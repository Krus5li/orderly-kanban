"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate, initialDiagram, exportJson, importJson } = require("../assets/js/diagram/data.js");

const sample = {
  version: 1,
  viewport: { x: 12, y: -4, zoom: 1.25 },
  nodes: [
    { id: "n1", type: "rect", x: 0, y: 0, w: 120, h: 80, text: "Step" },
    { id: "n2", type: "line", x: 10, y: 10, x2: 90, y2: 50 },
    { id: "n3", type: "text", x: 40, y: 200, text: "Hello\nWorld" }
  ]
};

test("JSON round trip preserves diagram data", () => {
  assert.deepEqual(importJson(exportJson(sample)), sample);
});

test("initial diagram is valid", () => {
  assert.deepEqual(validate(initialDiagram()), initialDiagram());
});

test("invalid diagrams are rejected", () => {
  assert.throws(() => validate({ ...sample, version: 2 }), /version/);
  assert.throws(() => validate({ ...sample, nodes: [{ ...sample.nodes[0], w: 0 }] }), /width/);
  assert.throws(() => validate({ ...sample, nodes: [sample.nodes[0], sample.nodes[0]] }), /unique/);
  assert.throws(() => importJson("{"), /JSON/);
});