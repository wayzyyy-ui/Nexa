/* Вход по QR (как в Телеграме) — серверная функция Vercel.

   1) start   — новое устройство (без входа) просит код. Получает { id, code, secret }:
                code показывает на экране и в QR, secret держит у себя.
   2) peek    — вошедшее устройство ввело / отсканировало код: что за устройство просит вход.
   3) approve — вошедшее устройство разрешает. Сервер делает одноразовый пропуск для входа
                (magic link без письма) и кладёт его к коду.
   4) poll    — новое устройство спрашивает «разрешили?». Если да — получает пропуск
                один раз и входит им сам (supabase.auth.verifyOtp).

   Нужны переменные окружения в Vercel:
   SUPABASE_SERVICE_ROLE_KEY — секретный ключ (только здесь, на сервере);
   SUPABASE_URL (или VITE_SUPABASE_URL) — адрес проекта.
   Таблица — supabase/qr-login.sql. Коды, секреты и пропуски никогда не пишем в журнал. */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { allow, clientKey } from './_lib/rate-limit.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без 0, O, 1, I, L — как у подключения
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const TTL_MS = 2 * 60 * 1000; // код живёт 2 минуты

// Те же адреса приложения, что и у api/chat.js
const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
const sameHash = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const cleanLabel = (v) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} .,·()-]/gu, '').slice(0, 40) : '') || 'Новое устройство';

function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Кто вошёл: проверяем ключ входа из заголовка Authorization
async function userFrom(req, sb) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

// Действующий (ждёт подтверждения и не истёк) запрос по коду
async function pendingByCode(sb, code) {
  const { data } = await sb.from('qr_logins').select('id, device_label, expires_at')
    .eq('code', code).eq('status', 'pending').gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const sb = admin();
  if (!sb) return res.status(503).json({ error: 'Вход по QR пока не настроен' });
  const body = req.body || {};
  const action = body.action;

  const who = clientKey(req);
  try {
    if (action === 'start') {
      // Новые коды: не больше 10 за 10 минут с одного адреса (иначе таблицу можно забить)
      if (!(await allow([[`qr:start:${who}`, 10, 600]]))) return res.status(429).json({ error: 'Слишком часто — подождите пару минут' });
      // Заодно убираем старые запросы (старше часа)
      await sb.from('qr_logins').delete().lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
      let code = makeCode();
      for (let i = 0; i < 5 && (await pendingByCode(sb, code)); i++) code = makeCode();
      const secret = randomBytes(32).toString('hex');
      const expires_at = new Date(Date.now() + TTL_MS).toISOString();
      const { data, error } = await sb.from('qr_logins')
        .insert({ code, secret_hash: sha256(secret), device_label: cleanLabel(body.label), expires_at })
        .select('id').single();
      if (error) throw error;
      return res.status(200).json({ id: data.id, code, secret, expires_at });
    }

    if (action === 'poll') {
      if (typeof body.id !== 'string' || typeof body.secret !== 'string' || body.secret.length > 128) return res.status(400).json({ error: 'bad request' });
      // Новое устройство спрашивает раз в 2 с — 90 в минуту с запасом
      if (!(await allow([[`qr:poll:${who}`, 90, 60]]))) return res.status(429).json({ status: 'slow_down' });
      const { data: row } = await sb.from('qr_logins').select('id, secret_hash, status, token_hash, expires_at').eq('id', body.id).maybeSingle();
      if (!row || !sameHash(row.secret_hash, sha256(body.secret))) return res.status(404).json({ status: 'not_found' });
      if (row.status === 'approved' && row.token_hash) {
        // Пропуск отдаём один раз: сразу помечаем «использован»
        const { data: taken } = await sb.from('qr_logins').update({ status: 'used', token_hash: null })
          .eq('id', row.id).eq('status', 'approved').select('id');
        if (!taken?.length) return res.status(200).json({ status: 'used' });
        return res.status(200).json({ status: 'approved', token_hash: row.token_hash });
      }
      if (row.status === 'pending' && new Date(row.expires_at) < new Date()) return res.status(200).json({ status: 'expired' });
      return res.status(200).json({ status: row.status });
    }

    if (action === 'peek' || action === 'approve') {
      const user = await userFrom(req, sb);
      if (!user?.email) return res.status(401).json({ error: 'Войдите, чтобы подтвердить вход' });
      // Перебор кодов: не больше 10 проверок в минуту и 40 в час на аккаунт
      // (раньше ограничение было только в браузере — его легко обойти)
      if (!(await allow([[`qr:peek:${user.id}`, 10, 60], [`qr:peek:h:${user.id}`, 40, 3600]]))) {
        return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту' });
      }
      const code = String(body.code || '').toUpperCase();
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Код — это 6 букв и цифр' });
      const row = await pendingByCode(sb, code);
      if (!row) return res.status(404).json({ error: 'Код не найден или уже истёк' });
      if (action === 'peek') return res.status(200).json({ device_label: row.device_label });

      // Одноразовый пропуск для входа в этот аккаунт — без отправки письма
      const { data: link, error: linkError } = await sb.auth.admin.generateLink({ type: 'magiclink', email: user.email });
      if (linkError || !link?.properties?.hashed_token) throw linkError || new Error('no token');
      const { data: done } = await sb.from('qr_logins')
        .update({ status: 'approved', token_hash: link.properties.hashed_token, approved_by: user.id })
        .eq('id', row.id).eq('status', 'pending').select('id');
      if (!done?.length) return res.status(409).json({ error: 'Код уже использован' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    // В журнал — только тип ошибки, без кодов и пропусков
    console.error('qr-login error:', error?.code || error?.name || 'unknown');
    return res.status(500).json({ error: 'Не получилось — попробуйте ещё раз' });
  }
}
