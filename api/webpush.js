/* Веб-уведомления сайта о новой версии NEXA (браузер компьютера; айфон — сайт на экране «Домой»).

   GET  /api/webpush?action=key                — открытый ключ VAPID (браузер подписывается на него);
   POST /api/webpush { action: "subscribe", sub } — сохранить подписку этого браузера
        (с Bearer — запомним и аккаунт; без входа тоже можно: это уведомление о версии, не личные данные);
   POST /api/webpush { action: "unsubscribe", endpoint };
   GET  /api/webpush?action=kick (и Vercel Cron раз в день) — проверить public/version.json и, если вышла
        версия новее разосланной, разослать «Вышла NEXA X» всем подписанным. Кто угодно может «толкнуть»,
        но решает сервер: версию он берёт сам с сайта, о каждой шлёт один раз (условное обновление
        web_push_state — при одновременных толчках рассылает только один). Приложения и сайт толкают сами,
        увидев новую версию, — так рассылка уходит вскоре после деплоя, без частого Cron.

   Переменные Vercel (только сервер): WEBPUSH_PUBLIC_KEY, WEBPUSH_PRIVATE_KEY (создаёт
   node scripts/vapid-keys.mjs), WEBPUSH_SUBJECT (mailto:…), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
   Нет ключей — { ok: false, reason: "not_configured" }. Адреса подписок и ключи в журнал не пишем. */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { allow } from './_lib/rate-limit.js';
import { sendPush, pushEndpointOk } from './_lib/webpush.js';

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const verNum = (v) => { const [a = 0, b = 0, c = 0] = String(v || '').split('.').map((x) => parseInt(x, 10) || 0); return a * 1e6 + b * 1e3 + c; };
const keys = () => (process.env.WEBPUSH_PUBLIC_KEY && process.env.WEBPUSH_PRIVATE_KEY
  ? { publicKey: process.env.WEBPUSH_PUBLIC_KEY, privateKey: process.env.WEBPUSH_PRIVATE_KEY, subject: process.env.WEBPUSH_SUBJECT }
  : null);
function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
const ipOf = (req) => sha(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'none');
const selfOrigin = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `https://${host}` : null;
};

// Последняя версия из version.json — самая новая из APK и веб-части; «что нового» — её пункты
export function latestOf(v) {
  const cands = [
    { version: v?.version, notes: v?.notes },
    { version: v?.web?.version, notes: v?.web?.notes },
    { version: v?.desktop?.version, notes: v?.desktop?.notes },
  ].filter((x) => typeof x.version === 'string' && /^\d+\.\d+\.\d+$/.test(x.version));
  cands.sort((a, b) => verNum(b.version) - verNum(a.version));
  const top = cands[0];
  if (!top) return null;
  const notes = Array.isArray(top.notes) ? top.notes.filter((s) => typeof s === 'string').slice(0, 3) : [];
  return { version: top.version, notes };
}

async function kick(req, res, sb, k) {
  if (!(await allow([[`wp-kick:${ipOf(req)}`, 20, 600]]))) return res.status(429).json({ ok: false, reason: 'rate' });
  const origin = selfOrigin(req);
  const r = origin ? await fetch(`${origin}/version.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null) : null;
  const latest = r?.ok ? latestOf(await r.json().catch(() => null)) : null;
  if (!latest) return res.status(200).json({ ok: false, reason: 'no_version' });
  const { data: st } = await sb.from('web_push_state').select('value').eq('key', 'updates').limit(1);
  const prev = st?.[0]?.value ?? '';
  // Первый запуск: запоминаем текущую версию без рассылки (о старых выпусках не уведомляем)
  if (!prev) {
    await sb.from('web_push_state').upsert({ key: 'updates', value: latest.version, updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true, sent: 0, version: latest.version, first: true });
  }
  if (verNum(latest.version) <= verNum(prev)) return res.status(200).json({ ok: true, sent: 0, version: prev });
  // Захватываем рассылку: обновится только если значение всё ещё прежнее (второй толчок получит 0 строк)
  const { data: won } = await sb.from('web_push_state').update({ value: latest.version, updated_at: new Date().toISOString() })
    .eq('key', 'updates').eq('value', prev).select('key');
  if (!won?.length) return res.status(200).json({ ok: true, sent: 0, version: latest.version, already: true });
  const payload = {
    title: `Вышла NEXA ${latest.version}`,
    body: latest.notes.length ? latest.notes.map((s) => `• ${s.length > 110 ? `${s.slice(0, 110)}…` : s}`).join('\n') : 'Откройте NEXA, чтобы посмотреть, что нового',
    url: '/',
    tag: `nexa-update-${latest.version}`,
  };
  let sent = 0, gone = 0, from = 0;
  // Порциями: подписки читаем по 500, шлём по 25 одновременно
  for (;;) {
    const { data: subs } = await sb.from('web_push_subs').select('endpoint_hash, endpoint, p256dh, auth').contains('topics', ['updates']).range(from, from + 499);
    if (!subs?.length) break;
    for (let i = 0; i < subs.length; i += 25) {
      const part = subs.slice(i, i + 25);
      const results = await Promise.all(part.map((s) => sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, k).catch(() => ({ ok: false }))));
      const dead = part.filter((_, j) => results[j].gone).map((s) => s.endpoint_hash);
      sent += results.filter((x) => x.ok).length;
      if (dead.length) { gone += dead.length; await sb.from('web_push_subs').delete().in('endpoint_hash', dead); }
    }
    if (subs.length < 500) break;
    from += 500;
  }
  console.log('webpush update', latest.version, 'sent', sent, 'gone', gone); // только числа
  return res.status(200).json({ ok: true, sent, version: latest.version });
}

export default async function handler(req, res) {
  const action = req.method === 'GET' ? String(req.query?.action || '') : String(req.body?.action || '');
  const k = keys();
  if (action === 'key') {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return k ? res.status(200).json({ ok: true, key: k.publicKey }) : res.status(200).json({ ok: false, reason: 'not_configured' });
  }
  const sb = admin();
  if (!k || !sb) return res.status(200).json({ ok: false, reason: 'not_configured' });
  if (action === 'kick') return kick(req, res, sb, k);
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  if (action === 'subscribe') {
    if (!(await allow([[`wp-sub:${ipOf(req)}`, 10, 600]]))) return res.status(429).json({ ok: false, reason: 'rate' });
    const s = req.body?.sub || {};
    const endpoint = String(s.endpoint || ''), p256dh = String(s.keys?.p256dh || ''), auth = String(s.keys?.auth || '');
    if (!pushEndpointOk(endpoint) || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,40}$/.test(auth)) return res.status(400).json({ ok: false, reason: 'bad_sub' });
    // Вошёл ли человек — по желанию (подписка работает и у гостя)
    let uid = null;
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (jwt) { const { data } = await sb.auth.getUser(jwt).catch(() => ({ data: null })); uid = data?.user?.id || null; }
    const { error } = await sb.from('web_push_subs').upsert({ endpoint_hash: sha(endpoint), endpoint, p256dh, auth, topics: ['updates'], user_id: uid, updated_at: new Date().toISOString() });
    if (error) return res.status(200).json({ ok: false, reason: /does not exist|could not find/i.test(error.message || '') ? 'not_configured' : 'error' });
    return res.status(200).json({ ok: true });
  }
  if (action === 'unsubscribe') {
    const endpoint = String(req.body?.endpoint || '');
    if (!pushEndpointOk(endpoint)) return res.status(400).json({ ok: false });
    await sb.from('web_push_subs').delete().eq('endpoint_hash', sha(endpoint));
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ ok: false });
}
