"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate, exportCsv, importCsv } = require("../assets/js/board/data.js");

const board = {
  columns: [{ id: "c1", name: "To Do" }, { id: "c2", name: "Empty, column" }],
  tickets: [{ id: "t1", columnId: "c1", title: 'Fix "it", please', project: "Project A", increment: "PI 1", description: "First line\nSecond line", owner: "", dueDate: "2028-02-29" }]
};

test("CSV preserves fields, quoting, ordering and empty columns", () => {
  assert.deepEqual(importCsv(exportCsv(board)), board);
  assert.deepEqual(importCsv("\uFEFF" + exportCsv(board)), board);
});

test("CSV supports a board without tickets and optional ticket fields", () => {
  const minimal = { columns: [{ id: "c", name: "Only" }], tickets: [] };
  assert.deepEqual(importCsv(exportCsv(minimal)), minimal);
  minimal.tickets.push({ id: "t", columnId: "c", title: "Title", project: "", increment: "", description: "", owner: "", dueDate: "" });
  assert.deepEqual(importCsv(exportCsv(minimal)), minimal);
});

test("invalid CSV is rejected rather than producing a partial board", () => {
  const csv = exportCsv(board);
  assert.throws(() => importCsv(csv.replace("board,1", "board,2")), /version/);
  assert.throws(() => importCsv(csv.replace("ticket,t1", "ticket,t1,unexpected")), /fields/);
  assert.throws(() => importCsv(csv.replace("ticket,t1,,c1", "ticket,t1,,missing")), /existing column/);
  assert.throws(() => importCsv(csv.replace('Fix ""it"", please"', 'Fix ""it"", please')), /quot/);
  assert.throws(() => importCsv(csv.replace("column,c1,To Do,,,,,,,,0", "column,c1,To Do,,,,,,,,1")), /positions/);
});

test("invalid dates and duplicate IDs are rejected", () => {
  assert.throws(() => validate({ ...board, tickets: [{ ...board.tickets[0], dueDate: "2027-02-29" }] }), /valid dates/);
  assert.throws(() => validate({ ...board, tickets: [board.tickets[0], board.tickets[0]] }), /unique IDs/);
});
