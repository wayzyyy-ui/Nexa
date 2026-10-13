/* Push-уведомления для «Найти устройство», когда приложение NEXA на телефоне закрыто.

   POST /api/push { action: "find", target_device_id, id } с заголовком
   Authorization: Bearer <ключ входа>. Сервер:
   - проверяет, кто вошёл (Supabase);
   - берёт push-адрес (FCM token) ТОЛЬКО устройства этого же аккаунта
     из таблицы push_tokens (supabase/push-tokens.sql);
   - отправляет через Firebase Cloud Messaging data-сообщение { type: "find" }.
   Телефон сам решает, что показать (NexaMessagingService.java): если NEXA открыта —
   ничего (сигнал уже пришёл по каналу связи), иначе — уведомление, которое звонит.

   Нужны переменные Vercel (только на сервере):
   - FIREBASE_SERVICE_ACCOUNT — JSON ключа сервисного аккаунта Firebase (целиком);
   - SUPABASE_SERVICE_ROLE_KEY и SUPABASE_URL (как у входа по QR).
   Без них отвечает { sent: false, reason: "not_configured" } — приложение пишет об этом честно.
   Ключи и push-адреса в журнал не пишем. */
import { createClient } from '@supabase/supabase-js';
import { createSign } from 'node:crypto';
import { allow } from './_lib/rate-limit.js';

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

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[\w-]+$/.test(v);
const LIMIT_PER_MINUTE = 10; // «Найти» не чаще 10 раз в минуту на аккаунт

function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceAccount() {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '');
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch { return null; }
}

/* Ключ доступа Google для FCM: подписываем JWT ключом сервисного аккаунта
   и меняем его на access_token (живёт час — держим в памяти функции) */
let cachedToken = null;
async function googleToken(sa) {
  if (cachedToken && cachedToken.until > Date.now() + 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sign = createSign('RSA-SHA256'); sign.update(`${head}.${body}`);
  const jwt = `${head}.${body}.${sign.sign(sa.private_key).toString('base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}`);
  const j = await r.json();
  cachedToken = { value: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sb = admin(), sa = serviceAccount();
  if (!sb || !sa) return res.status(200).json({ sent: false, reason: 'not_configured' });

  // Кто вошёл
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who, error: authErr } = jwt ? await sb.auth.getUser(jwt) : { data: null, error: true };
  if (authErr || !who?.user) return res.status(401).json({ error: 'Войдите заново' });
  const uid = who.user.id;

  const { action, target_device_id: target, id } = req.body || {};
  if (action !== 'find' || !isId(target) || !isId(id)) return res.status(400).json({ error: 'Неверный запрос' });
  if (!(await allow([[`push:${uid}`, LIMIT_PER_MINUTE, 60]]))) return res.status(429).json({ error: 'Слишком часто — подождите минуту' });

  // Push-адрес только своего устройства (user_id = вошедший)
  const { data: rows, error } = await sb.from('push_tokens').select('token').eq('user_id', uid).eq('device_id', target).limit(1);
  if (error) return res.status(200).json({ sent: false, reason: /does not exist|could not find/i.test(error.message || '') ? 'not_configured' : 'error' });
  const token = rows?.[0]?.token;
  if (!token) return res.status(200).json({ sent: false, reason: 'no_token' });

  // Имя того, кто ищет, — из его же устройства в аккаунте (не из запроса)
  const fromDevice = String(req.body?.from_device || '');
  let fromName = 'Ваше устройство';
  if (isId(fromDevice)) {
    const { data: devs } = await sb.from('devices').select('name, state').eq('user_id', uid);
    const me = (devs || []).find((d) => d.state?.device_id === fromDevice);
    if (me?.name) fromName = String(me.name).slice(0, 40);
  }

  try {
    const access = await googleToken(sa);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        data: { type: 'find', id, from: fromName, target },
        android: { priority: 'high', ttl: '60s' },
      } }),
    });
    if (r.status === 404 || r.status === 400) {
      // Адрес устарел (приложение удалили / переустановили) — забываем его
      await sb.from('push_tokens').delete().eq('user_id', uid).eq('device_id', target);
      return res.status(200).json({ sent: false, reason: 'no_token' });
    }
    if (!r.ok) { console.error('FCM error:', r.status); return res.status(200).json({ sent: false, reason: 'error' }); }
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('Push error:', e?.name || 'unknown');
    return res.status(200).json({ sent: false, reason: 'error' });
  }
}
