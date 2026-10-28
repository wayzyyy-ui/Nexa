// Отчёты о сбоях (supabase/error-reports.sql) —
// проверка на настоящем Postgres (embedded-postgres, локально), окружение как в Supabase.
// К Supabase не подключается. Запуск: cd supabase/tests && node error-reports-test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-err-test-${process.pid}`);
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--no-locale"] });
await server.initialise(); await server.start();

let fails = 0, passes = 0;
const check = (name, ok, extra = "") => { if (ok) passes++; else fails++; console.log(`${ok ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };
const db = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" });
await db.connect();
await db.query(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
const read = (f) => fs.readFileSync(`${REPO}supabase/${f}`, "utf8");
await db.query(read("error-reports.sql")); await db.query(read("error-reports.sql")); // повторный запуск безопасен

async function as(role, q, params = []) {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    const r = await db.query(q, params);
    await db.query("commit");
    return r;
  } catch (e) { await db.query("rollback"); return { error: e.code || e.message }; }
}
const rep = (fp, extra = {}) => ({ fp, version: "0.18.0", kind: "error", name: "TypeError", message: "boom", frames: [{ fn: "f", file: "i.js", line: 1, col: 2 }], platform: "android", browser: "WebView 140", screen: "files", ...extra });
const hit = (role, r) => as(role, "select public.nexa_error_hit($1::jsonb)", [JSON.stringify(r)]);

check("сервер пишет отчёт", !(await hit("service_role", rep("aaaaaaaa"))).error);
await hit("service_role", rep("aaaaaaaa", { platform: "web", browser: "Chrome 140" }));
await hit("service_role", rep("aaaaaaaa"));
const row = (await db.query("select * from public.error_reports where fp = 'aaaaaaaa'")).rows[0];
check("одинаковые склеиваются: счётчик 3", row?.count === 3, String(row?.count));
check("платформы и браузеры считаются", row?.platforms.android === 2 && row?.platforms.web === 1 && row?.browsers["Chrome 140"] === 1, JSON.stringify(row?.platforms));
check("другая версия — отдельная строка", !(await hit("service_role", rep("aaaaaaaa", { version: "0.18.1" }))).error && Number((await db.query("select count(*) from public.error_reports")).rows[0].count) === 2);
for (let i = 0; i < 40; i++) await hit("service_role", rep("bbbbbbbb", { browser: "Chrome " + i }));
const b = (await db.query("select browsers from public.error_reports where fp = 'bbbbbbbb'")).rows[0];
check("словарь браузеров не больше 30 ключей", Object.keys(b.browsers).length === 30);
check("неверный отпечаток — отказ", !!(await hit("service_role", rep("../x"))).error);
check("слишком длинный текст — отказ", !!(await hit("service_role", rep("cccccccc", { message: "x".repeat(400) }))).error);
for (const role of ["anon", "authenticated"]) {
  check(`${role}: прочитать отчёты`, !!(await as(role, "select * from public.error_reports")).error);
  check(`${role}: записать отчёт напрямую`, !!(await as(role, "insert into public.error_reports (fp, version, kind, name) values ('dddddddd', '1.0.0', 'error', 'X')")).error);
  check(`${role}: записать через функцию`, !!(await hit(role, rep("eeeeeeee"))).error);
}
const cols = (await db.query("select column_name from information_schema.columns where table_name = 'error_reports'")).rows.map((r) => r.column_name);
check("в таблице нет аккаунта, устройства и адреса", !cols.some((c) => /user|device|ip|url|email/.test(c)), cols.join(","));

console.log(`
${passes} из ${passes + fails}`);
await db.end();
try { await server.stop(); } catch {} // Windows иногда держит временную папку — это не ошибка теста
process.exit(fails ? 1 : 0);
