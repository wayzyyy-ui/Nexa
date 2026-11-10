/* Проверка облачной базы: всё ли из supabase/*.sql действительно вставлено в Supabase.
   Ничего не меняет — только читает описание базы. Запуск на своём компьютере (PowerShell):
     $env:SUPABASE_SERVICE_ROLE_KEY = "…"; npm run db:check
   Адрес базы — SUPABASE_URL / VITE_SUPABASE_URL из окружения или из .env.local.
   Ключ — только из переменной окружения: в код и файлы не вписывать, в вывод он не попадает.
   Нашлось недостающее — печатает, какие файлы вставить в SQL Editor, и выходит с кодом 1.
   Что НЕ видно отсюда: правила RLS, триггеры, правила Realtime и Storage — их проверяют
   тесты на локальном Postgres (supabase/tests) и supabase/security-test.sql. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expectFromSql, usedFunctions, compareWithSpec, filesToRun } from "./lib/db-expect.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const quiet = process.argv.includes("--quiet");

// Адрес — из окружения или .env.local (только адрес, ключи оттуда не берём)
function envUrl() {
  if (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  try {
    const m = readFileSync(join(root, ".env.local"), "utf8").match(/^\s*(?:VITE_)?SUPABASE_URL\s*=\s*"?([^"\s]+)/m);
    return m?.[1] || "";
  } catch { return ""; }
}
const url = envUrl().replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Нужны адрес базы (SUPABASE_URL или .env.local) и ключ SUPABASE_SERVICE_ROLE_KEY в переменной окружения.\n" +
    'PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY = "…"; npm run db:check');
  process.exit(2);
}

// Что должно быть — из SQL-файлов
const files = {};
for (const n of readdirSync(join(root, "supabase"))) {
  if (n.endsWith(".sql") && n !== "security-test.sql") files[n] = readFileSync(join(root, "supabase", n), "utf8");
}
const expect = expectFromSql(files);
const sources = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|jsx)$/.test(n)) sources.push(readFileSync(p, "utf8"));
  }
};
walk(join(root, "src"));
walk(join(root, "api"));
const used = usedFunctions(expect, sources);

// Заголовки: новые ключи (sb_secret_…) — только apikey, старые (JWT) — ещё и Authorization
const headers = { apikey: key, Accept: "application/openapi+json, application/json" };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
const get = async (path) => {
  const r = await fetch(url + path, { headers, signal: AbortSignal.timeout(20000) });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

let problems = [], how = "";
try {
  const spec = await get("/rest/v1/");
  if (spec.status === 401 || spec.status === 403) {
    console.error(`База не пустила (код ${spec.status}) — проверьте, что это ключ service role / secret этого проекта.`);
    process.exit(2);
  }
  if (spec.status === 200 && spec.body?.definitions) {
    how = "описание API базы";
    problems = compareWithSpec(expect, spec.body, used);
  } else {
    // Описания нет — проверяем таблицы и колонки по одной пустыми запросами (limit=0, без данных)
    how = "пустые запросы к таблицам (функции не проверены)";
    for (const [name, t] of expect.tables) {
      const r = await get(`/rest/v1/${name}?select=${[...t.columns.keys()].join(",")}&limit=0`);
      if (r.status === 200) continue;
      const code = r.body?.code || "";
      if (code === "PGRST205" || code === "42P01" || r.status === 404) { problems.push({ kind: "table", what: name, file: t.file, text: `нет таблицы ${name}` }); continue; }
      for (const [col, file] of t.columns) {
        const one = await get(`/rest/v1/${name}?select=${col}&limit=0`);
        if (one.status !== 200) problems.push({ kind: "column", what: `${name}.${col}`, file, text: `в таблице ${name} нет колонки ${col}` });
      }
    }
  }
  // Корзины файлов
  for (const [id, file] of expect.buckets) {
    const r = await get(`/storage/v1/bucket/${id}`);
    if (r.status !== 200) problems.push({ kind: "bucket", what: id, file, text: `нет корзины файлов ${id}` });
  }
} catch (e) {
  console.error(`Нет связи с базой (${e?.name || "ошибка"}). Проверьте интернет и адрес.`);
  process.exit(2);
}

const total = expect.tables.size + used.length + expect.buckets.size;
if (!problems.length) {
  if (!quiet) console.log(`✔ База в порядке: ${expect.tables.size} таблиц, ${used.length} функций, ${expect.buckets.size} корзин (проверка: ${how})`);
  process.exit(0);
}
console.log(`✘ В базе не хватает ${problems.length} (проверено ${total} таблиц, функций и корзин; проверка: ${how}):`);
for (const p of problems) console.log(`   • ${p.text}${p.file ? ` — ${p.file}` : ""}`);
console.log("\nВставьте в Supabase → SQL Editor → Run (сначала прочитайте шапку файла — там написано, можно ли запускать повторно):");
for (const f of filesToRun(problems)) console.log(`   supabase/${f}`);
console.log("и запустите проверку ещё раз.");
process.exit(1);

