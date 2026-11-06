-- Google Календарь (api/calendar-google.js). Вставить вручную в Supabase SQL Editor, повторно можно.
-- Обе таблицы только для сервера: RLS без правил, у anon и authenticated прав нет.
-- Текст дел здесь не хранится — только зашифрованный ключ доступа к календарю.

create table if not exists public.google_calendar (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_enc text not null check (char_length(token_enc) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Попытка подключения: одноразовый state (только хэш), срок 10 минут
create table if not exists public.google_calendar_states (
  state_hash text primary key check (char_length(state_hash) = 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  client text not null default 'web' check (client in ('web', 'android', 'desktop')),
  expires_at timestamptz not null
);
create index if not exists google_calendar_states_expires on public.google_calendar_states (expires_at);

alter table public.google_calendar enable row level security;
alter table public.google_calendar_states enable row level security;

revoke all on public.google_calendar from anon, authenticated;
revoke all on public.google_calendar_states from anon, authenticated;
grant all on public.google_calendar to service_role;
grant all on public.google_calendar_states to service_role;
