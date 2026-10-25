// Сбор непонятых фраз NEXA Mini (src/lib/mini/collect.js, api/phrases.js) и исправленные правила команд
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  phraseProblem, worthCollecting, enqueuePhrase, takeBatch, emptyQueue, shouldAsk,
  COLLECT_DAY_MAX, COLLECT_SEND_GAP_MS,
} from "../src/lib/mini/collect.js";

register("./helpers/stub-hooks.mjs", import.meta.url);
const { parseCommand } = await import("../src/lib/commands.js");

const unsure = (label = "NAV_FILES", confidence = 0.6) => ({ run: null, reason: "unsure", guess: { label, confidence, margin: 0.1 } });
const add = (q, text, extra = {}) => enqueuePhrase(q, { text, decision: unsure(), consent: true, online: true, ...extra });

test("фильтр: пароли, ссылки, почты, телефоны, длинные числа, длина, память", () => {
  assert.equal(phraseProblem("файлы не загружаются"), null);
  assert.equal(phraseProblem("пароль: Qwerty12345"), "number");
  assert.equal(phraseProblem("какой у меня пароль от вайфай"), "sensitive");
  assert.equal(phraseProblem("вот ключ Ab3xZ9qL"), "sensitive");
  assert.equal(phraseProblem("Открой Настройки, пожалуйста"), null);
  assert.equal(phraseProblem("мой пароль kT9#mZ2!xQ"), "sensitive");
  assert.equal(phraseProblem("открой https://example.com"), "link");
  assert.equal(phraseProblem("открой сайт nexa-link.ru"), "link");
  assert.equal(phraseProblem("напиши на ivan@mail.ru"), "link");
  assert.equal(phraseProblem("позвони +7 912 345 67 89"), "number");
  assert.equal(phraseProblem("карта 4276 1600 1234 5678"), "number");
  assert.equal(phraseProblem("код 123456"), "number");
  assert.equal(phraseProblem("раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать"), "long");
  assert.equal(phraseProblem("раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать"), null);
  assert.equal(phraseProblem("а".repeat(121)), "long");
  assert.equal(phraseProblem("запомни что я живу в Казани"), "memory");
  assert.equal(phraseProblem("Забудь всё"), "memory");
  assert.equal(phraseProblem("   "), "empty");
});

test("собираем только непонятое Mini", () => {
  assert.equal(worthCollecting(unsure()), true);
  assert.equal(worthCollecting({ run: null, reason: "no-cue", guess: { label: "ADD_DEVICE", confidence: 0.95 } }), true);
  assert.equal(worthCollecting({ run: { action: "navigate" }, reason: "ok", guess: { label: "NAV_FILES", confidence: 1 } }), false, "выполнено — не берём");
  assert.equal(worthCollecting({ run: null, reason: "question" }), false, "вопрос-объяснение");
  assert.equal(worthCollecting({ run: null, reason: "long" }), false);
  assert.equal(worthCollecting({ run: null, reason: "not-runnable", guess: { label: "GENERAL", confidence: 1 } }), false, "обычный вопрос к Gemini");
  assert.equal(worthCollecting({ run: null, reason: "unsure", guess: { label: "NAV_FILES", confidence: 0 } }), false, "нулевая уверенность");
  assert.equal(worthCollecting(null), false, "Mini не загрузилась / правило / файл");
});

test("без согласия ничего не копится и не отправляется", () => {
  const q = enqueuePhrase(emptyQueue(), { text: "файлы не грузятся", decision: unsure(), consent: false, online: true });
  assert.equal(q.items.length, 0);
  const full = add(emptyQueue(), "файлы не грузятся");
  assert.equal(full.items.length, 1);
  assert.equal(takeBatch(full, { consent: false, online: true }).batch.length, 0, "отозвали согласие — не уходит");
});

test("без сети не копим и не шлём", () => {
  assert.equal(add(emptyQueue(), "файлы не грузятся", { online: false }).items.length, 0);
  assert.equal(takeBatch(add(emptyQueue(), "файлы не грузятся"), { consent: true, online: false }).batch.length, 0);
});

test("дубли не шлём (и после отправки тоже)", () => {
  let q = add(emptyQueue(), "Файлы не грузятся");
  q = add(q, "файлы   не грузятся");
  assert.equal(q.items.length, 1);
  const { queue } = takeBatch(q, { consent: true, online: true, now: Date.now() });
  assert.equal(add(queue, "файлы не грузятся").items.length, 0);
});

