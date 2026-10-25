-- Непонятые фразы для дообучения NEXA Mini (api/phrases.js). Вставить вручную в Supabase SQL Editor
-- (повторный запуск безопасен). Собираются только с согласия человека в приложении.
--
-- В таблице НЕТ аккаунта, устройства, имени и адреса — только текст короткой просьбы,
-- догадка сети и её уверенность. Поэтому «Удалить мои данные» эти строки не трогает: связать их
-- с человеком нельзя.
-- Доступ только у сервера (service_role): RLS включена, правил нет — ни anon, ни authenticated
-- ничего не читают и не пишут. Записи старше 90 дней удаляются (триггером при каждой записи
-- и функцией nexa_mini_phrases_cleanup — её можно поставить в Cron). Всего не больше 20 000 строк.

create table if not exists public.mini_phrases (
  id bigint generated always as identity primary key,
  text text not null check (char_length(text) between 1 and 120),
  intent_guess text check (intent_guess is null or intent_guess ~ '^[A-Z_]{2,20}$'),
  confidence real check (confidence is null or (confidence > 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);
create index if not exists mini_phrases_created_idx on public.mini_phrases (created_at);

alter table public.mini_phrases enable row level security;
revoke all on public.mini_phrases from anon, authenticated;

-- Убрать записи старше 90 дней
create or replace function public.nexa_mini_phrases_cleanup()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.mini_phrases where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.nexa_mini_phrases_cleanup() from public, anon, authenticated;

-- Перед записью: стираем старое и не даём таблице разрастись (одновременные записи — по очереди)
create or replace function public.nexa_mini_phrases_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('nexa_mini_phrases'));
  delete from public.mini_phrases where created_at < now() - interval '90 days';
  if (select count(*) from public.mini_phrases) >= 20000 then
    raise exception 'mini_phrases_full' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.nexa_mini_phrases_limit() from public, anon, authenticated;

drop trigger if exists nexa_mini_phrases_limit on public.mini_phrases;
create trigger nexa_mini_phrases_limit before insert on public.mini_phrases
  for each row execute function public.nexa_mini_phrases_limit();
