// Квота облачного хранилища 2 ГБ на аккаунт (files-storage.sql / storage-quota-fix.sql) —
// проверка на настоящем Postgres (embedded-postgres, локально). К Supabase и production не подключается.
// Storage в миниатюре повторяет ход настоящего Supabase Storage при загрузке:
//   1) до загрузки байтов — пробная вставка от имени вошедшего (правила RLS), откат;
//   2) байты грузятся (пауза);
//   3) запись: транзакция от имени Storage (обходит RLS), блокировка объекта, повторная пробная
//      проверка от имени вошедшего в точке сохранения (откат), потом настоящая вставка с size.
//
// Запуск: cd supabase/tests && npm install
//   node storage-quota-test.mjs new              — текущий files-storage.sql
//   node storage-quota-test.mjs migrate [коммит]  — база из старого коммита с файлами, сверху storage-quota-fix.sql дважды
//   node storage-quota-test.mjs old [коммит]      — версия до исправления (ожидаются ✘ — так видно ошибку)
// Коммит по умолчанию — 226219c (последний до исправления квоты).
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
const REF = process.argv[3] || "226219c";
const sqlOf = (f) => MODE !== "new" ? execFileSync("git", ["-C", REPO, "show", `${REF}:supabase/${f}`], { encoding: "utf8" }) : fs.readFileSync(`${REPO}supabase/${f}`, "utf8");
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-storage-test-${MODE}-${process.pid}`);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--no-locale"] });
await server.initialise(); await server.start();

let fails = 0, passes = 0;
const check = (name, ok, extra = "") => { if (ok) passes++; else fails++; console.log(`${ok ? "✔" : "✘"} [${MODE}] ${name}${extra !== "" ? " — " + extra : ""}`); };
const cfg = { host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" };
const admin = new pg.Client(cfg); await admin.connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = 1048576, GB2 = 2147483648, FILE_MAX = 50 * MB;
const mb = (n) => `${(n / MB).toFixed(1)} МБ`;

// ── Supabase в миниатюре: роли, auth.uid(), схема storage (как в Supabase) ──
await admin.query(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  create function public.nexa_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, owner uuid);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid,
    metadata jsonb, user_metadata jsonb, version text, created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
    declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated; grant select on storage.buckets to anon, authenticated;
`);
await admin.query(sqlOf("files-storage.sql"));

const [A, B, C, D, E, F] = Array.from({ length: 6 }, () => crypto.randomUUID());
await admin.query("insert into auth.users select unnest($1::uuid[])", [[A, B, C, D, E, F]]);
const used = async (uid) => Number((await admin.query("select coalesce(sum((metadata->>'size')::bigint),0) s from storage.objects where bucket_id='nexa-files' and name like $1", [uid + "/%"])).rows[0].s);
// Уже лежащие файлы (кладёт сам Storage, мимо правил) — до нужного объёма кусками по 50 МБ
async function seed(uid, bytes, { legacy = false } = {}) {
  // legacy — файлы, попавшие в базу до исправления (новая проверка их не пропустила бы)
  if (legacy) await admin.query("set session_replication_role = replica");
  for (let i = 0, left = bytes; left > 0; i++, left -= FILE_MAX) {
    await admin.query("insert into storage.objects (bucket_id, name, owner, metadata) values ('nexa-files', $1, $2, $3)",
      [`${uid}/seed-${i}`, uid, { size: Math.min(FILE_MAX, left), mimetype: "application/octet-stream" }]);
  }
  if (legacy) await admin.query("set session_replication_role = origin");
}

if (MODE === "migrate") {
  // База «как сейчас»: старые правила и уже лежащие файлы; у E по старой ошибке уже больше 2 ГБ
  await seed(A, 300 * MB); await seed(E, GB2 + 30 * MB);
  const before = (await admin.query("select count(*)::int n from storage.objects")).rows[0].n;
  const fix = fs.readFileSync(`${REPO}supabase/storage-quota-fix.sql`, "utf8");
  await admin.query(fix); await admin.query(fix);
  const after = (await admin.query("select count(*)::int n from storage.objects")).rows[0].n;
  check("миграция дважды: файлы на месте", before === after, `${after} объектов`);
  const pol = (await admin.query("select policyname from pg_policies where schemaname='storage' and tablename='objects' order by 1")).rows.map((r) => r.policyname);
  check("правила корзины: те же три (читать / класть / удалять)", pol.length === 3, pol.join(", "));
  const trg = (await admin.query("select count(*)::int n from pg_trigger where tgname = 'nexa_storage_quota' and not tgisinternal")).rows[0].n;
  check("триггер квоты создан один раз", trg === 1);
  await admin.query("delete from storage.objects"); // дальше — те же проверки, что и для новой базы
}

