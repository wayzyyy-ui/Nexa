/* Проверка подписи обновления приложения для ПК — тот же формат, что у Tauri (minisign).
   Нужна скрипту release:desktop: до публикации убедиться, что установщик подписан ключом,
   открытая часть которого вписана в приложение (иначе приложения откажутся его ставить),
   и что в подписи записана именно эта версия (защита от «отката», requireSignedVersion).

   Открытый ключ (pubkey в tauri.conf.json) — base64 текста из двух строк:
     untrusted comment: …
     <base64: "Ed" + номер ключа (8 байт) + ключ Ed25519 (32 байта)>
   Подпись (.sig рядом с установщиком) — base64 текста из четырёх строк:
     untrusted comment: …
     <base64: "ED" (файл хешируется BLAKE2b-512) или "Ed" + номер ключа + подпись (64 байта)>
     trusted comment: timestamp:…\tfile:…\tversion:…
     <base64: подпись (64 байта) над «подпись файла + trusted comment»>
   Без библиотек: Ed25519 и BLAKE2b-512 есть в node:crypto. */
import { createHash, createPublicKey, verify } from "node:crypto";

const b64 = (s) => Buffer.from(String(s).trim(), "base64");
const lines = (text) => text.split(/\r?\n/).filter((l) => l.length);

// Открытый ключ → { keyId (hex), key (KeyObject) }
export function parsePublicKey(pubkeyB64) {
  const text = b64(pubkeyB64).toString("utf8");
  const raw = b64(lines(text)[1] || "");
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== "Ed") throw new Error("открытый ключ не в формате minisign");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.subarray(10).toString("base64url") }, format: "jwk" });
  return { keyId: raw.subarray(2, 10).toString("hex"), key };
}

// Поля trusted comment: "timestamp:1\tfile:x\tversion:0.14.0" → { timestamp, file, version }
export function commentFields(comment) {
  return Object.fromEntries(String(comment).split("\t").map((f) => { const i = f.indexOf(":"); return i > 0 ? [f.slice(0, i), f.slice(i + 1)] : null; }).filter(Boolean));
}

/* Проверить подпись файла. data — Buffer файла, sigB64 — содержимое .sig, pubkeyB64 — из tauri.conf.json.
   → { ok: true, keyId, comment, fields } или { ok: false, why } */
export function verifyFile(data, sigB64, pubkeyB64) {
  let pub;
  try { pub = parsePublicKey(pubkeyB64); } catch (e) { return { ok: false, why: e.message }; }
  const l = lines(b64(sigB64).toString("utf8"));
  if (l.length < 4 || !l[2].startsWith("trusted comment: ")) return { ok: false, why: "файл подписи не в формате minisign" };
  const sig = b64(l[1]);
  if (sig.length !== 74) return { ok: false, why: "подпись неверной длины" };
  const alg = sig.subarray(0, 2).toString();
  const keyId = sig.subarray(2, 10).toString("hex");
  if (keyId !== pub.keyId) return { ok: false, why: `подписано другим ключом (${keyId}), а в приложении — ${pub.keyId}` };
  const msg = alg === "ED" ? createHash("blake2b512").update(data).digest() : alg === "Ed" ? data : null;
  if (!msg) return { ok: false, why: "неизвестный вид подписи" };
  if (!verify(null, msg, pub.key, sig.subarray(10))) return { ok: false, why: "подпись не сходится с файлом" };
  const comment = l[2].slice("trusted comment: ".length);
  const global = b64(l[3]);
  if (global.length !== 64 || !verify(null, Buffer.concat([sig.subarray(10), Buffer.from(comment)]), pub.key, global)) {
    return { ok: false, why: "подпись комментария (с версией) не сходится" };
  }
  return { ok: true, keyId, comment, fields: commentFields(comment) };
}
