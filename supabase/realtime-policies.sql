-- NEXA: доступ к закрытому каналу связи устройств (Supabase Realtime).
-- У каждого аккаунта свой канал «nexa:<id пользователя>». Читать и писать
-- в него (сообщения и статус «онлайн») может только сам владелец, гостям — нельзя.
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно: правила пересоздаются.

-- Слушать свой канал: получать сообщения (broadcast) и видеть, кто онлайн (presence)
drop policy if exists "nexa: читать свой канал" on realtime.messages;
create policy "nexa: читать свой канал"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'nexa:' || (select auth.uid())::text
    and realtime.messages.extension in ('broadcast', 'presence')
  );

-- Писать в свой канал: отправлять сообщения и сообщать «я онлайн»
drop policy if exists "nexa: писать в свой канал" on realtime.messages;
create policy "nexa: писать в свой канал"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (select realtime.topic()) = 'nexa:' || (select auth.uid())::text
    and realtime.messages.extension in ('broadcast', 'presence')
  );
