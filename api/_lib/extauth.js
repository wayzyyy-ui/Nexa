/* Вход через внешние сервисы (Яндекс ID, Telegram) — общая часть серверных функций.

   Схема как у входа по QR: сервер сам проверяет внешний вход, находит или создаёт
   пользователя Supabase (ключ service role — только здесь), делает одноразовый пропуск
   (magic link без письма) и отдаёт его приложению один раз в ответ на опрос.
   Приложение меняет пропуск на сессию (supabase.auth.verifyOtp).

   Таблицы — supabase/auth-providers.sql:
   - auth_logins — попытки входа: хэш state / токена, хэш секрета приложения, срок, итог;
   - auth_identities — чей это Яндекс / Telegram: (provider, subject) → user_id.
   Ничего секретного (state, секреты, пропуски, ключи) в журнал не пишем.

   Файл в папке с «_» — Vercel не делает из него отдельный адрес. */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isAllowedEmail } from '../../src/lib/allowedEmailDomains.js';

export const LOGIN_TTL_MS = 10 * 60 * 1000;     // попытка входа через Яндекс живёт 10 минут
export const TG_TTL_MS = 5 * 60 * 1000;         // токен для бота Telegram — 5 минут
export const PROVIDERS = ['yandex', 'telegram'];
// Служебная почта для тех, кто входит только через Telegram: домен .invalid не существует,
// письма туда не уходят. Триггер почтовых доменов пропускает его только вместе с меткой
// провайдера в app_metadata (её ставит только сервер) — см. auth-providers.sql
export const TG_EMAIL_DOMAIN = 'tg.nexa.invalid';
export const tgEmail = (tgId) => `tg${tgId}@${TG_EMAIL_DOMAIN}`;
export const isServiceEmail = (email) => String(email || '').toLowerCase().endsWith('@' + TG_EMAIL_DOMAIN);

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('hex');
// Сравнение без утечки по времени (длины у хэшей одинаковые)
export function sameHash(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
export const HEX64 = /^[0-9a-f]{64}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Попытка ещё действует: не истекла и ждёт внешнего входа
export const isFresh = (row, now = Date.now()) => !!row && new Date(row.expires_at).getTime() > now;

// Откуда пришёл запрос: приложение для ПК, Android или сайт
export function clientKind(v) { return v === 'desktop' || v === 'android' ? v : 'web'; }

// Адреса приложения — как у api/qr-login.js
const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

let testAdmin = null;
export const __setAdminTest = (a) => { testAdmin = a; };
export function admin() {
  if (testAdmin) return testAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Кто вошёл: ключ входа из заголовка Authorization
export async function userFrom(req, sb) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4096) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data?.user || null;
}

/* Что сделать с внешним входом — чистая функция (тесты в tests/ext-auth.test.mjs).
   purpose: "login" | "link"; owner — чей уже этот Яндекс / Telegram (user_id или null);
   linkUser — кто привязывает; byEmail — аккаунт с той же почтой; mine — уже привязанный
   к linkUser аккаунт этого же сервиса (subject) или null.
   Ответ: { act: "use", user } | { act: "attach", user } | { act: "create" } | { act: "fail", reason } | { act: "linked" } */
export function decide({ purpose, owner, linkUser, byEmail, mine, emailOk = true }) {
  if (purpose === 'link') {
    if (!linkUser) return { act: 'fail', reason: 'auth' };
    if (owner && owner !== linkUser) return { act: 'fail', reason: 'taken' };     // уже у другого аккаунта — не склеиваем
    if (owner === linkUser) return { act: 'linked' };                            // уже привязан — ничего не меняем
    if (mine) return { act: 'fail', reason: 'has_other' };                        // привязан другой Яндекс / Telegram
    return { act: 'attach', user: linkUser, then: 'linked' };
  }
  if (owner) return { act: 'use', user: owner };
  if (!emailOk) return { act: 'fail', reason: 'domain' };
  if (byEmail) return { act: 'attach', user: byEmail };   // та же почта — тот же аккаунт (один человек — один аккаунт)
  return { act: 'create' };
}

/* Можно ли отвязать сервис: должен остаться хоть один способ входа.
   Настоящая почта — всегда способ входа (код из письма). Служебная почта Telegram — нет */
export function canUnlink({ provider, email, linked }) {
  const others = (linked || []).filter((p) => p !== provider);
  if (!(linked || []).includes(provider)) return { ok: false, reason: 'not_linked' };
  if (!isServiceEmail(email)) return { ok: true };
  return others.length ? { ok: true } : { ok: false, reason: 'last' };
}

