/* Шифрование на устройствах (2026-10-28) — без библиотек, встроенный в браузер WebCrypto.
   Ключ получается из пароля, который знает только человек (PBKDF2-SHA-256 → AES-GCM 256).
   Сервер видит только зашифрованное: ни Supabase, ни Vercel прочитать текст не могут.
   Где используется: общий буфер обмена (clipboardSync.js) и файл резервной копии (backup.jsx).
   Пароль не восстанавливается — забыли, зашифрованное не открыть (так и написано в интерфейсе).
   Тесты — tests/e2e.test.mjs */

export const E2E_ITER = 600000;       // повторов PBKDF2: подбор пароля перебором становится очень медленным
export const E2E_PASS_MIN = 8;        // знаков в пароле, не меньше
const TEXT_PREFIX = "e1:";            // зашифрованный текст: e1:<base64(iv 12 байт + шифр)>
const CHECK_TEXT = "nexa-e2e-check";  // проверка пароля на другом устройстве (расшифровалось → пароль верный)

const subtle = () => globalThis.crypto.subtle;
const te = new TextEncoder(), td = new TextDecoder();
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Ключ из пароля. extractable: false — сам ключ из браузера не достать даже скриптом страницы
export async function deriveKey(pass, salt, iter = E2E_ITER) {
  const base = await subtle().importKey("raw", te.encode(String(pass)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ── Короткие тексты (буфер обмена) ── */
export async function sealText(key, text) {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, te.encode(String(text))));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  return TEXT_PREFIX + toB64(all);
}
export const isSealedText = (s) => typeof s === "string" && s.startsWith(TEXT_PREFIX);
// Расшифровать; не тот ключ или текст испорчен — null (не исключение)
export async function openText(key, s) {
  if (!key || !isSealedText(s)) return null;
  try {
    const all = fromB64(s.slice(TEXT_PREFIX.length));
    if (all.length < 12 + 16) return null;
    return td.decode(await subtle().decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, key, all.subarray(12)));
  } catch { return null; }
}

/* ── Настройка аккаунта: соль и проверочная строка лежат в профиле (user_metadata.nexa_e2e) —
   это не секрет: без пароля из них ключ не получить. Сам пароль и ключ никуда не уходят ── */
export async function makeE2eConfig(pass) {
  const salt = rand(16);
  const key = await deriveKey(pass, salt);
  return { key, config: { v: 1, salt: toB64(salt), iter: E2E_ITER, check: await sealText(key, CHECK_TEXT), at: Date.now() } };
}
export const validConfig = (c) => !!c && c.v === 1 && typeof c.salt === "string" && Number.isInteger(c.iter) && c.iter >= 100000 && isSealedText(c.check);
// Пароль верный — ключ, иначе null
export async function unlockE2e(pass, config) {
  if (!validConfig(config)) return null;
  const key = await deriveKey(pass, fromB64(config.salt), config.iter);
  return (await openText(key, config.check)) === CHECK_TEXT ? key : null;
}
// Ключ на устройстве подходит к нынешней настройке аккаунта (пароль не меняли на другом устройстве)?
export async function keyMatches(key, config) {
  return validConfig(config) && (await openText(key, config.check)) === CHECK_TEXT;
}

/* ── Файл резервной копии ──
   Формат: заголовок 40 байт = «NXBKENC1» (8) + соль (16) + повторы PBKDF2 (4) + размер куска (4) + основа номера (8),
   дальше куски по CHUNK байт (последний короче), у каждого свой номер (основа + счётчик) и метка
   «последний» в проверяемых данных — подмену, перестановку и обрезку файла расшифровка замечает */
const MAGIC = te.encode("NXBKENC1");
export const SEAL_CHUNK = 1024 * 1024;
const HEAD = 40;
const ivOf = (nonce, i) => { const iv = new Uint8Array(12); iv.set(nonce); new DataView(iv.buffer).setUint32(8, i); return iv; };
const aadOf = (head, i, last) => { const a = new Uint8Array(HEAD + 5); a.set(head); const v = new DataView(a.buffer); v.setUint32(HEAD, i); a[HEAD + 4] = last ? 1 : 0; return a; };
const aborted = (signal) => { if (signal?.aborted) { const e = new Error("abort"); e.code = "abort"; throw e; } };

export async function isSealedBlob(blob) {
  if (!blob || blob.size < HEAD) return false;
  const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return b.every((x, i) => x === MAGIC[i]);
}

export async function sealBlob(blob, pass, { signal, onProgress, chunk = SEAL_CHUNK, iter = E2E_ITER } = {}) {
  const salt = rand(16), nonce = rand(8);
  const head = new Uint8Array(HEAD);
  head.set(MAGIC); head.set(salt, 8);
  const hv = new DataView(head.buffer); hv.setUint32(24, iter); hv.setUint32(28, chunk); head.set(nonce, 32);
  const key = await deriveKey(pass, salt, iter);
  const parts = [head];
  const n = Math.max(1, Math.ceil(blob.size / chunk));
  for (let i = 0; i < n; i++) {
    aborted(signal);
    const plain = new Uint8Array(await blob.slice(i * chunk, Math.min(blob.size, (i + 1) * chunk)).arrayBuffer());
    parts.push(new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: ivOf(nonce, i), additionalData: aadOf(head, i, i === n - 1) }, key, plain)));
    onProgress?.(Math.min(blob.size, (i + 1) * chunk), blob.size);
  }
  return new Blob(parts, { type: "application/octet-stream" });
}

// Расшифровать файл копии. Неверный пароль или файл испорчен — ошибка { code: "wrong_password" | "broken" }
export async function openBlob(blob, pass, { signal, onProgress } = {}) {
  const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };
  if (!(await isSealedBlob(blob))) throw fail("broken", "Это не зашифрованная копия NEXA");
  const head = new Uint8Array(await blob.slice(0, HEAD).arrayBuffer());
  const hv = new DataView(head.buffer);
  const salt = head.slice(8, 24), iter = hv.getUint32(24), chunk = hv.getUint32(28), nonce = head.slice(32, 40);
  if (iter < 100000 || iter > 10000000 || chunk < 1024 || chunk > 64 * 1024 * 1024) throw fail("broken", "Файл копии повреждён");
  const key = await deriveKey(pass, salt, iter);
  const body = blob.size - HEAD, step = chunk + 16;
  const n = Math.max(1, Math.ceil(body / step));
  const parts = [];
  for (let i = 0; i < n; i++) {
    aborted(signal);
    const ct = await blob.slice(HEAD + i * step, Math.min(blob.size, HEAD + (i + 1) * step)).arrayBuffer();
    try {
      parts.push(new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: ivOf(nonce, i), additionalData: aadOf(head, i, i === n - 1) }, key, ct)));
    } catch {
      if (i > 0) throw fail("broken", "Файл копии повреждён или обрезан");
      // Первый кусок не открылся: пароль неверный — или файл обрезан до одного куска (тогда кусок
      // открывается с другой меткой «последний»)
      const other = await subtle().decrypt({ name: "AES-GCM", iv: ivOf(nonce, 0), additionalData: aadOf(head, 0, n !== 1) }, key, ct).then(() => true, () => false);
      throw other ? fail("broken", "Файл копии повреждён или обрезан") : fail("wrong_password", "Неверный пароль копии");
    }
    onProgress?.(Math.min(body, (i + 1) * step), body);
  }
  return new Blob(parts, { type: "application/zip" });
}
