-- NEXA: облачное хранилище файлов аккаунта.
--
-- Зачем:
--   * таблица files — сведения о файле (имя, папка, размер, путь к содержимому),
--     синхронизируются между устройствами, как устройства и чаты;
--   * таблица file_folders — папки, созданные пользователем;
--   * корзина Storage «nexa-files» — сами байты. ЗАКРЫТАЯ (не публичная):
--     открыть файл можно только по временной подписанной ссылке.
--     Путь объекта — <id аккаунта>/<id файла>: правила ниже пускают человека
--     только в его собственную папку.
--
-- Ничего не удаляет. Если корзина уже есть — её не пересоздаём, только делаем закрытой.
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно. Лучше после security-hardening.sql (тогда сработает и лимит строк).

-- ─── 1. Сведения о файлах ────────────────────────────────────────────────────
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null,
  cat          text,                          -- photo, video, doc, music, other
  folder       text,                          -- id папки (photo, docs… или id из file_folders); null — корень
  mime         text,
  size_bytes   bigint,
  device       text,                          -- откуда загружен («Смартфон», «Ноутбук»)
  storage_path text,                          -- <user_id>/<id> в корзине nexa-files
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint files_name_len  check (char_length(name) between 1 and 255),
  constraint files_cat_len   check (cat is null or char_length(cat) <= 20),
  constraint files_folder_len check (folder is null or char_length(folder) <= 64),
  constraint files_mime_len  check (mime is null or char_length(mime) <= 255),
  constraint files_size      check (size_bytes is null or size_bytes between 0 and 52428800),
  -- Путь — только в своей папке: запись не может указывать на чужой файл
  constraint files_own_path  check (storage_path is null or storage_path like user_id::text || '/%')
);
create index if not exists files_user_id_idx on public.files (user_id);

-- ─── 2. Папки пользователя ───────────────────────────────────────────────────
create table if not exists public.file_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  parent     text,                            -- id родительской папки; null — корень
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_folders_name_len   check (char_length(name) between 1 and 120),
  constraint file_folders_parent_len check (parent is null or char_length(parent) <= 64)
);
create index if not exists file_folders_user_id_idx on public.file_folders (user_id);

-- updated_at ставится сам (функция — из sync-tables.sql)
drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at before update on public.files
  for each row execute function public.nexa_set_updated_at();
drop trigger if exists file_folders_set_updated_at on public.file_folders;
create trigger file_folders_set_updated_at before update on public.file_folders
  for each row execute function public.nexa_set_updated_at();

-- Не больше 5000 файлов и 500 папок на аккаунт (функция — из security-hardening.sql)
do $$
begin
  if to_regprocedure('public.nexa_limit_rows()') is not null then
    drop trigger if exists files_limit_rows on public.files;
    create trigger files_limit_rows before insert on public.files
      for each row execute function public.nexa_limit_rows('5000');
    drop trigger if exists file_folders_limit_rows on public.file_folders;
    create trigger file_folders_limit_rows before insert on public.file_folders
      for each row execute function public.nexa_limit_rows('500');
  end if;
end;
$$;

-- Доступ: только вошедшие и только к своим строкам
alter table public.files        enable row level security;
alter table public.file_folders enable row level security;
revoke all on public.files, public.file_folders from anon;
grant select, insert, update, delete on public.files, public.file_folders to authenticated;

drop policy if exists "files: свои строки — читать"    on public.files;
drop policy if exists "files: свои строки — добавлять" on public.files;
drop policy if exists "files: свои строки — менять"    on public.files;
drop policy if exists "files: свои строки — удалять"   on public.files;
create policy "files: свои строки — читать"    on public.files for select to authenticated using ((select auth.uid()) = user_id);
create policy "files: свои строки — добавлять" on public.files for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "files: свои строки — менять"    on public.files for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "files: свои строки — удалять"   on public.files for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "file_folders: свои строки — читать"    on public.file_folders;
drop policy if exists "file_folders: свои строки — добавлять" on public.file_folders;
drop policy if exists "file_folders: свои строки — менять"    on public.file_folders;
drop policy if exists "file_folders: свои строки — удалять"   on public.file_folders;
create policy "file_folders: свои строки — читать"    on public.file_folders for select to authenticated using ((select auth.uid()) = user_id);
create policy "file_folders: свои строки — добавлять" on public.file_folders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "file_folders: свои строки — менять"    on public.file_folders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "file_folders: свои строки — удалять"   on public.file_folders for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── 3. Корзина Storage: закрытая, до 50 МБ на файл ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('nexa-files', 'nexa-files', false, 52428800)
on conflict (id) do nothing;
-- Если корзина уже была — гарантируем, что она закрытая и с лимитом
update storage.buckets set public = false, file_size_limit = 52428800 where id = 'nexa-files';

-- Сколько места уже занято у того, кто вошёл (для лимита 2 ГБ на аккаунт).
-- Без параметра: узнать занятое место другого человека нельзя.
-- security definer: правило на storage.objects не может само читать storage.objects
create or replace function public.nexa_storage_used()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'nexa-files' and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;
revoke execute on function public.nexa_storage_used() from public, anon;
grant execute on function public.nexa_storage_used() to authenticated;

-- ─── 4. Правила корзины: только своя папка <id аккаунта>/ ────────────────────
-- Перезаписи (update) нет: новый файл — новый объект; переименование меняет только сведения
drop policy if exists "nexa-files: читать свои"   on storage.objects;
drop policy if exists "nexa-files: класть в свою папку" on storage.objects;
drop policy if exists "nexa-files: удалять свои"  on storage.objects;
create policy "nexa-files: читать свои" on storage.objects for select to authenticated
  using (bucket_id = 'nexa-files' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "nexa-files: класть в свою папку" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nexa-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.nexa_storage_used() < 2147483648   -- до 2 ГБ на аккаунт
  );
create policy "nexa-files: удалять свои" on storage.objects for delete to authenticated
  using (bucket_id = 'nexa-files' and (storage.foldername(name))[1] = (select auth.uid()::text));
