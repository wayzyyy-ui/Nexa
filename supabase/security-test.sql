-- NEXA: проверка защиты данных. Запускать в Supabase → SQL Editor.
--
-- Файл из двух частей. Каждую часть запускайте ОТДЕЛЬНО (выделите её и Run)
-- и присылайте вывод.
--
-- ЧАСТЬ 1 — «два пользователя пытаются залезть друг к другу».
--   Всё происходит внутри одного блока. В конце блок специально завершается
--   «ошибкой» — так Postgres откатывает ВСЁ: тестовые строки, тестовых
--   пользователей, любые изменения. В базе ничего не остаётся.
--   Отчёт — в тексте этой ошибки (строка за строкой: ожидалось / получено / OK).
--   «‼ ПРОБЛЕМА» в строке — значит, защита не сработала.
--
-- ЧАСТЬ 2 — только чтение: какие правила стоят на таблицах, Storage и Realtime.
--   Ничего не меняет.
--
-- Пользователи: берутся два настоящих аккаунта из auth.users (их данные
-- не трогаются — тест работает только со своими тестовыми строками и всё
-- откатывает). Если аккаунтов меньше двух — создаются два временных
-- (тоже откатываются).

-- ═══════════════════════════ ЧАСТЬ 1 ═══════════════════════════════════════
do $$
declare
  A uuid; B uuid;                       -- «я» и «чужой»
  dA uuid := gen_random_uuid();         -- тестовое устройство A
  dB uuid := gen_random_uuid();         -- тестовое устройство B
  cA uuid := gen_random_uuid();         -- тестовый чат A
  cB uuid := gen_random_uuid();         -- тестовый чат B
  n integer;
  r text[] := '{}';                     -- строки отчёта
  -- одна строка отчёта
  ok_line text := '%s  %-62s ожидается: %-24s получено: %-24s %s';
