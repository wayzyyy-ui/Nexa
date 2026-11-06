/* Google Календарь — серверная функция Vercel. Только чтение: дела из основного календаря
   показываются в расписании NEXA, менять их отсюда нельзя.

   1) POST start (Bearer) { client } → { url } — страница согласия Google. state одноразовый,
      в базе только его хэш, срок 10 минут.
   2) GET ?code&state — Google вернул человека. Код меняем на ключи здесь (client_secret только
      на сервере), длинный ключ (refresh token) храним зашифрованным, ключ шифрования —
      переменная окружения, в базе его нет.
   3) POST events (Bearer) { tz } → { connected, items } — дела на 31 день вперёд. Текст дел
      на сервере не хранится: прочитали у Google и сразу отдали устройству.
   4) POST disconnect (Bearer) — отозвать доступ у Google и стереть ключ.

   Переменные Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY (от 24 знаков),
   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL. Таблицы — supabase/google-calendar.sql.
   Redirect URI в Google Cloud: https://nexa-link.ru/api/calendar-google (и другие адреса сайта). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { allow, clientKey } from './_lib/rate-limit.js';
import { admin, applyCors, userFrom, sha256, randomToken, HEX64, clientKind, FAIL_TEXT } from './_lib/extauth.js';
import { siteBase, resultPage } from './auth-yandex.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const STATE_TTL_MS = 10 * 60 * 1000;
const DAYS = 31;          // на сколько дней вперёд читаем
const MAX_EVENTS = 250;   // столько Google отдаёт за один запрос по умолчанию
const TZ_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const KEY_MIN = 24;

let fetchImpl = (...a) => fetch(...a);
export const __setFetchTest = (f) => { fetchImpl = f; };

export const redirectUri = (host) => `${siteBase(host)}/api/calendar-google`;

export function authorizeUrl({ clientId, state, host }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri(host), scope: SCOPE, state,
    access_type: 'offline', prompt: 'consent', // иначе при повторном подключении Google не даст длинный ключ
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// Шифрование длинного ключа Google: AES-256-GCM, у каждой записи свой случайный вектор
const cipherKey = () => createHash('sha256').update(String(process.env.GOOGLE_TOKEN_KEY)).digest();
export function sealToken(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function openToken(sealed) {
  const [v, iv, tag, data] = String(sealed).split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; } // сменили ключ шифрования или запись повреждена
}

const nextDay = (key) => new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/* Ответ Google → дела NEXA. Время уже в поясе человека (параметр timeZone запроса).
   Дело на весь день — allDay, на несколько дней — отдельная запись на каждый день */
export function parseEvents(items) {
  const out = [];
  for (const ev of Array.isArray(items) ? items : []) {
    if (!ev || typeof ev.id !== 'string' || ev.status === 'cancelled') continue;
    if (ev.attendees?.find?.((a) => a?.self)?.responseStatus === 'declined') continue;
    const base = { title: clip(ev.summary, 200) || 'Занято', place: clip(ev.location, 200) };
    const at = ev.start?.dateTime;
    if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) {
      const date = at.slice(0, 10);
      out.push({ id: `gcal:${ev.id}:${date}`, date, time: at.slice(11, 16), ...base });
      continue;
    }
    const from = ev.start?.date, to = ev.end?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from))) continue;
    let day = from;
    for (let i = 0; i < DAYS && (i === 0 || day < to); i++, day = nextDay(day)) {
      out.push({ id: `gcal:${ev.id}:${day}`, date: day, time: '00:00', allDay: true, ...base });
    }
  }
  return out;
}

const tokenRequest = (fields) => fetchImpl('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...fields }).toString(),
  signal: AbortSignal.timeout(8000),
});

// Код из адреса → длинный ключ. fail: denied (не дали доступ к календарю) | expired | upstream
async function exchangeCode(code, host) {
  const r = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(host) });
  const tok = await r.json().catch(() => ({}));
  if (!r.ok) return { fail: r.status === 400 ? 'expired' : 'upstream' };
  // Человек мог снять галочку на странице согласия
  if (!String(tok.scope || '').split(' ').includes(SCOPE) || typeof tok.refresh_token !== 'string') return { fail: 'denied' };
  return { refresh: tok.refresh_token };
}

// Google больше не принимает ключ: человек отозвал доступ, сменил пароль или ключ истёк
const forget = (sb, userId) => sb.from('google_calendar').delete().eq('user_id', userId);

async function readEvents(sb, userId, tz) {
  const { data: row, error } = await sb.from('google_calendar').select('token_enc').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!row) return [200, { connected: false, items: [] }];
  const refresh = openToken(row.token_enc);
  if (!refresh) { await forget(sb, userId); return [200, { connected: false, items: [], reason: 'reconnect' }]; }
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  const tok = await t.json().catch(() => ({}));
  if (t.status === 400 && tok.error === 'invalid_grant') { await forget(sb, userId); return [200, { connected: false, items: [], reason: 'reconnect' }]; }
  if (!t.ok || typeof tok.access_token !== 'string') return [502, { error: 'Google сейчас не отвечает', reason: 'upstream' }];
  const now = Date.now();
  const q = new URLSearchParams({
    singleEvents: 'true', orderBy: 'startTime', maxResults: String(MAX_EVENTS), timeZone: tz,
    timeMin: new Date(now - 86400000).toISOString(), timeMax: new Date(now + DAYS * 86400000).toISOString(),
    fields: 'items(id,status,summary,location,start,end,attendees(self,responseStatus))',
  });
  const e = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, {
    headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(8000),
  });
  if (!e.ok) return [502, { error: 'Google сейчас не отвечает', reason: 'upstream', code: e.status }];
  const body = await e.json().catch(() => null);
  return [200, { connected: true, items: parseEvents(body?.items) }];
}

