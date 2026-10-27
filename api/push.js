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

   «Где устройство?», когда NEXA на телефоне закрыта (supabase/locate-requests.sql):
   - POST { action: "locate", target_device_id, id } (Bearer) — заводим запрос (в базе только sha256
     одноразового ключа, срок 5 минут) и шлём телефону push { type: "locate", id, key, api };
   - POST { action: "locate-reply", id, key, status, lat, lon, acc, at } БЕЗ входа — так отвечает
     сам телефон (ключа входа в Android-части нет): принимаем, только если ключ совпал, запрос
     ещё ждёт и не просрочен; ответ записывается один раз;
   - POST { action: "locate-poll", id } (Bearer) — спросивший забирает ответ; готовый ответ сразу
     удаляется из базы. Координаты в журнал не пишем.
   POST { action: "message", target_device_id, id, text } (Bearer) — сообщение на экран блокировки
   своего телефона («Нашли телефон? Позвоните…»), до MESSAGE_MAX знаков.

   POST { action: "announce", id, title, text, dry? } с заголовком x-nexa-admin: <NEXA_ADMIN_SECRET> — разовое
   объявление («Встречайте NEXA mini-1») на все телефоны с приложением NEXA, где выполнен вход (push_tokens).
   Запускает только автор — скриптом scripts/announce.mjs. Уведомление FCM с блоком notification: Android
   показывает его сам, даже если NEXA закрыта и APK старый; открытой NEXA оно не мешает (там своё объявление,
   src/lib/announce.js). Одно и то же id — не чаще раза в 30 дней. dry: true — только посчитать телефоны.

   Нужны переменные Vercel (только на сервере):
   - FIREBASE_SERVICE_ACCOUNT — JSON ключа сервисного аккаунта Firebase (целиком);
   - SUPABASE_SERVICE_ROLE_KEY и SUPABASE_URL (как у входа по QR).
   Без них отвечает { sent: false, reason: "not_configured" } — приложение пишет об этом честно.
   Ключи и push-адреса в журнал не пишем. */
import { createClient } from '@supabase/supabase-js';
import { createSign, createHash, randomBytes } from 'node:crypto';
import { allow } from './_lib/rate-limit.js';
import { adminGate } from './_lib/admin.js';

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
const LOCATE_PER_MINUTE = 6;  // «Где устройство?» и сообщение на экран через push
const MESSAGE_MAX = 200;
const LOCATE_STATUS = ['ok', 'off', 'denied', 'background', 'error', 'nogps']; // nogps — геолокация на телефоне выключена (2026-10-27)
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const missing = (error) => /does not exist|could not find/i.test(error?.message || '');
// Свой адрес — телефон отвечает именно сюда (только https)
function selfOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `https://${host}` : null;
}

/* Ответ телефона на «Где устройство?» (без входа: проверяем одноразовый ключ из push) */
async function locateReply(req, res, sb) {
  const b = req.body || {};
  if (!isUuid(b.id) || typeof b.key !== 'string' || b.key.length < 20 || b.key.length > 100 || !LOCATE_STATUS.includes(b.status)) return res.status(400).json({ error: 'Неверный запрос' });
  const ip = sha(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'none');
  if (!(await allow([[`loc-reply:${ip}`, 30, 60]]))) return res.status(429).json({ error: 'Слишком часто' });
  const lat = num(b.lat, -90, 90), lon = num(b.lon, -180, 180), acc = num(b.acc, 0, 1000000);
  const ok = b.status === 'ok';
  if (ok && (lat === null || lon === null)) return res.status(400).json({ error: 'Неверный запрос' });
  const at = num(b.at, 0, Date.now() + 60000);
  // Записываем один раз: запрос ещё ждёт, ключ совпал, срок не вышел
  const { data, error } = await sb.from('locate_requests')
    .update({ status: b.status, lat: ok ? lat : null, lon: ok ? lon : null, acc: ok ? (acc ?? 0) : null, at: ok ? Math.round(at || Date.now()) : null })
    .eq('id', b.id).eq('secret_hash', sha(b.key)).eq('status', 'waiting').gt('expires_at', new Date().toISOString())
    .select('id, user_id, device_id');
  if (error) return res.status(200).json({ ok: false });
  // Место пришло — это и есть «последнее известное» этого телефона (supabase/device-places.sql;
  // нет таблицы — просто не сохраняем)
  const row = data?.[0];
  if (ok && row) {
    await sb.from('device_places').upsert({ user_id: row.user_id, device_id: row.device_id, lat, lon, acc: acc ?? 0, at: Math.round(at || Date.now()), updated_at: new Date().toISOString() })
      .then(() => {}, () => {});
  }
  return res.status(200).json({ ok: !!data?.length });
}