begin
  -- ── Подготовка (от имени администратора) ──
  select id into A from auth.users order by created_at limit 1;
  select id into B from auth.users where id <> A order by created_at limit 1;
  if A is null then
    A := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email) values (A, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nexa-test-a@nexa-test.ru');
  end if;
  if B is null then
    B := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email) values (B, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nexa-test-b@nexa-test.ru');
  end if;

  insert into public.devices (id, user_id, name, type) values (dA, A, 'ТЕСТ A', 'phone'), (dB, B, 'ТЕСТ B', 'phone');
  insert into public.chats (id, user_id, title, messages) values (cA, A, 'ТЕСТ A', '[]'), (cB, B, 'ТЕСТ B', '[]');

  -- ── Входим как A ──
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;

  -- 1–2. Видит ли A чужие строки
  select count(*) into n from public.devices where user_id <> A;
  r := r || format(ok_line, ' 1', 'devices: прочитать чужие устройства', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  select count(*) into n from public.chats where user_id <> A;
  r := r || format(ok_line, ' 2', 'chats: прочитать чужие диалоги', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);

  -- 3–4. Изменить чужое
  update public.devices set name = 'ВЗЛОМ' where id = dB;
  get diagnostics n = row_count;
  r := r || format(ok_line, ' 3', 'devices: изменить чужое устройство', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  update public.chats set title = 'ВЗЛОМ' where id = cB;
  get diagnostics n = row_count;
  r := r || format(ok_line, ' 4', 'chats: изменить чужой диалог', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);

  -- 5–6. Удалить чужое
  delete from public.devices where id = dB;
  get diagnostics n = row_count;
  r := r || format(ok_line, ' 5', 'devices: удалить чужое устройство', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  delete from public.chats where id = cB;
  get diagnostics n = row_count;
  r := r || format(ok_line, ' 6', 'chats: удалить чужой диалог', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);

  -- 7–8. Создать строку «от имени» B
  begin
    insert into public.devices (user_id, name, type) values (B, 'ПОДЛОГ', 'phone');
    r := r || format(ok_line, ' 7', 'devices: добавить устройство с user_id чужого', 'ошибка RLS', 'добавилось', '‼ ПРОБЛЕМА');
  exception when others then
    r := r || format(ok_line, ' 7', 'devices: добавить устройство с user_id чужого', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;
  begin
    insert into public.chats (user_id, title) values (B, 'ПОДЛОГ');
    r := r || format(ok_line, ' 8', 'chats: добавить диалог с user_id чужого', 'ошибка RLS', 'добавилось', '‼ ПРОБЛЕМА');
  exception when others then
    r := r || format(ok_line, ' 8', 'chats: добавить диалог с user_id чужого', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 9. Передать своё устройство чужому (сменить владельца)
  begin
    update public.devices set user_id = B where id = dA;
    get diagnostics n = row_count;
    r := r || format(ok_line, ' 9', 'devices: сменить владельца своего устройства на чужого', 'ошибка RLS', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, ' 9', 'devices: сменить владельца своего устройства на чужого', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 10. Перезаписать чужую строку через upsert (так синхронизация пишет в облако)
  begin
    insert into public.devices (id, name, type) values (dB, 'ВЗЛОМ', 'phone')
      on conflict (id) do update set name = excluded.name;
    get diagnostics n = row_count;
    r := r || format(ok_line, '10', 'devices: upsert с id чужого устройства', 'ошибка RLS', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '10', 'devices: upsert с id чужого устройства', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;
  begin
    insert into public.chats (id, title) values (cB, 'ВЗЛОМ')
      on conflict (id) do update set title = excluded.title;
    get diagnostics n = row_count;
    r := r || format(ok_line, '11', 'chats: upsert с id чужого диалога', 'ошибка RLS', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '11', 'chats: upsert с id чужого диалога', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 12. Своё — можно (проверка, что защита не мешает работать)
  update public.devices set name = 'ТЕСТ A (изменено)' where id = dA;
  get diagnostics n = row_count;
  r := r || format(ok_line, '12', 'devices: изменить СВОЁ устройство', '1 строка', n || ' строк', case when n = 1 then 'OK' else '‼ ПРОБЛЕМА' end);

  -- 13. Служебная таблица входа по QR — браузеру недоступна
  begin
    select count(*) into n from public.qr_logins;
    r := r || format(ok_line, '13', 'qr_logins: прочитать служебную таблицу', 'нет доступа', n || ' строк', case when n = 0 then 'OK (пусто)' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '13', 'qr_logins: прочитать служебную таблицу', 'нет доступа', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 14. Счётчик запросов (security-hardening.sql) — вызвать из браузера нельзя
  begin
    perform public.nexa_rate_hit('test', 1, 60);
    r := r || format(ok_line, '14', 'nexa_rate_hit: вызвать как пользователь', 'нет доступа', 'вызвалась', '‼ ПРОБЛЕМА');
  exception when undefined_function then
    r := r || format(ok_line, '14', 'nexa_rate_hit: вызвать как пользователь', 'нет доступа', 'функции нет', 'не применён security-hardening.sql');
  when others then
    r := r || format(ok_line, '14', 'nexa_rate_hit: вызвать как пользователь', 'нет доступа', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 15. Ограничение размера (security-hardening.sql): диалог больше 1 МБ
  begin
    insert into public.chats (title, messages)
      -- ~5 МБ случайного текста (случайный — чтобы база не сжала его до малого размера)
      values ('БОЛЬШОЙ', (select jsonb_agg(jsonb_build_object('role', 'user', 'text',
        (select string_agg(md5(random()::text || g || i), '') from generate_series(1, 40) i))) from generate_series(1, 4000) g));
    if exists (select 1 from pg_constraint where conname = 'chats_messages_size') then
      r := r || format(ok_line, '15', 'chats: записать диалог больше 1 МБ', 'ошибка check', 'записалось', '‼ ПРОБЛЕМА');
    else
      r := r || format(ok_line, '15', 'chats: записать диалог больше 1 МБ', 'ошибка check', 'записалось', 'не применён security-hardening.sql');
    end if;
  exception when others then
    r := r || format(ok_line, '15', 'chats: записать диалог больше 1 МБ', 'ошибка check', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 16. Таблица files (файлы пока не синхронизируются — её может не быть)
  if to_regclass('public.files') is null then
    r := r || format(ok_line, '16', 'files: таблица', 'нет / только свои', 'таблицы нет', 'OK (проверять нечего)');
  else
    begin
      execute 'select count(*) from public.files where user_id <> $1' into n using A;
      r := r || format(ok_line, '16', 'files: прочитать чужие файлы', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
    exception when others then
      r := r || format(ok_line, '16', 'files: прочитать чужие файлы', '0 строк', 'ошибка ' || sqlstate, 'OK');
    end;
  end if;

  -- 17. Storage: видит ли A чужие файлы в хранилище
  begin
    select count(*) into n from storage.objects o
      where coalesce(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner', '') <> A::text;
    r := r || format(ok_line, '17', 'storage.objects: чужие объекты', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '17', 'storage.objects: чужие объекты', '0 строк', 'ошибка ' || sqlstate, 'OK (нет доступа)');
  end;

  -- 18–19. Realtime: писать в канал чужого (nexa:<B>) и в свой (nexa:<A>)
  perform set_config('realtime.topic', 'nexa:' || B, true);
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
      values ('nexa:' || B, 'broadcast', 'text.send', '{"text":"подлог"}', true);
    r := r || format(ok_line, '18', 'realtime: отправить в канал чужого', 'ошибка RLS', 'отправилось', '‼ ПРОБЛЕМА');
  exception when others then
    r := r || format(ok_line, '18', 'realtime: отправить в канал чужого', 'ошибка RLS', 'ошибка ' || sqlstate, 'OK');
  end;
  perform set_config('realtime.topic', 'nexa:' || A, true);
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
      values ('nexa:' || A, 'broadcast', 'text.send', '{"text":"своё"}', true);
    r := r || format(ok_line, '19', 'realtime: отправить в СВОЙ канал', 'можно', 'отправилось', 'OK');
  exception when others then
    -- 42501 — нет правила (не вставлен realtime-policies.sql); 23514 — у Realtime ещё нет раздела на сегодня (это не про защиту)
    r := r || format(ok_line, '19', 'realtime: отправить в СВОЙ канал', 'можно', 'ошибка ' || sqlstate, case when sqlstate = '42501' then '‼ проверьте realtime-policies.sql' else 'не про защиту (см. код)' end);
  end;

  -- 20. Realtime: читать канал чужого (подкладываем сообщение B от имени администратора)
  reset role;
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
      values ('nexa:' || B, 'broadcast', 'text.send', '{"text":"секрет B"}', true);
  exception when others then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  perform set_config('realtime.topic', 'nexa:' || B, true);
  begin
    select count(*) into n from realtime.messages where topic = 'nexa:' || B;
    r := r || format(ok_line, '20', 'realtime: прочитать канал чужого', '0 строк', n || ' строк', case when n = 0 then 'OK' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '20', 'realtime: прочитать канал чужого', '0 строк', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 21. Без входа (anon) — к таблицам доступа нет
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    select count(*) into n from public.devices;
    r := r || format(ok_line, '21', 'anon: прочитать devices без входа', 'нет доступа', n || ' строк', case when n = 0 then 'OK (пусто)' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '21', 'anon: прочитать devices без входа', 'нет доступа', 'ошибка ' || sqlstate, 'OK');
  end;
  begin
    select count(*) into n from public.chats;
    r := r || format(ok_line, '22', 'anon: прочитать chats без входа', 'нет доступа', n || ' строк', case when n = 0 then 'OK (пусто)' else '‼ ПРОБЛЕМА' end);
  exception when others then
    r := r || format(ok_line, '22', 'anon: прочитать chats без входа', 'нет доступа', 'ошибка ' || sqlstate, 'OK');
  end;

  -- 23. Итог: строки B не изменились (смотрим глазами администратора)
  reset role;
  select count(*) into n from public.devices where id = dB and name = 'ТЕСТ B' and user_id = B;
  r := r || format(ok_line, '23', 'итог: устройство B осталось как было', '1 строка', n || ' строк', case when n = 1 then 'OK' else '‼ ПРОБЛЕМА' end);
  select count(*) into n from public.chats where id = cB and title = 'ТЕСТ B' and user_id = B;
  r := r || format(ok_line, '24', 'итог: диалог B остался как был', '1 строка', n || ' строк', case when n = 1 then 'OK' else '‼ ПРОБЛЕМА' end);

  -- Конец: «ошибка» с отчётом — Postgres откатывает всё, что сделал тест
  raise exception E'\n\nОТЧЁТ NEXA (всё откачено, база не изменилась)\n%\n', array_to_string(r, E'\n');
end;
$$;


-- ═══════════════════════════ ЧАСТЬ 2 (только чтение) ═══════════════════════
-- Выделите отсюда и до конца файла → Run. Ожидаемое — в колонке «ожидается».
select * from (
  -- RLS включена на всех таблицах с данными пользователей
  select 'RLS: ' || c.relname as проверка,
         case when c.relrowsecurity then 'включена' else 'ВЫКЛЮЧЕНА' end as получено,
         'включена' as ожидается
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('devices', 'chats', 'qr_logins', 'api_rate_limits', 'files')

  union all
  -- Сколько правил RLS на каждой таблице
  select 'правил RLS: ' || tablename, count(*)::text,
         case tablename when 'devices' then '4' when 'chats' then '4' else '0 (только сервер)' end
  from pg_policies where schemaname = 'public'
    and tablename in ('devices', 'chats', 'qr_logins', 'api_rate_limits', 'files')
  group by tablename

  union all
  -- Права гостя (anon) на таблицы
  select 'права anon: ' || table_name, string_agg(privilege_type, ', '), 'нет строк — значит, прав нет'
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
    and table_name in ('devices', 'chats', 'qr_logins', 'api_rate_limits')
  group by table_name

  union all
  -- Realtime: правила на канал nexa:<id>
  select 'realtime: ' || policyname, cmd || ' для ' || array_to_string(roles, ','), 'select и insert для authenticated'
  from pg_policies where schemaname = 'realtime' and tablename = 'messages'

  union all
  -- Storage: публичные корзины (NEXA ими не пользуется)
  select 'storage: корзина ' || name, case when public then 'ПУБЛИЧНАЯ' else 'закрытая' end, 'корзин нет или все закрытые'
  from storage.buckets

  union all
  -- Storage: правила на файлы
  select 'storage: правило ' || policyname, cmd || ' для ' || array_to_string(roles, ','), 'нет правил или только «свои файлы»'
  from pg_policies where schemaname = 'storage' and tablename = 'objects'

  union all
  -- Кто может вызвать счётчик запросов
  select 'nexa_rate_hit: вызов для ' || r.rolname,
         case when has_function_privilege(r.rolname, 'public.nexa_rate_hit(text, integer, integer)', 'execute') then 'МОЖЕТ' else 'не может' end,
         case r.rolname when 'service_role' then 'может' else 'не может' end
  from pg_roles r
  where r.rolname in ('anon', 'authenticated', 'service_role')
    and to_regprocedure('public.nexa_rate_hit(text, integer, integer)') is not null

  union all
  -- Триггеры проверки почты (регистрация и смена почты)
  select 'триггер почты: ' || tgname, 'есть', 'nexa_restrict_email_domain и …_update'
  from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'nexa_restrict_email_domain%'
) t
order by 1;
