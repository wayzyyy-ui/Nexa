// NEXA Mini (src/lib/mini): своя небольшая нейросеть, которая узнаёт команды ассистента.
// Проверяем: данные чистые, сеть правда учится, сохранённые веса работают, неуверенное и «вопросы» не выполняются,
// и сколько обращений к Gemini убирает Mini. Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { TRAINING_DATA, LABELS } from "../src/lib/mini/trainingData.js";
import { HOLDOUT } from "../src/lib/mini/holdout.js";
import { trainModel, flatten, evaluate, splitData } from "../src/lib/mini/train.js";
import { modelFromJSON, modelToJSON, predict } from "../src/lib/mini/model.js";
import { normalize, featurize, DIM } from "../src/lib/mini/features.js";
import { decide, setMiniModel, miniCommand, INTENT_ACTIONS } from "../src/lib/mini/index.js";

register("./helpers/stub-hooks.mjs", import.meta.url);
const { parseCommand } = await import("../src/lib/commands.js");

const weights = JSON.parse(readFileSync(new URL("../src/lib/mini/weights.json", import.meta.url), "utf8"));
const net = modelFromJSON(weights);
setMiniModel(net);
const holdout = flatten(HOLDOUT);

test("обучающие данные: нет одинаковых фраз у разных намерений, holdout не пересекается с обучением", () => {
  const seen = new Map();
  for (const ex of [...flatten(TRAINING_DATA), ...holdout]) {
    const key = normalize(ex.text);
    assert.ok(key, "пустая фраза");
    assert.ok(!seen.has(key), `«${ex.text}» повторяется (${seen.get(key)} и ${ex.label})`);
    seen.set(key, ex.label);
  }
  for (const l of Object.keys(HOLDOUT)) assert.ok(LABELS.includes(l), `в holdout неизвестное намерение ${l}`);
  for (const l of LABELS) assert.ok(TRAINING_DATA[l].length >= 25, `мало примеров у ${l}`);
});

test("признаки: фраза → разреженный вектор длиной 1, опечатка остаётся похожей", () => {
  const f = featurize("Открой  ФАЙЛЫ!");
  assert.deepEqual(f.words, 2);
  assert.ok(f.idx.every((i) => i >= 0 && i < DIM));
  const norm = Math.sqrt(f.val.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-4);
  const a = new Set(featurize("открой файлы").idx);
  const b = new Set(featurize("открй фаилы").idx);
  const common = [...a].filter((i) => b.has(i)).length;
  assert.ok(common / a.size > 0.2, "опечатка не должна делать фразу совсем чужой");
});

test("обучение: ошибка падает, сеть запоминает обучающие примеры, одинаковое зерно даёт одинаковые веса", () => {
  const { train } = splitData(TRAINING_DATA, 5);
  const opts = { hidden: 16, epochs: 25, typos: 0, seed: 3 };
  const run = trainModel(train, LABELS, opts);
  const first = run.history[0].loss;
  const last = run.history[run.history.length - 1].loss;
  assert.ok(last < first / 4, `ошибка не упала: ${first} → ${last}`);
  assert.ok(evaluate(run.model, train).accuracy > 0.95);
  const again = trainModel(train, LABELS, { ...opts, epochs: 3 });
  const again2 = trainModel(train, LABELS, { ...opts, epochs: 3 });
  assert.deepEqual(Array.from(again.model.W1.slice(0, 200)), Array.from(again2.model.W1.slice(0, 200)));
});

test("веса: сохраняются и читаются обратно с тем же ответом; битые веса отклоняются", () => {
  const { model } = trainModel(flatten({ A: ["один", "раз"], B: ["два", "дважды"] }), ["A", "B"], { hidden: 4, epochs: 30, typos: 0 });
  const back = modelFromJSON(JSON.parse(JSON.stringify(modelToJSON(model, { x: 1 }))));
  assert.equal(predict(back, "один").label, predict(model, "один").label);
  assert.throws(() => modelFromJSON({ format: "other" }), /Неизвестный формат/);
  assert.throws(() => modelFromJSON({ ...weights, dim: 5 }), /другого размера/);
  assert.throws(() => modelFromJSON({ ...weights, W2: weights.W2.slice(1) }), /повреждены/);
});

