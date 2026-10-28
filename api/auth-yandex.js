/* Вход через Яндекс ID — серверная функция Vercel (OAuth с обменом кода на сервере).

   1) POST start  { purpose: login | link, client: web | android | desktop } (link — с Bearer)
      → { id, secret, url }. В попытке храним только хэши state и секрета, срок — 10 минут.
      Приложение открывает url: сайт — в этой же вкладке, Android и ПК — во внешнем браузере
      (встроенную страницу Яндекса внутри приложения не открываем).
   2) GET ?code&state — сюда Яндекс возвращает человека. state одноразовый: попытка
      атомарно переходит pending → processing. Код меняем на ключ Яндекса (client_secret
      только здесь), читаем id, почту, имя, аватар, решаем, чей это аккаунт (api/_lib/extauth.js).
      Сайт — обратно на сайт (?ext_auth=yandex), приложение — страница «Вернитесь в NEXA».
   3) POST poll { id, secret } — итог: одноразовый пропуск (verifyOtp), «привязано» или причина.
   4) POST unlink (Bearer) — отвязать Яндекс (последний способ входа отвязать нельзя).

   Переменные Vercel: YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL.
   Redirect URI в кабинете Яндекса: https://nexa-link.ru/api/auth-yandex (и другие адреса сайта из SITE_HOSTS). */
import { allow, clientKey } from './_lib/rate-limit.js';
import {
  admin, applyCors, userFrom, sha256, randomToken, HEX64, LOGIN_TTL_MS, clientKind,
  pollLogin, finishLogin, unlinkProvider, cleanup, FAIL_TEXT,
} from './_lib/extauth.js';

const PROVIDER = 'yandex';
// Адреса сайта, на которые Яндексу можно возвращать человека (все — в Redirect URI приложения Яндекса)
const SITE_HOSTS = ['nexa-link.ru', 'nexaru-ecosystem.vercel.app', 'nexahub.ru', 'localhost:3000'];
export const DEFAULT_HOST = 'nexa-link.ru';
const AVATAR_ID_RE = /^[\w/-]{1,120}$/;
const AVATAR_MAX = 6500; // байт: data-адрес должен уложиться в 9000 знаков (как «Имя и фото»)

let fetchImpl = (...a) => fetch(...a);
export const __setFetchTest = (f) => { fetchImpl = f; };

export function siteBase(host) {
  const h = SITE_HOSTS.includes(String(host || '').toLowerCase()) ? String(host).toLowerCase() : DEFAULT_HOST;
  return `${h.startsWith('localhost') ? 'http' : 'https'}://${h}`;
}
export const redirectUri = (host) => `${siteBase(host)}/api/auth-yandex`;

export function authorizeUrl({ clientId, state, host }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri(host), state });
  return `https://oauth.yandex.ru/authorize?${q}`;
}

// Что нам нужно из ответа login.yandex.ru/info
export function parseInfo(info) {
  if (!info || (typeof info.id !== 'string' && typeof info.id !== 'number')) return null;
  const email = typeof info.default_email === 'string' ? info.default_email.trim().toLowerCase()
    : Array.isArray(info.emails) && typeof info.emails[0] === 'string' ? info.emails[0].trim().toLowerCase() : '';
  const name = [info.real_name, info.display_name, info.first_name].find((v) => typeof v === 'string' && v.trim()) || '';
  const avatarId = !info.is_avatar_empty && typeof info.default_avatar_id === 'string' && AVATAR_ID_RE.test(info.default_avatar_id) ? info.default_avatar_id : null;
  return { subject: String(info.id), email, name: name.trim().slice(0, 40), avatarId };
}

// Маленький аватар Яндекса → data-адрес (чужие ссылки приложение не показывает)
async function avatarData(id) {
  if (!id) return null;
  try {
    const r = await fetchImpl(`https://avatars.yandex.net/get-yapic/${id}/islands-68`, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    const type = String(r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length && buf.length <= AVATAR_MAX ? `data:${type};base64,${buf.toString('base64')}` : null;
  } catch { return null; }
}

// Код → ключ Яндекса → сведения о человеке
async function yandexUser(code, host) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code,
    client_id: process.env.YANDEX_CLIENT_ID, client_secret: process.env.YANDEX_CLIENT_SECRET,
    redirect_uri: redirectUri(host),
  });
  const t = await fetchImpl('https://oauth.yandex.ru/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(8000),
  });
  const tok = await t.json().catch(() => ({}));
  if (!t.ok || typeof tok.access_token !== 'string') return { fail: t.status === 400 ? 'expired' : 'upstream' };
  const i = await fetchImpl('https://login.yandex.ru/info?format=json', { headers: { Authorization: `OAuth ${tok.access_token}` }, signal: AbortSignal.timeout(8000) });
  const info = parseInfo(await i.json().catch(() => null));
  if (!i.ok || !info) return { fail: 'upstream' };
  return { info };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Страница во внешнем браузере (приложения): без скриптов, обе темы
