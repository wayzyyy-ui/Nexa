/* Push-уведомления для «Найти устройство», когда приложение NEXA на телефоне закрыто.

   POST /api/push { action: "find", target_device_id, id } с заголовком
   Authorization: Bearer <ключ входа>. Сервер:
   - проверяет, кто вошёл (Supabase);
   - берёт push-адрес (FCM token) ТОЛЬКО устройства этого же аккаунта
     из таблицы push_tokens (supabase/push-tokens.sql);
   - отправляет через Firebase Cloud Messaging data-сообщение { type: "find" }.
   Телефон сам решает, что показать (NexaMessagingService.java): если NEXA открыта —
   ничего (сигнал уже пришёл по каналу связи), иначе — уведомление, которое звонит.

   POST /api/push { action: "clip", target_device_id, id } — общий буфер обмена: на телефоне,
   где NEXA закрыта, — уведомление «Скопировано на …» с кнопкой «Скопировать». Текст сервер
   берёт сам из таблицы clipboard (supabase/clipboard.sql) по номеру записи — только этого
   аккаунта и только не просроченной; из запроса текст не принимаем. В push кладём не больше
   CLIP_PUSH_MAX знаков (data-сообщение FCM — до 4 КБ); длиннее — начало и «откройте NEXA».
   Срок жизни push = оставшийся срок записи. Текст в журнал не пишем.

   Нужны переменные Vercel (только на сервере):
   - FIREBASE_SERVICE_ACCOUNT — JSON ключа сервисного аккаунта Firebase (целиком);
   - SUPABASE_SERVICE_ROLE_KEY и SUPABASE_URL (как у входа по QR).
   Без них отвечает { sent: false, reason: "not_configured" } — приложение пишет об этом честно.
   Ключи и push-адреса в журнал не пишем. */
import { createClient } from '@supabase/supabase-js';
import { createSign } from 'node:crypto';
import { allow } from './_lib/rate-limit.js';

// Android (Capacitor) и приложение для ПК (Tauri: в Windows — http://tauri.localhost, в macOS/Linux — tauri://localhost)
const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
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

// Push буфера: значения data в FCM — только строки
const CLIP_PER_MINUTE = 30;
const CLIP_PUSH_MAX = 1500;
function clipData(clip, id, from) {
  const long = clip.text.length > CLIP_PUSH_MAX;
  return { type: 'clip', id, from, text: long ? clip.text.slice(0, 300) : clip.text, long: long ? '1' : '0', exp: String(Date.parse(clip.expires_at)) };
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
  if (!['find', 'clip'].includes(action) || !isId(target) || !isId(id)) return res.status(400).json({ error: 'Неверный запрос' });
  const limit = action === 'clip' ? [[`push-clip:${uid}`, CLIP_PER_MINUTE, 60]] : [[`push:${uid}`, LIMIT_PER_MINUTE, 60]];
  if (!(await allow(limit))) return res.status(429).json({ error: 'Слишком часто — подождите минуту' });

  // Буфер обмена: текст — из своей же записи, не из запроса
  let clip = null;
  if (action === 'clip') {
    const { data: rows, error } = await sb.from('clipboard').select('text, expires_at, enc')
      .eq('user_id', uid).eq('id', id).gt('expires_at', new Date().toISOString()).limit(1);
    if (error) return res.status(200).json({ sent: false, reason: /does not exist|could not find/i.test(error.message || '') ? 'not_configured' : 'error' });
    clip = rows?.[0];
    if (!clip || clip.enc) return res.status(200).json({ sent: false, reason: 'no_clip' });
  }

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
        data: clip ? clipData(clip, id, fromName) : { type: 'find', id, from: fromName, target },
        android: clip
          ? { priority: 'high', ttl: `${Math.max(1, Math.floor((Date.parse(clip.expires_at) - Date.now()) / 1000))}s` }
          : { priority: 'high', ttl: '60s' },
      } }),
    });
    if (await staleToken(r)) {
      // Адрес устарел (приложение удалили / переустановили) — забываем его
      await sb.from('push_tokens').delete().eq('user_id', uid).eq('device_id', target);
      return res.status(200).json({ sent: false, reason: 'no_token' });
    }
    if (!r.ok) { console.error('FCM error:', r.status, r.fcmCode || ''); return res.status(200).json({ sent: false, reason: 'error' }); }
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('Push error:', e?.name || 'unknown');
    return res.status(200).json({ sent: false, reason: 'error' });
  }
}

/* Ответ FCM значит «такого адреса больше нет»? Только тогда адрес удаляем.
   404 / UNREGISTERED — приложение удалили или переустановили; 400 с замечанием к message.token —
   адрес испорчен. Остальные 400 (INVALID_ARGUMENT про само сообщение) — наша ошибка,
   адрес телефона при этом рабочий: удалив его, мы отвязали бы телефон от «Найти» и буфера */
async function staleToken(r) {
  if (r.ok) return false;
  let err = null;
  try { err = (await r.json())?.error; } catch {}
  const details = Array.isArray(err?.details) ? err.details : [];
  const code = details.map((d) => d?.errorCode).find(Boolean) || '';
  r.fcmCode = code; // в журнал — только код
  if (r.status === 404 || code === 'UNREGISTERED') return true;
  if (r.status !== 400) return false;
  return details.some((d) => (d?.fieldViolations || []).some((v) => String(v?.field || '') === 'message.token'));
}
