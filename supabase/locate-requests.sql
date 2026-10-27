-- «Где устройство?», когда NEXA на телефоне закрыта (api/push.js, действия locate / locate-reply / locate-poll).
-- Вставить вручную в Supabase SQL Editor (повторный запуск безопасен).
--
-- Как это работает:
--   1) вошедший спрашивает место своего телефона → сервер заводит строку (только хеш одноразового
--      ключа, срок 5 минут) и шлёт телефону push с этим ключом;
--   2) телефон сам (без входа в аккаунт — ключа входа в Android нет) отвечает серверу с ключом:
--      сервер сверяет хеш и записывает координаты;
--   3) спросивший забирает ответ — после этого строка удаляется. Просроченные стираются при каждом
--      новом запросе. Координаты лежат здесь не дольше нескольких минут.
-- Доступ только у сервера (RLS включена, правил нет — как у qr_logins).

create table if not exists public.locate_requests (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) <= 64),
  secret_hash text not null check (char_length(secret_hash) = 64),
  status text not null default 'waiting' check (status in ('waiting', 'ok', 'off', 'denied', 'background', 'error')),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  acc double precision check (acc >= 0 and acc <= 1000000),
  at bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

create index if not exists locate_requests_user_idx on public.locate_requests (user_id);
create index if not exists locate_requests_expires_idx on public.locate_requests (expires_at);

alter table public.locate_requests enable row level security;
-- Правил нет: ни authenticated, ни anon строки не видят. Работает только сервер (service_role)
revoke all on public.locate_requests from anon, authenticated;

-- ── 2026-10-27: «запрос дошёл» и «геолокация выключена» ──
-- received_at — телефон получил push и сразу отметился (locate-ack), ещё до поиска места:
-- спросивший видит «Телефон получил запрос…» вместо долгого молчания
alter table public.locate_requests add column if not exists received_at timestamptz;
-- nogps — на телефоне выключена геолокация целиком
alter table public.locate_requests drop constraint if exists locate_requests_status_check;
alter table public.locate_requests add constraint locate_requests_status_check
  check (status in ('waiting', 'ok', 'off', 'denied', 'background', 'error', 'nogps'));
