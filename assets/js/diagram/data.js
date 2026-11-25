(function (root) {
  "use strict";

  const VERSION = 1;
  const NODE_TYPES = new Set(["rect", "ellipse", "text", "line"]);

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function validate(diagram) {
    if (!diagram || diagram.version !== VERSION) {
      throw new Error("Diagram must be version " + VERSION + ".");
    }
    const viewport = diagram.viewport;
    if (!viewport || !isFiniteNumber(viewport.x) || !isFiniteNumber(viewport.y) || !isFiniteNumber(viewport.zoom) || viewport.zoom <= 0) {
      throw new Error("Diagram viewport must have numeric x, y, and a positive zoom.");
    }
    if (!Array.isArray(diagram.nodes)) throw new Error("Diagram must have a nodes array.");
    const ids = new Set();
    for (const node of diagram.nodes) {
      if (!node || typeof node.id !== "string" || !node.id.trim() || ids.has(node.id)) {
        throw new Error("Nodes must have unique non-empty ids.");
      }
      if (!NODE_TYPES.has(node.type)) throw new Error("Unknown node type.");
      if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y)) throw new Error("Nodes must have numeric x and y.");
      if (node.type === "rect" || node.type === "ellipse") {
        if (!isFiniteNumber(node.w) || !isFiniteNumber(node.h) || node.w <= 0 || node.h <= 0) {
          throw new Error("Shapes must have positive width and height.");
        }
        if (node.text !== undefined && typeof node.text !== "string") throw new Error("Shape text must be a string.");
      } else if (node.type === "text") {
        if (typeof node.text !== "string") throw new Error("Text nodes must have a text string.");
      } else if (node.type === "line") {
        if (!isFiniteNumber(node.x2) || !isFiniteNumber(node.y2)) throw new Error("Lines must have numeric end coordinates.");
      }
      ids.add(node.id);
    }
    return diagram;
  }

  function initialDiagram() {
    return { version: VERSION, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] };
  }

  function exportJson(diagram) {
    return JSON.stringify(validate(diagram), null, 2) + "\n";
  }

  function importJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("Invalid JSON: " + error.message);
    }
    return validate(parsed);
  }

  const api = { VERSION, validate, initialDiagram, exportJson, importJson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DiagramData = api;
})(globalThis);