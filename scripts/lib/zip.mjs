/* Простейший zip без сторонних библиотек: собрать архив из папки и прочитать его оглавление.
   Нужен для обновления веб-части (OTA). Пути внутри — только с «/» (архив из Проводника /
   Compress-Archive Windows PowerShell пишет «\» — Android такой архив разложит неправильно). */
import { deflateRawSync, inflateRawSync, crc32 } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Все файлы папки: [{ name: "assets/index.js", data: Buffer }]; skip(name) — что не класть
export function filesOf(dir, skip = () => false) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      const full = join(d, e);
      const name = relative(dir, full).split(sep).join("/");
      if (skip(name)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ name, data: readFileSync(full) });
    }
  };
  walk(dir);
  return out;
}

// Время в формате DOS — постоянное, чтобы один и тот же код давал один и тот же архив
const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1; // 1980-01-01 00:00

export function makeZip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const packed = deflateRawSync(f.data, { level: 9 });
    const useDeflate = packed.length < f.data.length;
    const body = useDeflate ? packed : f.data;
    const crc = crc32(f.data) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); // UTF-8 имена
    h.writeUInt16LE(useDeflate ? 8 : 0, 8); h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(f.data.length, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(useDeflate ? 8 : 0, 10); c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// Оглавление и содержимое архива (для проверки перед выпуском): [{ name, size, data }]
export function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error("это не zip: нет оглавления");
  const count = buf.readUInt16LE(endAt + 10), cdAt = buf.readUInt32LE(endAt + 16);
  const out = [];
  let p = cdAt;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("оглавление zip повреждено");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24), crc = buf.readUInt32LE(p + 16);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lstart = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(lstart, lstart + csize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    if (!data) throw new Error(`неизвестное сжатие у ${name}`);
    if (data.length !== size || (crc32(data) >>> 0) !== crc) throw new Error(`файл ${name} в архиве повреждён`);
    out.push({ name, size, data });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
