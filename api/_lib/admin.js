/* Служебные действия автора (рассылка объявления, выгрузка непонятых фраз NEXA Mini) — только по секрету.
   Секрет — переменная Vercel NEXA_ADMIN_SECRET (не короче 24 знаков; нет или короче — такие действия выключены),
   у автора — только в переменной окружения при запуске скрипта, в код и git не вписывается. Приходит в заголовке
   x-nexa-admin. Сравниваем по отпечаткам одинаковой длины — время сравнения не подсказывает, сколько символов совпало.
   Перебор: не больше 10 попыток в час с адреса (и верных, и неверных) — общий счётчик для всех служебных действий. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { allow, clientKey } from './rate-limit.js';

export function adminOk(req) {
  const want = String(process.env.NEXA_ADMIN_SECRET || '');
  const got = String(req.headers['x-nexa-admin'] || '');
  if (want.length < 24 || !got) return false;
  return timingSafeEqual(createHash('sha256').update(want).digest(), createHash('sha256').update(got).digest());
}

// Ответ: null — можно продолжать; иначе { code, error } — что ответить
export async function adminGate(req, scope) {
  if (!(await allow([[`admin-try:${scope}:${clientKey(req)}`, 10, 3600]]))) return { code: 429, error: 'Слишком часто' };
  if (!adminOk(req)) return { code: 403, error: 'Нет доступа' };
  return null;
}
