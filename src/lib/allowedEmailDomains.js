/* С какой почтой можно войти в NEXA — только российские почтовые сервисы.
   Список в одном месте: его же повторяет серверная проверка
   supabase/restrict-email-domains.sql — меняете здесь, меняйте и там. */

// Почтовые сервисы, которые разрешены явно
export const ALLOWED_EMAIL_DOMAINS = [
  "mail.ru", "inbox.ru", "list.ru", "bk.ru", "internet.ru",
  "yandex.ru", "ya.ru", "yandex.com",
  "rambler.ru", "lenta.ru", "autorambler.ru", "ro.ru",
];

// Плюс любые домены в российских зонах: корпоративная и вузовская почта
// (например kpfu.ru). «xn--p1ai» — это .рф, как его видят почтовые серверы
export const ALLOWED_EMAIL_ZONES = [".ru", ".su", ".рф", ".xn--p1ai"];

export const DOMAIN_NOT_ALLOWED_MESSAGE =
  "Вход доступен только с почтой российского сервиса, например Яндекс или Mail.ru.";

// Похоже ли на адрес почты: что-то@домен.зона, без пробелов
export const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());

// Разрешён ли домен почты
export function isAllowedEmail(email) {
  const domain = String(email).trim().toLowerCase().split("@").pop().replace(/\.$/, "");
  if (!domain || !domain.includes(".")) return false;
  if (ALLOWED_EMAIL_DOMAINS.includes(domain)) return true;
  return ALLOWED_EMAIL_ZONES.some((zone) => domain.endsWith(zone));
}
