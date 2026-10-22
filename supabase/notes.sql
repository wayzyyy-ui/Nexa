-- NEXA · Заметки (раздел «Сегодня» → «Заметки»).
-- Вставить целиком в Supabase → SQL Editor → Run (один раз; повторный запуск безопасен).
-- Без этой таблицы заметки вошедшего живут только на этом устройстве (как у гостя) —
-- приложение так и пишет: «облако для заметок ещё не настроено».

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  text text not null default '' check (char_length(text) <= 100000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id);

-- Теги и архив (NEXA 0.14.3). Уже созданной таблице повторный запуск файла добавит колонки.
-- Пока их нет, приложение шлёт строки без них — теги и архив живут только на устройстве.
alter table public.notes add column if not exists tags text[] not null default '{}';
alter table public.notes add column if not exists archived boolean not null default false;
-- До 10 тегов, каждый до 30 знаков (как в приложении: NOTE_TAGS_MAX, NOTE_TAG_LEN)
create or replace function public.nexa_note_tags_ok(t text[]) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(t), 0) <= 10 and not exists (select 1 from unnest(t) x where x is null or char_length(x) not between 1 and 30);
$$;
alter table public.notes drop constraint if exists notes_tags_check;
alter table public.notes add constraint notes_tags_check check (public.nexa_note_tags_ok(tags));

-- updated_at ставит база (по нему синхронизация понимает, где новее)
create or replace function public.nexa_notes_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes for each row execute function public.nexa_notes_touch();

-- Не больше 1000 заметок на аккаунт. Как остальные лимиты (supabase/limits-fix.sql):
-- чужая строка — дальше (её отклонит RLS), обновление существующей (upsert) лимит не трогает,
-- одновременные добавления одного аккаунта — по очереди
create or replace function public.nexa_notes_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexa:notes:' || new.user_id::text, 0));
  if exists (select 1 from public.notes where id = new.id and user_id = new.user_id) then
    return new;
  end if;
  if (select count(*) from public.notes where user_id = new.user_id) >= 1000 then
    raise exception 'notes_limit' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.nexa_notes_limit() from public, anon, authenticated;
drop trigger if exists notes_limit on public.notes;
create trigger notes_limit before insert on public.notes for each row execute function public.nexa_notes_limit();

-- Только свои строки и только для вошедших; anon — без доступа
alter table public.notes enable row level security;
drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_select on public.notes for select to authenticated using (auth.uid() = user_id);
create policy notes_insert on public.notes for insert to authenticated with check (auth.uid() = user_id);
create policy notes_update on public.notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notes_delete on public.notes for delete to authenticated using (auth.uid() = user_id);
revoke all on public.notes from anon;
grant select, insert, update, delete on public.notes to authenticated;

-- «Удалить мои данные» в приложении стирает и заметки (deleteAllMine в src/lib/sync.js)
