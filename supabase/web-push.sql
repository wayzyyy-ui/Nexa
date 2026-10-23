-- Веб-уведомления сайта (Web Push): «Вышла NEXA X» в браузере компьютера и на айфоне
-- (сайт на экране «Домой»). Вставить вручную в Supabase SQL Editor (повторный запуск безопасен).
-- Доступ только у сервера (api/webpush.js, service_role): RLS включена, правил нет.
--   web_push_subs  — подписки браузеров: адрес сервиса уведомлений и ключи шифрования этого браузера
--                    (не личные данные: по ним можно только прислать уведомление этому браузеру);
--   web_push_state — о какой версии уже разослали (чтобы не слать дважды).

create table if not exists public.web_push_subs (
  endpoint_hash text primary key check (char_length(endpoint_hash) = 64),
  endpoint text not null check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  topics text[] not null default '{updates}',
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists web_push_subs_user_idx on public.web_push_subs (user_id);

create table if not exists public.web_push_state (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.web_push_state (key, value) values ('updates', '') on conflict (key) do nothing;

alter table public.web_push_subs enable row level security;
alter table public.web_push_state enable row level security;
revoke all on public.web_push_subs from anon, authenticated;
revoke all on public.web_push_state from anon, authenticated;