/* Телефон получил push «Где устройство?» и сразу отметился — ещё до поиска места (без входа, по ключу).
   Спросивший видит «Телефон получил запрос…»: так понятно, дошёл ли push вообще */
async function locateAck(req, res, sb) {
  const b = req.body || {};
  if (!isUuid(b.id) || typeof b.key !== 'string' || b.key.length < 20 || b.key.length > 100) return res.status(400).json({ error: 'Неверный запрос' });
  const ip = sha(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'none');
  if (!(await allow([[`loc-reply:${ip}`, 30, 60]]))) return res.status(429).json({ error: 'Слишком часто' });
  const { data, error } = await sb.from('locate_requests').update({ received_at: new Date().toISOString() })
    .eq('id', b.id).eq('secret_hash', sha(b.key)).eq('status', 'waiting').is('received_at', null).gt('expires_at', new Date().toISOString())
    .select('id');
  if (error) return res.status(200).json({ ok: false }); // нет колонки received_at — без отметки, как раньше
  return res.status(200).json({ ok: !!data?.length });
}

let testAdmin, testSa; // подмена базы и ключа Firebase в тестах (tests/announce.test.mjs)
export function __setPushTest({ admin, sa } = {}) { testAdmin = admin; testSa = sa; cachedToken = sa ? { value: 'test', until: Date.now() + 3600e3 } : null; }
function admin() {
  if (testAdmin !== undefined) return testAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceAccount() {
  if (testSa !== undefined) return testSa;
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
  if (req.body?.action === 'announce') return announce(req, res, sb, sa);
  if (req.body?.action === 'locate-reply') {
    if (!sb) return res.status(200).json({ ok: false });
    return locateReply(req, res, sb);
  }
  if (req.body?.action === 'locate-ack') {
    if (!sb) return res.status(200).json({ ok: false });
    return locateAck(req, res, sb);
  }
  if (!sb || !sa) return res.status(200).json({ sent: false, reason: 'not_configured' });

  // Кто вошёл
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who, error: authErr } = jwt ? await sb.auth.getUser(jwt) : { data: null, error: true };
  if (authErr || !who?.user) return res.status(401).json({ error: 'Войдите заново' });
  const uid = who.user.id;

  const { action, target_device_id: target, id } = req.body || {};

  // Забрать ответ телефона (свой запрос). Готовый ответ сразу удаляем — координаты не храним
  if (action === 'locate-poll') {
    if (!isUuid(id)) return res.status(400).json({ error: 'Неверный запрос' });
    if (!(await allow([[`loc-poll:${uid}`, 60, 60]]))) return res.status(429).json({ error: 'Слишком часто' });
    let { data: rows, error } = await sb.from('locate_requests').select('status, lat, lon, acc, at, expires_at, received_at').eq('user_id', uid).eq('id', id).limit(1);
    // Таблица без received_at (миграцию 2026-10-27 ещё не запускали) — как раньше
    if (error && missing(error) && /received_at/.test(error.message || '')) ({ data: rows, error } = await sb.from('locate_requests').select('status, lat, lon, acc, at, expires_at').eq('user_id', uid).eq('id', id).limit(1));
    if (error) return res.status(200).json({ status: missing(error) ? 'not_configured' : 'error' });
    const r = rows?.[0];
    if (!r) return res.status(200).json({ status: 'gone' });
    if (r.status === 'waiting') return res.status(200).json({ status: Date.parse(r.expires_at) < Date.now() ? 'gone' : r.received_at ? 'received' : 'waiting' });
    await sb.from('locate_requests').delete().eq('user_id', uid).eq('id', id);
    return res.status(200).json(r.status === 'ok' ? { status: 'ok', lat: r.lat, lon: r.lon, acc: r.acc, at: Number(r.at) } : { status: r.status });
  }

  if (!['find', 'clip', 'locate', 'message'].includes(action) || !isId(target) || !isId(id)) return res.status(400).json({ error: 'Неверный запрос' });
  if (action === 'locate' && !isUuid(id)) return res.status(400).json({ error: 'Неверный запрос' });
  const text = action === 'message' ? String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX) : '';
  if (action === 'message' && !text) return res.status(400).json({ error: 'Пустое сообщение' });
  const limit = action === 'clip' ? [[`push-clip:${uid}`, CLIP_PER_MINUTE, 60]]
    : action === 'locate' || action === 'message' ? [[`push-loc:${uid}`, LOCATE_PER_MINUTE, 60]]
    : [[`push:${uid}`, LIMIT_PER_MINUTE, 60]];
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

  // «Где устройство?»: заводим запрос с одноразовым ключом (в базе — только его хеш)
  let locate = null;
  if (action === 'locate') {
    const api = selfOrigin(req);
    if (!api) return res.status(200).json({ sent: false, reason: 'error' });
    await sb.from('locate_requests').delete().lt('expires_at', new Date().toISOString()); // просроченное — убираем
    const key = randomBytes(24).toString('base64url');
    const { error: insErr } = await sb.from('locate_requests').insert({ id, user_id: uid, device_id: target, secret_hash: sha(key) });
    if (insErr) return res.status(200).json({ sent: false, reason: missing(insErr) ? 'not_configured' : 'error' });
    locate = { type: 'locate', id, key, api, from: fromName };
  }
  const data = clip ? clipData(clip, id, fromName)
    : locate ? locate
    : action === 'message' ? { type: 'message', id, from: fromName, text }
    : { type: 'find', id, from: fromName, target };

  try {
    const access = await googleToken(sa);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        data,
        android: clip
          ? { priority: 'high', ttl: `${Math.max(1, Math.floor((Date.parse(clip.expires_at) - Date.now()) / 1000))}s` }
          : { priority: 'high', ttl: locate ? '240s' : action === 'message' ? '3600s' : '60s' },
      } }),
    });
    if (await staleToken(r)) {
      // Адрес устарел (приложение удалили / переустановили) — забываем его
      await sb.from('push_tokens').delete().eq('user_id', uid).eq('device_id', target);
      return res.status(200).json({ sent: false, reason: 'no_token' });
    }
    if (!r.ok) {
      console.error('FCM error:', r.status, r.fcmCode || '');
      if (locate) await sb.from('locate_requests').delete().eq('user_id', uid).eq('id', id);
      // Наружу — только код ответа Google (например SENDER_ID_MISMATCH: google-services.json в APK
      // от другого проекта Firebase, чем ключ сервера), без адреса телефона и текста ошибки
      return res.status(200).json({ sent: false, reason: 'fcm', code: r.status, fcm: String(r.fcmCode || '').slice(0, 40) });
    }
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('Push error:', e?.name || 'unknown');
    // Не получили ключ доступа Google (ключ сервисного аккаунта испорчен) или Google не ответил
    return res.status(200).json({ sent: false, reason: 'fcm', code: 0, fcm: e?.name === 'TypeError' ? 'NETWORK' : 'AUTH' });
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

