-- NEXA · Центр безопасности: сеансы входа своего аккаунта.
-- Вставить целиком в Supabase → SQL Editor → Run (один раз; повторный запуск безопасен).
--
-- Что даёт:
--   nexa_my_sessions()        — список СВОИХ сеансов входа (когда вошли, последняя активность,
--                               какое приложение/браузер, «это устройство»). IP не отдаём.
--   nexa_revoke_session(sid)  — завершить СВОЙ сеанс (не текущий): его ключ обновления
--                               перестаёт работать, устройство больше не продлит вход.
-- Обе функции работают от имени владельца (security definer), но внутри всегда
-- фильтруют по auth.uid() — чужие сеансы не видны и не завершаются.
-- Уже выданный пропуск (JWT) живёт до своего срока (по умолчанию час):
-- Authentication → Sessions / JWT expiry можно уменьшить (например, до 10 минут).

create or replace function public.nexa_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  active_at timestamptz,
  user_agent text,
  current boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.created_at,
    greatest(s.updated_at, s.refreshed_at::timestamptz, s.created_at) as active_at,
    left(coalesce(s.user_agent, ''), 300) as user_agent,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '') as current
  from auth.sessions s
  where auth.uid() is not null and s.user_id = auth.uid()
  order by active_at desc
  limit 50;
$$;

create or replace function public.nexa_revoke_session(sid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Текущий сеанс так не завершают — для него есть обычный «Выйти»
  if sid::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'current_session' using errcode = '22023';
  end if;
  -- Ключи обновления удаляются вместе с сеансом (связь on delete cascade)
  delete from auth.sessions where id = sid and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Вызывать могут только вошедшие пользователи
revoke all on function public.nexa_my_sessions() from public, anon;
revoke all on function public.nexa_revoke_session(uuid) from public, anon;
grant execute on function public.nexa_my_sessions() to authenticated;
grant execute on function public.nexa_revoke_session(uuid) to authenticated;

-- Проверка после установки (выполнить по отдельности, будучи вошедшим в SQL Editor нельзя —
-- проверяйте из приложения: Настройки → Безопасность и приватность → «Сеансы входа»).
-- Чужой сеанс: nexa_revoke_session(<id чужого сеанса>) вернёт false — строка не найдена по auth.uid().
