// Дописывание сообщений диалога (supabase/chats-append.sql) — проверка на настоящем Postgres
// (embedded-postgres, локально), окружение как в Supabase: роли anon / authenticated, auth.uid(), RLS.
// К Supabase и production не подключается. Запуск: cd supabase/tests && node chats-append-test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const PORT = await new Promise((ok) => { const srv = net.createServer().listen(0, () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const dir = path.join(os.tmpdir(), `nexa-chats-append-test-${process.pid}`);
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--no-locale"] });
await server.initialise(); await server.start();

let fails = 0, passes = 0;
const check = (name, ok, extra = "") => { if (ok) passes++; else fails++; console.log(`${ok ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };
const db = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" });
await db.connect();
try {
  await db.query(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  for (const f of ["sync-tables.sql", "chats-pinned.sql"]) await db.query(fs.readFileSync(`${REPO}supabase/${f}`, "utf8"));
  // Ограничение размера диалога — как в security-hardening.sql (1 МБ)
  await db.query("alter table public.chats add constraint chats_messages_size check (pg_column_size(messages) <= 1048576)");
  const sql = fs.readFileSync(`${REPO}supabase/chats-append.sql`, "utf8");
  await db.query(sql);
  await db.query(sql); // повторный запуск безопасен

  const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
  const chatA = "00000000-0000-0000-0000-0000000000c1";
  await db.query("insert into auth.users (id) values ($1), ($2)", [A, B]);
  await db.query("insert into public.chats (id, user_id, title, messages) values ($1, $2, 'Диалог', $3)", [chatA, A, JSON.stringify([{ role: "user", text: "привет" }])]);
  const as = async (uid, fn) => {
    await db.query("begin");
    try {
      await db.query(uid ? "set local role authenticated" : "set local role anon");
      if (uid) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const r = await fn();
      await db.query("commit");
      return r;
    } catch (e) { await db.query("rollback"); return { error: e }; }
  };
  const updatedAt = async () => (await db.query("select updated_at from public.chats where id = $1", [chatA])).rows[0].updated_at;
  const call = (uid, expected, msgs, title = null) => as(uid, () => db.query("select public.nexa_chat_append($1, $2, $3, $4) as at", [chatA, expected, JSON.stringify(msgs), title]));

  // 1. Своя строка, время совпадает — дописано, вернулось новое время
  let t0 = await updatedAt();
  let r = await call(A, new Date(t0.getTime()).toISOString(), [{ role: "ai", text: "ответ" }], "Новое название");
  let row = (await db.query("select title, messages, updated_at from public.chats where id = $1", [chatA])).rows[0];
  check("своё, время совпало — сообщение дописано в конец", !r.error && row.messages.length === 2 && row.messages[1].text === "ответ", JSON.stringify(r.error?.message || ""));
  check("название поменялось, время изменения новое", row.title === "Новое название" && r.rows?.[0]?.at && row.updated_at.getTime() >= t0.getTime());

  // 2. Время не совпало (строку изменили на другом устройстве) — null, ничего не дописано
  r = await call(A, new Date(t0.getTime() - 5000).toISOString(), [{ role: "user", text: "лишнее" }]);
  row = (await db.query("select messages from public.chats where id = $1", [chatA])).rows[0];
  check("время не совпало — null, строка не тронута", !r.error && r.rows[0].at === null && row.messages.length === 2);

  // 3. Чужой аккаунт — null (строка не видна), ничего не дописано
  const t1 = await updatedAt();
  r = await call(B, new Date(t1.getTime()).toISOString(), [{ role: "user", text: "чужое" }]);
  row = (await db.query("select messages from public.chats where id = $1", [chatA])).rows[0];
  check("чужой диалог — null, не дописано", !r.error && r.rows[0].at === null && row.messages.length === 2);

  // 4. Без входа — нет права вызывать
  r = await call(null, new Date(t1.getTime()).toISOString(), [{ role: "user", text: "аноним" }]);
  check("без входа (anon) — нет доступа", !!r.error && /permission denied/i.test(r.error.message), r.error?.message);

  // 5. Пусто, не список, больше 50 — ошибка
  for (const [name, msgs] of [["пустой список", []], ["не список", { a: 1 }], ["51 сообщение", Array.from({ length: 51 }, () => ({ role: "user", text: "x" }))]]) {
    r = await call(A, new Date(t1.getTime()).toISOString(), msgs);
    check(`${name} — отказ`, !!r.error && r.error.code === "22023", r.error?.code);
  }

  // 6. Предел размера диалога (1 МБ) действует и при дописывании
  const t2 = await updatedAt();
  r = await call(A, new Date(t2.getTime()).toISOString(), Array.from({ length: 50 }, () => ({ role: "user", text: "ж".repeat(30000) })));
  check("сверх 1 МБ — отказ ограничения размера", !!r.error && r.error.code === "23514", r.error?.code);

  // 7. Время с микросекундами: сравнение до миллисекунд (так его знает приложение)
  await db.query("update public.chats set updated_at = '2026-10-22 10:00:00.123456+00' where id = $1", [chatA]);
  await db.query("alter table public.chats disable trigger chats_set_updated_at");
  await db.query("update public.chats set updated_at = '2026-10-22 10:00:00.123456+00' where id = $1", [chatA]);
  await db.query("alter table public.chats enable trigger chats_set_updated_at");
  r = await call(A, "2026-10-22T10:00:00.123Z", [{ role: "user", text: "мс" }]);
  check("время облака с микросекундами совпадает по миллисекундам", !r.error && r.rows[0].at !== null);
} finally {
  await db.end(); await server.stop(); fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} из ${passes + fails}${fails ? " — ЕСТЬ ОШИБКИ" : ""}`);
process.exit(fails ? 1 : 0);
