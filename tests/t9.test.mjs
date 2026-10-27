// NEXA mini-1 · локальные подсказки при наборе (src/lib/mini/t9.js)
import test from "node:test";
import assert from "node:assert/strict";
import { buildT9, localSuggest, emptyFeedback, learnFeedback, suggestionContext } from "../src/lib/mini/t9.js";

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

test("контекст: два прошлых слова важнее одного", () => {
  // После «купить» чаще «хлеб», но после «маме купить» человек пишет «цветы»
  const m = buildT9(["купить хлеб", "купить хлеб", "купить хлеб", "маме купить цветы", "маме купить цветы"]);
  assert.equal(localSuggest("Завтра купить ", m), "хлеб");
  assert.equal(localSuggest("Не забыть маме купить ", m), "цветы");
  assert.equal(localSuggest("Не забыть маме купить цв", m), "еты", "и при дописывании слова");
});

test("контекст: тема заметки выбирает нужное слово", () => {
  // «пре…»: в целом чаще «премия», но в заметке про дизайн и макеты — «презентация»
  const m = buildT9(["премия премия премия за квартал", "дизайн макет презентация интерфейс", "макет интерфейс презентация"]);
  assert.equal(localSuggest("Зарплата и пре", m), "мия");
  assert.equal(localSuggest("Сегодня правим дизайн и макет интерфейса, потом пре", m), "зентация");
});

test("обратная связь: какое слово и после какого предлагалось", () => {
  assert.deepEqual(suggestionContext("Завтра купить мол", "око"), { word: "молоко", prev: "купить" });
  assert.deepEqual(suggestionContext("Список\nкупить ", "хлеб"), { word: "хлеб", prev: "купить" });
});

test("обратная связь: отклонённое слово перестаёт предлагаться, принятое — набирает вес", () => {
  const m = buildT9(["премия премия за квартал", "презентация"]);
  const fb = emptyFeedback();
  assert.equal(localSuggest("пре", m, fb), "мия");
  // Человек трижды напечатал другое вместо «премия»
  for (let i = 0; i < 3; i++) learnFeedback(fb, "пре", "мия", false, 3);
  assert.equal(localSuggest("пре", m, fb), "зентация");
  // Пара: «купить молоко» встречалась один раз — обычно мало, но человек её уже принимал
  const m2 = buildT9(["купить молоко"]);
  assert.equal(localSuggest("купить ", m2, emptyFeedback()), "");
  const fb2 = emptyFeedback();
  learnFeedback(fb2, "купить ", "молоко", true);
  assert.equal(localSuggest("купить ", m2, fb2), "молоко");
  // Отклонённое продолжение больше не показываем
  const m3 = buildT9(["купить хлеб", "купить хлеб"]);
  const fb3 = emptyFeedback();
  for (let i = 0; i < 3; i++) learnFeedback(fb3, "купить ", "хлеб", false);
  assert.equal(localSuggest("купить ", m3, fb3), "");
});
