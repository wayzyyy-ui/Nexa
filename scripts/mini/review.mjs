/* npm run mini:review — выгрузить новые непонятые фразы NEXA Mini в mini-review.csv для разметки.
   Фразы лежат на сервере в таблице mini_phrases (Supabase), забираем их через api/phrases.js (action "export")
   по секрету NEXA_ADMIN_SECRET — тому же, что для рассылки. Секрет — только из переменной окружения:
     командная строка:  set NEXA_ADMIN_SECRET=…   затем  npm run mini:review
     PowerShell:        $env:NEXA_ADMIN_SECRET = "…"; npm run mini:review
   Флаги: --all — выгрузить всё заново (не только новое с прошлого раза), --base=https://… — другой сервер.
   «Новые» — после последней выгруженной записи (номер — в .mini-review-state.json, не в git).
   Повторы, уже размеченные (trainingData.js / holdout.js) и уже лежащие в mini-review.csv фразы не добавляются;
   прежние строки CSV вместе с вашей разметкой остаются. Дальше — заполнить колонку «правильное намерение»
   и запустить npm run mini:merge. */
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TRAINING_DATA, LABELS } from "../../src/lib/mini/trainingData.js";
import { HOLDOUT } from "../../src/lib/mini/holdout.js";
import { CSV_FILE, STATE_FILE, SKIP_WORDS, knownKeys, newReviewRows, toCsv, parseCsv } from "./review-lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const csvPath = ROOT + CSV_FILE, statePath = ROOT + STATE_FILE;
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--base="))?.slice(7) || "https://nexa-link.ru").replace(/\/+$/, "");
const secret = process.env.NEXA_ADMIN_SECRET || "";
if (secret.length < 24) { console.error("Нет секрета: задайте NEXA_ADMIN_SECRET (тот же, что в переменных Vercel)"); process.exit(1); }
if (!base.startsWith("https://")) { console.error("Адрес сервера — только https"); process.exit(1); }

let state = { lastId: 0 };
try { if (!args.includes("--all")) state = { lastId: 0, ...JSON.parse(readFileSync(statePath, "utf8")) }; } catch { /* первый запуск */ }

// Забираем порциями, пока сервер говорит «есть ещё»
const got = [];
let after = Number(state.lastId) || 0;
for (let i = 0; i < 50; i++) {
  const r = await fetch(`${base}/api/phrases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nexa-admin": secret },
    body: JSON.stringify({ action: "export", afterId: after }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`Сервер ответил ${r.status}: ${j.error || "ошибка"}`); process.exit(1); }
  if (j.reason === "not_configured") { console.error("На сервере нет таблицы mini_phrases или ключей Supabase (supabase/mini-phrases.sql)"); process.exit(1); }
  if (j.reason) { console.error("Сервер не смог прочитать фразы, попробуйте позже"); process.exit(1); }
  got.push(...(j.phrases || []));
  after = j.last ?? after;
  if (!j.more) break;
}

const existing = existsSync(csvPath) ? parseCsv(readFileSync(csvPath, "utf8")) : [];
const fresh = newReviewRows(got, { known: knownKeys(TRAINING_DATA, HOLDOUT), existing });
const rows = [...existing, ...fresh];
// Сначала во временный файл, потом подменяем — оборванная запись не испортит прежнюю разметку
writeFileSync(csvPath + ".tmp", toCsv(rows));
renameSync(csvPath + ".tmp", csvPath);
writeFileSync(statePath, JSON.stringify({ lastId: after, at: new Date().toISOString() }, null, 2));

console.log(`С сервера: ${got.length}, новых для разметки: ${fresh.length}, всего в ${CSV_FILE}: ${rows.length} (ждут разметки: ${rows.filter((r) => !r.intent).length})`);
if (!rows.length) process.exit(0);
console.log(`\nОткройте ${CSV_FILE} и в колонке «правильное намерение» напишите одно из:`);
console.log("  " + LABELS.join(", "));
console.log(`  GENERAL — вопрос или разговор для большой модели; ${SKIP_WORDS.map((w) => `«${w}»`).join(" / ")} — выбросить фразу;`);
console.log("  пусто — оставить на потом.");
console.log("Потом: npm run mini:merge");
