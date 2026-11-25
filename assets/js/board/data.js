(function (root) {
  "use strict";

  const HEADER = ["type", "id", "name", "column_id", "title", "project", "increment", "description", "owner", "due_date", "position"];
  const ticketFields = ["id", "columnId", "title", "project", "increment", "description", "owner", "dueDate"];

  function validate(board) {
    if (!board || !Array.isArray(board.columns) || !Array.isArray(board.tickets) || !board.columns.length) {
      throw new Error("The board must have at least one column and a ticket list.");
    }
    const columnIds = new Set();
    for (const column of board.columns) {
      if (!column || typeof column.id !== "string" || !column.id.trim() || typeof column.name !== "string" || !column.name.trim() || columnIds.has(column.id)) {
        throw new Error("Columns must have unique IDs and non-empty names.");
      }
      columnIds.add(column.id);
    }
    const ticketIds = new Set();
    for (const ticket of board.tickets) {
      if (!ticket || ticketFields.some(field => typeof ticket[field] !== "string") || !ticket.id.trim() || ticketIds.has(ticket.id) || !ticket.title.trim() || !columnIds.has(ticket.columnId)) {
        throw new Error("Tickets must have unique IDs, a title, and an existing column.");
      }
      if (ticket.dueDate) {
        const date = new Date(ticket.dueDate + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ticket.dueDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ticket.dueDate) {
          throw new Error("Ticket due dates must be valid dates in YYYY-MM-DD format.");
        }
      }
      ticketIds.add(ticket.id);
    }
    return board;
  }

  function encode(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function exportCsv(board) {
    validate(board);
    const rows = [HEADER, ["board", "1", "", "", "", "", "", "", "", "", ""]];
    board.columns.forEach((column, index) => rows.push(["column", column.id, column.name, "", "", "", "", "", "", "", String(index)]));
    board.tickets.forEach((ticket, index) => rows.push(["ticket", ticket.id, "", ticket.columnId, ticket.title, ticket.project, ticket.increment, ticket.description, ticket.owner, ticket.dueDate, String(index)]));
    return rows.map(row => row.map(encode).join(",")).join("\r\n") + "\r\n";
  }

  function parseRows(text) {
    const rows = [];
    let row = [], field = "", quoted = false, closedQuote = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closedQuote = true; }
        } else field += char;
      } else if (char === ",") {
        row.push(field); field = ""; closedQuote = false;
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = ""; closedQuote = false;
      } else if (char === '"' && !field && !closedQuote) {
        quoted = true;
      } else {
        if (closedQuote || char === '"') throw new Error("Invalid CSV quoting.");
        field += char;
      }
    }
    if (quoted) throw new Error("Unterminated quoted CSV field.");
    if (row.length || field || closedQuote) { row.push(field); rows.push(row); }
    return rows;
  }

  function importCsv(text) {
    const rows = parseRows(text);
    if (!rows.length || rows[0].length !== HEADER.length || rows[0].some((value, i) => value !== HEADER[i])) {
      throw new Error("Unrecognized CSV header. Import an Orderly CSV export.");
    }
    const columns = [], tickets = [];
    let versionSeen = false;
    for (const row of rows.slice(1)) {
      if (row.length !== HEADER.length) throw new Error("Every CSV row must have the expected number of fields.");
      const [type, id, name, columnId, title, project, increment, description, owner, dueDate, position] = row;
      if (type === "board") {
        if (versionSeen || id !== "1" || row.slice(2).some(Boolean)) throw new Error("Unsupported or invalid board version.");
        versionSeen = true;
      } else if (type === "column" || type === "ticket") {
        if (!/^(0|[1-9]\d*)$/.test(position) || !Number.isSafeInteger(Number(position))) throw new Error("Invalid row position.");
        if (type === "column") {
          if (row.slice(3, 10).some(Boolean)) throw new Error("Unexpected data in a column row.");
          columns.push({ position: Number(position), value: { id, name } });
        } else {
          if (name) throw new Error("Unexpected data in a ticket row.");
          tickets.push({ position: Number(position), value: { id, columnId, title, project, increment, description, owner, dueDate } });
        }
      } else throw new Error("Unknown CSV row type.");
    }
    if (!versionSeen) throw new Error("Missing board version.");
    function ordered(items) {
      items.sort((a, b) => a.position - b.position);
      if (items.some((item, index) => item.position !== index)) throw new Error("Row positions must be unique and consecutive.");
      return items.map(item => item.value);
    }
    return validate({ columns: ordered(columns), tickets: ordered(tickets) });
  }

  const api = { validate, exportCsv, importCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoardData = api;
})(globalThis);
