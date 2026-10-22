// Заметки (supabase/notes.sql) — проверка на настоящем Postgres (embedded-postgres, локально),
// окружение как в Supabase: роли anon / authenticated, auth.uid() из request.jwt.claim.sub, RLS.
// К Supabase и production не подключается. Запуск: cd supabase/tests && node notes-test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-notes-test-${process.pid}`);
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
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
const sql = fs.readFileSync(`${REPO}supabase/notes.sql`, "utf8");
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
await db.query("insert into auth.users (id) values ($1), ($2)", [A, B]);
// Таблица как в 0.14.2 (без tags / archived) и заметка в ней — повторный запуск notes.sql должен её дополнить
await db.query(`create table public.notes (id uuid primary key, user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200), text text not null default '' check (char_length(text) <= 100000),
  pinned boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
const oldId = "00000000-0000-0000-0000-0000000000a0";
await db.query("insert into public.notes (id, user_id, title, text) values ($1, $2, 'старая', 'до тегов')", [oldId, A]);
await db.query(sql); await db.query(sql); // дважды — повторный запуск безопасен
const old = (await db.query("select tags, archived, text from public.notes where id = $1", [oldId])).rows[0];
check("старая таблица дополнена: tags = {}, archived = false, текст цел", old && Array.isArray(old.tags) && !old.tags.length && old.archived === false && old.text === "до тегов", JSON.stringify(old));
await db.query("delete from public.notes where id = $1", [oldId]);
const bId = "00000000-0000-0000-0000-0000000000b1";
await db.query("insert into public.notes (id, user_id, title, text) values ($1, $2, 'B', 'секрет B')", [bId, B]);

async function as(uid, q, params = []) {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || ""]);
    await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
    const r = await db.query(q, params);
    await db.query("commit");
    return r;
  } catch (e) { await db.query("rollback"); return { error: e.code || e.message }; }
}
const upsert = (uid, id, title, text = "", owner) =>
  as(uid, `insert into public.notes (id, ${owner ? "user_id, " : ""}title, text) values ($1, ${owner ? "$4, " : ""}$2, $3)
    on conflict (id) do update set title = excluded.title, text = excluded.text returning id, updated_at`, owner ? [id, title, text, owner] : [id, title, text]);
const aId = "00000000-0000-0000-0000-0000000000a1";

const own = await upsert(A, aId, "Покупки", "молоко");
check("A создаёт свою заметку (upsert, как синхронизация)", !own.error && own.rows.length === 1, own.error);
const t1 = own.rows[0].updated_at;
await new Promise((r) => setTimeout(r, 20));
const edit = await upsert(A, aId, "Покупки", "молоко, хлеб");
check("A меняет свою заметку, updated_at растёт", !edit.error && edit.rows[0].updated_at > t1);
check("A видит только своё", (await as(A, "select count(*)::int n from public.notes")).rows[0].n === 1);
check("A не видит заметку B", (await as(A, "select count(*)::int n from public.notes where id = $1", [bId])).rows[0].n === 0);
check("A не меняет заметку B", ((r) => r.error || r.rowCount === 0)(await as(A, "update public.notes set text = 'взлом' where id = $1", [bId])));
check("A не удаляет заметку B", (await as(A, "delete from public.notes where id = $1", [bId])).rowCount === 0);
check("A не перезаписывает заметку B upsert'ом", !!(await upsert(A, bId, "взлом")).error);
check("A не создаёт заметку от имени B", !!(await upsert(A, "00000000-0000-0000-0000-0000000000a2", "подлог", "", B)).error);
check("заголовок длиннее 200 — отказ", !!(await upsert(A, aId, "я".repeat(201))).error);
check("текст 100 000 знаков — можно", !(await upsert(A, aId, "big", "т".repeat(100000))).error);
check("текст длиннее 100 000 — отказ", !!(await upsert(A, aId, "big", "т".repeat(100001))).error);
const setTags = (tags, archived = false) => as(A, "update public.notes set tags = $2, archived = $3 where id = $1", [aId, tags, archived]);
check("теги и архив сохраняются", ((r) => !r.error && r.rowCount === 1)(await setTags(["дом", "работа"], true)));
check("10 тегов — можно", !(await setTags(Array.from({ length: 10 }, (_, i) => `т${i}`))).error);
check("11 тегов — отказ", (await setTags(Array.from({ length: 11 }, (_, i) => `т${i}`))).error === "23514");
check("тег длиннее 30 — отказ", (await setTags(["я".repeat(31)])).error === "23514");
check("пустой тег — отказ", (await setTags([""])).error === "23514");
check("A удаляет свою заметку", (await as(A, "delete from public.notes where id = $1", [aId])).rowCount === 1);
// Лимит 1000: 999 вставляем от имени администратора, 1000-я — можно, 1001-я — нет, правка существующей — можно
await db.query("insert into public.notes (id, user_id, title) select gen_random_uuid(), $1, 'n' || g from generate_series(1, 999) g", [A]);
check("1000-я заметка — можно", !(await upsert(A, "00000000-0000-0000-0000-0000000000a3", "1000")).error);
const over = await upsert(A, "00000000-0000-0000-0000-0000000000a4", "1001");
check("1001-я заметка — отказ (лимит 1000)", over.error === "23514", over.error);
check("при полном лимите правка существующей — можно", !(await upsert(A, "00000000-0000-0000-0000-0000000000a3", "1000 правка")).error);
const anon = await as(null, "select count(*)::int n from public.notes");
check("гость (anon) не читает", !!anon.error || anon.rows[0].n === 0, anon.error);

// Тот же кусок, что в security-test.sql (16в), — как есть
const st = fs.readFileSync(`${REPO}supabase/security-test.sql`, "utf8");
const part = st.slice(st.indexOf("  -- 16в."), st.indexOf("  -- 17. Storage"));
const DO = ["do $blk$ declare A uuid := '", A, "'; B uuid := '", B, "'; fB uuid := gen_random_uuid(); n integer; r text[] := '{}';",
  " ok_line text := '%s  %-62s ожидается: %-24s получено: %-24s %s'; begin ", part,
  " reset role; raise exception 'REPORT%', array_to_string(r, chr(10)); end $blk$"].join("");
try { await db.query(DO); check("кусок security-test.sql (16в) выполняется", false, "нет отчёта"); } catch (e) {
  const rep = String(e.message);
  check("кусок security-test.sql (16в) выполняется", rep.startsWith("REPORT"), rep.startsWith("REPORT") ? "" : rep);
  if (rep.startsWith("REPORT")) {
    const lines = rep.slice(6).split(String.fromCharCode(10));
    lines.forEach((l) => console.log("   " + l));
    check("в отчёте 16в нет «ПРОБЛЕМА»", lines.length >= 6 && !rep.includes("ПРОБЛЕМА"));
  }
}
check("заметка B на месте", (await db.query("select text from public.notes where id = $1", [bId])).rows[0]?.text === "секрет B");

await db.end(); await server.stop();
console.log(`\n${fails ? "✘" : "✔"} notes.sql: ${passes} проверок прошло, ${fails} не прошло`);
process.exit(fails ? 1 : 0);
