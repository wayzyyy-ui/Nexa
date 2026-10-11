-- NEXA: вход по QR (как в Телеграме).
-- Новое устройство показывает QR и код, уже вошедшее подтверждает — и новое
-- входит без письма. Таблица служебная: читать и писать её может только
-- серверная функция api/qr-login.js (секретный ключ service_role).
-- Ни гостям (anon), ни вошедшим (authenticated) доступа нет вообще.
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно.

create table if not exists public.qr_logins (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,                 -- 6 символов на экране нового устройства
  secret_hash  text not null,                 -- отпечаток секрета, который знает только новое устройство
  device_label text,                          -- «Сайт на компьютере» и т.п. — показать при подтверждении
  status       text not null default 'pending' check (status in ('pending', 'approved', 'used')),
  token_hash   text,                          -- одноразовый пропуск для входа (после подтверждения)
  approved_by  uuid references auth.users on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists qr_logins_code_idx on public.qr_logins (code);

-- Защита: RLS включена, правил нет — значит, никто, кроме сервера, не видит строк
alter table public.qr_logins enable row level security;
revoke all on public.qr_logins from anon, authenticated;
