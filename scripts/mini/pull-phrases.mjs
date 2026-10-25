/* Разбор непонятых фраз для дообучения NEXA Mini (собираются api/phrases.js, таблица mini_phrases).
   Запуск на своём компьютере:
     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/mini/pull-phrases.mjs [--days=30]
   (в PowerShell: $env:SUPABASE_URL = "…"; $env:SUPABASE_SERVICE_ROLE_KEY = "…"; node scripts/mini/pull-phrases.mjs)
   Ключ — только из переменных окружения, в код и в файлы не вписывать.
   Печатает фразы списком: сколько раз встречалась, догадка Mini сейчас (по нынешним весам) и что она
   думала тогда. Дальше человек сам решает, в какое намерение добавить фразу в src/lib/mini/trainingData.js
   (или в GENERAL, если это вопрос для Gemini), и запускает npm run mini:train. Сам скрипт ничего не меняет. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { modelFromJSON, predict } from "../../src/lib/mini/model.js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Нужны переменные окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (ключ в код не вписывать)");
  process.exit(1);
}
const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "--days=90").split("=")[1]) || 90;
const since = new Date(Date.now() - days * 86400e3).toISOString();

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("mini_phrases").select("text, intent_guess, confidence, created_at")
    .gte("created_at", since).order("created_at", { ascending: false }).range(from, from + 999);
  if (error) { console.error("Не удалось прочитать фразы:", error.code || error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}
if (!rows.length) { console.log(`За ${days} дн. фраз нет.`); process.exit(0); }

// Одинаковые фразы — одной строкой со счётчиком
const groups = new Map();
for (const r of rows) {
  const k = r.text.toLowerCase().replace(/ё/g, "е");
  const g = groups.get(k) || { text: r.text, count: 0, then: r.intent_guess, conf: r.confidence };
  g.count++;
  groups.set(k, g);
}
const net = modelFromJSON(JSON.parse(readFileSync(new URL("../../src/lib/mini/weights.json", import.meta.url), "utf8")));
const list = [...groups.values()].sort((a, b) => b.count - a.count);
console.log(`Фраз за ${days} дн.: ${rows.length}, разных: ${list.length}\n`);
console.log("раз  сейчас Mini думает       тогда думала              фраза");
for (const g of list) {
  const now = predict(net, g.text);
  const nowTxt = `${now.label} ${now.confidence.toFixed(2)}`;
  const thenTxt = g.then ? `${g.then} ${g.conf != null ? Number(g.conf).toFixed(2) : ""}` : "—";
  console.log(`${String(g.count).padStart(3)}  ${nowTxt.padEnd(24)} ${thenTxt.padEnd(25)} ${g.text}`);
}
console.log("\nДобавьте фразы в нужные списки src/lib/mini/trainingData.js и запустите npm run mini:train.");
