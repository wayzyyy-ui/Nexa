-- NEXA · Память ассистента: записи, которые человек сам попросил запомнить.
-- Вставить целиком в Supabase → SQL Editor → Run (один раз; повторный запуск безопасен).
-- Без этой таблицы память вошедшего работает только на этом устройстве (как у гостя).

create table if not exists public.memory (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  always boolean not null default false,          -- учитывать в каждом ответе (пожелания к ответам)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memory_user_idx on public.memory (user_id);

-- updated_at ставит база (как у остальных таблиц синхронизации)
create or replace function public.nexa_memory_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists memory_touch on public.memory;
create trigger memory_touch before insert or update on public.memory for each row execute function public.nexa_memory_touch();

-- Не больше 50 записей на аккаунт. Обновление существующей записи (в том числе через upsert,
-- который вызывает BEFORE INSERT ещё до проверки конфликта) лимит не трогает; одновременные
-- добавления одного аккаунта проверяются по очереди (см. supabase/limits-fix.sql)
create or replace function public.nexa_memory_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Чужая строка (вошедший пишет не от своего имени): не считаем и не блокируем — её отклонит RLS
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:memory:' || new.user_id::text, 0));
  if exists (select 1 from public.memory where id = new.id and user_id = new.user_id) then
    return new;
  end if;
  if (select count(*) from public.memory where user_id = new.user_id) >= 50 then
    raise exception 'memory_limit' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.nexa_memory_limit() from public, anon, authenticated;
drop trigger if exists memory_limit on public.memory;
create trigger memory_limit before insert on public.memory for each row execute function public.nexa_memory_limit();

-- Только свои строки и только для вошедших; anon — без доступа
alter table public.memory enable row level security;
drop policy if exists memory_select on public.memory;
drop policy if exists memory_insert on public.memory;
drop policy if exists memory_update on public.memory;
drop policy if exists memory_delete on public.memory;
create policy memory_select on public.memory for select to authenticated using (auth.uid() = user_id);
create policy memory_insert on public.memory for insert to authenticated with check (auth.uid() = user_id);
create policy memory_update on public.memory for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy memory_delete on public.memory for delete to authenticated using (auth.uid() = user_id);
revoke all on public.memory from anon;
