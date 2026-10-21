-- NEXA: общий буфер обмена (NEXA Flow как облачный буфер) — история скопированного текста
-- между устройствами аккаунта. Вставить вручную в Supabase → SQL Editor и выполнить.
-- Повторный запуск безопасен. Нужен после sync-tables.sql.
--
-- Что хранится: текст, который устройство само скопировало (синхронизация буфера включена
-- на нём отдельно, по умолчанию выключена), откуда он и до какого времени живёт.
-- Срок жизни — 1, 10 или 60 минут (выбирает отправитель); просроченное не видно даже владельцу
-- и удаляется при следующей записи этого аккаунта. Само событие «скопировано» идёт по закрытому
-- каналу Realtime nexa:<uid> (supabase/realtime-policies.sql) — таблица нужна устройствам,
-- которые были не в сети, и серверу push (api/push.js читает текст по номеру, а не из запроса).
--
-- enc — место под шифрование на устройствах: 0 — текст как есть (сейчас), 1 — зашифрован
-- общим ключом устройств аккаунта (будет позже; сервер текст тогда прочитать не сможет).

create table if not exists public.clipboard (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_device text not null check (char_length(from_device) between 1 and 64),
  from_name   text check (from_name is null or char_length(from_name) <= 60),
  text        text not null check (char_length(text) between 1 and 10000),
  enc         smallint not null default 0 check (enc in (0, 1)),
  created_at  timestamptz not null default now(),
  -- Не дольше часа (с запасом в минуту на расхождение часов устройств)
  expires_at  timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '61 minutes')
);
create index if not exists clipboard_user_idx on public.clipboard (user_id, created_at desc);

alter table public.clipboard enable row level security;
revoke all on public.clipboard from anon;
grant select, insert, delete on public.clipboard to authenticated;
revoke update on public.clipboard from authenticated;

-- Только свои строки. Просроченные не видны. Изменять нельзя (правила update нет) —
-- скопированное только добавляют и удаляют
drop policy if exists "clipboard select own" on public.clipboard;
drop policy if exists "clipboard insert own" on public.clipboard;
drop policy if exists "clipboard delete own" on public.clipboard;
drop policy if exists "clipboard update none" on public.clipboard;
create policy "clipboard select own" on public.clipboard for select to authenticated
  using (auth.uid() = user_id and expires_at > now());
create policy "clipboard insert own" on public.clipboard for insert to authenticated
  with check (auth.uid() = user_id);
create policy "clipboard delete own" on public.clipboard for delete to authenticated
  using (auth.uid() = user_id);
-- Явно «никому» — чтобы было видно, что обновление запрещено намеренно
create policy "clipboard update none" on public.clipboard for update to authenticated
  using (false) with check (false);

-- Перед записью: убрать просроченное этого аккаунта и не дать больше 100 живых записей.
-- Как остальные лимиты (limits-fix.sql): чужая строка — дальше (отклонит RLS), одновременные
-- записи одного аккаунта — по очереди
create or replace function public.nexa_clipboard_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:clipboard:' || new.user_id::text, 0));
  delete from public.clipboard where user_id = new.user_id and expires_at <= now();
  if (select count(*) from public.clipboard where user_id = new.user_id) >= 100 then
    raise exception 'too many clipboard items' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.nexa_clipboard_before_insert() from public, anon, authenticated;
drop trigger if exists nexa_clipboard_before_insert on public.clipboard;
create trigger nexa_clipboard_before_insert before insert on public.clipboard
  for each row execute function public.nexa_clipboard_before_insert();

-- Уборка всех просроченных разом (по желанию: Database → Cron, раз в 10 минут —
-- select public.nexa_clipboard_cleanup();). Без неё просроченное и так не видно и уходит
-- при следующей записи аккаунта
create or replace function public.nexa_clipboard_cleanup() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.clipboard where expires_at <= now() returning 1) select count(*)::int from d;
$$;
revoke all on function public.nexa_clipboard_cleanup() from public, anon, authenticated;

-- «Удалить мои данные» в приложении стирает и эти строки (deleteAllMine в src/lib/sync.js)
