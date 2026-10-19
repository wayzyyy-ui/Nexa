-- NEXA · Исправление лимитов записей в memory (50) и push_tokens (50) для уже установленной базы.
-- Вставить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен: заменяются только
-- две функции-проверки, таблицы, данные, триггеры и правила доступа (RLS) не трогаются.
--
-- Что было не так:
-- 1) Проверка лимита висела на BEFORE INSERT. Postgres вызывает такой триггер и для upsert
--    (INSERT … ON CONFLICT DO UPDATE) — ещё до того, как поймёт, что строка уже есть. Когда у аккаунта
--    ровно 50 записей, любое изменение существующей (синхронизация памяти шлёт upsert, приложение
--    обновляет свой push-адрес upsert'ом) отклонялось как «51-я запись».
-- 2) Подсчёт без блокировки: два одновременных добавления при 49 записях оба видели 49 и оба проходили.
-- 3) Вставка «от имени» другого аккаунта сначала проходила через подсчёт его записей: по ошибке
--    (лимит или отказ доступа) можно было узнать, заполнена ли чужая память. Теперь такую строку
--    сразу отклоняют правила доступа (RLS), чужие записи не считаются.
--
-- Как теперь: запросы одного аккаунта к одной таблице проверяются по очереди (короткая блокировка
-- до конца транзакции, pg_advisory_xact_lock), строка с тем же ключом уже есть — это обновление,
-- лимит не мешает; новая строка сверх 50 — по-прежнему отказ.

create or replace function public.nexa_memory_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Чужая строка (вошедший пишет не от своего имени): не считаем и не блокируем — её отклонит RLS
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  -- Одновременные добавления одного аккаунта — по очереди (до конца транзакции)
  perform pg_advisory_xact_lock(hashtextextended('nexa:memory:' || new.user_id::text, 0));
  -- Запись с таким id у этого аккаунта уже есть: upsert станет обновлением — не новая запись
  if exists (select 1 from public.memory where id = new.id and user_id = new.user_id) then
    return new;
  end if;
  if (select count(*) from public.memory where user_id = new.user_id) >= 50 then
    raise exception 'memory_limit' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.nexa_push_tokens_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Чужая строка (вошедший пишет не от своего имени): не считаем и не блокируем — её отклонит RLS
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:push_tokens:' || new.user_id::text, 0));
  -- Это же устройство обновляет свой адрес — не новая строка
  if exists (select 1 from public.push_tokens where user_id = new.user_id and device_id = new.device_id) then
    return new;
  end if;
  if (select count(*) from public.push_tokens where user_id = new.user_id) >= 50 then
    raise exception 'too many push tokens' using errcode = '23514';
  end if;
  return new;
end; $$;

-- Триггеры (memory_limit, nexa_push_tokens_limit — BEFORE INSERT) остаются прежними:
-- они вызывают эти функции по имени, пересоздавать их не нужно.
-- Функции вызываются только триггерами — напрямую их никто не зовёт
revoke all on function public.nexa_memory_limit() from public, anon, authenticated;
revoke all on function public.nexa_push_tokens_limit() from public, anon, authenticated;
