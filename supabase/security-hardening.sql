-- NEXA: усиление защиты (аудит безопасности).
-- Ничего не удаляет и не отключает — только добавляет ограничения и одну служебную таблицу.
-- Запускать после sync-tables.sql, realtime-policies.sql, qr-login.sql, restrict-email-domains.sql.
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно.

-- ─── 1. Счётчик запросов для серверных функций (ассистент, вход по QR) ────────
-- Нужен, чтобы ограничение «не больше N запросов в минуту» было общим для всех
-- копий сервера Vercel. Доступ — только у сервера (service_role).
create table if not exists public.api_rate_limits (
  key          text primary key,          -- «chat:m:<отпечаток IP>» и т.п. (сам IP не храним)
  window_start timestamptz not null,
  hits         integer not null
);
alter table public.api_rate_limits enable row level security;   -- правил нет: никому, кроме сервера
revoke all on public.api_rate_limits from anon, authenticated;

-- Засчитать запрос: true — можно, false — слишком часто
create or replace function public.nexa_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.api_rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  -- Изредка убираем старые счётчики, чтобы таблица не росла
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;
-- Функции в Postgres по умолчанию может вызвать кто угодно — закрываем
revoke execute on function public.nexa_rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.nexa_rate_hit(text, integer, integer) to service_role;

-- ─── 2. Размер данных в devices и chats ──────────────────────────────────────
-- Без ограничений вошедший человек мог записать в свои строки сколько угодно
-- мегабайт. NOT VALID — старые строки не проверяются (ничего не ломаем),
-- проверка действует для всех новых записей и изменений.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'devices_name_len') then
    alter table public.devices add constraint devices_name_len check (char_length(name) <= 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'devices_type_len') then
    alter table public.devices add constraint devices_type_len check (char_length(type) <= 20) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'devices_state_size') then
    alter table public.devices add constraint devices_state_size check (pg_column_size(state) <= 16384) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chats_title_len') then
    alter table public.chats add constraint chats_title_len check (char_length(title) <= 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chats_messages_size') then
    alter table public.chats add constraint chats_messages_size check (pg_column_size(messages) <= 1048576) not valid;
  end if;
end;
$$;

-- ─── 3. Количество строк на аккаунт ──────────────────────────────────────────
-- Не больше 200 устройств и 1000 диалогов на человека. Перезапись уже
-- существующей строки (синхронизация шлёт upsert) лимит не трогает.
create or replace function public.nexa_limit_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_exists boolean;
  v_count integer;
begin
  execute format('select exists (select 1 from %I.%I where id = $1)', tg_table_schema, tg_table_name)
    into v_exists using new.id;
  if v_exists then
    return new;
  end if;
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_limit then
    raise exception 'NEXA: row limit reached for %', tg_table_name using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists devices_limit_rows on public.devices;
create trigger devices_limit_rows before insert on public.devices
  for each row execute function public.nexa_limit_rows('200');
drop trigger if exists chats_limit_rows on public.chats;
create trigger chats_limit_rows before insert on public.chats
  for each row execute function public.nexa_limit_rows('1000');

-- ─── 4. Проверка почты и при смене почты ─────────────────────────────────────
-- Раньше триггер проверял почту только при регистрации: можно было войти
-- с разрешённой почтой, а потом сменить её на любую. Теперь — и при смене.
-- (Функция nexa_restrict_email_domain — из restrict-email-domains.sql.)
drop trigger if exists nexa_restrict_email_domain_update on auth.users;
create trigger nexa_restrict_email_domain_update
  before update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.nexa_restrict_email_domain();

-- ─── 5. Ещё раз закрываем служебную таблицу входа по QR от браузера ─────────
-- (Функции-триггеры отдельно не закрываем: напрямую их вызвать нельзя.)
revoke all on public.qr_logins from anon, authenticated;
