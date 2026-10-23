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
  assert.equal(suggestionWanted("Сегодня я хочу работать\n", 24, 24), false, "новая строка");
  assert.equal(suggestionWanted("Сегодня я хочу работать ", 24, 24), true, "пробел в конце — можно");
});

test("стык подсказки с набранным", () => {
  assert.equal(joinSuggestion("Сегодня я хочу разра", "ботать интерфейс"), "ботать интерфейс");
  assert.equal(joinSuggestion("Сегодня я хочу ", " работать"), "работать", "второй пробел не нужен");
  assert.equal(joinSuggestion("Сегодня я хочу", " работать"), " работать");
  assert.equal(joinSuggestion("Привет,", "как дела"), " как дела", "после запятой нужен пробел");
  assert.equal(joinSuggestion("Привет", "\n\n  как   дела\t"), " как дела".trimStart() === "как дела" ? " как дела" : "", "переводы строк схлопываются");
});

test("пустая и длинная подсказка", () => {
  assert.equal(joinSuggestion("Сегодня я хочу", "   "), "");
  assert.equal(joinSuggestion("Сегодня я хочу", ""), "");
  const long = Array.from({ length: 60 }, (_, i) => "слово" + i).join(" ");
  const out = joinSuggestion("Сегодня я хочу ", long);
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
