"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");

const app = readFileSync(require.resolve("../assets/js/board/app.js"), "utf8");

function startApp(storage) {
  class Element {
    constructor() {
      this.value = "";
      this.textContent = "";
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.elements = { title: new ElementField(), name: new ElementField() };
    }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    replaceChildren() {}
    append() {}
  }
  class ElementField {
    addEventListener() {}
  }
  const elements = new Map();
  const document = {
    documentElement: new Element(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() { return new Element(); },
    querySelectorAll() { return []; }
  };
  runInNewContext(app, { document, localStorage: storage });
  return {
    theme: () => document.documentElement.dataset.theme,
    toggle: () => elements.get("theme-toggle").listeners.click(),
    pressed: () => elements.get("theme-toggle").attributes["aria-pressed"],
    themeNotice: () => elements.get("theme-notice").textContent,
    boardNotice: () => elements.get("notice").textContent
  };
}

test("theme toggle saves and restores the choice without changing board data", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const first = startApp(storage);
  assert.equal(first.theme(), "light");
  assert.equal(first.pressed(), "false");
  first.toggle();
  assert.equal(first.theme(), "dark");
  assert.equal(first.pressed(), "true");
  assert.equal(values.get("orderly-theme"), "dark");
  assert.equal(values.has("orderly-board-v1"), false);
  const reloaded = startApp(storage);
  assert.equal(reloaded.theme(), "dark");
  assert.equal(reloaded.pressed(), "true");
  reloaded.toggle();
  assert.equal(values.get("orderly-theme"), "light");
});

test("theme storage errors are visible without hiding board storage errors", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };
  const app = startApp(storage);
  assert.equal(app.theme(), "light");
  assert.match(app.themeNotice(), /Could not load the theme preference/);
  assert.match(app.boardNotice(), /Could not load browser storage/);
  app.toggle();
  assert.equal(app.theme(), "dark");
  assert.equal(app.pressed(), "true");
  assert.match(app.themeNotice(), /Could not save the theme preference/);
  assert.match(app.boardNotice(), /Could not load browser storage/);
});
