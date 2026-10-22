-- ─────────────────────────────────────────────────────────────────────────────
-- NEXA: новые сообщения диалога — в облако без всего диалога.
--
-- Как запустить: Supabase → SQL Editor → вставить файл целиком → Run.
-- Можно запускать повторно (create or replace).
--
-- Зачем: раньше каждое новое сообщение отправляло в облако весь диалог целиком
-- (вместе со всеми прежними сообщениями — до 1 МБ). Теперь приложение, если диалог
-- просто дописали в конец, зовёт эту функцию и передаёт только новые сообщения.
--
-- Как устроено:
--   • дописывает p_messages в конец messages и при необходимости меняет название;
--   • только своя строка (user_id = auth.uid(); функция работает с правами вызывающего —
--     действуют и правила RLS chats, и ограничения размера из security-hardening.sql);
--   • только если строку с тех пор никто не менял: время её изменения (с точностью
--     до миллисекунд) должно совпасть с p_expected. Иначе — null, и приложение
--     отправит диалог целиком обычным способом (там же решаются конфликты);
--   • за раз — от 1 до 50 сообщений.
--
-- До запуска этого файла приложение работает как раньше: диалог уходит целиком.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.nexa_chat_append(p_id uuid, p_expected timestamptz, p_messages jsonb, p_title text)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array'
     or jsonb_array_length(p_messages) = 0 or jsonb_array_length(p_messages) > 50 then
    raise exception 'nexa_chat_append: нужен список из 1–50 сообщений' using errcode = '22023';
  end if;
  update public.chats
     set messages = coalesce(messages, '[]'::jsonb) || p_messages,
         title = coalesce(p_title, title)
   where id = p_id
     and user_id = (select auth.uid())
     and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', p_expected)
  returning updated_at into v_at;
  return v_at; -- null: строки нет или её уже изменили
end;
$$;

revoke all on function public.nexa_chat_append(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.nexa_chat_append(uuid, timestamptz, jsonb, text) to authenticated;
