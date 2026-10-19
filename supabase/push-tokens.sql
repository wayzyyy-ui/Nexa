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

-- Не больше 50 устройств с push на аккаунт. Это же устройство обновляет свой адрес upsert'ом —
-- лимит не мешает (BEFORE INSERT вызывается и для upsert); одновременные добавления — по очереди
create or replace function public.nexa_push_tokens_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Чужая строка (вошедший пишет не от своего имени): не считаем и не блокируем — её отклонит RLS
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:push_tokens:' || new.user_id::text, 0));
  if exists (select 1 from public.push_tokens where user_id = new.user_id and device_id = new.device_id) then
    return new;
  end if;
  if (select count(*) from public.push_tokens where user_id = new.user_id) >= 50 then
    raise exception 'too many push tokens' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.nexa_push_tokens_limit() from public, anon, authenticated;
drop trigger if exists nexa_push_tokens_limit on public.push_tokens;
create trigger nexa_push_tokens_limit before insert on public.push_tokens
  for each row execute function public.nexa_push_tokens_limit();

-- «Удалить мои данные» в приложении стирает и эти строки (deleteAllMine в src/lib/sync.js)
