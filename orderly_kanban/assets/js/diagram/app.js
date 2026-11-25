(function () {
  "use strict";

  const storageKey = "orderly-diagram-v1";
  const themeStorageKey = "orderly-theme";
  const MIN_SIZE = 8;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;
  const $ = id => document.getElementById(id);
  const notice = $("notice");
  const themeNotice = $("theme-notice");
  const themeToggle = $("theme-toggle");
  const canvasWrap = $("canvas-wrap");
  const viewportGroup = $("viewport-group");
  const overlayGroup = $("overlay-group");
  const textDialog = $("text-dialog");
  const textForm = $("text-form");

  let diagram;
  let currentTool = "select";
  let selectedId = null;
  let spacePan = false;
  let editingTextId = null;
  let interaction = null;
  let unsavedChanges = false;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle.textContent = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }

  try {
    applyTheme(localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light");
  } catch (error) {
    applyTheme("light");
    themeNotice.textContent = "Could not load the theme preference: " + error.message;
  }

  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem(themeStorageKey, theme);
      themeNotice.textContent = "";
    } catch (error) {
      themeNotice.textContent = "Could not save the theme preference: " + error.message;
    }
  });

  function id() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  try {
    const saved = localStorage.getItem(storageKey);
    diagram = saved ? DiagramData.validate(JSON.parse(saved)) : DiagramData.initialDiagram();
  } catch (error) {
    diagram = DiagramData.initialDiagram();
    notice.textContent = "Could not load saved diagram: " + error.message + " Export a backup if you have one.";
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(DiagramData.validate(diagram)));
      notice.textContent = "";
      unsavedChanges = false;
    } catch (error) {
      notice.textContent = "Could not save diagram: " + error.message + " Export a JSON backup before leaving.";
      unsavedChanges = true;
    }
    render();
  }

  function markUnsaved() {
    unsavedChanges = true;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", event => {
      if (!unsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function nodeById(nodeId) {
    return diagram.nodes.find(item => item.id === nodeId);
  }

  function setTool(tool) {
    currentTool = tool;
    canvasWrap.dataset.tool = tool;
    document.querySelectorAll(".tool-button").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    });
  }

  function effectivePanTool() {
    return currentTool === "pan" || spacePan;
  }

  function screenToWorld(clientX, clientY) {
    const point = $("diagram-svg").createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = viewportGroup.getScreenCTM();
    if (!matrix) return { x: clientX, y: clientY };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function svgRootPoint(clientX, clientY) {
    const point = $("diagram-svg").createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = $("diagram-svg").getScreenCTM();
    if (!matrix) return { x: clientX, y: clientY };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function applyViewportTransform() {
    const { x, y, zoom } = diagram.viewport;
    viewportGroup.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + zoom + ")");
    overlayGroup.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + zoom + ")");
  }

  function normalizeBox(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(Math.abs(x2 - x1), MIN_SIZE),
      h: Math.max(Math.abs(y2 - y1), MIN_SIZE)
    };
  }

  function svgElement(name, attrs) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  }

  function appendTextLines(parent, text, x, y, className) {
    const lines = (text || "").split("\n");
    const startY = y + 16;
    lines.forEach((line, index) => {
      parent.append(svgElement("text", {
        class: className,
        x,
        y: startY + index * 18,
        "xml:space": "preserve"
      }));
      parent.lastChild.textContent = line;
    });
  }

  function renderNode(node) {
    const group = svgElement("g", { "data-node-id": node.id });
    if (node.type === "rect") {
      group.append(svgElement("rect", { class: "shape-fill hit-target", x: node.x, y: node.y, width: node.w, height: node.h, rx: 4 }));
      if (node.text) appendTextLines(group, node.text, node.x + 8, node.y, "shape-label");
    } else if (node.type === "ellipse") {
      group.append(svgElement("ellipse", {
        class: "shape-fill hit-target",
        cx: node.x + node.w / 2,
        cy: node.y + node.h / 2,
        rx: node.w / 2,
        ry: node.h / 2
      }));
      if (node.text) appendTextLines(group, node.text, node.x + 8, node.y + node.h / 2 - 8, "shape-label");
    } else if (node.type === "line") {
      group.append(svgElement("line", {
        class: "shape-line hit-target",
        x1: node.x,
        y1: node.y,
        x2: node.x2,
        y2: node.y2
      }));
    } else if (node.type === "text") {
      appendTextLines(group, node.text, node.x, node.y, "shape-text");
      const hit = svgElement("rect", { class: "hit-target", x: node.x - 4, y: node.y, width: Math.max(40, node.text.length * 8), height: Math.max(24, node.text.split("\n").length * 18 + 8) });
      group.insertBefore(hit, group.firstChild);
    }
    return group;
  }

  function renderSelection() {
    overlayGroup.replaceChildren();
    if (!selectedId) return;
    const node = nodeById(selectedId);
    if (!node) return;
    if (node.type === "rect" || node.type === "ellipse") {
      overlayGroup.append(svgElement("rect", {
        class: "selection-box",
        x: node.x - 4,
        y: node.y - 4,
        width: node.w + 8,
        height: node.h + 8,
        rx: node.type === "rect" ? 6 : 0
      }));
      const handle = svgElement("rect", {
        class: "resize-handle",
        "data-resize-handle": "true",
        x: node.x + node.w - 5,
        y: node.y + node.h - 5,
        width: 10,
        height: 10,
        rx: 2
      });
      handle.addEventListener("pointerdown", event => startResize(event, node.id));
      overlayGroup.append(handle);
    } else if (node.type === "line") {
      const padding = 6;
      const left = Math.min(node.x, node.x2) - padding;
      const top = Math.min(node.y, node.y2) - padding;
      overlayGroup.append(svgElement("rect", {
        class: "selection-box",
        x: left,
        y: top,
        width: Math.abs(node.x2 - node.x) + padding * 2,
        height: Math.abs(node.y2 - node.y) + padding * 2
      }));
    } else if (node.type === "text") {
      overlayGroup.append(svgElement("rect", {
        class: "selection-box",
        x: node.x - 6,
        y: node.y - 4,
        width: Math.max(48, node.text.length * 8),
        height: Math.max(28, node.text.split("\n").length * 18 + 12)
      }));
    }
  }

  function renderDraft() {
    const existing = overlayGroup.querySelector("[data-draft]");
    if (existing) existing.remove();
    if (!interaction || interaction.kind !== "create" && interaction.kind !== "line") return;
    const draft = interaction.kind === "line"
      ? svgElement("line", {
        class: "draft-preview",
        "data-draft": "true",
        x1: interaction.x,
        y1: interaction.y,
        x2: interaction.currentX,
        y2: interaction.currentY
      })
      : svgElement("rect", {
        class: "draft-preview",
        "data-draft": "true",
        ...normalizeBox(interaction.x, interaction.y, interaction.currentX, interaction.currentY)
      });
    overlayGroup.append(draft);
  }

  function render() {
    applyViewportTransform();
    viewportGroup.replaceChildren(...diagram.nodes.map(renderNode));
    renderSelection();
    renderDraft();
  }

  function selectNode(nodeId) {
    selectedId = nodeId;
    renderSelection();
  }

  function deleteSelected() {
    if (!selectedId) return;
    diagram.nodes = diagram.nodes.filter(node => node.id !== selectedId);
    selectedId = null;
    save();
  }

  function openTextDialog(node) {
    editingTextId = node.id;
    textForm.reset();
    textForm.elements.text.value = node.text;
    textDialog.showModal();
  }

  function addTextNode(world) {
    const textNode = { id: id(), type: "text", x: world.x, y: world.y, text: "Text" };
    diagram.nodes.push(textNode);
    selectedId = textNode.id;
    save();
    openTextDialog(textNode);
  }

  function startInteraction(event) {
    if (event.button !== 0 && event.button !== 1) return;
    const world = screenToWorld(event.clientX, event.clientY);
    const target = event.target;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    const resizeHandle = target.closest("[data-resize-handle]");

    if (resizeHandle) return;

    if (event.button === 1 || (event.button === 0 && effectivePanTool())) {
      event.preventDefault();
      interaction = {
        kind: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: diagram.viewport.x,
        originY: diagram.viewport.y
      };
      canvasWrap.dataset.panning = "active";
      canvasWrap.setPointerCapture(event.pointerId);
      return;
    }

    if (currentTool === "select") {
      if (nodeId) {
        selectNode(nodeId);
        interaction = {
          kind: "move",
          nodeId,
          startX: world.x,
          startY: world.y,
          originX: nodeById(nodeId).x,
          originY: nodeById(nodeId).y,
          originX2: nodeById(nodeId).x2,
          originY2: nodeById(nodeId).y2,
          type: nodeById(nodeId).type
        };
        canvasWrap.setPointerCapture(event.pointerId);
      } else {
        selectedId = null;
        renderSelection();
      }
      return;
    }

    if (currentTool === "text") {
      addTextNode(world);
      return;
    }

    if (currentTool === "rect" || currentTool === "ellipse" || currentTool === "line") {
      interaction = {
        kind: currentTool === "line" ? "line" : "create",
        type: currentTool,
        x: world.x,
        y: world.y,
        currentX: world.x,
        currentY: world.y
      };
      canvasWrap.setPointerCapture(event.pointerId);
      renderDraft();
    }
  }

  function startResize(event, nodeId) {
    event.stopPropagation();
    const node = nodeById(nodeId);
    interaction = {
      kind: "resize",
      nodeId,
      originW: node.w,
      originH: node.h,
      startX: screenToWorld(event.clientX, event.clientY).x,
      startY: screenToWorld(event.clientX, event.clientY).y
    };
    canvasWrap.setPointerCapture(event.pointerId);
  }

  function moveInteraction(event) {
    if (!interaction) return;
    if (interaction.kind === "pan") {
      diagram.viewport.x = interaction.originX + (event.clientX - interaction.startClientX);
      diagram.viewport.y = interaction.originY + (event.clientY - interaction.startClientY);
      markUnsaved();
      applyViewportTransform();
      renderSelection();
      renderDraft();
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    if (interaction.kind === "move") {
      const dx = world.x - interaction.startX;
      const dy = world.y - interaction.startY;
      const node = nodeById(interaction.nodeId);
      node.x = interaction.originX + dx;
      node.y = interaction.originY + dy;
      if (interaction.type === "line") {
        node.x2 = interaction.originX2 + dx;
        node.y2 = interaction.originY2 + dy;
      }
      markUnsaved();
      render();
      return;
    }
    if (interaction.kind === "resize") {
      const node = nodeById(interaction.nodeId);
      const dx = world.x - interaction.startX;
      const dy = world.y - interaction.startY;
      node.w = Math.max(MIN_SIZE, interaction.originW + dx);
      node.h = Math.max(MIN_SIZE, interaction.originH + dy);
      markUnsaved();
      render();
      return;
    }
    if (interaction.kind === "create" || interaction.kind === "line") {
      interaction.currentX = world.x;
      interaction.currentY = world.y;
      renderDraft();
    }
  }

  function endInteraction(event) {
    if (!interaction) return;
    try {
      canvasWrap.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* pointer may already be released */
    }
    if (interaction.kind === "pan") {
      canvasWrap.dataset.panning = "";
      interaction = null;
      save();
      return;
    }
    if (interaction.kind === "move" || interaction.kind === "resize") {
      interaction = null;
      save();
      return;
    }
    if (interaction.kind === "create") {
      const box = normalizeBox(interaction.x, interaction.y, interaction.currentX, interaction.currentY);
      const shape = {
        id: id(),
        type: interaction.type,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        text: ""
      };
      diagram.nodes.push(shape);
      selectedId = shape.id;
      interaction = null;
      save();
      return;
    }
    if (interaction.kind === "line") {
      const dx = interaction.currentX - interaction.x;
      const dy = interaction.currentY - interaction.y;
      if (Math.hypot(dx, dy) >= MIN_SIZE) {
        const line = { id: id(), type: "line", x: interaction.x, y: interaction.y, x2: interaction.currentX, y2: interaction.currentY };
        diagram.nodes.push(line);
        selectedId = line.id;
      }
      interaction = null;
      save();
      return;
    }
  }

  function zoomAt(clientX, clientY, factor) {
    const world = screenToWorld(clientX, clientY);
    const anchor = svgRootPoint(clientX, clientY);
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, diagram.viewport.zoom * factor));
    if (nextZoom === diagram.viewport.zoom) return;
    diagram.viewport.zoom = nextZoom;
    diagram.viewport.x = anchor.x - world.x * nextZoom;
    diagram.viewport.y = anchor.y - world.y * nextZoom;
    save();
  }

  canvasWrap.addEventListener("pointerdown", event => {
    canvasWrap.focus();
    if (event.target.closest("[data-resize-handle]")) return;
    if (event.target.closest("[data-node-id]") && currentTool === "select" && event.button === 0) {
      startInteraction(event);
      return;
    }
    if (event.target.closest("[data-node-id]") && currentTool !== "select") return;
    startInteraction(event);
  });

  canvasWrap.addEventListener("pointermove", moveInteraction);
  canvasWrap.addEventListener("pointerup", endInteraction);
  canvasWrap.addEventListener("pointercancel", endInteraction);

  canvasWrap.addEventListener("dblclick", event => {
    const nodeId = event.target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    const node = nodeById(nodeId);
    if (node.type === "text" || node.type === "rect" || node.type === "ellipse") openTextDialog(node);
  });

  canvasWrap.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  document.querySelectorAll(".tool-button").forEach(button => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  window.addEventListener("keydown", event => {
    if (event.code === "Space" && !event.repeat && !textDialog.open) {
      spacePan = true;
      canvasWrap.dataset.panning = "true";
      event.preventDefault();
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !textDialog.open) {
      event.preventDefault();
      deleteSelected();
    }
    if (event.key === "Escape") {
      interaction = null;
      selectedId = null;
      render();
    }
  });

  window.addEventListener("keyup", event => {
    if (event.code === "Space") {
      spacePan = false;
      if (interaction?.kind !== "pan") canvasWrap.dataset.panning = "";
    }
  });

  textForm.addEventListener("submit", event => {
    event.preventDefault();
    const node = nodeById(editingTextId);
    if (node) {
      markUnsaved();
      node.text = textForm.elements.text.value;
      if (node.type === "text" && !node.text.trim()) {
        diagram.nodes = diagram.nodes.filter(item => item.id !== node.id);
        selectedId = null;
      }
      save();
    }
    textDialog.close();
  });

  document.querySelectorAll(".close-dialog").forEach(button => {
    button.addEventListener("click", () => textDialog.close());
  });

  $("export-button").addEventListener("click", () => {
    try {
      const url = URL.createObjectURL(new Blob([DiagramData.exportJson(diagram)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "orderly-diagram.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notice.textContent = "Could not export JSON: " + error.message;
    }
  });

  $("import-button").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = DiagramData.importJson(await file.text());
      if (!confirm("Importing replaces the entire current diagram. Export a backup first if needed. Continue?")) return;
      diagram = imported;
      selectedId = null;
      save();
    } catch (error) {
      notice.textContent = "Could not import JSON: " + error.message + " The current diagram was not changed.";
    }
  });

  setTool("select");
  render();
})();