test("сохранённая сеть: точность на фразах, которых не было в обучении", () => {
  const r = evaluate(net, holdout);
  assert.ok(r.accuracy >= 0.85, `holdout ${(r.accuracy * 100).toFixed(1)}% — ниже 85%`);
});

test("Mini выполняет только то, что ассистент умеет, и только с подтверждением", () => {
  assert.equal(weights.meta.threshold >= 0.8, true);
  for (const [intent, act] of Object.entries(INTENT_ACTIONS)) {
    assert.ok(LABELS.includes(intent));
    if (act) assert.ok(["theme", "navigate", "summary", "devices", "addDevice", "help"].includes(act.action));
  }
  assert.equal(INTENT_ACTIONS.UPLOAD, null, "окно выбора файла Mini не открывает");
  assert.equal(INTENT_ACTIONS.GENERAL, null);
});

test("вопросы и неуверенные фразы не становятся командами", () => {
  const questions = [
    "объясни почему не работает синхронизация устройств", "расскажи про светлую тему в дизайне", "почему не подключается телефон",
    "как включить темную тему в хроме", "что такое менеджер файлов", "как подключить телефон к телевизору по wifi",
    "напиши план на сегодня для учебы", "какая температура кипения воды", "спасибо", "привет как дела",
  ];
  for (const q of questions) assert.equal(miniCommand(q), null, `«${q}» не должна выполняться`);
  assert.equal(miniCommand(""), null);
  assert.equal(miniCommand("открой файлы " + "очень ".repeat(12)), null, "длинное сообщение — разговор");
  assert.equal(decide(net, "открой файлы", { threshold: 1.01 }).reason, "unsure", "порог выше 1 — не уверена никогда");
});

test("предохранитель тем: противоречивые и перепутанные фразы не превращаются в чужую тему", () => {
  // «поярче» и «слишком темно» вместе — неясно, чего хотят: не выполняем
  for (const q of ["мне слишком темно сделай поярче интерфейс", "сделай не темно а светло"]) assert.equal(miniCommand(q), null, `«${q}»`);
  // «ярче» без слов про темноту — это светлая тема или ничего, но не тёмная
  const run = miniCommand("ярче сделай интерфейс");
  assert.ok(!run || run.intent === "THEME_LIGHT");
  // ясные фразы про ночь работают
  const night = miniCommand("хочу ночь вместо дня");
  assert.ok(!night || night.intent === "THEME_DARK");
});

test("команды из holdout: нужное действие или null, но не чужое действие", () => {
  let wrong = 0;
  for (const ex of holdout) {
    const run = miniCommand(ex.text);
    const want = INTENT_ACTIONS[ex.label] ? ex.label : null;
    if (run && run.intent !== want) { wrong++; assert.fail(`«${ex.text}» (${ex.label}) выполнена как ${run.intent}`); }
  }
  assert.equal(wrong, 0);
});

test("сколько обращений к Gemini убирает Mini (на фразах holdout: их не было в обучении)", (t) => {
  let before = 0, after = 0, miniOnly = 0, gemini = 0;
  for (const ex of holdout) {
    const byRules = parseCommand(ex.text);
    const byMini = byRules ? null : miniCommand(ex.text);
    if (!byRules) before++; // правила не поняли — раньше ушло бы в Gemini
    if (!byRules && !byMini) after++;
    if (byMini) miniOnly++;
    if (ex.label === "GENERAL") gemini++;
  }
  t.diagnostic(`фраз ${holdout.length}, из них настоящих вопросов (должны уйти в Gemini) ${gemini}`);
  t.diagnostic(`в Gemini ушло бы только с правилами: ${before}, с правилами и Mini: ${after}; Mini забрала себе: ${miniOnly}`);
  assert.ok(after <= before);
  assert.ok(miniOnly > 0, "Mini должна хоть что-то брать на себя");
  assert.ok(after >= gemini, "Mini не должна забирать настоящие вопросы");
});
