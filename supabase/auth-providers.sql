-- NEXA: вход через Яндекс ID и Telegram (api/auth-yandex.js, api/tg-*.js, api/_lib/extauth.js).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно.
--
-- Обе таблицы — только для сервера: RLS включена БЕЗ правил, у anon и authenticated
-- нет никаких прав. Сервер ходит с ключом service role (он RLS не замечает).

-- ── Попытки входа: одноразовые state (Яндекс) и токены для бота (Telegram) ──
-- Храним только хэши sha256: state_hash — state Яндекса или токен из ссылки t.me/<бот>?start=…,
-- secret_hash — секрет приложения, которое ждёт итог (опрос). Пропуск token_hash отдаётся один раз.
create table if not exists public.auth_logins (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('yandex', 'telegram')),
  purpose text not null default 'login' check (purpose in ('login', 'link')),
  client text not null default 'web' check (client in ('web', 'android', 'desktop')),
  link_user uuid references auth.users (id) on delete cascade,
  state_hash text,
  secret_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'linked', 'error', 'used')),
  token_hash text,
  error text check (error is null or char_length(error) <= 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- больше 15 минут попытка не живёт (Яндекс — 10, Telegram — 5)
  constraint auth_logins_ttl check (expires_at <= created_at + interval '15 minutes')
);
create unique index if not exists auth_logins_state_idx on public.auth_logins (state_hash) where state_hash is not null;
create index if not exists auth_logins_expires_idx on public.auth_logins (expires_at);

-- ── Чей это внешний аккаунт: один Яндекс / Telegram — один аккаунт NEXA, и у аккаунта не больше одного каждого ──
create table if not exists public.auth_identities (
  provider text not null check (provider in ('yandex', 'telegram')),
  subject text not null check (char_length(subject) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject),
  unique (provider, user_id)
);

alter table public.auth_logins enable row level security;
alter table public.auth_identities enable row level security;
-- Правил нет — значит, anon и authenticated ничего не видят. Плюс отзываем права целиком
revoke all on public.auth_logins from anon, authenticated;
revoke all on public.auth_identities from anon, authenticated;
grant all on public.auth_logins to service_role;
grant all on public.auth_identities to service_role;

-- ── Очистка: при каждой новой попытке убираем просроченные больше часа назад ──
create or replace function public.nexa_auth_logins_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.auth_logins where expires_at < now() - interval '1 hour';
$$;
revoke all on function public.nexa_auth_logins_cleanup() from public, anon, authenticated;
grant execute on function public.nexa_auth_logins_cleanup() to service_role;

create or replace function public.nexa_auth_logins_gc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.auth_logins where expires_at < now() - interval '1 hour';
  return new;
end;
$$;
revoke all on function public.nexa_auth_logins_gc() from public, anon, authenticated;
drop trigger if exists nexa_auth_logins_gc on public.auth_logins;
create trigger nexa_auth_logins_gc after insert on public.auth_logins
  for each statement execute function public.nexa_auth_logins_gc();

-- ── Аккаунт по почте: «тот же человек — тот же аккаунт» (только для сервера) ──
create or replace function public.nexa_auth_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) order by created_at limit 1;
$$;
revoke all on function public.nexa_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.nexa_auth_user_by_email(text) to service_role;
