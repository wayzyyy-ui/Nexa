// Шифрование на устройствах (src/lib/e2e.js): буфер обмена и файл резервной копии
import test from "node:test";
import assert from "node:assert/strict";
import { deriveKey, sealText, openText, isSealedText, makeE2eConfig, unlockE2e, keyMatches, sealBlob, openBlob, isSealedBlob } from "../src/lib/e2e.js";

const FAST = 100000; // повторов поменьше — тесты быстрее (в приложении 600 000)
const salt = new Uint8Array(16).fill(7);

test("текст: свой ключ открывает, чужой — нет, испорченный — нет", async () => {
  const k1 = await deriveKey("пароль-один", salt, FAST), k2 = await deriveKey("пароль-два", salt, FAST);
  const s = await sealText(k1, "Привет, буфер 😀");
  assert.ok(isSealedText(s));
  assert.ok(!s.includes("Привет"), "в зашифрованном нет исходного текста");
  assert.equal(await openText(k1, s), "Привет, буфер 😀");
  assert.equal(await openText(k2, s), null);
  const broken = s.slice(0, -4) + (s.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(await openText(k1, broken), null);
  assert.notEqual(await sealText(k1, "одно и то же"), await sealText(k1, "одно и то же"), "каждый раз новый шифр");
});

test("настройка аккаунта: верный пароль даёт ключ, неверный — нет", async () => {
  const { key, config } = await makeE2eConfig("секретный пароль");
  assert.equal(config.iter, 600000);
  assert.ok(await keyMatches(key, config));
  const again = await unlockE2e("секретный пароль", config);
  assert.ok(again);
  assert.equal(await openText(again, await sealText(key, "с другого устройства")), "с другого устройства");
  assert.equal(await unlockE2e("не тот", config), null);
  // Пароль сменили на другом устройстве — старый ключ больше не подходит
  const { config: next } = await makeE2eConfig("новый пароль!");
  assert.equal(await keyMatches(key, next), false);
});

test("файл копии: шифруется кусками, открывается тем же паролем", async () => {
  const data = new Uint8Array(5000).map((_, i) => (i * 31) % 251);
  const sealed = await sealBlob(new Blob([data]), "пароль копии", { chunk: 1024, iter: FAST });
  assert.ok(await isSealedBlob(sealed));
  assert.equal(await isSealedBlob(new Blob([data])), false);
  const back = new Uint8Array(await (await openBlob(sealed, "пароль копии")).arrayBuffer());
  assert.deepEqual(back, data);
});

test("файл копии: неверный пароль, обрезка и подмена замечаются", async () => {
  const data = new Uint8Array(4096).fill(42);
  const sealed = await sealBlob(new Blob([data]), "пароль копии", { chunk: 1024, iter: FAST });
  await assert.rejects(openBlob(sealed, "другой"), (e) => e.code === "wrong_password");
  // Обрезали последний кусок ровно по границе — заметно
  const step = 1024 + 16;
  await assert.rejects(openBlob(sealed.slice(0, 40 + step * 3), "пароль копии"), (e) => e.code === "broken");
  // Обрезали до одного куска — тоже «повреждён», а не «неверный пароль»
  await assert.rejects(openBlob(sealed.slice(0, 40 + step), "пароль копии"), (e) => e.code === "broken");
  // Испортили байт в середине
  const bytes = new Uint8Array(await sealed.arrayBuffer());
  bytes[40 + step + 10] ^= 1;
  await assert.rejects(openBlob(new Blob([bytes]), "пароль копии"), (e) => e.code === "broken");
});

test("пустой файл тоже шифруется и открывается", async () => {
  const sealed = await sealBlob(new Blob([]), "пароль копии", { iter: FAST });
  assert.equal((await openBlob(sealed, "пароль копии")).size, 0);
});
