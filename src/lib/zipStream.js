/* ZIP в браузере без библиотек — для резервной копии NEXA (src/lib/backup.js).
   Запись: без сжатия («stored»): фото и видео и так сжаты, а без сжатия архив собирается
   из кусков (Blob), не копируя содержимое файлов в память страницы. Контрольная сумма CRC-32
   считается по кускам по 1 МБ. Чтение: только оглавление в конце архива и нужные записи
   (File.slice) — весь архив в память не грузится. Поддерживаются «stored» и «deflate»
   (DecompressionStream), без шифрования и без ZIP64 (архив до 4 ГБ).
   Тот же модуль работает в Node (тесты tests/backup.test.mjs): Blob, TextEncoder — встроенные. */

const CHUNK = 1024 * 1024;
const MAX_ENTRIES = 20000;
const U32 = 0xffffffff;

export class ZipError extends Error {
  constructor(code, text) { super(text || code); this.code = code; }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crcUpdate = (crc, bytes) => { let c = crc; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return c; };
const abortIf = (signal) => { if (signal?.aborted) throw new ZipError("abort", "Отменено"); };

// CRC-32 содержимого Blob — кусками; onBytes(n) — сколько байт прочитано (для прогресса)
export async function crc32Blob(blob, { signal, onBytes } = {}) {
  let c = U32;
  for (let pos = 0; pos < blob.size; pos += CHUNK) {
    abortIf(signal);
    const part = new Uint8Array(await blob.slice(pos, pos + CHUNK).arrayBuffer());
    c = crcUpdate(c, part);
    onBytes?.(part.length);
  }
  return (c ^ U32) >>> 0;
}
export const crc32Bytes = (bytes) => (crcUpdate(U32, bytes) ^ U32) >>> 0;

// Дата в формате DOS (так её хранит ZIP)
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/* Запись: add(имя, Blob | строка) по очереди, потом finish() → Blob архива.
   Имена — только латиница, цифры, «/», «.», «-», «_» (их задаёт сама NEXA) */
export function createZipWriter({ date = new Date() } = {}) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const { time, date: day } = dosTime(date);
  return {
    get size() { return offset; },
    async add(name, content, { signal, onBytes } = {}) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,200}$/.test(name) || name.includes("..")) throw new ZipError("bad_name");
      const blob = typeof content === "string" ? new Blob([enc.encode(content)]) : content;
      const crc = await crc32Blob(blob, { signal, onBytes });
      const size = blob.size;
      if (size >= U32 || offset + size + 1024 >= U32) throw new ZipError("too_big", "Архив больше 4 ГБ — уберите часть файлов");
      const nameBytes = enc.encode(name);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, day, true); h.setUint32(14, crc, true);
      h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, nameBytes.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nameBytes, blob);
      central.push({ nameBytes, crc, size, offset });
      offset += 30 + nameBytes.length + size;
      if (central.length > MAX_ENTRIES) throw new ZipError("too_many");
    },
    finish() {
      const cdStart = offset;
      let cdSize = 0;
      for (const e of central) {
        const h = new DataView(new ArrayBuffer(46));
        h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true);
        h.setUint16(10, 0, true); h.setUint16(12, time, true); h.setUint16(14, day, true); h.setUint32(16, e.crc, true);
        h.setUint32(20, e.size, true); h.setUint32(24, e.size, true); h.setUint16(28, e.nameBytes.length, true);
        h.setUint32(42, e.offset, true);
        parts.push(new Uint8Array(h.buffer), e.nameBytes);
        cdSize += 46 + e.nameBytes.length;
      }
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
      end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true);
      parts.push(new Uint8Array(end.buffer));
      return new Blob(parts, { type: "application/zip" });
    },
  };
}

/* Чтение: оглавление → Map имя → запись. read(имя, { maxBytes }) → Blob содержимого,
   CRC сверяется; text(имя) — строка. Любая странность — ZipError("corrupt") */
