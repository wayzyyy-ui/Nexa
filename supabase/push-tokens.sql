-- Push-адреса (FCM token) приложений NEXA — для «Найти устройство», когда приложение закрыто.
-- Вставить вручную в Supabase → SQL Editor и выполнить один раз.
-- Одна строка на устройство аккаунта. Читает и пишет только сам владелец (RLS);
-- сервер (api/push.js) читает через service_role.

create table if not exists public.push_tokens (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id  text not null check (char_length(device_id) between 1 and 64),
  token      text not null check (char_length(token) between 10 and 4096),
  platform   text not null default 'android' check (platform in ('android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens select own" on public.push_tokens;
drop policy if exists "push_tokens insert own" on public.push_tokens;
drop policy if exists "push_tokens update own" on public.push_tokens;
drop policy if exists "push_tokens delete own" on public.push_tokens;
create policy "push_tokens select own" on public.push_tokens for select to authenticated using (auth.uid() = user_id);
create policy "push_tokens insert own" on public.push_tokens for insert to authenticated with check (auth.uid() = user_id);
create policy "push_tokens update own" on public.push_tokens for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_tokens delete own" on public.push_tokens for delete to authenticated using (auth.uid() = user_id);

-- Не больше 50 устройств с push на аккаунт
create or replace function public.nexa_push_tokens_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.push_tokens where user_id = new.user_id) >= 50 then
    raise exception 'too many push tokens';
  end if;
  return new;
end $$;
drop trigger if exists nexa_push_tokens_limit on public.push_tokens;
create trigger nexa_push_tokens_limit before insert on public.push_tokens
  for each row execute function public.nexa_push_tokens_limit();

-- «Удалить мои данные» в приложении стирает и эти строки (deleteAllMine в src/lib/sync.js)
