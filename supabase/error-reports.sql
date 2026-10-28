-- NEXA: отчёты о сбоях без личных данных (api/errors.js, src/lib/crashReport.js).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Повторно можно.
--
-- В таблице нет аккаунта, устройства, IP и адресов страниц — только «что и где упало» после очистки.
-- Одинаковые сбои склеиваются (отпечаток fp + версия): растёт счётчик, видно платформы, браузеры и разделы.
-- RLS включена БЕЗ правил: читать и писать может только сервер (service role).
-- Старше 90 дней — удаляются; строк не больше 5000 (лишние — самые давние).

create table if not exists public.error_reports (
  fp text not null check (fp ~ '^[0-9a-f]{8}$'),
  version text not null check (version ~ '^\d+\.\d+\.\d+$'),
  kind text not null check (kind in ('error', 'rejection', 'render')),
  name text not null check (char_length(name) <= 40),
  message text not null default '' check (char_length(message) <= 300),
  frames jsonb not null default '[]' check (jsonb_typeof(frames) = 'array' and pg_column_size(frames) <= 4096),
  platforms jsonb not null default '{}',
  browsers jsonb not null default '{}',
  screens jsonb not null default '{}',
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (fp, version)
);
create index if not exists error_reports_last_idx on public.error_reports (last_seen desc);

alter table public.error_reports enable row level security;
revoke all on public.error_reports from anon, authenticated;
grant all on public.error_reports to service_role;

-- +1 к счётчику словаря (не больше 30 разных ключей — словарь не раздувается)
create or replace function public.nexa_bump(p_map jsonb, p_key text)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_key is null or p_key = '' then p_map
    when p_map ? p_key or (select count(*) from jsonb_object_keys(p_map)) < 30
      then p_map || jsonb_build_object(p_key, coalesce((p_map ->> p_key)::int, 0) + 1)
    else p_map end;
$$;
revoke all on function public.nexa_bump(jsonb, text) from public, anon, authenticated;

-- Записать сбой (вызывает только сервер). p — уже очищенный отчёт
create or replace function public.nexa_error_hit(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.error_reports as e (fp, version, kind, name, message, frames, platforms, browsers, screens)
  values (p ->> 'fp', p ->> 'version', p ->> 'kind', p ->> 'name', coalesce(p ->> 'message', ''), coalesce(p -> 'frames', '[]'),
    public.nexa_bump('{}', p ->> 'platform'), public.nexa_bump('{}', p ->> 'browser'), public.nexa_bump('{}', p ->> 'screen'))
  on conflict (fp, version) do update set
    count = e.count + 1, last_seen = now(),
    platforms = public.nexa_bump(e.platforms, p ->> 'platform'),
    browsers = public.nexa_bump(e.browsers, p ->> 'browser'),
    screens = public.nexa_bump(e.screens, p ->> 'screen');
  -- Уборка иногда (примерно раз на 20 записей): старше 90 дней и сверх 5000 строк
  if random() < 0.05 then
    delete from public.error_reports where last_seen < now() - interval '90 days';
    delete from public.error_reports where (fp, version) in (
      select fp, version from public.error_reports order by last_seen desc offset 5000);
  end if;
end;
$$;
revoke all on function public.nexa_error_hit(jsonb) from public, anon, authenticated;
grant execute on function public.nexa_error_hit(jsonb) to service_role;
