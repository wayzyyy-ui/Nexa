// Возврат в NEXA после фона (src/lib/lifecycle.js): когда освежать данные, а когда нет.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { returnTracker } from "../src/lib/lifecycle.js";

const S = 1000;

test("короткое переключение (меньше 30 с) — ничего не делаем", () => {
  const t = returnTracker();
  t.hide(0);
  assert.equal(t.show(29 * S), false);
});

test("долгий фон — освежаем один раз", () => {
  const t = returnTracker();
  t.hide(0);
  assert.equal(t.show(31 * S), true);
  assert.equal(t.show(31 * S + 10), false, "второй сигнал «вернулись» (resume после visibilitychange) — без повтора");
});

test("сигналы ухода дважды (pause + visibilitychange) не сдвигают время ухода", () => {
  const t = returnTracker();
  t.hide(0);
  t.hide(25 * S);
  assert.equal(t.show(31 * S), true);
});

test("не чаще раза в 30 с, даже если уходили надолго", () => {
  const t = returnTracker({ minHiddenMs: 30 * S, gapMs: 60 * S });
  t.hide(0);
  assert.equal(t.show(40 * S), true);
  t.hide(41 * S);
  assert.equal(t.show(75 * S), false, "прошло 35 с с прошлого раза — рано");
  t.hide(76 * S);
  assert.equal(t.show(140 * S), true);
});

test("«вернулись» без «ушли» (первый запуск) — ничего не делаем", () => {
  const t = returnTracker();
  assert.equal(t.show(100 * S), false);
});

test("часы устройства перевели назад — не срабатывает и не ломается", () => {
  const t = returnTracker();
  t.hide(100 * S);
  assert.equal(t.show(50 * S), false);
  t.hide(60 * S);
  assert.equal(t.show(100 * S), true);
});
