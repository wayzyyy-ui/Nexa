// Проверка правил доступа в supabase/*.sql без базы (scripts/lib/sql-check.mjs):
// все настоящие файлы проходят, а каждая типичная дыра ловится
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkSql } from "../scripts/lib/sql-check.mjs";

const repo = () => {
  const dir = new URL("../supabase/", import.meta.url);
  const out = {};
  for (const n of fs.readdirSync(dir)) if (n.endsWith(".sql") && n !== "security-test.sql") out[n] = fs.readFileSync(new URL(n, dir), "utf8");
  return out;
};

test("все SQL-файлы проекта проходят проверку", () => {
  const files = repo();
  assert.ok(Object.keys(files).length >= 15);
  assert.deepEqual(checkSql(files), []);
});

const good = `
create table if not exists public.things (id uuid primary key, user_id uuid not null default auth.uid());
alter table public.things enable row level security;
create policy "things select own" on public.things for select to authenticated using (auth.uid() = user_id);
create policy "things insert own" on public.things for insert to authenticated with check (auth.uid() = user_id);
create policy "things no update" on public.things for update to authenticated using (false);
create or replace function public.nexa_x() returns void language sql security definer set search_path = '' as $$ select 1; $$;
`;
const rules = (sql) => checkSql({ "x.sql": sql }).map((p) => p.rule);

test("правильная таблица — без замечаний", () => {
  assert.deepEqual(rules(good), []);
});

test("ловит каждую дыру", () => {
  assert.deepEqual(rules(good.replace("alter table public.things enable row level security;", "")), ["rls"], "без RLS");
  assert.deepEqual(rules(`create table public.lost (id int); alter table public.lost enable row level security;`), ["no-policy"], "без правил и не «только сервер»");
  assert.deepEqual(rules(good + `create policy "all" on public.things for select to anon using (auth.uid() is null);`), ["anon"], "правило для anon");
  assert.deepEqual(rules(good + `create policy "all" on public.things for select using (auth.uid() = user_id);`), ["anon"], "без «to» — для всех");
  assert.deepEqual(rules(good + `create policy "open" on public.things for select to authenticated using (true);`), ["true"], "using (true)");
  assert.deepEqual(rules(good + `create policy "open" on public.things for insert to authenticated with check (true);`), ["true"], "with check (true)");
  assert.deepEqual(rules(good + `create policy "any" on public.things for select to authenticated using (user_id is not null);`), ["uid"], "без auth.uid()");
  assert.deepEqual(rules(good + `create or replace function public.bad() returns void language plpgsql security definer as $$ begin perform 1; end; $$;`), ["definer"], "security definer без search_path");
  assert.deepEqual(rules(good + `grant select on public.things to anon;`), ["grant"], "grant для anon");
  assert.deepEqual(rules(good + `revoke all on public.things from anon; grant select on public.things to authenticated;`), [], "revoke и grant для вошедших — можно");
  assert.deepEqual(rules(`create table public.qr_logins (id int); alter table public.qr_logins enable row level security;
    create policy "oops" on public.qr_logins for select to authenticated using (auth.uid() is not null);`), ["server-policy"], "таблице «только для сервера» правила не нужны");
});

test("комментарии и тела функций не путают разбор", () => {
  const sql = good + `-- create table public.ghost (id int);
  /* create policy "x" on public.things using (true); */
  create or replace function public.nexa_y() returns void language plpgsql security definer set search_path = '' as $$
  begin execute 'grant select on public.things to anon'; end; $$;`;
  assert.deepEqual(rules(sql), []);
});
