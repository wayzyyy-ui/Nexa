// Выпуск приложения для ПК: проверка подписи (scripts/lib/minisign.mjs) и правила
// (scripts/desktop-release.mjs). Подписи делаем тут же своим ключом Ed25519 — в формате Tauri.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyFile, commentFields } from "../scripts/lib/minisign.mjs";
import { apiBase, desktopBlock, desktopMinVersion, latestJson } from "../scripts/desktop-release.mjs";

// Ключ и подпись в формате minisign (как у npx tauri signer)
function makeKey(id = "0102030405060708") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const pubLine = Buffer.concat([Buffer.from("Ed"), Buffer.from(id, "hex"), raw]).toString("base64");
  const pubkey = Buffer.from(`untrusted comment: minisign public key: ${id}\n${pubLine}\n`).toString("base64");
  return { id, pubkey, privateKey };
}
function makeSig(key, data, comment) {
  const s = sign(null, createHash("blake2b512").update(data).digest(), key.privateKey);
  const g = sign(null, Buffer.concat([s, Buffer.from(comment)]), key.privateKey);
  const sigLine = Buffer.concat([Buffer.from("ED"), Buffer.from(key.id, "hex"), s]).toString("base64");
  return Buffer.from(`untrusted comment: signature from tauri secret key\n${sigLine}\ntrusted comment: ${comment}\n${g.toString("base64")}\n`).toString("base64");
}
const file = Buffer.from("установщик NEXA");
const comment = "timestamp:1792605020\tfile:NEXA_0.14.0_x64-setup.exe\tversion:0.14.0";

test("подпись своим ключом проходит, версия читается", () => {
  const k = makeKey();
  const r = verifyFile(file, makeSig(k, file, comment), k.pubkey);
  assert.equal(r.ok, true);
  assert.equal(r.keyId, k.id);
  assert.equal(r.fields.version, "0.14.0");
});

test("подменённый файл, чужой ключ, подменённый комментарий — отказ", () => {
  const k = makeKey(), other = makeKey("0807060504030201");
  const sig = makeSig(k, file, comment);
  assert.equal(verifyFile(Buffer.from("другой файл"), sig, k.pubkey).ok, false);
  assert.match(verifyFile(file, sig, other.pubkey).why, /другим ключом/);
  // Тот же номер ключа, но другой ключ — подпись не сходится
  const twin = makeKey(k.id);
  assert.equal(verifyFile(file, sig, twin.pubkey).ok, false);
  // Версию в комментарии подменили (откат на старый файл под новым номером)
  const text = Buffer.from(sig, "base64").toString().replace("version:0.14.0", "version:0.15.0");
  assert.match(verifyFile(file, Buffer.from(text).toString("base64"), k.pubkey).why, /комментария/);
  assert.equal(verifyFile(file, "мусор", k.pubkey).ok, false);
  assert.equal(verifyFile(file, sig, "мусор").ok, false);
});

test("поля trusted comment", () => {
  assert.deepEqual(commentFields("timestamp:1\tfile:a.exe"), { timestamp: "1", file: "a.exe" });
});

test("минимальная версия: по умолчанию — прошлый выпуск, hard / soft, повтор той же версии", () => {
  assert.equal(desktopMinVersion({ prev: null, version: "0.14.0" }), null);
  assert.equal(desktopMinVersion({ prev: { version: "0.14.0" }, version: "0.14.1" }), "0.14.0");
  assert.equal(desktopMinVersion({ prev: { version: "0.14.0", minVersion: "0.13.9" }, version: "0.14.1", mode: "soft" }), "0.13.9");
  assert.equal(desktopMinVersion({ prev: { version: "0.14.0" }, version: "0.14.1", mode: "hard" }), "0.14.1");
  assert.equal(desktopMinVersion({ prev: { version: "0.14.1", minVersion: "0.14.0" }, version: "0.14.1" }), "0.14.0");
});

test("файлы выпуска: блок desktop и latest.json", () => {
  const b = desktopBlock({ version: "0.14.0", size: 100, sha256: "ab", notes: ["Раз"], minVersion: null });
  assert.equal(b.exeUrl, "/nexa-setup.exe?v=0.14.0");
  assert.equal("minVersion" in b, false);
  const l = latestJson({ version: "0.14.0", notes: ["Раз", "Два"], signature: "SIG", url: "https://nexa-link.ru/nexa-setup.exe?v=0.14.0", pubDate: "2026-10-21T00:00:00.000Z" });
  assert.equal(l.platforms["windows-x86_64"].url, "https://nexa-link.ru/nexa-setup.exe?v=0.14.0");
  assert.equal(l.notes, "- Раз\n- Два");
});

test("адрес сервера — только https", () => {
  assert.equal(apiBase("VITE_API_BASE=https://nexa-link.ru/\n"), "https://nexa-link.ru");
  assert.equal(apiBase("VITE_API_BASE=http://localhost:3000"), null);
  assert.equal(apiBase(""), null);
});
