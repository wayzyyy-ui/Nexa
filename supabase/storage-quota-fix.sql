-- NEXA · Исправление квоты облачного хранилища (2 ГБ на аккаунт) для уже установленной базы.
-- Вставить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- Меняет только правило «класть в свою папку» корзины nexa-files, добавляет две функции
-- проверки и триггер на storage.objects. Файлы, таблицы files / file_folders, правила
-- «читать / удалять свои» и nexa_storage_used() (полоска «занято» в приложении) не трогаются.
--
-- Что было не так:
-- 1) Правило проверяло только «занято < 2 ГБ» — размер нового файла не учитывался:
--    при 1,99 ГБ проходил ещё файл до 50 МБ.
-- 2) Одновременные загрузки считали занятое место, не видя друг друга, — проходили все.
-- 3) Отказ был общим («нет доступа»), приложение не могло сказать «место закончилось»
--    (исправлено в приложении: после отказа оно само сверяет занятое место).

-- ─── Квота 2 ГБ на аккаунт вместе с новым файлом ─────────────────────────────
-- Storage кладёт файл в два шага: проверка правил до загрузки байтов (размер — заявленный,
-- contentLength) и запись строки после загрузки (настоящий size, пишет сам Storage —
-- клиент его не подделает; таблица files для квоты не используется). Поэтому две проверки:
--
-- 1) nexa_storage_fits — в правиле загрузки ниже: быстрый отказ ещё до передачи байтов.
--    занято + новый файл ≤ 2 ГБ; размер неизвестен — считаем максимум 50 МБ;
--    объект с тем же именем (замена) в «занято» не входит; чужая папка — сразу «нет».
create or replace function public.nexa_storage_fits(obj_name text, obj_meta jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  raw text := coalesce(obj_meta ->> 'size', obj_meta ->> 'contentLength');
  new_size bigint := 52428800;
  used bigint;
begin
  if uid is null or (storage.foldername(obj_name))[1] is distinct from uid then
    return false;
  end if;
  if raw ~ '^[0-9]{1,15}$' then new_size := raw::bigint; end if;
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into used
  from storage.objects o
  where o.bucket_id = 'nexa-files' and (storage.foldername(o.name))[1] = uid and o.name <> obj_name;
  return used + new_size <= 2147483648;
end;
$$;
revoke execute on function public.nexa_storage_fits(text, jsonb) from public, anon;
grant execute on function public.nexa_storage_fits(text, jsonb) to authenticated;

-- 2) nexa_storage_quota — триггер на саму запись строки (срабатывает при любой роли, в том
--    числе когда Storage пишет от своего имени). Записи одного аккаунта идут по очереди
--    (блокировка до конца транзакции записи) — одновременные загрузки квоту не превысят.
--    Владелец — по папке пути (<id аккаунта>/…), размер — metadata.size от Storage.
--    Строки без size (пробная проверка до загрузки) пропускает — их проверяет правило выше.
create or replace function public.nexa_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_dir text := (storage.foldername(new.name))[1];
  raw text := new.metadata ->> 'size';
  used bigint;
begin
  if new.bucket_id <> 'nexa-files' or owner_dir is null or raw is null then
    return new;
  end if;
  if raw !~ '^[0-9]{1,15}$' then
    raise exception 'storage_quota: bad size' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:storage:' || owner_dir, 0));
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into used
  from storage.objects o
  where o.bucket_id = 'nexa-files' and (storage.foldername(o.name))[1] = owner_dir
    and o.name <> new.name and (tg_op = 'INSERT' or o.name <> old.name);
  if used + raw::bigint > 2147483648 then
    raise exception 'storage_quota: account storage quota exceeded' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.nexa_storage_quota() from public, anon, authenticated;
-- Триггер на storage.objects: Supabase разрешает свои триггеры на этой таблице. Если права
-- всё же нет — остальное применится, а здесь будет предупреждение (тогда параллельные
-- загрузки защищает только правило выше, без очереди)
do $$
begin
  drop trigger if exists nexa_storage_quota on storage.objects;
  create trigger nexa_storage_quota before insert or update of name, metadata on storage.objects
    for each row execute function public.nexa_storage_quota();
exception when insufficient_privilege then
  raise warning 'NEXA: нет права создать триггер на storage.objects — квота проверяется только правилом загрузки';
end;
$$;

-- Правило загрузки: своя папка и место с учётом нового файла
drop policy if exists "nexa-files: класть в свою папку" on storage.objects;
create policy "nexa-files: класть в свою папку" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nexa-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.nexa_storage_fits(name, metadata)   -- до 2 ГБ на аккаунт вместе с новым файлом
  );