export async function openZip(blob, { maxEntries = MAX_ENTRIES } = {}) {
  const size = blob.size;
  if (size < 22) throw new ZipError("corrupt", "Файл слишком маленький для резервной копии");
  const tailLen = Math.min(size, 22 + 65535);
  const tail = new DataView(await blob.slice(size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError("corrupt", "Это не резервная копия NEXA (не архив) или файл обрезан");
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdStart = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdStart === U32) throw new ZipError("corrupt", "Архив больше 4 ГБ не поддерживается");
  if (count > maxEntries) throw new ZipError("corrupt", "В архиве слишком много записей");
  if (cdStart + cdSize > size) throw new ZipError("corrupt", "Архив повреждён: оглавление за концом файла");
  const cd = new DataView(await blob.slice(cdStart, cdStart + cdSize).arrayBuffer());
  const dec = new TextDecoder("utf-8", { fatal: true });
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdSize || cd.getUint32(p, true) !== 0x02014b50) throw new ZipError("corrupt", "Архив повреждён: оглавление");
    const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true);
    const csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true), xlen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    if (p + 46 + nlen > cdSize) throw new ZipError("corrupt", "Архив повреждён: имя записи");
    let name;
    try { name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen)); } catch { throw new ZipError("corrupt", "Архив повреждён: имя записи"); }
    p += 46 + nlen + xlen + clen;
    if (flags & 1) throw new ZipError("encrypted", "Архив зашифрован средствами ZIP — NEXA такие не открывает");
    if (method !== 0 && method !== 8) throw new ZipError("corrupt", "Неизвестный способ сжатия в архиве");
    if (local + 30 > cdStart || local + csize > cdStart) throw new ZipError("corrupt", "Архив повреждён: запись за пределами");
    if (entries.has(name)) throw new ZipError("corrupt", "В архиве две записи с одним именем");
    entries.set(name, { name, method, crc, csize, usize, local });
  }
  // Начало данных записи: локальный заголовок у каждой своей длины
  const dataStart = async (e) => {
    const h = new DataView(await blob.slice(e.local, e.local + 30).arrayBuffer());
    if (h.getUint32(0, true) !== 0x04034b50) throw new ZipError("corrupt", "Архив повреждён: запись «" + e.name + "»");
    const start = e.local + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    if (start + e.csize > cdStart) throw new ZipError("corrupt", "Архив повреждён: запись «" + e.name + "»");
    return start;
  };
  const read = async (name, { maxBytes = Infinity, signal, onBytes } = {}) => {
    const e = entries.get(name);
    if (!e) throw new ZipError("missing", "В архиве нет записи «" + name + "»");
    if (e.usize > maxBytes) throw new ZipError("too_big", "Запись «" + name + "» больше допустимого");
    const start = await dataStart(e);
    let out = blob.slice(start, start + e.csize);
    if (e.method === 8) {
      if (typeof DecompressionStream === "undefined") throw new ZipError("corrupt", "Сжатый архив не открыть в этом браузере");
      // Распаковываем с проверкой размера: не больше заявленного (защита от «архивных бомб»)
      const reader = out.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      const chunks = []; let got = 0;
      for (;;) {
        abortIf(signal);
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > e.usize || got > maxBytes) { reader.cancel().catch(() => {}); throw new ZipError("corrupt", "Архив повреждён: запись «" + name + "» больше заявленного"); }
        chunks.push(value);
      }
      out = new Blob(chunks);
    }
    if (out.size !== e.usize) throw new ZipError("corrupt", "Архив повреждён: размер записи «" + name + "»");
    const crc = await crc32Blob(out, { signal, onBytes });
    if (crc !== e.crc) throw new ZipError("corrupt", "Архив повреждён: запись «" + name + "» не совпала с контрольной суммой");
    return out;
  };
  return { entries, read, text: async (name, opts) => new TextDecoder("utf-8", { fatal: true }).decode(await (await read(name, opts)).arrayBuffer()) };
}
