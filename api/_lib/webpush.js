/* Веб-уведомления (Web Push) без сторонних библиотек — только node:crypto.
   - vapidAuth(endpoint, keys) — заголовок Authorization «vapid t=…, k=…» (RFC 8292): подпись ES256
     нашим закрытым ключом, чтобы сервис уведомлений браузера (Google, Mozilla, Apple, Microsoft) знал,
     что шлёт тот же сервер, на который подписался человек;
   - encrypt(payload, sub) — шифрование содержимого для одного браузера (RFC 8291, aes128gcm):
     прочитать уведомление может только этот браузер, сервис доставки видит лишь зашифрованное;
   - sendPush(sub, payload, keys) — отправить; ответ { ok, gone } (gone — подписки больше нет, удалить).
   Ключи — base64url: public — 65 байт (04‖x‖y), private — 32 байта (d). Создаёт их scripts/vapid-keys.mjs */
import { createECDH, createHmac, createCipheriv, randomBytes, createPrivateKey, sign } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

// Сервисы уведомлений браузеров — только к ним и ходим (иначе адрес подписки мог бы указать куда угодно)
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function pushEndpointOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && String(endpoint).length <= 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

export function vapidAuth(endpoint, { publicKey, privateKey, subject }) {
  const pub = fromB64u(publicKey);
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(fromB64u(privateKey)) },
    format: 'jwk',
  });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || 'mailto:support@nexa-link.ru' }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
// HKDF (RFC 5869) с одним блоком — нам нужно не больше 32 байт
const hkdf = (salt, ikm, info, len) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

// salt и ключ сервера можно подставить (только для тестов)
export function encrypt(payload, sub, { salt = randomBytes(16), serverKeys } = {}) {
  const uaPublic = fromB64u(sub.keys?.p256dh);
  const authSecret = fromB64u(sub.keys?.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad_keys');
  const ecdh = serverKeys || createECDH('prime256v1');
  if (!serverKeys) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // Одна запись: содержимое + разделитель 0x02 («последняя запись»)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export async function sendPush(sub, payload, keys, { ttl = 86400 } = {}) {
  if (!pushEndpointOk(sub.endpoint)) return { ok: false, gone: true };
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuth(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: encrypt(JSON.stringify(payload), sub),
  });
  // 404 / 410 — подписку отменили (браузер удалили, сайт запретили): больше не шлём
  return { ok: r.status >= 200 && r.status < 300, gone: r.status === 404 || r.status === 410, status: r.status };
}
