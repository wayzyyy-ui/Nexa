// Ctrl+← / Ctrl+→ между разделами (src/lib/keynav.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrowNavTarget } from "../src/lib/keynav.js";

const order = ["home", "today", "media", "files", "assistant", "settings"];
const base = { key: "ArrowRight", ctrlKey: true, order, tab: "home" };

test("Ctrl+→ — следующий раздел, Ctrl+← — предыдущий", () => {
  assert.equal(arrowNavTarget(base), "today");
  assert.equal(arrowNavTarget({ ...base, tab: "media", key: "ArrowLeft" }), "today");
});

test("по кругу не ходит", () => {
  assert.equal(arrowNavTarget({ ...base, tab: "settings" }), null);
  assert.equal(arrowNavTarget({ ...base, key: "ArrowLeft" }), null);
});

test("без Ctrl, с Alt / Shift / ⌘ и при удержании — ничего", () => {
  assert.equal(arrowNavTarget({ ...base, ctrlKey: false }), null);
  assert.equal(arrowNavTarget({ ...base, altKey: true }), null);
  assert.equal(arrowNavTarget({ ...base, shiftKey: true }), null);
  assert.equal(arrowNavTarget({ ...base, metaKey: true }), null);
  assert.equal(arrowNavTarget({ ...base, repeat: true }), null);
});

test("в поле ввода и при открытом окне — ничего", () => {
  assert.equal(arrowNavTarget({ ...base, editable: true }), null);
  assert.equal(arrowNavTarget({ ...base, blocked: true }), null);
});

test("другие клавиши и неизвестный раздел — ничего", () => {
  assert.equal(arrowNavTarget({ ...base, key: "ArrowUp" }), null);
  assert.equal(arrowNavTarget({ ...base, tab: "nope" }), null);
});
