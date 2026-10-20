// Голосовой вывод (src/lib/speechText.js): что читаем вслух и как режем на фразы.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { speechText, speechParts } from "../src/lib/speechText.js";

test("разметка убирается, текст остаётся", () => {
  assert.equal(speechText("**Главное**: пейте *воду* и __спите__"), "Главное: пейте воду и спите.");
  assert.equal(speechText("# Заголовок\n- первый пункт\n- второй пункт\n1. третий"), "Заголовок. первый пункт. второй пункт. третий.");
  assert.equal(speechText("> цитата"), "цитата.");
  assert.equal(speechText("<b>жирный</b> текст"), "жирный текст.");
});

test("ссылки не читаются целиком", () => {
  assert.equal(speechText("Смотрите [документацию](https://example.com/a/b?x=1)."), "Смотрите документацию.");
  assert.equal(speechText("Адрес: https://www.gismeteo.ru/weather-kazan-4364/now/"), "Адрес: ссылка на gismeteo.ru.");
});

test("блоки кода пропускаются, код в строке — как текст", () => {
  const t = speechText("Пример:\n```js\nconst a = 1;\nconsole.log(a);\n```\nВызовите `start()`.");
  assert.ok(!/const|console/.test(t), t);
  assert.ok(/Пример кода пропущен/.test(t), t);
  assert.ok(/start\(\)/.test(t), t);
});

test("пустой текст и одна разметка — читать нечего", () => {
  assert.equal(speechText(""), "");
  assert.equal(speechText("   \n**\n"), "");
  assert.deepEqual(speechParts(speechText("```\nкод\n```").replace("Пример кода пропущен.", "")), []);
});

test("точка внутри адреса или числа — не конец фразы", () => {
  assert.deepEqual(speechParts("Смотрите ссылка на example.com и версию 3.5 сегодня. Готово!"), ["Смотрите ссылка на example.com и версию 3.5 сегодня.", "Готово!"]);
});

test("длинный текст режется на фразы не длиннее предела", () => {
  const long = "Это очень длинное предложение без точки, " + "в котором много слов и запятых, ".repeat(20) + "и в конце точка.";
  const parts = speechParts("Короткое. " + long + " Ещё одно!");
  assert.equal(parts[0], "Короткое.");
  assert.equal(parts.at(-1), "Ещё одно!");
  assert.ok(parts.every((p) => p.length <= 220), parts.map((p) => p.length).join(","));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), ("Короткое. " + long + " Ещё одно!").replace(/\s+/g, " "));
});