/* ── Разовое объявление на все телефоны с NEXA (см. начало файла) ── */
const ANNOUNCE_TITLE_MAX = 80, ANNOUNCE_TEXT_MAX = 300;
async function announce(req, res, sb, sa) {
  // Только автор — по секрету (api/_lib/admin.js; там же счётчик попыток)
  const gate = await adminGate(req, 'announce');
  if (gate) return res.status(gate.code).json({ error: gate.error });
  const { id, dry } = req.body || {};
  const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, ANNOUNCE_TITLE_MAX);
  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, ANNOUNCE_TEXT_MAX);
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id) || !title || !text) return res.status(400).json({ error: 'Неверный запрос' });
  if (!sb || !sa) return res.status(200).json({ sent: 0, reason: 'not_configured' });
  // Все push-адреса (порциями), один адрес — один раз (один телефон мог входить в разные аккаунты)
  const tokens = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('push_tokens').select('token').order('token').range(from, from + 999);
    if (error) return res.status(200).json({ sent: 0, reason: missing(error) ? 'not_configured' : 'error' });
    for (const r of data || []) if (typeof r.token === 'string' && r.token.length >= 10) tokens.add(r.token);
    if (!data || data.length < 1000) break;
  }
  if (dry) return res.status(200).json({ devices: tokens.size, dry: true });
  // Одно объявление — не чаще раза в 30 дней (повторный запуск скрипта не заспамит людей)
  if (!(await allow([[`announce-id:${id}`, 1, 30 * 86400]]))) return res.status(409).json({ error: 'Это объявление уже рассылали' });
  let sent = 0, stale = 0, failed = 0;
  const access = await googleToken(sa);
  const list = [...tokens];
  // По 10 одновременно: и быстро, и не упираемся в ограничения Firebase
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async (token) => {
      try {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: {
            token,
            notification: { title, body: text },
            data: { type: 'announce', id },
            android: { priority: 'normal', ttl: '604800s', notification: { channel_id: 'nexa-updates', icon: 'ic_stat_nexa', tag: `announce-${id}` } },
          } }),
        });
        if (await staleToken(r)) { stale++; await sb.from('push_tokens').delete().eq('token', token); return; }
        if (r.ok) sent++; else { failed++; console.error('FCM announce:', r.status, r.fcmCode || ''); }
      } catch { failed++; }
    }));
  }
  return res.status(200).json({ devices: list.length, sent, stale, failed });
}
