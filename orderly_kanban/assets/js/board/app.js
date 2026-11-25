(function () {
  "use strict";

  const storageKey = "orderly-board-v1";
  const themeStorageKey = "orderly-theme";
  const boardFileNameKey = "orderly-board-csv-filename";
  const csvPickerTypes = [{ description: "CSV", accept: { "text/csv": [".csv"] } }];
  const $ = id => document.getElementById(id);
  const notice = $("notice");
  const themeNotice = $("theme-notice");
  const themeToggle = $("theme-toggle");
  const ticketDialog = $("ticket-dialog");
  const ticketForm = $("ticket-form");
  const columnDialog = $("column-dialog");
  const columnForm = $("column-form");
  const deleteColumnDialog = $("delete-column-dialog");
  const deleteColumnForm = $("delete-column-form");
  const ticketViewDialog = $("ticket-view-dialog");
  let editingTicket = null;
  let viewingTicket = null;
  let titleClickAllowed = true;
  let editingColumn = null;
  let deletingColumn = null;
  let draggingTicket = null;
  let unsavedChanges = false;
  let boardFileHandle = null;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle.textContent = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }

  try {
    applyTheme(localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light");
  } catch (error) {
    applyTheme("light");
    themeNotice.textContent = "Could not load the theme preference: " + error.message + ". The theme may not persist.";
  }

  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem(themeStorageKey, theme);
      themeNotice.textContent = "";
    } catch (error) {
      themeNotice.textContent = "Could not save the theme preference: " + error.message + ". The theme may not persist.";
    }
  });

  function id() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function initialBoard() {
    return { columns: ["To Do", "In Progress", "Done"].map(name => ({ id: id(), name })), tickets: [] };
  }

  let board;
  try {
    const saved = localStorage.getItem(storageKey);
    board = saved ? BoardData.validate(JSON.parse(saved)) : initialBoard();
  } catch (error) {
    board = initialBoard();
    notice.textContent = "Could not load browser storage: " + error.message + ". Your saved data has not been overwritten; import a backup or make a change to start a new board.";
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(BoardData.validate(board)));
      notice.textContent = "";
      unsavedChanges = false;
    } catch (error) {
      notice.textContent = "Could not save to browser storage: " + error.message + ". Export a CSV backup before leaving this page.";
      unsavedChanges = true;
    }
    render();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", event => {
      if (!unsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function option(value, text) {
    const element = node("option", "", text);
    element.value = value;
    return element;
  }

  function populateColumns(select, exclude) {
    select.replaceChildren(...board.columns.filter(column => column.id !== exclude).map(column => option(column.id, column.name)));
  }

  function refreshFilter(select, field, label) {
    const selected = select.value;
    const values = uniqueFieldValues(field);
    select.replaceChildren(option("", label), ...values.map(value => option(value, value)));
    if (values.includes(selected)) select.value = selected;
  }

  function uniqueFieldValues(field) {
    return [...new Set(board.tickets.map(ticket => ticket[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  const quickPickNew = "__new__";

  function populateQuickPick(select, values, placeholder, selectedValue) {
    const selected = (selectedValue || "").trim();
    const choices = [...new Set([...values, selected].filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.replaceChildren(
      option("", placeholder),
      ...choices.map(value => option(value, value)),
      option(quickPickNew, "Add new…")
    );
    select.value = selected || "";
  }

  function populateTicketSuggestions(ticket) {
    const projectPick = $("project-pick");
    const ownerPick = $("owner-pick");
    if (!projectPick || !ownerPick) return;
    populateQuickPick(projectPick, uniqueFieldValues("project"), "Select project…", ticket?.project);
    populateQuickPick(ownerPick, uniqueFieldValues("owner"), "Select owner…", ticket?.owner);
  }

  function bindQuickPickNew(select, promptLabel) {
    select.addEventListener("change", () => {
      if (select.value !== quickPickNew) return;
      const name = prompt(promptLabel);
      if (!name?.trim()) {
        select.value = "";
        return;
      }
      const value = name.trim().slice(0, 120);
      const marker = select.querySelector(`option[value="${quickPickNew}"]`);
      if (![...select.options].some(item => item.value === value)) select.insertBefore(option(value, value), marker);
      select.value = value;
    });
  }

  function columnTagClass(columnName) {
    const name = columnName.toLocaleLowerCase();
    if (/\b(done|complete|completed|closed)\b/.test(name)) return "tag-column-done";
    if (/(in[-\s]?progress|doing|active|wip)/.test(name)) return "tag-column-progress";
    if (/(to[-\s]?do|backlog|todo|planned|new)/.test(name)) return "tag-column-todo";
    return "tag-column-other";
  }

  function getBoardFileName() {
    try {
      return localStorage.getItem(boardFileNameKey) || "orderly-board.csv";
    } catch (error) {
      return "orderly-board.csv";
    }
  }

  function rememberBoardFileName(name) {
    try {
      localStorage.setItem(boardFileNameKey, name);
    } catch (error) {
      notice.textContent = "Could not remember the board file name: " + error.message;
    }
    updateBoardFileLabel();
  }

  function updateBoardFileLabel() {
    const label = $("board-file-label");
    const name = boardFileHandle?.name || getBoardFileName();
    label.textContent = name;
    label.title = boardFileHandle ? "Board file: " + name + " (linked for Save and Load)" : "Default board file name: " + name;
  }

  async function ensureFilePermission(handle, mode) {
    if (!handle.queryPermission) return true;
    const options = { mode };
    let permission = await handle.queryPermission(options);
    if (permission === "granted") return true;
    permission = await handle.requestPermission(options);
    return permission === "granted";
  }

  async function configureBoardFile() {
    if (!window.showOpenFilePicker) {
      $("import-file").click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({ types: csvPickerTypes, multiple: false });
      boardFileHandle = handle;
      rememberBoardFileName(handle.name);
      notice.textContent = "";
    } catch (error) {
      if (error.name !== "AbortError") notice.textContent = "Could not choose board file: " + error.message;
    }
  }

  async function chooseBoardFileForExport() {
    if (!window.showSaveFilePicker) return null;
    return window.showSaveFilePicker({ suggestedName: getBoardFileName(), types: csvPickerTypes });
  }

  async function writeBoardCsv(csv) {
    if (boardFileHandle) {
      if (!(await ensureFilePermission(boardFileHandle, "readwrite"))) {
        throw new Error("Write permission was not granted for the configured board file.");
      }
      const writable = await boardFileHandle.createWritable();
      await writable.write(csv);
      await writable.close();
      return;
    }
    if (window.showSaveFilePicker) {
      const handle = await chooseBoardFileForExport();
      if (!handle) return;
      boardFileHandle = handle;
      rememberBoardFileName(handle.name);
      const writable = await handle.createWritable();
      await writable.write(csv);
      await writable.close();
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = node("a");
    link.href = url;
    link.download = getBoardFileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readBoardCsvFromHandle() {
    if (!(await ensureFilePermission(boardFileHandle, "read"))) {
      throw new Error("Read permission was not granted for the configured board file.");
    }
    return (await boardFileHandle.getFile()).text();
  }

  async function chooseBoardFileForImport() {
    if (!window.showOpenFilePicker) return null;
    const [handle] = await window.showOpenFilePicker({ types: csvPickerTypes, multiple: false });
    return handle;
  }

  function matches(ticket) {
    const query = $("search").value.trim().toLocaleLowerCase();
    const text = [ticket.title, ticket.description, ticket.project, ticket.increment, ticket.owner, ticket.dueDate].join(" ").toLocaleLowerCase();
    return (!query || text.includes(query)) &&
      (!$("project-filter").value || ticket.project === $("project-filter").value) &&
      (!$("increment-filter").value || ticket.increment === $("increment-filter").value);
  }

  function render() {
    refreshFilter($("project-filter"), "project", "All projects");
    refreshFilter($("increment-filter"), "increment", "All increments");
    const visible = board.tickets.filter(matches);
    $("ticket-count").textContent = visible.length + " of " + board.tickets.length + (board.tickets.length === 1 ? " ticket" : " tickets");
    $("board").replaceChildren(...board.columns.map(column => renderColumn(column, visible)));
  }

  function button(text, label, action, className) {
    const element = node("button", className, text);
    element.type = "button";
    if (label) element.setAttribute("aria-label", label);
    element.addEventListener("click", action);
    return element;
  }

  function renderColumn(column, visible) {
    const section = node("section", "column");
    const title = node("h3", "", column.name);
    const header = node("div", "column-header");
    const tickets = visible.filter(ticket => ticket.columnId === column.id);
    header.append(title, node("span", "badge", String(tickets.length)),
      button("✎", "Rename " + column.name, () => openColumn(column), "icon-button"),
      button("×", "Delete " + column.name, () => deleteColumn(column), "icon-button"));
    section.append(header);
    const cards = node("div", "cards");
    if (!tickets.length) cards.append(node("p", "empty", "No tickets to show"));
    else cards.append(...tickets.map(renderTicket));
    section.append(cards);
    section.addEventListener("dragover", event => {
      if (draggingTicket) { event.preventDefault(); section.classList.add("drag-over"); }
    });
    section.addEventListener("dragleave", event => {
      if (!section.contains(event.relatedTarget)) section.classList.remove("drag-over");
    });
    section.addEventListener("drop", event => {
      event.preventDefault();
      section.classList.remove("drag-over");
      const ticket = board.tickets.find(item => item.id === draggingTicket);
      if (ticket && ticket.columnId !== column.id) {
        ticket.columnId = column.id;
        save();
      }
      draggingTicket = null;
    });
    return section;
  }

  function displayValue(text) {
    return text?.trim() ? text : "—";
  }

  function openTicketView(ticket) {
    viewingTicket = ticket;
    const column = board.columns.find(item => item.id === ticket.columnId);
    $("view-title").textContent = ticket.title;
    $("view-description").textContent = displayValue(ticket.description);
    $("view-project").textContent = displayValue(ticket.project);
    $("view-increment").textContent = displayValue(ticket.increment);
    $("view-owner").textContent = displayValue(ticket.owner);
    $("view-due-date").textContent = displayValue(ticket.dueDate);
    $("view-column").textContent = column ? column.name : "Unknown";
    ticketViewDialog.showModal();
  }

  function renderTicket(ticket) {
    const card = node("article", "card");
    card.draggable = true;
    card.addEventListener("dragstart", event => {
      draggingTicket = ticket.id;
      titleClickAllowed = false;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", ticket.id);
    });
    card.addEventListener("dragend", () => {
      draggingTicket = null;
      card.classList.remove("is-dragging");
      document.querySelectorAll(".drag-over").forEach(element => element.classList.remove("drag-over"));
      setTimeout(() => { titleClickAllowed = true; }, 0);
    });
    const column = board.columns.find(item => item.id === ticket.columnId);
    const columnName = column ? column.name : "Unknown";
    const title = node("button", "card-title", ticket.title);
    title.type = "button";
    title.setAttribute("aria-label", "View ticket " + ticket.title);
    title.addEventListener("click", event => {
      event.stopPropagation();
      if (!titleClickAllowed) return;
      openTicketView(ticket);
    });
    card.append(title);
    const meta = node("div", "card-meta");
    meta.append(node("span", "tag " + columnTagClass(columnName), columnName));
    if (ticket.project) meta.append(node("span", "tag", ticket.project));
    if (ticket.increment) meta.append(node("span", "tag", ticket.increment));
    if (meta.childElementCount) card.append(meta);
    if (ticket.owner || ticket.dueDate) {
      const details = node("div", "card-details");
      if (ticket.owner) details.append(node("span", "", "Owner: " + ticket.owner));
      if (ticket.dueDate) details.append(node("span", "", "Due: " + ticket.dueDate));
      card.append(details);
    }
    const actions = node("div", "card-actions");
    actions.append(button("Edit", "Edit " + ticket.title, () => openTicket(ticket)),
      button("Delete", "Delete " + ticket.title, () => {
        if (confirm('Delete ticket "' + ticket.title + '"?')) {
          board.tickets = board.tickets.filter(item => item.id !== ticket.id);
          save();
        }
      }, "delete"));
    card.append(actions);
    return card;
  }

  function openTicket(ticket) {
    editingTicket = ticket ? ticket.id : null;
    ticketForm.reset();
    ticketForm.elements.title.setCustomValidity("");
    populateColumns(ticketForm.elements.columnId);
    populateTicketSuggestions(ticket);
    $("ticket-dialog-title").textContent = ticket ? "Edit ticket" : "New ticket";
    if (ticket) {
      for (const field of ["title", "description", "increment", "dueDate", "columnId"]) ticketForm.elements[field].value = ticket[field];
    }
    ticketDialog.showModal();
  }

  ticketForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = ticketForm.elements.title.value.trim();
    if (!title) {
      ticketForm.elements.title.setCustomValidity("Enter a title.");
      ticketForm.elements.title.reportValidity();
      return;
    }
    const ticket = {
      id: editingTicket || id(),
      title,
      description: ticketForm.elements.description.value,
      project: ticketForm.elements.project.value === quickPickNew ? "" : ticketForm.elements.project.value.trim(),
      increment: ticketForm.elements.increment.value.trim(),
      owner: ticketForm.elements.owner.value === quickPickNew ? "" : ticketForm.elements.owner.value.trim(),
      dueDate: ticketForm.elements.dueDate.value,
      columnId: ticketForm.elements.columnId.value
    };
    if (editingTicket) board.tickets[board.tickets.findIndex(item => item.id === editingTicket)] = ticket;
    else board.tickets.push(ticket);
    ticketDialog.close();
    save();
  });
  ticketForm.elements.title.addEventListener("input", () => ticketForm.elements.title.setCustomValidity(""));
  const projectPick = $("project-pick");
  const ownerPick = $("owner-pick");
  if (projectPick) bindQuickPickNew(projectPick, "Project name");
  if (ownerPick) bindQuickPickNew(ownerPick, "Owner name");

  function openColumn(column) {
    editingColumn = column ? column.id : null;
    columnForm.reset();
    columnForm.elements.name.setCustomValidity("");
    $("column-dialog-title").textContent = column ? "Rename column" : "Add column";
    if (column) columnForm.elements.name.value = column.name;
    columnDialog.showModal();
  }

  columnForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = columnForm.elements.name.value.trim();
    if (!name) {
      columnForm.elements.name.setCustomValidity("Enter a column name.");
      columnForm.elements.name.reportValidity();
      return;
    }
    if (editingColumn) board.columns.find(column => column.id === editingColumn).name = name;
    else board.columns.push({ id: id(), name });
    columnDialog.close();
    save();
  });
  columnForm.elements.name.addEventListener("input", () => columnForm.elements.name.setCustomValidity(""));

  function deleteColumn(column) {
    if (board.columns.length === 1) {
      notice.textContent = "The board must have at least one column.";
      return;
    }
    if (board.tickets.some(ticket => ticket.columnId === column.id)) {
      deletingColumn = column.id;
      populateColumns(deleteColumnForm.elements.destination, column.id);
      deleteColumnDialog.showModal();
    } else if (confirm('Delete column "' + column.name + '"?')) {
      board.columns = board.columns.filter(item => item.id !== column.id);
      save();
    }
  }

  deleteColumnForm.addEventListener("submit", event => {
    event.preventDefault();
    const destination = deleteColumnForm.elements.destination.value;
    for (const ticket of board.tickets) if (ticket.columnId === deletingColumn) ticket.columnId = destination;
    board.columns = board.columns.filter(column => column.id !== deletingColumn);
    deleteColumnDialog.close();
    save();
  });

  $("add-ticket").addEventListener("click", () => openTicket());
  $("add-column").addEventListener("click", () => openColumn());
  $("view-edit-button")?.addEventListener("click", () => {
    const ticket = viewingTicket;
    ticketViewDialog.close();
    if (ticket) openTicket(ticket);
  });
  document.querySelectorAll(".close-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  $("search").addEventListener("input", render);
  $("project-filter").addEventListener("change", render);
  $("increment-filter").addEventListener("change", render);

  $("export-button").addEventListener("click", async () => {
    try {
      await writeBoardCsv(BoardData.exportCsv(board));
      notice.textContent = "";
    } catch (error) {
      if (error.name !== "AbortError") notice.textContent = "Could not export CSV: " + error.message;
    }
  });

  $("import-button").addEventListener("click", async () => {
    try {
      let csvText;
      if (boardFileHandle) {
        csvText = await readBoardCsvFromHandle();
      } else if (window.showOpenFilePicker) {
        const handle = await chooseBoardFileForImport();
        if (!handle) return;
        boardFileHandle = handle;
        rememberBoardFileName(handle.name);
        csvText = await readBoardCsvFromHandle();
      } else {
        $("import-file").click();
        return;
      }
      const imported = BoardData.importCsv(csvText);
      if (!confirm("Importing replaces the entire current board from \"" + (boardFileHandle?.name || getBoardFileName()) + "\". Continue?")) return;
      board = imported;
      save();
    } catch (error) {
      if (error.name !== "AbortError") notice.textContent = "Could not import CSV: " + error.message + " The current board was not changed.";
    }
  });

  $("board-file-button").addEventListener("click", () => {
    configureBoardFile();
  });

  $("import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    rememberBoardFileName(file.name);
    try {
      const imported = BoardData.importCsv(await file.text());
      if (!confirm("Importing replaces the entire current board. Export a backup first if needed. Continue?")) return;
      board = imported;
      save();
    } catch (error) {
      notice.textContent = "Could not import CSV: " + error.message + " The current board was not changed.";
    }
  });

  updateBoardFileLabel();
  render();
})();
