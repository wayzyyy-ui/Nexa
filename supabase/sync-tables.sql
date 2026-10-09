-- NEXA: таблицы для устройств и чатов аккаунта.
-- Каждый видит и меняет только свои строки (RLS), гостям (anon) доступа нет.
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно: всё создаётся «если ещё нет» или пересоздаётся.

-- ─── Устройства ───────────────────────────────────────────────
create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text,
  type       text,                       -- phone, laptop, tablet, watch, buds (наушники), tv
  state      jsonb not null default '{}', -- заряд, память, в сети ли, переключатели
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Чаты ассистента ──────────────────────────────────────────
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text,
  messages   jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Поиск строк одного пользователя — быстрый
create index if not exists devices_user_id_idx on public.devices (user_id);
create index if not exists chats_user_id_idx   on public.chats (user_id);

-- ─── updated_at обновляется сам при каждом изменении строки ───
create or replace function public.nexa_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.nexa_set_updated_at();

drop trigger if exists chats_set_updated_at on public.chats;
create trigger chats_set_updated_at
  before update on public.chats
  for each row execute function public.nexa_set_updated_at();

-- ─── Доступ: только вошедшие и только к своим строкам ─────────
alter table public.devices enable row level security;
alter table public.chats   enable row level security;

revoke all on public.devices from anon;
revoke all on public.chats   from anon;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update, delete on public.chats   to authenticated;

drop policy if exists "devices: свои строки — читать"   on public.devices;
drop policy if exists "devices: свои строки — добавлять" on public.devices;
drop policy if exists "devices: свои строки — менять"   on public.devices;
drop policy if exists "devices: свои строки — удалять"  on public.devices;
create policy "devices: свои строки — читать"   on public.devices for select to authenticated using ((select auth.uid()) = user_id);
create policy "devices: свои строки — добавлять" on public.devices for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "devices: свои строки — менять"   on public.devices for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "devices: свои строки — удалять"  on public.devices for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "chats: свои строки — читать"   on public.chats;
drop policy if exists "chats: свои строки — добавлять" on public.chats;
drop policy if exists "chats: свои строки — менять"   on public.chats;
drop policy if exists "chats: свои строки — удалять"  on public.chats;
create policy "chats: свои строки — читать"   on public.chats for select to authenticated using ((select auth.uid()) = user_id);
create policy "chats: свои строки — добавлять" on public.chats for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "chats: свои строки — менять"   on public.chats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "chats: свои строки — удалять"  on public.chats for delete to authenticated using ((select auth.uid()) = user_id);
