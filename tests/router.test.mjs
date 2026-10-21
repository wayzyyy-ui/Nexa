// Адреса и история (src/lib/router.js): какой шаг сделать с историей браузера.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { planNavigate, screenFromPath, pathOf, titleOf, HOME } from "../src/lib/router.js";

const T = (tab) => ({ tab, sub: null, dev: null });
const E = (s, l = 0) => ({ s, l });
// Модель истории: применяем план к стопке, как это сделает браузер
function step(h, s) {
  for (const op of planNavigate(h.stack, h.idx, s)) {
    if (op.t === "go") h.idx += op.n;
    else if (op.t === "push") { h.stack.length = h.idx + 1; h.stack.push(E(op.s)); h.idx++; }
    else h.stack[h.idx] = E(op.s);
  }
  return h;
}
const at = (h) => h.stack[h.idx].s;
const start = () => ({ stack: [E(HOME)], idx: 0 });

test("адреса разделов и экранов", () => {
  assert.deepEqual(screenFromPath("/"), HOME);
  assert.deepEqual(screenFromPath("/files"), T("files"));
  assert.deepEqual(screenFromPath("/files/"), T("files"));
  assert.deepEqual(screenFromPath("/about"), { tab: "home", sub: "about", dev: null });
  assert.deepEqual(screenFromPath("/device/3f2a-11"), { tab: "home", sub: null, dev: "3f2a-11" });
  assert.equal(screenFromPath("/nope"), null);
  assert.equal(screenFromPath("/device/a/b"), null);
  assert.equal(screenFromPath("/device/%E0%A4%A"), null, "битый адрес — не падаем");
  assert.equal(pathOf({ tab: "files", sub: null, dev: "x y" }), "/device/x%20y");
  assert.equal(pathOf({ tab: "settings", sub: "security", dev: null }), "/security");
  assert.equal(titleOf(HOME), "NEXA Hub — смартфон, ноутбук и часы в одной системе");
  assert.equal(titleOf(T("today")), "Сегодня · NEXA");
});

test("с Главной в раздел — новая запись, между разделами — замена", () => {
  const h = step(start(), T("files"));
  assert.equal(h.stack.length, 2);
  step(h, T("today")); step(h, T("media"));
  assert.equal(h.stack.length, 2, "свайпы и панель не раздувают историю");
  assert.deepEqual(at(h), T("media"));
  // Назад (браузер) → Главная
  h.idx--; assert.deepEqual(at(h), HOME);
});

test("на Главную нажатием — шаг назад, а не новая запись", () => {
  const h = step(step(start(), T("files")), HOME);
  assert.equal(h.idx, 0);
  assert.deepEqual(at(h), HOME);
});

test("экран устройства поверх раздела — своя запись, закрыли — шаг назад", () => {
  const h = step(step(start(), T("today")), { tab: "today", sub: null, dev: "d1" });
  assert.equal(h.stack.length, 3);
  step(h, T("today"));
  assert.equal(h.idx, 1);
  assert.deepEqual(at(h), T("today"));
});

test("«Все устройства» → устройство → назад к списку → назад на Главную", () => {
  const list = { tab: "home", sub: "devices", dev: null };
  const h = step(step(start(), list), { ...list, dev: "d1" });
  assert.equal(h.stack.length, 3);
  step(h, list); assert.equal(h.idx, 1);
  step(h, HOME); assert.equal(h.idx, 0);
});

test("из экрана устройства — в другой раздел: Назад всё равно ведёт на Главную", () => {
  const h = step(step(start(), T("today")), { tab: "today", sub: null, dev: "d1" });
  step(h, T("media"));
  assert.deepEqual(at(h), T("media"));
  assert.equal(h.idx, 1, "запись устройства ушла, раздел стоит сразу над Главной");
  assert.deepEqual(h.stack[0].s, HOME);
});

test("центр безопасности из Настроек: Назад — в Настройки", () => {
  const sec = { tab: "settings", sub: "security", dev: null };
  const h = step(step(start(), T("settings")), sec);
  step(h, T("settings"));
  assert.equal(h.idx, 1);
  assert.deepEqual(at(h), T("settings"));
});

test("смена экрана при открытом окне — запись окна уходит", () => {
  const h = step(start(), T("files"));
  h.stack.push(E(T("files"), 1)); h.idx = 2; // открыто окно
  const ops = planNavigate(h.stack, h.idx, T("today"));
  assert.deepEqual(ops[0], { t: "go", n: -1 });
  step(h, T("today"));
  assert.equal(h.idx, 1);
  assert.deepEqual(at(h), T("today"));
});

test("тот же экран — ничего не делаем", () => {
  assert.deepEqual(planNavigate([E(HOME), E(T("files"))], 1, T("files")), []);
});

test("неизвестная история снизу (после перезагрузки) — замена", () => {
  const ops = planNavigate([null, E(T("files"))], 1, T("today"));
  assert.deepEqual(ops, [{ t: "replace", s: T("today") }]);
});
