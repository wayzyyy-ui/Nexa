// Проверка облачной базы (scripts/lib/db-expect.mjs): что берётся из SQL и как сравнивается
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { expectFromSql, usedFunctions, compareWithSpec, filesToRun } from "../scripts/lib/db-expect.mjs";

const SQL = `
-- комментарий: create table fake (x int);
create table if not exists public.notes (
  id uuid primary key,
  title text not null default '' check (char_length(title) <= 200),
  numbers numeric(10, 2),
  constraint notes_ok check (true),
  primary key (id)
);
alter table public.notes add column if not exists tags text[] not null default '{}';
alter table public.notes
  add column if not exists archived boolean;
create table storage.other (y int);
create or replace function public.nexa_used(p int) returns int language sql as $$ select 1; create table inside (z int) $$;
create or replace function public.nexa_touch() returns trigger language plpgsql as $$ begin return new; end $$;
create or replace function public.nexa_unused() returns int language sql as $$ select 2 $$;
insert into storage.buckets (id, name, public) values ('nexa-files', 'nexa-files', false) on conflict do nothing;
`;

test("из SQL берутся таблицы, колонки, функции и корзины", () => {
  const e = expectFromSql({ "a.sql": SQL, "b.sql": "alter table notes add column images jsonb;" });
  assert.deepEqual([...e.tables.keys()], ["notes"]); // storage.other, inside и fake из комментария — не наши
  assert.deepEqual([...e.tables.get("notes").columns.keys()], ["id", "title", "numbers", "tags", "archived", "images"]);
  assert.equal(e.tables.get("notes").columns.get("images"), "b.sql");
  assert.equal(e.functions.get("nexa_touch").trigger, true);
  assert.equal(e.functions.get("nexa_used").trigger, false);
  assert.equal(e.buckets.get("nexa-files"), "a.sql");
  assert.deepEqual(usedFunctions(e, ['supabase.rpc("nexa_used")', '"nexa_touch"']), ["nexa_used"]);
});

test("сравнение с описанием базы: чего не хватает и какие файлы запустить", () => {
  const e = expectFromSql({ "a.sql": SQL, "b.sql": "alter table notes add column images jsonb;" });
  const spec = { definitions: { notes: { properties: { id: {}, title: {}, numbers: {}, tags: {}, archived: {} } } }, paths: {} };
  const p = compareWithSpec(e, spec, ["nexa_used"]);
  assert.deepEqual(p.map((x) => x.what), ["notes.images", "nexa_used"]);
  assert.deepEqual(filesToRun(p), ["b.sql", "a.sql"]);
  spec.definitions.notes.properties.images = {};
  spec.paths["/rpc/nexa_used"] = {};
  assert.deepEqual(compareWithSpec(e, spec, ["nexa_used"]), []);
  assert.equal(compareWithSpec(e, { definitions: {} }, [])[0].text, "нет таблицы notes");
});

test("настоящие файлы supabase/*.sql разбираются", () => {
  const files = {};
  for (const n of readdirSync("supabase")) if (n.endsWith(".sql") && n !== "security-test.sql") files[n] = readFileSync(`supabase/${n}`, "utf8");
  const e = expectFromSql(files);
  for (const t of ["devices", "chats", "files", "file_folders", "notes", "memory", "schedule", "clipboard", "push_tokens", "error_reports"]) {
    assert.ok(e.tables.has(t), `нет таблицы ${t}`);
  }
  assert.equal(e.tables.get("notes").columns.get("images"), "notes.sql");
  assert.equal(e.tables.get("chats").columns.get("pinned"), "chats-pinned.sql");
  assert.equal(e.tables.get("chats").file, "sync-tables.sql");
  assert.equal(e.tables.get("chats").columns.get("messages"), "sync-tables.sql");
  assert.ok(e.tables.get("locate_requests").columns.has("received_at"));
  assert.ok(e.functions.has("nexa_chat_append"));
  assert.ok(e.buckets.has("nexa-files"));
});