/* Загрузка как в Supabase Storage. size — настоящий размер, declared — заявленный (Content-Length).
   Возвращает { ok, stage: "pre" | "write", code, msg } */
async function upload(uid, name, size, { declared = size, pauseMs = 0, preMeta } = {}) {
  const c = new pg.Client(cfg); await c.connect();
  const asUser = async () => { await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); };
  const row = (meta) => c.query("insert into storage.objects (bucket_id, name, owner, metadata) values ('nexa-files', $1, $2, $3)", [name, uid, meta]);
  let stage = "pre";
  try {
    await c.query("begin"); await asUser();
    try { await row(preMeta ?? { mimetype: "text/plain", contentLength: declared }); } finally { await c.query("rollback"); }
    if (pauseMs) await wait(pauseMs);
    stage = "write";
    const meta = { size, mimetype: "text/plain", eTag: "e", contentLength: size };
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext('object:' || $1))", [name]);
    await c.query("savepoint probe"); await asUser();
    try { await row(meta); } finally { await c.query("rollback to savepoint probe"); }
    await row(meta);
    await c.query("commit");
    return { ok: true };
  } catch (e) {
    try { await c.query("rollback"); } catch {}
    return { ok: false, stage, code: e.code, msg: e.message };
  } finally { await c.end(); }
}
// Запрос от имени вошедшего (как PostgREST / Storage от его имени)
async function as(uid, sql, params = []) {
  const c = new pg.Client(cfg); await c.connect();
  try {
    await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await c.query(sql, params); await c.query("commit");
    return { ok: true, rows: r.rows, count: r.rowCount };
  } catch (e) { try { await c.query("rollback"); } catch {} return { ok: false, code: e.code, msg: e.message }; }
  finally { await c.end(); }
}
const why = (r) => (r.ok ? "прошло" : `отказ на шаге ${r.stage === "pre" ? "до загрузки" : "записи"} (${r.code})`);

// ── 1. Размер нового файла учитывается ──
await seed(A, GB2 - 10 * MB);
let r = await upload(A, `${A}/a-5mb`, 5 * MB);
check("занято 2 ГБ − 10 МБ: файл 5 МБ проходит", r.ok, why(r));
r = await upload(A, `${A}/a-20mb`, 20 * MB);
check("осталось 5 МБ: файл 20 МБ — отказ", !r.ok, why(r));
r = await upload(A, `${A}/a-rest`, 5 * MB);
check("файл ровно на остаток (5 МБ) проходит — занято ровно 2 ГБ", r.ok && (await used(A)) === GB2, `${why(r)}, занято ${mb(await used(A))}`);
r = await upload(A, `${A}/a-1b`, 1);
check("при ровно 2 ГБ даже 1 байт — отказ", !r.ok, why(r));
check("итог: квота не превышена", (await used(A)) <= GB2, mb(await used(A)));

// ── 2. Заявленный размер меньше настоящего — ловит запись ──
await seed(B, GB2 - 10 * MB);
r = await upload(B, `${B}/liar`, 40 * MB, { declared: 1024 });
check("заявил 1 КБ, загрузил 40 МБ при остатке 10 МБ — отказ при записи", !r.ok && r.stage === "write", why(r));
r = await upload(B, `${B}/nosize`, 1 * MB, { preMeta: { mimetype: "text/plain" } });
check("размер до загрузки не указан — считается как 50 МБ (при остатке 10 МБ — отказ)", !r.ok && r.stage === "pre", why(r));

// ── 3. Замена существующего файла ──
await admin.query("delete from storage.objects where name like $1", [`${B}/%`]);
await seed(B, GB2 - 30 * MB);
r = await upload(B, `${B}/doc`, 30 * MB);
check("файл 30 МБ на остаток — проходит", r.ok, why(r));
r = await upload(B, `${B}/doc`, 30 * MB);
check("тот же путь второй раз (без перезаписи) — отказ «уже есть», не квота", !r.ok && r.code === "23505", why(r));
r = await as(B, "insert into storage.objects (bucket_id, name, owner, metadata) values ('nexa-files', $1, $2, $3) on conflict (bucket_id, name) do update set metadata = excluded.metadata", [`${B}/doc`, B, { size: 10 * MB }]);
check("перезапись (upsert) от имени пользователя запрещена правилами", !r.ok && r.code === "42501", r.code);
r = await as(B, "update storage.objects set metadata = jsonb_set(metadata, '{size}', '1') where name = $1", [`${B}/doc`]);
check("подменить размер в сведениях объекта нельзя (0 строк)", r.ok && r.count === 0, JSON.stringify(r.count ?? r.code));
// Замена самим Storage (обход RLS): размер старого освобождается, новый считается
const replace = (size) => admin.query("insert into storage.objects (bucket_id, name, owner, metadata) values ('nexa-files', $1, $2, $3) on conflict (bucket_id, name) do update set metadata = excluded.metadata", [`${B}/doc`, B, { size }]).then(() => "прошло", (e) => `отказ (${e.code})`);
let rr = await replace(25 * MB);
check("замена тем же путём при полной квоте: 30 МБ → 25 МБ проходит (старый размер не считается дважды)", rr === "прошло", rr);
rr = await replace(40 * MB);
check("замена с ростом сверх квоты (25 → 40 МБ при остатке 5 МБ) — отказ", rr !== "прошло", rr);
check("итог: квота не превышена", (await used(B)) <= GB2, mb(await used(B)));

