-- NEXA: регистрация только с почтой российских сервисов.
-- Сервер проверяет почту сам, поэтому проверку в приложении нельзя обойти
-- (например, отправив запрос в Supabase напрямую).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Запускать повторно можно: функция и триггер просто пересоздадутся.
--
-- Список тот же, что в src/lib/allowedEmailDomains.js — меняете там, меняйте и здесь.

create or replace function public.nexa_restrict_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- домен почты: всё после @, маленькими буквами, без точки в конце
  domain text := rtrim(lower(split_part(coalesce(new.email, ''), '@', 2)), '.');
begin
  -- Без почты (например, вход по телефону) — не наш случай, пропускаем
  if new.email is null or new.email = '' then
    return new;
  end if;

  -- Разрешённые почтовые сервисы
  if domain in (
    'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'internet.ru',
    'yandex.ru', 'ya.ru', 'yandex.com',
    'rambler.ru', 'lenta.ru', 'autorambler.ru', 'ro.ru'
  ) then
    return new;
  end if;

  -- Любые домены в зонах .ru, .su и .рф (xn--p1ai — это .рф в записи почтовых серверов)
  if domain like '%_.ru' or domain like '%_.su'
     or domain like '%_.рф' or domain like '%_.xn--p1ai' then
    return new;
  end if;

  raise exception 'NEXA: email domain % is not allowed', domain
    using errcode = 'check_violation';
end;
$$;

-- Срабатывает перед созданием каждого нового пользователя
drop trigger if exists nexa_restrict_email_domain on auth.users;
create trigger nexa_restrict_email_domain
  before insert on auth.users
  for each row execute function public.nexa_restrict_email_domain();
