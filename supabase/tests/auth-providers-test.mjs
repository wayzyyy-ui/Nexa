// Вход через Яндекс ID / Telegram (supabase/auth-providers.sql + restrict-email-domains.sql) —
// проверка на настоящем Postgres (embedded-postgres, локально), окружение как в Supabase.
// К Supabase не подключается. Запуск: cd supabase/tests && node auth-providers-test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-auth-test-${process.pid}`);
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
await db.query(read("restrict-email-domains.sql"));
await db.query(read("auth-providers.sql")); await db.query(read("auth-providers.sql")); // повторный запуск безопасен

const A = (await db.query("insert into auth.users (email) values ('a@mail.ru') returning id")).rows[0].id;

async function as(role, q, params = [], uid = A) {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [role === "authenticated" ? uid : ""]);
    await db.query(`set local role ${role}`);
    const r = await db.query(q, params);
    await db.query("commit");
    return r;
  } catch (e) { await db.query("rollback"); return { error: e.code || e.message }; }
}
const denied = (r) => !!r.error || (r.rowCount === 0 && !(r.rows || []).length);

// Сервер (service role) пишет и читает
const ins = await as("service_role", "insert into public.auth_logins (provider, secret_hash, state_hash, expires_at) values ('yandex', 's', 'st', now() + interval '5 minutes') returning id");
check("service role: создать попытку входа", !ins.error && ins.rows.length === 1, ins.error);
check("service role: привязать Яндекс", !(await as("service_role", "insert into public.auth_identities (provider, subject, user_id) values ('yandex', '1', $1)", [A])).error);
const sr = await as("service_role", "select public.nexa_auth_user_by_email('A@mail.ru') as id");
check("service role: аккаунт по почте (без учёта регистра)", sr.rows?.[0]?.id === A);

for (const role of ["anon", "authenticated"]) {
  check(`${role}: прочитать auth_logins`, denied(await as(role, "select * from public.auth_logins")));
  check(`${role}: записать auth_logins`, !!(await as(role, "insert into public.auth_logins (provider, secret_hash, expires_at) values ('telegram', 'x', now() + interval '1 minute')")).error);
  check(`${role}: подменить итог входа`, denied(await as(role, "update public.auth_logins set status = 'ready', token_hash = 'x' returning id")));
  check(`${role}: удалить попытки`, denied(await as(role, "delete from public.auth_logins returning id")));
  check(`${role}: прочитать auth_identities`, denied(await as(role, "select * from public.auth_identities")));
  check(`${role}: привязать себе чужой Telegram`, !!(await as(role, "insert into public.auth_identities (provider, subject, user_id) values ('telegram', '5', $1)", [A])).error);
  check(`${role}: искать аккаунт по почте`, !!(await as(role, "select public.nexa_auth_user_by_email('a@mail.ru')")).error);
  check(`${role}: очистка попыток`, !!(await as(role, "select public.nexa_auth_logins_cleanup()")).error);
}

// Срок жизни не больше 15 минут; один Яндекс — один аккаунт, у аккаунта — один Яндекс
check("попытка дольше 15 минут — отказ", !!(await as("service_role", "insert into public.auth_logins (provider, secret_hash, expires_at) values ('yandex', 's', now() + interval '1 hour')")).error);
const B = (await db.query("insert into auth.users (email) values ('b@mail.ru') returning id")).rows[0].id;
check("тот же Яндекс второму аккаунту — отказ", (await as("service_role", "insert into public.auth_identities (provider, subject, user_id) values ('yandex', '1', $1)", [B])).error === "23505");
check("второй Яндекс тому же аккаунту — отказ", (await as("service_role", "insert into public.auth_identities (provider, subject, user_id) values ('yandex', '2', $1)", [A])).error === "23505");

// Очистка: попытки, истёкшие больше часа назад, убираются при новой
await db.query("insert into public.auth_logins (provider, secret_hash, created_at, expires_at) values ('yandex', 'old', now() - interval '130 minutes', now() - interval '2 hours')");
await as("service_role", "insert into public.auth_logins (provider, secret_hash, expires_at) values ('yandex', 'new', now() + interval '5 minutes')");
check("старые попытки убираются сами", Number((await db.query("select count(*) from public.auth_logins where secret_hash = 'old'")).rows[0].count) === 0);

// Почтовые домены: чужой — отказ, метка в user_metadata не помогает
const signup = (email, app = { provider: "email" }, user = {}) => db.query("insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3)", [email, app, user]).then(() => "ok", (e) => e.code);
check("регистрация с gmail.com — отказ", (await signup("x@gmail.com")) === "23514");
check("регистрация с yandex.ru — можно", (await signup("x@yandex.ru")) === "ok");
check("чужой домен + метка Telegram в user_metadata — отказ", (await signup("x@gmail.com", { provider: "email" }, { nexa_provider: "telegram" })) === "23514");

// Удалили аккаунт — его привязки тоже
await db.query("delete from auth.users where id = $1", [A]);
check("удалили аккаунт — привязки ушли", Number((await db.query("select count(*) from public.auth_identities where user_id = $1", [A])).rows[0].count) === 0);

console.log(`\n${passes} из ${passes + fails}`);
await db.end();
try { await server.stop(); } catch {} // Windows иногда держит временную папку — это не ошибка теста
process.exit(fails ? 1 : 0);