test("не больше 20 фраз в сутки; пачкой не чаще раза в 5 минут", () => {
  const now = 1_000_000_000;
  let q = emptyQueue();
  for (let i = 0; i < 30; i++) q = enqueuePhrase(q, { text: `непонятная фраза ${"абвгдежзийклмнопрстуфхцчшщ"[i]}`, decision: unsure(), consent: true, online: true, now });
  assert.equal(q.items.length, COLLECT_DAY_MAX);
  const first = takeBatch(q, { consent: true, online: true, now });
  assert.equal(first.batch.length, COLLECT_DAY_MAX);
  // Сразу ещё одна фраза — сутки уже выбраны
  const more = enqueuePhrase(first.queue, { text: "ещё одна новая фраза", decision: unsure(), consent: true, online: true, now: now + 1000 });
  assert.equal(more.items.length, 0);
  // Через сутки — снова можно
  const next = enqueuePhrase(first.queue, { text: "ещё одна новая фраза", decision: unsure(), consent: true, online: true, now: now + 25 * 3600e3 });
  assert.equal(next.items.length, 1);
  // Пачки не чаще раза в 5 минут
  const q2 = { ...add(emptyQueue(), "первая фраза"), lastSend: now };
  assert.equal(takeBatch(q2, { consent: true, online: true, now: now + 1000 }).batch.length, 0);
  assert.equal(takeBatch(q2, { consent: true, online: true, now: now + COLLECT_SEND_GAP_MS + 1 }).batch.length, 1);
});

test("окно-вопрос: спрашиваем один раз; отказ или закрытие не переспрашивают", () => {
  assert.equal(shouldAsk({ consent: false, asked: false }), true);
  assert.equal(shouldAsk({ consent: false, asked: true }), false);
  assert.equal(shouldAsk({ consent: true, asked: false }), false);
});

test("сервер: проверяет фразы сам, пишет без аккаунта, лимит пачки", async () => {
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const { default: handler, __setAdmin, cleanPhrase } = await import("../api/phrases.js");
  const inserted = [];
  __setAdmin({ from: (t) => ({ insert: async (rows) => { inserted.push({ t, rows }); return { error: null }; } }) });
  const call = async (body, headers = {}) => {
    const res = { code: 0, body: null, h: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.h[k] = v; } };
    await handler({ method: "POST", headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers }, body }, res);
    return res;
  };
  let r = await call({ phrases: [
    { text: "файлы не грузятся", intent: "NAV_FILES", confidence: 0.61 },
    { text: "Файлы не грузятся", intent: "NAV_FILES", confidence: 0.6 },
    { text: "пароль: Qwerty12345", intent: "GENERAL", confidence: 0.5 },
    { text: "https://evil.example", intent: "GENERAL", confidence: 0.5 },
    { text: "ок", intent: "<script>", confidence: 7 },
  ] });
  assert.equal(r.code, 200); assert.equal(r.body.saved, 2);
  assert.equal(inserted[0].t, "mini_phrases");
  assert.deepEqual(inserted[0].rows[0], { text: "файлы не грузятся", intent_guess: "NAV_FILES", confidence: 0.61 });
  assert.deepEqual(inserted[0].rows[1], { text: "ок", intent_guess: null, confidence: null });
  for (const row of inserted[0].rows) assert.deepEqual(Object.keys(row).sort(), ["confidence", "intent_guess", "text"], "только текст, догадка и уверенность");
  r = await call({ phrases: Array.from({ length: 21 }, (_, i) => ({ text: "фраза " + i })) });
  assert.equal(r.code, 400, "больше 20 за раз — отказ");
  r = await call({ nothing: true });
  assert.equal(r.code, 400);
  r = await call({ phrases: [{ text: "x" }] }, { origin: "http://tauri.localhost" });
  assert.equal(r.h["Access-Control-Allow-Origin"], "http://tauri.localhost");
  // Лимит с одного адреса: 3 пачки за 10 минут
  const ip = { "x-forwarded-for": "10.9.9.9" };
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call({ phrases: [{ text: "фраза номер " + "абвг"[i] }] }, ip)).code);
  assert.deepEqual(codes, [200, 200, 200, 429]);
  // База без таблицы — честно not_configured, без падения
  __setAdmin({ from: () => ({ insert: async () => ({ error: { code: "42P01" } }) }) });
  r = await call({ phrases: [{ text: "новая непонятая фраза" }] });
  assert.equal(r.body.reason, "not_configured");
  assert.equal(cleanPhrase({ text: "a".repeat(200) }), null);
});

test("исправленные правила команд", () => {
  assert.deepEqual(parseCommand("выключи светлую тему"), { action: "theme", params: { mode: "dark" } });
  assert.deepEqual(parseCommand("выключи тёмную тему"), { action: "theme", params: { mode: "light" } });
  assert.deepEqual(parseCommand("включи тёмную тему"), { action: "theme", params: { mode: "dark" } });
  assert.equal(parseCommand("почему не выключается тёмная тема"), null);
  assert.equal(parseCommand("как подключить наушники к телефону"), null);
  assert.equal(parseCommand("удали устройство"), null);
  assert.equal(parseCommand("удали все файлы"), null);
  assert.deepEqual(parseCommand("подключи телефон"), { action: "addDevice", params: {} });
  assert.deepEqual(parseCommand("открой файлы"), { action: "navigate", params: { tab: "files" } });
});
