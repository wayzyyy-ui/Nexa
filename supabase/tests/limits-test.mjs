// Лимиты memory (50) и push_tokens (50) — проверка на настоящем Postgres (embedded-postgres, локально),
// окружение как в Supabase: роли anon / authenticated / service_role, auth.uid() из request.jwt.claim.sub, RLS.
// К Supabase и production не подключается.
//
// Запуск (один раз поставить зависимости теста — они не попадают в package.json проекта):
//   cd supabase/tests && npm install
//   node limits-test.mjs new              — текущие memory.sql + push-tokens.sql + limits-fix.sql
//   node limits-test.mjs migrate [коммит]  — база из старого коммита с данными, сверху limits-fix.sql дважды
//   node limits-test.mjs old [коммит]      — старая версия без исправления (ожидаются ✘ — так видно ошибку)
// Коммит по умолчанию — d3053c0 (последний до исправления лимитов).
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import { execFileSync } from "child_process";
import crypto from "crypto";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const MODE = process.argv[2] || "new";
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const REF = process.argv[3] || "d3053c0";
const sqlOf = (f) => MODE !== "new" ? execFileSync("git", ["-C", REPO, "show", `${REF}:supabase/${f}`], { encoding: "utf8" }) : fs.readFileSync(`${REPO}supabase/${f}`, "utf8");
// Свободный порт — чтобы не мешал другой Postgres на компьютере
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-limits-test-${MODE}-${process.pid}`); // временная база, удаляется после прогона
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--no-locale"] });
await server.initialise(); await server.start();

let fails = 0, passes = 0;
const check = (name, ok, extra = "") => { if (ok) passes++; else fails++; console.log(`${ok ? "✔" : "✘"} [${MODE}] ${name}${extra ? " — " + extra : ""}`); };
const cfg = { host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" };
const admin = new pg.Client(cfg); await admin.connect();

// Окружение Supabase в миниатюре
await admin.query(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
await admin.query(sqlOf("memory.sql"));
await admin.query(sqlOf("push-tokens.sql"));
if (MODE === "new") await admin.query(fs.readFileSync(`${REPO}supabase/limits-fix.sql`, "utf8")); // миграция поверх — повторный запуск безопасен
if (MODE === "migrate") {
  // Старая база с уже лежащими записями: миграция не должна их трогать
  await admin.query("insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000ee') on conflict do nothing");
  await admin.query("insert into public.memory (id, user_id, text) select gen_random_uuid(), '00000000-0000-0000-0000-0000000000ee', 'старая ' || g from generate_series(1, 50) g");
  await admin.query("insert into public.push_tokens (user_id, device_id, token) values ('00000000-0000-0000-0000-0000000000ee', 'old-dev', 'old-token-xxxxxxxx')");
  const fix = fs.readFileSync(`${REPO}supabase/limits-fix.sql`, "utf8");
  await admin.query(fix); await admin.query(fix); // дважды — проверка повторного запуска
  const m = (await admin.query("select count(*)::int n from public.memory where user_id = '00000000-0000-0000-0000-0000000000ee'")).rows[0].n;
  const p = (await admin.query("select count(*)::int n from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000ee'")).rows[0].n;
  const trg = (await admin.query("select tgname from pg_trigger where tgname in ('memory_limit','nexa_push_tokens_limit') and not tgisinternal order by 1")).rows.map((r) => r.tgname).join(",");
  const pol = (await admin.query("select count(*)::int n from pg_policies where tablename in ('memory','push_tokens')")).rows[0].n;
  const rls = (await admin.query("select bool_and(relrowsecurity) ok from pg_class where relname in ('memory','push_tokens')")).rows[0].ok;
  const sd = (await admin.query("select bool_and(prosecdef) ok, bool_and(not has_function_privilege('authenticated', oid, 'execute')) noexec from pg_proc where proname in ('nexa_memory_limit','nexa_push_tokens_limit')")).rows[0];
  console.log(`${m === 50 && p === 1 ? "✔" : "✘"} [migrate] миграция дважды: прежние данные на месте — память ${m}, push ${p}`);
  console.log(`${trg === "memory_limit,nexa_push_tokens_limit" ? "✔" : "✘"} [migrate] триггеры лимита на месте — ${trg}`);
  console.log(`${pol === 8 && rls ? "✔" : "✘"} [migrate] RLS включена, правил ${pol} (ожидается 8)`);
  console.log(`${sd.ok && sd.noexec ? "✔" : "✘"} [migrate] функции security definer, вызвать напрямую authenticated не может`);
}

const A = crypto.randomUUID(), B = crypto.randomUUID();
await admin.query("insert into auth.users values ($1), ($2)", [A, B]);

// Запрос от имени вошедшего пользователя (как PostgREST): своя транзакция, роль authenticated, sub = uid
async function as(uid, sql, params = [], client) {
  const c = client || new pg.Client(cfg);
  if (!client) await c.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, rows: r.rows, count: r.rowCount };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { ok: false, code: e.code, msg: e.message };
  } finally { if (!client) await c.end(); }
}
const count = async (table, uid) => Number((await admin.query(`select count(*) from public.${table} where user_id = $1`, [uid])).rows[0].count);
// Upsert так, как его шлёт supabase-js (PostgREST): INSERT … ON CONFLICT (ключ) DO UPDATE SET … = EXCLUDED…
const memUpsert = (rows) => {
  const vals = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  return [`insert into public.memory (id, text) values ${vals} on conflict (id) do update set text = excluded.text`, rows.flatMap((r) => [r.id, r.text])];
};
const pushUpsert = (device, token) => [`insert into public.push_tokens (device_id, token) values ($1, $2) on conflict (user_id, device_id) do update set token = excluded.token, updated_at = now()`, [device, token]];

/* ═══ memory ═══ */
const memIds = [];
for (let i = 0; i < 50; i++) { const id = crypto.randomUUID(); memIds.push(id); const r = await as(A, "insert into public.memory (id, text) values ($1, $2)", [id, `запись ${i}`]); if (!r.ok) { console.log("заполнение упало", r.msg); break; } }
check("memory: 50 записей добавились", (await count("memory", A)) === 50);
let r = await as(A, "insert into public.memory (id, text) values ($1, 'лишняя')", [crypto.randomUUID()]);
check("memory: 51-я новая запись — отказ (23514)", !r.ok && r.code === "23514", r.msg);
r = await as(A, ...memUpsert([{ id: memIds[3], text: "изменено через upsert" }]));
check("memory: при 50 — upsert существующей записи проходит", r.ok, r.msg);
check("memory: текст после upsert обновился", (await admin.query("select text from public.memory where id = $1", [memIds[3]])).rows[0]?.text === "изменено через upsert");
r = await as(A, "update public.memory set text = 'через update' where id = $1", [memIds[4]]);
check("memory: при 50 — UPDATE проходит", r.ok && r.count === 1, r.msg);
r = await as(A, ...memUpsert([{ id: memIds[5], text: "ок" }, { id: crypto.randomUUID(), text: "новая" }]));
check("memory: upsert пачкой «существующая + новая» при 50 — отказ целиком", !r.ok && r.code === "23514" && (await count("memory", A)) === 50, r.msg);
r = await as(A, ...memUpsert(memIds.slice(0, 20).map((id, i) => ({ id, text: `пачка ${i}` }))));
check("memory: upsert пачкой из 20 существующих при 50 (как синхронизация) — проходит", r.ok, r.msg);
r = await as(A, "delete from public.memory where id = $1", [memIds[0]]);
check("memory: DELETE своей записи", r.ok && r.count === 1);
r = await as(A, "insert into public.memory (id, text) values ($1, 'после удаления')", [crypto.randomUUID()]);
check("memory: после удаления новая запись снова добавляется (49 → 50)", r.ok && (await count("memory", A)) === 50, r.msg);
// Изоляция
r = await as(B, "select count(*)::int as n from public.memory");
check("memory: B не видит записей A", r.ok && r.rows[0].n === 0);
r = await as(B, ...memUpsert([{ id: memIds[7], text: "чужое" }]));
const stillA = (await admin.query("select text, user_id from public.memory where id = $1", [memIds[7]])).rows[0];
check("memory: B не может перезаписать запись A через upsert с её id", !r.ok && stillA.user_id === A && stillA.text !== "чужое", `${r.code} ${r.msg}`);
r = await as(B, "update public.memory set text = 'чужое' where id = $1", [memIds[8]]);
check("memory: UPDATE чужой записи — 0 строк", r.ok && r.count === 0);
r = await as(B, "delete from public.memory where id = $1", [memIds[8]]);
check("memory: DELETE чужой записи — 0 строк", r.ok && r.count === 0);
r = await as(B, "insert into public.memory (id, user_id, text) values ($1, $2, 'подмена')", [crypto.randomUUID(), A]);
check("memory: B не может вставить запись от имени A — отказ RLS (42501), а не лимит A", !r.ok && r.code === "42501", r.code);
r = await as(B, "update public.memory set user_id = $1 where user_id = $2", [B, A]);
check("memory: B не может «перетащить» записи A на себя", r.ok && r.count === 0);
check("memory: лимит A не мешает B (у B 0 записей, может добавлять)", (await as(B, "insert into public.memory (id, text) values ($1, 'b')", [crypto.randomUUID()])).ok);
// Гонка: у B 49 записей, 12 одновременных добавлений новых → должна пройти ровно одна
for (let i = (await count("memory", B)); i < 49; i++) await as(B, "insert into public.memory (id, text) values ($1, 'b')", [crypto.randomUUID()]);
const clients = await Promise.all(Array.from({ length: 12 }, async () => { const c = new pg.Client(cfg); await c.connect(); return c; }));
const race = await Promise.all(clients.map((c) => as(B, "insert into public.memory (id, text) values ($1, 'гонка')", [crypto.randomUUID()], c)));
const nB = await count("memory", B);
check("memory: 12 одновременных добавлений при 49 — итог ровно 50", nB === 50, `прошло ${race.filter((x) => x.ok).length}, записей ${nB}`);
// Одновременные upsert существующих при 50 — все проходят
const bIds = (await admin.query("select id from public.memory where user_id = $1 limit 12", [B])).rows.map((x) => x.id);
const race2 = await Promise.all(clients.map((c, i) => as(B, ...memUpsert([{ id: bIds[i], text: `одновременно ${i}` }]), c)));
check("memory: 12 одновременных upsert существующих при 50 — все прошли", race2.every((x) => x.ok), race2.filter((x) => !x.ok).map((x) => x.code).join(","));
// Одновременно удаление и добавление
const race3 = await Promise.all([as(B, "delete from public.memory where id = $1", [bIds[0]], clients[0]), as(B, "insert into public.memory (id, text) values ($1, 'x')", [crypto.randomUUID()], clients[1]), as(B, "insert into public.memory (id, text) values ($1, 'y')", [crypto.randomUUID()], clients[2])]);
check("memory: одновременно удаление и два добавления — не больше 50", (await count("memory", B)) <= 50, `${await count("memory", B)}`);
void race3;

/* ═══ push_tokens ═══ */
for (let i = 0; i < 50; i++) await as(A, "insert into public.push_tokens (device_id, token) values ($1, $2)", [`dev-${i}`, `token-${i}-xxxxxxxxxx`]);
check("push: 50 устройств добавились", (await count("push_tokens", A)) === 50);
r = await as(A, ...pushUpsert("dev-51", "token-new-xxxxxxxxxx"));
check("push: 51-е новое устройство (upsert) — отказ", !r.ok && /too many push tokens/.test(r.msg), `${r.code} ${r.msg}`);
r = await as(A, ...pushUpsert("dev-7", "token-refreshed-xxxxxxxx"));
check("push: при 50 — upsert своего же устройства (новый адрес) проходит", r.ok, r.msg);
check("push: адрес обновился", (await admin.query("select token from public.push_tokens where user_id = $1 and device_id = 'dev-7'", [A])).rows[0]?.token === "token-refreshed-xxxxxxxx");
r = await as(A, "update public.push_tokens set token = 'via-update-xxxxxxxx' where device_id = 'dev-8'");
check("push: при 50 — UPDATE проходит", r.ok && r.count === 1);
r = await as(A, "delete from public.push_tokens where device_id = 'dev-0'");
check("push: DELETE своего", r.ok && r.count === 1);
r = await as(A, ...pushUpsert("dev-new", "token-new2-xxxxxxxxx"));
check("push: после удаления новое устройство снова добавляется", r.ok && (await count("push_tokens", A)) === 50, r.msg);
// Изоляция: B с тем же device_id — это его собственная строка (ключ user_id + device_id)
r = await as(B, ...pushUpsert("dev-7", "token-of-b-xxxxxxxxx"));
const aTok = (await admin.query("select token from public.push_tokens where user_id = $1 and device_id = 'dev-7'", [A])).rows[0]?.token;
check("push: B с тем же device_id не трогает строку A", r.ok && aTok === "token-refreshed-xxxxxxxx");
r = await as(B, "select count(*)::int as n from public.push_tokens");
check("push: B видит только свои строки", r.ok && r.rows[0].n === 1);
r = await as(B, "update public.push_tokens set token = 'hack-xxxxxxxxxx' where user_id = $1", [A]);
check("push: B не меняет строки A", r.ok && r.count === 0);
r = await as(B, "insert into public.push_tokens (user_id, device_id, token) values ($1, 'x', 'token-xxxxxxxxxx')", [A]);
check("push: B не вставляет от имени A — отказ RLS (42501)", !r.ok && r.code === "42501", r.code);
// Гонка: у B 49, 12 одновременных новых устройств → ровно 50
for (let i = (await count("push_tokens", B)); i < 49; i++) await as(B, "insert into public.push_tokens (device_id, token) values ($1, 'token-xxxxxxxxxx')", [`b-${i}`]);
const race4 = await Promise.all(clients.map((c, i) => as(B, ...pushUpsert(`race-${i}`, "token-race-xxxxxxxxx"), c)));
const nPB = await count("push_tokens", B);
check("push: 12 одновременных новых устройств при 49 — итог ровно 50", nPB === 50, `прошло ${race4.filter((x) => x.ok).length}, строк ${nPB}`);
const race5 = await Promise.all(clients.map((c) => as(B, ...pushUpsert("dev-7", `token-${crypto.randomUUID()}`), c)));
check("push: 12 одновременных обновлений своего адреса при 50 — все прошли", race5.every((x) => x.ok), race5.filter((x) => !x.ok).map((x) => x.msg).join(" | ").slice(0, 120));
// anon без доступа
const an = new pg.Client(cfg); await an.connect();
await an.query("begin"); await an.query("set local role anon");
const anonR = await an.query("select count(*)::int as n from public.memory").then((x) => x.rows[0].n, (e) => "отказ: " + e.code);
await an.query("rollback"); await an.end();
check("anon не видит памяти", anonR === 0 || String(anonR).startsWith("отказ"), String(anonR));

await Promise.all(clients.map((c) => c.end()));
console.log(`\n[${MODE}] пройдено ${passes}, не пройдено ${fails}`);
await admin.end();
// На Windows Postgres иногда держит папку ещё пару секунд — итог от этого не зависит
try { await server.stop(); } catch { /* временная папка удалится позже */ }
process.exit(fails ? 1 : 0);
