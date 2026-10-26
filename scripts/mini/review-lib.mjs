/* Дообучение NEXA Mini на настоящих фразах: общие правила для npm run mini:review и npm run mini:merge.
   Без сети и без записи на диск — только преобразования (тесты — tests/mini-review.test.mjs). */
import { normalize } from "../../src/lib/mini/features.js";
import { phraseProblem } from "../../src/lib/mini/collect.js";

export const CSV_FILE = "mini-review.csv";
export const STATE_FILE = ".mini-review-state.json";
export const HEADER = ["фраза", "догадка сети", "уверенность", "правильное намерение"];
export const HOLDOUT_EVERY = 5; // каждая 5-я размеченная фраза — в holdout (честная проверка), остальные — в обучение
// Чтобы явно выбросить фразу (мусор, не просьба): одно из этих слов в колонке намерения
export const SKIP_WORDS = ["-", "пропустить", "skip", "мусор"];

// Ключ для сравнения фраз — так же, как фразу видит сама сеть (регистр, ё, знаки, пробелы)
export const phraseKey = (t) => normalize(t);

// Все фразы из обучения и holdout — чтобы не добавлять повторы
export function knownKeys(...sets) {
  const keys = new Set();
  for (const data of sets) for (const list of Object.values(data)) for (const t of list) keys.add(phraseKey(t));
  return keys;
}

/* Выгрузка с сервера → строки для CSV: без повторов (между собой, с уже лежащими в CSV и с обучением / holdout),
   без того, что не прошло бы проверку приватности (на всякий случай — сервер уже проверял) */
export function newReviewRows(serverRows, { known, existing = [] }) {
  const seen = new Set([...known, ...existing.map((r) => phraseKey(r.text))]);
  const out = [];
  for (const r of serverRows) {
    const text = String(r.text || "").replace(/\s+/g, " ").trim();
    const k = phraseKey(text);
    if (!k || seen.has(k) || phraseProblem(text)) continue;
    seen.add(k);
    const c = Number(r.confidence);
    out.push({ text, guess: r.intent_guess || "", confidence: Number.isFinite(c) ? c.toFixed(2) : "", intent: "" });
  }
  return out;
}

/* CSV для таблиц: разделитель «;» и BOM — так его сразу правильно открывает табличный редактор с русскими настройками */
const cell = (v) => {
  const s = String(v ?? "");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows) {
  const lines = [HEADER, ...rows.map((r) => [r.text, r.guess, r.confidence, r.intent])].map((l) => l.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// Разбор CSV: «;» или «,» (как сохранил редактор), кавычки, BOM, первая строка — заголовок
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const sep = firstLine.includes(";") ? ";" : ",";
  const records = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); records.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); records.push(row); }
  return records.slice(1)
    .map((r, i) => ({ line: i + 2, text: (r[0] || "").trim(), guess: (r[1] || "").trim(), confidence: (r[2] || "").trim(), intent: (r[3] || "").trim() }))
    .filter((r) => r.text);
}

/* Что добавить: строки с заполненным намерением. Пустое намерение — строка остаётся в CSV на потом.
   Неизвестное намерение — ошибка (merge тогда ничего не пишет). Повторы и уже известные фразы — пропуск.
   Каждая HOLDOUT_EVERY-я добавленная фраза — в holdout, остальные — в обучение */
export function planMerge(rows, { labels, training, holdout }) {
  const valid = new Set(labels);
  const seen = knownKeys(training, holdout);
  const plan = { train: {}, holdout: {}, added: [], left: [], skipped: [], dups: [], rejected: [], errors: [] };
  let n = 0;
  for (const r of rows) {
    const raw = r.intent.trim();
    if (!raw) { plan.left.push(r); continue; }
    if (SKIP_WORDS.includes(raw.toLowerCase())) { plan.skipped.push(r); continue; }
    const label = raw.toUpperCase().replace(/[\s-]+/g, "_");
    if (!valid.has(label)) { plan.errors.push({ line: r.line, text: r.text, intent: raw }); continue; }
    const k = phraseKey(r.text);
    if (!k || seen.has(k)) { plan.dups.push(r); continue; }
    if (phraseProblem(r.text)) { plan.rejected.push(r); continue; }
    seen.add(k);
    n++;
    const where = n % HOLDOUT_EVERY === 0 ? plan.holdout : plan.train;
    (where[label] ||= []).push(r.text);
    plan.added.push({ text: r.text, label, holdout: where === plan.holdout });
  }
  return plan;
}

/* Дописать фразы в объект файла (trainingData.js → TRAINING_DATA, holdout.js → HOLDOUT): новой строкой сразу
   после «  НАМЕРЕНИЕ: [». Нет такого намерения в объекте — добавляем список перед закрывающей «};» */
export function insertPhrases(src, objName, additions) {
  let out = src;
  const nl = src.includes("\r\n") ? "\r\n" : "\n";
  for (const [label, phrases] of Object.entries(additions)) {
    if (!phrases.length) continue;
    const start = out.indexOf(`export const ${objName} = {`);
    if (start < 0) throw new Error(`В файле нет ${objName}`);
    const end = out.indexOf(`${nl}};`, start);
    const line = `    ${phrases.map((p) => JSON.stringify(p)).join(", ")},`;
    const head = new RegExp(`(^|\\r?\\n)(  ${label}: \\[)`, "g");
    head.lastIndex = start;
    const m = head.exec(out);
    if (m && m.index < end) {
      const at = m.index + m[0].length;
      out = out.slice(0, at) + nl + line + out.slice(at);
    } else {
      out = out.slice(0, end) + `${nl}  ${label}: [${nl}${line}${nl}  ],` + out.slice(end);
    }
  }
  return out;
}
