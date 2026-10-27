-- Последнее известное место своих устройств (2026-10-27, «Где устройство?» для выключенного телефона).
-- Вставить вручную в Supabase SQL Editor (повторный запуск безопасен).
--
-- Пишется, только если на САМОМ устройстве включено «Поиск этого устройства»:
--   - само устройство (вошедший, через клиент — RLS «только свои»): при открытии NEXA, возврате в неё,
--     раз в 15 минут, пока открыта, и при сворачивании;
--   - сервер (api/push.js), когда телефон ответил на «Где устройство?» при закрытой NEXA.
-- Одна строка на устройство — только ПОСЛЕДНЯЯ точка, истории перемещений нет.
-- Выключили поиск на устройстве — его строка удаляется. «Удалить мои данные» стирает всё.

create table if not exists public.device_places (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 64),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  acc double precision not null default 0 check (acc >= 0 and acc <= 1000000),
  at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.device_places enable row level security;
revoke all on public.device_places from anon;
grant select, insert, update, delete on public.device_places to authenticated;

drop policy if exists "device_places_select_own" on public.device_places;
drop policy if exists "device_places_insert_own" on public.device_places;
drop policy if exists "device_places_update_own" on public.device_places;
drop policy if exists "device_places_delete_own" on public.device_places;
create policy "device_places_select_own" on public.device_places for select to authenticated using (user_id = auth.uid());
create policy "device_places_insert_own" on public.device_places for insert to authenticated with check (user_id = auth.uid());
create policy "device_places_update_own" on public.device_places for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "device_places_delete_own" on public.device_places for delete to authenticated using (user_id = auth.uid());

-- Не больше 200 устройств на аккаунт (как devices): чужой перебор id таблицу не раздует
create or replace function public.nexa_device_places_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from auth.uid() and auth.uid() is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('device_places:' || new.user_id::text));
  if exists (select 1 from public.device_places where user_id = new.user_id and device_id = new.device_id) then return new; end if;
  if (select count(*) from public.device_places where user_id = new.user_id) >= 200 then
    raise exception 'device_places limit' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists nexa_device_places_limit on public.device_places;
create trigger nexa_device_places_limit before insert on public.device_places
  for each row execute function public.nexa_device_places_limit();