const missingTable = (e) => ['42P01', 'PGRST205'].includes(String(e?.code));

export default async function handler(req, res) {
  applyCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  const sb = admin();
  const configured = sb && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && String(process.env.GOOGLE_TOKEN_KEY || '').length >= KEY_MIN;
  const who = clientKey(req);
  try {
    // ── Google вернул человека ──
    if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const host = req.headers.host;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const page = (code, ok, text, client) => res.status(code).send(resultPage({ ok, text, client, note: 'Вернитесь в приложение NEXA, расписание обновится само.' }));
      if (!(await allow([[`gc:cb:${who}`, 20, 600]]))) return page(429, false, 'Слишком часто. Подождите пару минут.');
      const state = String(q.state || '');
      if (!configured || !HEX64.test(state)) return page(400, false, FAIL_TEXT.expired);
      // state одноразовый: удаление и чтение — одним запросом
      const { data: rows } = await sb.from('google_calendar_states').delete()
        .eq('state_hash', sha256(state)).gt('expires_at', new Date().toISOString()).select('user_id, client');
      const row = rows?.[0];
      if (!row) return page(400, false, FAIL_TEXT.expired);
      let fail = null;
      if (q.error || typeof q.code !== 'string' || !q.code || q.code.length > 512) fail = 'denied';
      else {
        const x = await exchangeCode(q.code, host);
        if (x.fail) fail = x.fail;
        else {
          const { error } = await sb.from('google_calendar').upsert({ user_id: row.user_id, token_enc: sealToken(x.refresh), updated_at: new Date().toISOString() });
          if (error) throw error;
        }
      }
      if (row.client === 'web') {
        res.setHeader('Location', `${siteBase(host)}/?gcal=${fail || 'ok'}`);
        return res.status(302).end();
      }
      return page(200, !fail, fail ? (fail === 'denied' ? 'Без доступа к календарю подключить его не получится.' : FAIL_TEXT[fail] || FAIL_TEXT.server) : 'Google Календарь подключён к NEXA.', row.client);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    if (!configured) return res.status(503).json({ error: 'Подключение календаря пока не настроено', reason: 'not_configured' });
    const user = await userFrom(req, sb);
    if (!user) return res.status(401).json({ error: FAIL_TEXT.auth });

    if (body.action === 'start') {
      if (!(await allow([[`gc:start:${user.id}`, 10, 600]]))) return res.status(429).json({ error: 'Слишком часто. Подождите пару минут' });
      await sb.from('google_calendar_states').delete().lt('expires_at', new Date().toISOString()); // старые попытки
      const state = randomToken();
      const { error } = await sb.from('google_calendar_states').insert({
        state_hash: sha256(state), user_id: user.id, client: clientKind(body.client), expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      });
      if (error) throw error;
      return res.status(200).json({ url: authorizeUrl({ clientId: process.env.GOOGLE_CLIENT_ID, state, host: req.headers.host }) });
    }

    if (body.action === 'events') {
      if (!(await allow([[`gc:ev:${user.id}`, 40, 600]]))) return res.status(429).json({ error: 'Слишком часто. Подождите пару минут' });
      const tz = typeof body.tz === 'string' && body.tz.length <= 64 && TZ_RE.test(body.tz) ? body.tz : 'UTC';
      const [code, out] = await readEvents(sb, user.id, tz);
      return res.status(code).json(out);
    }

    if (body.action === 'disconnect') {
      if (!(await allow([[`gc:off:${user.id}`, 10, 60]]))) return res.status(429).json({ error: 'Слишком часто. Подождите минуту' });
      const { data: row } = await sb.from('google_calendar').select('token_enc').eq('user_id', user.id).maybeSingle();
      const refresh = row && openToken(row.token_enc);
      // Сбой отзыва не мешает: у нас ключа всё равно не останется
      if (refresh) {
        try {
          await fetchImpl('https://oauth2.googleapis.com/revoke', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refresh }).toString(), signal: AbortSignal.timeout(6000),
          });
        } catch {}
      }
      const { error } = await forget(sb, user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    console.error('calendar-google error:', error?.code || error?.name || 'unknown');
    if (missingTable(error) && req.method === 'POST') return res.status(503).json({ error: 'Подключение календаря пока не настроено', reason: 'not_configured' });
    if (req.method === 'GET') return res.status(500).send(resultPage({ ok: false, text: FAIL_TEXT.server }));
    return res.status(500).json({ error: FAIL_TEXT.server });
  }
}