// Тексты причин — их показывает приложение (в журнал не идут)
export const FAIL_TEXT = {
  denied: 'Вход отменён. Попробуйте ещё раз или войдите по почте.',
  domain: 'Почта этого аккаунта не подходит: NEXA принимает только российские почтовые сервисы. Войдите по почте.',
  no_email: 'Сервис не сообщил почту. Разрешите доступ к почте или войдите по коду из письма.',
  taken: 'Этот аккаунт уже привязан к другому аккаунту NEXA. Сначала отвяжите его там.',
  has_other: 'К вашему аккаунту уже привязан другой такой аккаунт. Сначала отвяжите его.',
  expired: 'Время на вход вышло. Начните заново.',
  auth: 'Войдите в NEXA, чтобы привязать способ входа.',
  upstream: 'Сервис входа не ответил. Попробуйте позже или войдите по почте.',
  server: 'Не получилось войти. Попробуйте ещё раз.',
  last: 'Это последний способ входа, отвязать его нельзя.',
  not_linked: 'Этот способ входа не привязан.',
};

/* Найти владельца внешнего аккаунта. Запись есть, а пользователя уже нет (удалён) — забываем запись */
export async function ownerOf(sb, provider, subject) {
  const { data } = await sb.from('auth_identities').select('user_id').eq('provider', provider).eq('subject', String(subject)).limit(1);
  const uid = data?.[0]?.user_id || null;
  if (!uid) return null;
  const { data: u } = await sb.auth.admin.getUserById(uid);
  if (u?.user) return uid;
  await sb.from('auth_identities').delete().eq('provider', provider).eq('subject', String(subject));
  return null;
}
export async function mineOf(sb, provider, userId) {
  const { data } = await sb.from('auth_identities').select('subject').eq('provider', provider).eq('user_id', userId).limit(1);
  return data?.[0]?.subject || null;
}
// Аккаунт с этой почтой (функция базы — только для service role)
export async function userByEmail(sb, email) {
  if (!email) return null;
  const { data, error } = await sb.rpc('nexa_auth_user_by_email', { p_email: String(email).toLowerCase() });
  if (error) throw error;
  return data || null;
}

/* Записать «этот внешний аккаунт — этого пользователя» и копию в app_metadata
   (её меняет только сервер; user_metadata человек правит сам — туда не пишем).
   meta — { yandex_id } / { tg_id } */
export async function attach(sb, userId, provider, subject, meta = {}) {
  const { error } = await sb.from('auth_identities').insert({ provider, subject: String(subject), user_id: userId });
  // 23505 — уже есть (повторное нажатие или гонка) — проверяем, что это тот же человек
  if (error && error.code !== '23505') throw error;
  if (error) {
    const owner = await ownerOf(sb, provider, subject);
    if (owner !== userId) return false;
  }
  await syncAppMeta(sb, userId, { [`nexa_${provider}`]: meta.value ?? String(subject) });
  return true;
}
export async function detach(sb, userId, provider) {
  await sb.from('auth_identities').delete().eq('provider', provider).eq('user_id', userId);
  await syncAppMeta(sb, userId, { [`nexa_${provider}`]: null });
}

// Список привязанных сервисов — в app_metadata.nexa_providers (для показа в Настройках)
export async function syncAppMeta(sb, userId, extra = {}) {
  const { data } = await sb.from('auth_identities').select('provider').eq('user_id', userId);
  const linked = PROVIDERS.filter((p) => (data || []).some((r) => r.provider === p));
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const app = { ...(u?.user?.app_metadata || {}), ...extra, nexa_providers: linked };
  for (const k of Object.keys(app)) if (app[k] === null) delete app[k];
  await sb.auth.admin.updateUserById(userId, { app_metadata: app });
  return linked;
}

/* Новый пользователь. profile — { name, avatar } кладём в user_metadata (как «Имя и фото»).
   appMeta — метка провайдера (для Telegram без неё триггер почтовых доменов отклонит запись) */
export async function createUser(sb, { email, profile = {}, appMeta = {} }) {
  const user_metadata = {};
  if (profile.name) user_metadata.nexa_name = String(profile.name).slice(0, 40);
  if (profile.avatar) user_metadata.nexa_avatar = profile.avatar;
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata, app_metadata: appMeta });
  if (!error && data?.user) return data.user.id;
  // Почта уже занята (гонка двух входов) — берём существующего
  const existing = await userByEmail(sb, email);
  if (existing) return existing;
  throw error || new Error('create failed');
}

