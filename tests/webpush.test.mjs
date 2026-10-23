import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHmac, createDecipheriv, randomBytes, createPublicKey, verify, generateKeyPairSync } from "node:crypto";
import { encrypt, vapidAuth, pushEndpointOk } from "../api/_lib/webpush.js";

const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
const hkdf = (salt, ikm, info, len) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

// Так расшифровывает браузер (RFC 8291 / 8188)
function decrypt(buf, ua, auth) {
  const salt = buf.subarray(0, 16), idlen = buf[20], asPublic = buf.subarray(21, 21 + idlen), body = buf.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(body.subarray(body.length - 16));
  const plain = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2); // разделитель последней записи
  return plain.subarray(0, plain.length - 1).toString();
}

test("шифрование: браузер расшифровывает своё уведомление", () => {
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const auth = randomBytes(16);
  const sub = { keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
  const msg = JSON.stringify({ title: "Вышла NEXA 0.15.5", body: "Что нового" });
  const enc = encrypt(msg, sub);
  assert.equal(enc.readUInt32BE(16), 4096);
  assert.equal(decrypt(enc, ua, auth), msg);
  // Чужой браузер прочитать не может
  const other = createECDH("prime256v1"); other.generateKeys();
  assert.throws(() => decrypt(enc, other, auth));
});

test("подпись VAPID проверяется открытым ключом", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pj = publicKey.export({ format: "jwk" }), sj = privateKey.export({ format: "jwk" });
  const keys = { publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, "base64url"), Buffer.from(pj.y, "base64url")]).toString("base64url"), privateKey: sj.d, subject: "mailto:a@b.ru" };
  const h = vapidAuth("https://fcm.googleapis.com/fcm/send/abc", keys);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [hd, bd, sg] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(bd, "base64url")).aud, "https://fcm.googleapis.com");
  assert.ok(verify("sha256", Buffer.from(`${hd}.${bd}`), { key: createPublicKey({ key: pj, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(sg, "base64url")));
});

test("адреса — только сервисы уведомлений браузеров, только https", () => {
  assert.ok(pushEndpointOk("https://fcm.googleapis.com/fcm/send/x"));
  assert.ok(pushEndpointOk("https://web.push.apple.com/abc"));
  assert.ok(pushEndpointOk("https://updates.push.services.mozilla.com/wpush/v2/x"));
  assert.ok(pushEndpointOk("https://wns2-db5p.notify.windows.com/w/?token=x"));
  assert.ok(!pushEndpointOk("http://fcm.googleapis.com/x"));
  assert.ok(!pushEndpointOk("https://evil.example.com/googleapis.com"));
  assert.ok(!pushEndpointOk("https://googleapis.com.evil.ru/x"));
  assert.ok(!pushEndpointOk("https://169.254.169.254/latest"));
});
