// Поле ввода ассистента (src/lib/composer.js): что делает Enter.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { enterAction, readEnterSends, touchLike } from "../src/lib/composer.js";

const key = (more = {}) => ({ key: "Enter", keyCode: 13, nativeEvent: {}, ...more });
// Устройство: сенсорный экран и ширина — как матчат медиазапросы
const device = (coarse, width) => {
  globalThis.matchMedia = (q) => ({ matches: q.includes("coarse") ? coarse : q.includes("max-width: 1024px") ? width <= 1024 : false });
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

test("компьютер: Enter — отправить, Shift+Enter — новая строка, Ctrl+Enter — отправить", () => {
  assert.equal(enterAction(key(), true), "send");
  assert.equal(enterAction(key({ shiftKey: true }), true), null);
  assert.equal(enterAction(key({ ctrlKey: true }), true), "send");
  assert.equal(enterAction(key({ metaKey: true }), true), "send");
});

test("телефон (Enter не отправляет): Enter — новая строка, Ctrl+Enter — всё же отправить", () => {
  assert.equal(enterAction(key(), false), null);
  assert.equal(enterAction(key({ ctrlKey: true }), false), "send");
});

test("набор через IME / экранную клавиатуру — Enter не трогаем", () => {
  assert.equal(enterAction(key({ nativeEvent: { isComposing: true } }), true), null);
  assert.equal(enterAction(key({ keyCode: 229 }), true), null);
  assert.equal(enterAction(key({ isComposing: true, ctrlKey: true }), true), null);
});

test("другие клавиши — не наше дело", () => {
  assert.equal(enterAction({ key: "a", nativeEvent: {} }, true), null);
});

test("по умолчанию: компьютер — Enter отправляет, телефон и планшет — нет", () => {
  store.clear();
  device(false, 1440); assert.equal(touchLike(), false); assert.equal(readEnterSends(), true);
  device(false, 390); assert.equal(readEnterSends(), true, "узкое окно с мышью — всё ещё компьютер");
  device(true, 390); assert.equal(touchLike(), true); assert.equal(readEnterSends(), false);
  device(true, 1366); assert.equal(readEnterSends(), true, "большой сенсорный экран (ноутбук) — как компьютер");
});

test("выбор в Настройках важнее устройства", () => {
  device(true, 390); store.set("nexa-enter-sends", "1"); assert.equal(readEnterSends(), true);
  device(false, 1440); store.set("nexa-enter-sends", "0"); assert.equal(readEnterSends(), false);
  store.clear();
});
