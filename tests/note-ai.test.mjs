// ИИ в заметках: правила подсказки и вставки результата (src/lib/noteText.js)
import test from "node:test";
import assert from "node:assert/strict";
import { suggestionWanted, joinSuggestion, replaceRange, appendContinuation, SUGGEST_MAX_CHARS } from "../src/lib/noteText.js";

test("подсказка нужна только когда курсор в конце и текста достаточно", () => {
  const t = "Сегодня я хочу разра";
  assert.equal(suggestionWanted(t, t.length, t.length), true);
  assert.equal(suggestionWanted(t, 3, 3), false, "курсор не в конце");
  assert.equal(suggestionWanted(t, 0, t.length), false, "есть выделение");
  assert.equal(suggestionWanted("Привет", 6, 6), false, "слишком коротко");
  const para = "Сегодня я хочу работать над длинной статьёй про устройство системы и её части.\n";
  assert.equal(suggestionWanted(para, para.length, para.length), false, "новая строка после абзаца");
  const list = "Дела на завтра\n☐ Купить молоко\n☐ ";
  assert.equal(suggestionWanted(list, list.length, list.length), true, "пустой пункт списка — подсказать следующий");
  const plain = "Купить молоко\nПозвонить маме\n";
  assert.equal(suggestionWanted(plain, plain.length, plain.length), true, "короткие строки подряд — тоже список");
  const dash = "Покупки:\n- хлеб\n";
  assert.equal(suggestionWanted(dash, dash.length, dash.length), true, "пункт с дефисом");
  assert.equal(suggestionWanted("Сегодня я хочу работать ", 24, 24), true, "пробел в конце — можно");
});

test("стык подсказки с набранным", () => {
  assert.equal(joinSuggestion("Сегодня я хочу разра", "ботать интерфейс"), "ботать", "посреди слова — только его конец");
  assert.equal(joinSuggestion("Сегодня я хочу ", " работать"), "работать", "второй пробел не нужен");
  assert.equal(joinSuggestion("Сегодня я хочу", " работать"), " работать");
  assert.equal(joinSuggestion("Привет,", "как дела"), " как", "после запятой нужен пробел, одно слово");
  assert.equal(joinSuggestion("Привет", "\n\n  как   дела\t"), " как", "переводы строк схлопываются");
  assert.equal(joinSuggestion("Дела:\n☐ Купить молоко\n☐ ", "Позвонить маме"), "Позвонить маме", "новый пункт списка — целиком");
});

test("пустая и длинная подсказка", () => {
  assert.equal(joinSuggestion("Сегодня я хочу", "   "), "");
  assert.equal(joinSuggestion("Сегодня я хочу", ""), "");
  const long = Array.from({ length: 60 }, (_, i) => "слово" + i).join(" ");
  const out = joinSuggestion("Дела:\n- хлеб\n", long);
  assert.ok(out.length <= SUGGEST_MAX_CHARS && !out.endsWith(" "));
  assert.ok(out.split(" ").every((w) => /^слово\d+$/.test(w)), "режем по слову, не посередине");
});

test("замена выделенного фрагмента и устаревший ответ", () => {
  const text = "раз два три четыре";
  assert.deepEqual(replaceRange(text, 4, 7, "два", "ДВА"), { text: "раз ДВА три четыре", caret: 7 });
  // Текст сдвинулся, пока шёл запрос, — фрагмент ищем заново
  assert.deepEqual(replaceRange("НОВОЕ раз два три четыре", 4, 7, "два", "ДВА"), { text: "НОВОЕ раз ДВА три четыре", caret: 13 });
  // Фрагмент исчез — ничего не портим
  assert.equal(replaceRange("раз три", 4, 7, "два", "ДВА"), null);
});

test("продолжение дописывается в конец", () => {
  assert.deepEqual(appendContinuation("Сегодня хорошо", "Завтра будет лучше"), { text: "Сегодня хорошо Завтра будет лучше", caret: 33 });
  assert.deepEqual(appendContinuation("Строка\n", "Дальше"), { text: "Строка\nДальше", caret: 13 });
  assert.equal(appendContinuation("текст", "   "), null);
});