// Одноразовый пропуск для входа в аккаунт (письмо не отправляется)
export async function issueToken(sb, userId) {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) throw new Error('no email');
  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) throw error || new Error('no token');
  return data.properties.hashed_token;
}

/* Опрос приложения: { id, secret } → итог попытки. Пропуск отдаём один раз */
export async function pollLogin(sb, provider, body) {
  if (typeof body.id !== 'string' || !UUID_RE.test(body.id) || typeof body.secret !== 'string' || !HEX64.test(body.secret)) return [400, { error: 'bad request' }];
  const { data: row } = await sb.from('auth_logins').select('id, provider, secret_hash, status, token_hash, error, expires_at').eq('id', body.id).maybeSingle();
  if (!row || row.provider !== provider || !sameHash(row.secret_hash, sha256(body.secret))) return [404, { status: 'not_found' }];
  if (row.status === 'ready' && row.token_hash) {
    const { data: taken } = await sb.from('auth_logins').update({ status: 'used', token_hash: null })
      .eq('id', row.id).eq('status', 'ready').select('id');
    if (!taken?.length) return [200, { status: 'used' }];
    return [200, { status: 'ready', token_hash: row.token_hash }];
  }
  if (row.status === 'linked' || row.status === 'error') {
    // Итог прочитан — попытку больше не храним
    await sb.from('auth_logins').delete().eq('id', row.id);
    return [200, row.status === 'linked' ? { status: 'linked' } : { status: 'error', reason: row.error || 'server', text: FAIL_TEXT[row.error] || FAIL_TEXT.server }];
  }
  if ((row.status === 'pending' || row.status === 'processing') && !isFresh(row)) return [200, { status: 'expired', text: FAIL_TEXT.expired }];
  return [200, { status: row.status === 'used' ? 'used' : 'pending' }];
}

/* Довести внешний вход до конца: решить, кто это, и записать итог в попытку.
   ext — { subject, email, emailVerified, profile, appMeta, meta } от сервиса */
export async function finishLogin(sb, row, provider, ext) {
  const owner = await ownerOf(sb, provider, ext.subject);
  const purpose = row.purpose;
  const emailOk = ext.email ? isAllowedEmail(ext.email) || isServiceEmail(ext.email) : false;
  const byEmail = purpose === 'login' && !owner && ext.email && emailOk ? await userByEmail(sb, ext.email) : null;
  const mine = purpose === 'link' && row.link_user ? await mineOf(sb, provider, row.link_user) : null;
  if (purpose === 'login' && !owner && !ext.email) return save(sb, row, { status: 'error', error: 'no_email' });
  const d = decide({ purpose, owner, linkUser: row.link_user, byEmail, mine, emailOk });
  if (d.act === 'fail') return save(sb, row, { status: 'error', error: d.reason });
  if (d.act === 'linked') return save(sb, row, { status: 'linked' });
  let uid = d.user;
  if (d.act === 'create') uid = await createUser(sb, { email: ext.email, profile: ext.profile, appMeta: ext.appMeta });
  if (d.act === 'create' || d.act === 'attach') {
    const ok = await attach(sb, uid, provider, ext.subject, ext.meta);
    if (!ok) return save(sb, row, { status: 'error', error: 'taken' });
  }
  if (d.then === 'linked') return save(sb, row, { status: 'linked' });
  return save(sb, row, { status: 'ready', token_hash: await issueToken(sb, uid) });
}
async function save(sb, row, patch) {
  await sb.from('auth_logins').update(patch).eq('id', row.id);
  return patch;
}

/* Отвязать сервис у вошедшего */
export async function unlinkProvider(sb, user, provider) {
  const { data } = await sb.from('auth_identities').select('provider').eq('user_id', user.id);
  const linked = (data || []).map((r) => r.provider);
  const can = canUnlink({ provider, email: user.email, linked });
  if (!can.ok) return [409, { error: FAIL_TEXT[can.reason], reason: can.reason }];
  await detach(sb, user.id, provider);
  return [200, { ok: true }];
}

// Старые попытки (просроченные больше часа назад) убираем при каждой новой
export async function cleanup(sb) {
  await sb.from('auth_logins').delete().lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
}
