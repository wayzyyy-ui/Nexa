-- ─────────────────────────────────────────────────────────────────────────────
-- NEXA: расписание («Сегодня») в облаке аккаунта — общее для сайта и приложения.
--
-- Как запустить: Supabase → SQL Editor → вставить файл целиком → Run.
-- Можно запускать повторно: существующее не пересоздаётся и не удаляется.
-- Нужны уже запущенные sync-tables.sql (функция nexa_set_updated_at)
-- и security-hardening.sql (функция nexa_limit_rows).
--
-- До запуска этого файла расписание живёт только в браузере устройства,
-- как раньше; приложение работает без ошибок.
-- ─────────────────────────────────────────────────────────────────────────────

-- Без этих функций таблица не заработает — сразу понятная ошибка
do $$
begin
  if to_regprocedure('public.nexa_set_updated_at()') is null then
    raise exception 'NEXA: сначала запустите supabase/sync-tables.sql';
  end if;
  if to_regprocedure('public.nexa_limit_rows()') is null then
    raise exception 'NEXA: сначала запустите supabase/security-hardening.sql';
  end if;
end $$;

create table if not exists public.schedule (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        text not null,                -- дата дела: "2026-10-12"
  time       text not null,                -- время: "09:30"
  title      text not null,
  place      text not null default '',     -- описание (в приложении — поле «Описание»)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_day   check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint schedule_time  check (time ~ '^\d{2}:\d{2}$'),
  constraint schedule_title check (char_length(title) between 1 and 120),
  constraint schedule_place check (char_length(place) <= 200)
);

create index if not exists schedule_user_id_idx on public.schedule (user_id);

-- updated_at ставится сам при каждом изменении (по нему решается, какая версия новее)
drop trigger if exists schedule_set_updated_at on public.schedule;
create trigger schedule_set_updated_at
  before update on public.schedule
  for each row execute function public.nexa_set_updated_at();

-- Не больше 2000 дел на аккаунт
drop trigger if exists schedule_limit_rows on public.schedule;
create trigger schedule_limit_rows before insert on public.schedule
  for each row execute function public.nexa_limit_rows('2000');

-- Доступ: только свои строки и только вошедшим; anon — ничего
alter table public.schedule enable row level security;
revoke all on public.schedule from anon;
grant select, insert, update, delete on public.schedule to authenticated;

drop policy if exists "schedule: свои строки — читать"   on public.schedule;
drop policy if exists "schedule: свои строки — добавлять" on public.schedule;
drop policy if exists "schedule: свои строки — менять"   on public.schedule;
drop policy if exists "schedule: свои строки — удалять"  on public.schedule;
create policy "schedule: свои строки — читать"   on public.schedule for select to authenticated using ((select auth.uid()) = user_id);
create policy "schedule: свои строки — добавлять" on public.schedule for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "schedule: свои строки — менять"   on public.schedule for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "schedule: свои строки — удалять"  on public.schedule for delete to authenticated using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

-- Проверка (только чтение): RLS включена, четыре правила
select relrowsecurity as rls_on,
       (select count(*) from pg_policies where tablename = 'schedule') as policies
from pg_class where oid = 'public.schedule'::regclass;
