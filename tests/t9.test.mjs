// NEXA mini-1 · локальные подсказки при наборе (src/lib/mini/t9.js)
import test from "node:test";
import assert from "node:assert/strict";
import { buildT9, localSuggest } from "../src/lib/mini/t9.js";

test("посреди слова — дописывает самое частое подходящее", () => {
  const m = buildT9(["Подготовить презентацию для клиента. Презентацию отправить вечером.", "презентацию показать"]);
  assert.equal(localSuggest("Нужно сделать през", m), "ентацию");
  assert.equal(localSuggest("ПРЕЗ", m), "ЕНТАЦИЮ", "регистр как у начала");
  assert.equal(localSuggest("п", m), "", "одна буква — рано");
  assert.equal(localSuggest("Нужно презентацию", m), "", "слово уже дописано");
});

test("после пробела — слово, которое обычно идёт следом", () => {
  const m = buildT9(["купить молоко", "купить молоко и хлеб", "купить хлеб"]);
  assert.equal(localSuggest("Завтра купить ", m), "молоко");
  assert.equal(localSuggest("Завтра позвонить ", m), "", "пары нет — молчим (подскажет сервер)");
  assert.equal(localSuggest("Список\n", m), "", "новая строка — не локально");
});

test("слова самой заметки тоже учитываются", () => {
  const m = buildT9([]);
  assert.equal(localSuggest("Кривошеин звонил. Потом Крив", m), "ошеин");
});

test("словарь частых слов работает без заметок", () => {
  const m = buildT9([]);
  assert.equal(localSuggest("Надо позв", m), "онить");
});