export function resultPage({ ok, text, client }) {
  const title = ok ? 'Готово' : 'Не получилось';
  const back = client === 'desktop'
    ? '<a class="b" href="nexa://tab/home">Вернуться в NEXA</a>'
    : '<p class="m">Вернитесь в приложение NEXA, вход завершится сам.</p>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXA · ${title}</title><style>
:root{--bg:#01090F;--t:#EAF2F7;--m:#8FA3B3;--a:#5CE1C6;--r:#FF6B6B;color-scheme:dark light}
@media (prefers-color-scheme: light){:root{--bg:#F4F7FA;--t:#0B1A24;--m:#516574;--a:#0E9F84;--r:#D93838}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--t);font:16px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}h1{font-size:26px;margin:0 0 8px;color:${ok ? 'var(--a)' : 'var(--r)'}}.m{color:var(--m);margin:8px 0 0}
.b{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:999px;background:var(--a);color:#01090F;text-decoration:none;font-weight:600}
</style></head><body><main><h1>${title}</h1><p>${esc(text)}</p>${back}</main></body></html>`;
}

export default async function handler(req, res) {
  applyCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  const sb = admin();
  const configured = sb && process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET;
  const who = clientKey(req);
  let claimed = null; // попытка, которую забрал колбэк (сбой — честно отмечаем «не получилось»)
  try {
    // ── Яндекс вернул человека ──
    if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const host = req.headers.host;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!(await allow([[`ya:cb:${who}`, 20, 600]]))) return res.status(429).send(resultPage({ ok: false, text: 'Слишком часто. Подождите пару минут.' }));
      const state = String(q.state || '');
      if (!configured || !HEX64.test(state)) return res.status(400).send(resultPage({ ok: false, text: FAIL_TEXT.expired }));
      // state одноразовый: забираем попытку, только если она ещё ждёт
      const { data: rows } = await sb.from('auth_logins').update({ status: 'processing', state_hash: null })
        .eq('state_hash', sha256(state)).eq('provider', PROVIDER).eq('status', 'pending').gt('expires_at', new Date().toISOString())
        .select('id, purpose, client, link_user');
      const row = rows?.[0];
      if (!row) return res.status(400).send(resultPage({ ok: false, text: FAIL_TEXT.expired }));
      claimed = row;
      let out;
      if (q.error || typeof q.code !== 'string' || !q.code || q.code.length > 512) {
        out = { status: 'error', error: 'denied' };
        await sb.from('auth_logins').update(out).eq('id', row.id);
      } else {
        const y = await yandexUser(q.code, host);
        if (y.fail) {
          out = { status: 'error', error: y.fail };
          await sb.from('auth_logins').update(out).eq('id', row.id);
        } else {
          const avatar = row.purpose === 'login' ? await avatarData(y.info.avatarId) : null;
          out = await finishLogin(sb, row, PROVIDER, {
            subject: y.info.subject, email: y.info.email, profile: { name: y.info.name, avatar }, meta: { value: y.info.subject },
          });
        }
      }
      if (row.client === 'web') {
        res.setHeader('Location', `${siteBase(host)}/?ext_auth=${PROVIDER}`);
        return res.status(302).end();
      }
      const ok = out.status === 'ready' || out.status === 'linked';
      return res.status(200).send(resultPage({
        ok, client: row.client,
        text: ok ? (out.status === 'linked' ? 'Яндекс ID привязан к вашему аккаунту NEXA.' : 'Вы вошли через Яндекс ID.') : FAIL_TEXT[out.error] || FAIL_TEXT.server,
      }));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    if (!configured) return res.status(503).json({ error: 'Вход через Яндекс пока не настроен', reason: 'not_configured' });

    if (body.action === 'start') {
      if (!(await allow([[`ya:start:${who}`, 10, 600]]))) return res.status(429).json({ error: 'Слишком часто. Подождите пару минут' });
      const purpose = body.purpose === 'link' ? 'link' : 'login';
      let linkUser = null;
      if (purpose === 'link') {
        const user = await userFrom(req, sb);
        if (!user) return res.status(401).json({ error: FAIL_TEXT.auth });
        if (!(await allow([[`ya:link:${user.id}`, 10, 600]]))) return res.status(429).json({ error: 'Слишком часто. Подождите пару минут' });
        linkUser = user.id;
      }
      await cleanup(sb);
      const state = randomToken(), secret = randomToken();
      const { data, error } = await sb.from('auth_logins').insert({
        provider: PROVIDER, purpose, client: clientKind(body.client), link_user: linkUser,
        state_hash: sha256(state), secret_hash: sha256(secret), expires_at: new Date(Date.now() + LOGIN_TTL_MS).toISOString(),
      }).select('id').single();
      if (error) throw error;
      return res.status(200).json({ id: data.id, secret, url: authorizeUrl({ clientId: process.env.YANDEX_CLIENT_ID, state, host: req.headers.host }), ttl: LOGIN_TTL_MS });
    }

    if (body.action === 'poll') {
      const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
      if (!(await allow([[`ya:poll:${who}`, 90, 60], [`ya:poll:id:${id}`, 40, 60]]))) return res.status(429).json({ status: 'slow_down' });
      const [code, out] = await pollLogin(sb, PROVIDER, body);
      return res.status(code).json(out);
    }

    if (body.action === 'unlink') {
      const user = await userFrom(req, sb);
      if (!user) return res.status(401).json({ error: FAIL_TEXT.auth });
      if (!(await allow([[`ya:unlink:${user.id}`, 10, 60]]))) return res.status(429).json({ error: 'Слишком часто. Подождите минуту' });
      const [code, out] = await unlinkProvider(sb, user, PROVIDER);
      return res.status(code).json(out);
    }

    return res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    console.error('auth-yandex error:', error?.code || error?.name || 'unknown');
    if (claimed) {
      try { await sb.from('auth_logins').update({ status: 'error', error: 'server' }).eq('id', claimed.id); } catch {}
      if (claimed.client === 'web') { res.setHeader('Location', `${siteBase(req.headers.host)}/?ext_auth=${PROVIDER}`); return res.status(302).end(); }
    }
    if (req.method === 'GET') return res.status(500).send(resultPage({ ok: false, text: FAIL_TEXT.server }));
    return res.status(500).json({ error: FAIL_TEXT.server });
  }
}
