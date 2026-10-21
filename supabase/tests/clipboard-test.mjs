// Общий буфер обмена (supabase/clipboard.sql) — проверка на настоящем Postgres (embedded-postgres, локально),
// окружение как в Supabase: роли anon / authenticated, auth.uid() из request.jwt.claim.sub, RLS.
// К Supabase и production не подключается.
//
// Запуск: cd supabase/tests && npm install (один раз), потом node clipboard-test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-clipboard-test-${process.pid}`);
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
const sql = fs.readFileSync(`${REPO}supabase/clipboard.sql`, "utf8");
await db.query(sql); await db.query(sql); // дважды — повторный запуск безопасен
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
await db.query("insert into auth.users (id) values ($1), ($2)", [A, B]);
// Строка B — от имени администратора
const bId = (await db.query("insert into public.clipboard (user_id, from_device, text, expires_at) values ($1, 'dev-b', 'секрет B', now() + interval '10 minutes') returning id", [B])).rows[0].id;

// Выполнить как пользователь (uid) или гость (null); вернуть результат или текст ошибки
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
const ins = (uid, owner, text = "текст", ttl = "10 minutes") =>
  as(uid, `insert into public.clipboard (user_id, from_device, text, expires_at) values ($1, 'dev', $2, now() + $3::interval) returning id`, [owner, text, ttl]);

// Своё
const own = await ins(A, A);
check("A добавляет свою запись", !own.error && own.rows.length === 1, own.error);
check("A видит свою запись", (await as(A, "select count(*)::int n from public.clipboard")).rows[0].n === 1);
// Чужое
check("A не видит записи B", (await as(A, "select count(*)::int n from public.clipboard where user_id = $1", [B])).rows[0].n === 0);
check("A не удаляет запись B", (await as(A, "delete from public.clipboard where id = $1", [bId])).rowCount === 0);
check("A не меняет запись B", ((r) => r.error || r.rowCount === 0)(await as(A, "update public.clipboard set text = 'взлом' where id = $1", [bId])));
const fake = await ins(A, B);
check("A не добавляет запись от имени B", !!fake.error, fake.error);
// Своё изменить тоже нельзя (только добавить и удалить)
const upd = await as(A, "update public.clipboard set text = 'правка' where id = $1", [own.rows[0].id]);
check("A не меняет даже свою запись", !!upd.error || upd.rowCount === 0, upd.error || `${upd.rowCount} строк`);
// Ограничения
check("больше 10 000 знаков — отказ", !!(await ins(A, A, "я".repeat(10001))).error);
check("пустой текст — отказ", !!(await ins(A, A, "")).error);
check("срок больше часа — отказ", !!(await ins(A, A, "т", "2 hours")).error);
// Просроченное: не видно и убирается при следующей записи
await db.query("insert into public.clipboard (user_id, from_device, text, created_at, expires_at) values ($1, 'dev', 'старое', now() - interval '20 minutes', now() - interval '10 minutes')", [A]);
check("просроченное не видно владельцу", (await as(A, "select count(*)::int n from public.clipboard where text = 'старое'")).rows[0].n === 0);
await ins(A, A, "новое");
check("просроченное удалено при новой записи", (await db.query("select count(*)::int n from public.clipboard where text = 'старое'")).rows[0].n === 0);
// Удалить своё
check("A удаляет свою запись", (await as(A, "delete from public.clipboard where id = $1", [own.rows[0].id])).rowCount === 1);
// Лимит 100
for (let i = (await db.query("select count(*)::int n from public.clipboard where user_id = $1", [A])).rows[0].n; i < 100; i++) await ins(A, A, "запись " + i);
const over = await ins(A, A, "сто первая");
check("101-я запись — отказ (лимит 100)", over.error === "23514", over.error);
// Гость
const anon = await as(null, "select count(*)::int n from public.clipboard");
check("гость (anon) не читает", !!anon.error || anon.rows[0].n === 0, anon.error);
check("гость (anon) не пишет", !!(await ins(null, B)).error);
// Тот же кусок, что в security-test.sql (16б), — как есть, в блоке с теми же переменными
const st = fs.readFileSync(`${REPO}supabase/security-test.sql`, "utf8");
const part = st.slice(st.indexOf("  -- 16б."), st.indexOf("  -- 17. Storage"));
const DO = ["do $blk$ declare A uuid := '", A, "'; B uuid := '", B, "'; fB uuid := gen_random_uuid(); n integer; r text[] := '{}';",
  " ok_line text := '%s  %-62s ожидается: %-24s получено: %-24s %s'; begin ", part,
  " reset role; raise exception 'REPORT%', array_to_string(r, chr(10)); end $blk$"].join("");
try { await db.query(DO); check("кусок security-test.sql (16б) выполняется", false, "нет отчёта"); } catch (e) {
  const rep = String(e.message);
  check("кусок security-test.sql (16б) выполняется", rep.startsWith("REPORT"), rep.startsWith("REPORT") ? "" : rep);
  if (rep.startsWith("REPORT")) {
    const lines = rep.slice(6).split(String.fromCharCode(10));
    lines.forEach((l) => console.log("   " + l));
    check("в отчёте 16б нет «ПРОБЛЕМА»", lines.length >= 5 && !rep.includes("ПРОБЛЕМА"));
  }
}
// Строка B цела
check("запись B на месте", (await db.query("select text from public.clipboard where id = $1", [bId])).rows[0]?.text === "секрет B");

await db.end(); await server.stop();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${fails ? "✘" : "✔"} clipboard.sql: ${passes} проверок прошло, ${fails} не прошло`);
process.exit(fails ? 1 : 0);