// ── 4. Параллельные загрузки ──
await seed(C, GB2 - 60 * MB);
const par = await Promise.all(Array.from({ length: 10 }, (_, i) => upload(C, `${C}/p-${i}`, 20 * MB, { pauseMs: 300 })));
const okN = par.filter((x) => x.ok).length;
check("10 одновременных загрузок по 20 МБ при остатке 60 МБ — прошло ровно 3", okN === 3, `прошло ${okN}, занято ${mb(await used(C))}`);
check("итог: квота не превышена", (await used(C)) <= GB2, `превышение ${mb(Math.max(0, (await used(C)) - GB2))}`);

// ── 5. Удаление освобождает место ──
r = await as(C, "delete from storage.objects where name = $1", [`${C}/seed-0`]);
check("удаление своего файла", r.ok && r.count === 1);
r = await upload(C, `${C}/after-delete`, 30 * MB);
check("после удаления 50 МБ файл 30 МБ снова проходит", r.ok, why(r));

// ── 6. Чужие файлы и папки ──
await seed(D, 10 * MB);
r = await upload(D, `${A}/sneak`, MB);
check("положить файл в чужую папку — отказ", !r.ok, why(r));
r = await upload(D, `${D}`, MB);
check("путь без папки аккаунта — отказ", !r.ok, why(r));
r = await upload(D, `${A}/../${D}/x`, MB);
check("путь с «..» на чужую папку — отказ (папка считается по первой части)", !r.ok, why(r));
r = await as(D, "select count(*)::int n from storage.objects where name like $1", [`${A}/%`]);
check("чужие файлы не видны", r.ok && r.rows[0].n === 0, JSON.stringify(r.rows?.[0] ?? r.code));
r = await as(D, "delete from storage.objects where name like $1", [`${A}/%`]);
check("чужие файлы не удаляются (0 строк)", r.ok && r.count === 0);
r = await as(D, "select public.nexa_storage_used() n");
check("«занято» показывает только своё", r.ok && Number(r.rows[0].n) === 10 * MB, mb(Number(r.rows?.[0]?.n)));
r = await as(D, "select public.nexa_storage_fits($1, '{\"size\": 1}'::jsonb) ok", [`${A}/x`]);
check("проверка места по чужому пути — «нет» (чужой объём не узнать)", r.ok && r.rows[0].ok === false);
r = await upload(D, `${D}/ok`, 40 * MB);
check("у A квота заполнена, а D загружает своё без помех", r.ok, why(r));
r = await as(D, "select public.nexa_storage_quota()");
check("функцию триггера вызвать напрямую нельзя", !r.ok, r.code);
const anon = await (async () => { const c = new pg.Client(cfg); await c.connect(); try { await c.query("begin"); await c.query("set local role anon"); await c.query("insert into storage.objects (bucket_id, name, metadata) values ('nexa-files', $1, '{\"size\":1}')", [`${A}/anon`]); return "прошло"; } catch (e) { return e.code; } finally { await c.end(); } })();
check("без входа загрузить нельзя", anon !== "прошло", anon);

// ── 7. Уже превышенная (по старой ошибке) квота ──
await seed(F, GB2 + 30 * MB, { legacy: true });
r = await upload(F, `${F}/more`, MB);
check("занято больше 2 ГБ: новый файл — отказ", !r.ok, why(r));
r = await as(F, "delete from storage.objects where name = $1", [`${F}/seed-0`]);
r = await upload(F, `${F}/after`, 10 * MB);
check("удалил 50 МБ (стало 2 ГБ − 20 МБ): файл 10 МБ проходит", r.ok, why(r));

console.log(`\n[${MODE}] пройдено ${passes}, не пройдено ${fails}`);
await admin.end();
try { await server.stop(); } catch { /* Windows иногда держит папку — итог от этого не зависит */ }
process.exit(fails ? 1 : 0);
