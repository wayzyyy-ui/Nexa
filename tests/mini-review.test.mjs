// Дообучение NEXA Mini на настоящих фразах: CSV, повторы, раскладка по файлам, выгрузка с сервера по секрету
import { test } from "node:test";
import assert from "node:assert/strict";
import { newReviewRows, toCsv, parseCsv, planMerge, insertPhrases, knownKeys, HOLDOUT_EVERY } from "../scripts/mini/review-lib.mjs";

const TRAINING = { HELP: ["что ты умеешь"], NAV_FILES: ["открой файлы"], GENERAL: ["как дела"] };
const HOLD = { HELP: ["чем можешь помочь"], NAV_FILES: [], GENERAL: [] };
const LABELS = Object.keys(TRAINING);

test("выгрузка: без повторов, без известного обучению, без уже лежащего в CSV и без личного", () => {
  const rows = newReviewRows([
    { text: "файлы не грузятся", intent_guess: "NAV_FILES", confidence: 0.612 },
    { text: "Файлы не грузятся!", intent_guess: "NAV_FILES", confidence: 0.6 },
    { text: "Открой файлы", intent_guess: "NAV_FILES", confidence: 0.7 },   // уже в обучении
    { text: "чем можешь помочь?", intent_guess: "HELP", confidence: 0.7 },  // уже в holdout
    { text: "открой ютуб", intent_guess: "NAV_TODAY", confidence: 0.5 },    // уже в CSV
    { text: "мой пароль Kx8#pQ2z", intent_guess: "GENERAL", confidence: 0.5 },
  ], { known: knownKeys(TRAINING, HOLD), existing: [{ text: "Открой ютуб", intent: "GENERAL" }] });
  assert.deepEqual(rows, [{ text: "файлы не грузятся", guess: "NAV_FILES", confidence: "0.61", intent: "" }]);
});

test("CSV: «;», кавычки, BOM, туда и обратно; «,» от редактора тоже читается", () => {
  const rows = [
    { text: "скажи \"привет\"; пожалуйста", guess: "GENERAL", confidence: "0.40", intent: "" },
    { text: "покажи фотки", guess: "NAV_MEDIA", confidence: "0.70", intent: "nav_media" },
  ];
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("﻿фраза;догадка сети;уверенность;правильное намерение\r\n"));
  const back = parseCsv(csv);
  assert.equal(back.length, 2);
  assert.equal(back[0].text, "скажи \"привет\"; пожалуйста");
  assert.equal(back[1].intent, "nav_media");
  assert.equal(back[1].line, 3);
  const comma = parseCsv("фраза,догадка сети,уверенность,правильное намерение\nоткрой фото,NAV_MEDIA,0.5,NAV_MEDIA\n");
  assert.deepEqual(comma.map((r) => [r.text, r.intent]), [["открой фото", "NAV_MEDIA"]]);
});

test("разметка: неизвестное намерение — ошибка, пустое — на потом, «-» — выбросить, повторы — пропуск", () => {
  const rows = [
    { line: 2, text: "файлы не грузятся", intent: "nav files" },
    { line: 3, text: "открой ютуб", intent: "" },
    { line: 4, text: "абырвалг", intent: "-" },
    { line: 5, text: "Открой файлы!", intent: "NAV_FILES" },
    { line: 6, text: "сделай красиво", intent: "MAGIC" },
  ];
  const plan = planMerge(rows, { labels: LABELS, training: TRAINING, holdout: HOLD });
  assert.deepEqual(plan.errors.map((e) => e.line), [6]);
  assert.deepEqual(plan.left.map((r) => r.line), [3]);
  assert.deepEqual(plan.skipped.map((r) => r.line), [4]);
  assert.deepEqual(plan.dups.map((r) => r.line), [5]);
  assert.deepEqual(plan.train, { NAV_FILES: ["файлы не грузятся"] }, "регистр и пробелы в намерении не мешают");
});

test("каждая 5-я добавленная фраза — в holdout, внутри разметки повторы не дублируются", () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ line: i + 2, text: `вопрос номер ${"абвгдежзикл"[i]}`, intent: "GENERAL" }));
  rows.push({ line: 13, text: "Вопрос номер а", intent: "GENERAL" });
  const plan = planMerge(rows, { labels: LABELS, training: TRAINING, holdout: HOLD });
  assert.equal(plan.added.length, 11);
  assert.equal(plan.dups.length, 1);
  assert.deepEqual(plan.holdout.GENERAL, ["вопрос номер д", "вопрос номер к"]);
  assert.equal(plan.train.GENERAL.length, 11 - 2);
  assert.equal(HOLDOUT_EVERY, 5);
});

test("запись в файл: новой строкой после «НАМЕРЕНИЕ: [», нет намерения — новый список; файл остаётся рабочим", async () => {
  const src = 'export const HOLDOUT = {\n  HELP: [\n    "a",\n  ],\n};\n\nexport const X = 1;\n';
  const out = insertPhrases(src, "HOLDOUT", { HELP: ["скажи \"да\""], NAV_FILES: ["где мои файлы"] });
  assert.ok(out.includes('  HELP: [\n    "скажи \\"да\\"",\n    "a",'));
  assert.ok(out.includes('  NAV_FILES: [\n    "где мои файлы",\n  ],\n};'));
  const mod = await import("data:text/javascript," + encodeURIComponent(out));
  assert.deepEqual(mod.HOLDOUT, { HELP: ["скажи \"да\"", "a"], NAV_FILES: ["где мои файлы"] });
  // Окончания строк Windows сохраняются
  const crlf = insertPhrases(src.replace(/\n/g, "\r\n"), "HOLDOUT", { HELP: ["b"] });
  assert.ok(crlf.includes('  HELP: [\r\n    "b",\r\n    "a",') && !/[^\r]\n/.test(crlf));
});

test("сервер: выгрузка только по секрету, порциями по номеру записи", async () => {
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const SECRET = "x".repeat(30);
  process.env.NEXA_ADMIN_SECRET = SECRET;
  const { default: handler, __setAdmin } = await import("../api/phrases.js");
  const all = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, text: "фраза " + i, intent_guess: "GENERAL", confidence: 0.5, created_at: "2026-10-26" }));
  let asked = null;
  __setAdmin({ from: (t) => ({ select: () => ({ gt: (k, v) => ({ order: () => ({ limit: async (n) => { asked = { t, v, n }; return { data: all.filter((r) => r.id > v), error: null }; } }) }) }) }) });
  const call = async (body, headers = {}) => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} };
    await handler({ method: "POST", headers: { "x-forwarded-for": "10.3.3." + Math.floor(Math.random() * 250), ...headers }, body }, res);
    return res;
  };
  try {
    assert.equal((await call({ action: "export" })).code, 403, "без секрета");
    assert.equal((await call({ action: "export" }, { "x-nexa-admin": "неверный" })).code, 403);
    const r = await call({ action: "export", afterId: 2 }, { "x-nexa-admin": SECRET });
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.phrases.map((p) => p.id), [3, 4, 5]);
    assert.equal(r.body.last, 5);
    assert.equal(r.body.more, false);
    assert.equal(asked.t, "mini_phrases");
    assert.equal(asked.v, 2);
    // Обычная отправка фраз от приложения по-прежнему работает без секрета
    __setAdmin({ from: () => ({ insert: async () => ({ error: null }) }) });
    assert.equal((await call({ phrases: [{ text: "новая фраза" }] })).body.saved, 1);
  } finally { delete process.env.NEXA_ADMIN_SECRET; }
});
