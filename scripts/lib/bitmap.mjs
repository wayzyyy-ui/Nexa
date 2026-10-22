// PNG → пиксели → BMP без сторонних библиотек (для графики установщика, scripts/installer-art.mjs).
// Читает только то, что отдаёт Chrome: 8 бит на канал, RGB или RGBA, без чересстрочности.
import zlib from "node:zlib";

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("не PNG");
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8], color = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`PNG не поддерживается: ${depth} бит, тип ${color}`);
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels, out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      if (f === 1) line[i] = (line[i] + a) & 255;
      else if (f === 2) line[i] = (line[i] + b) & 255;
      else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out }; // data — RGBA построчно сверху вниз
}

// Кусок картинки (x, y, w, h) → 24-битный BMP (строки снизу вверх, выравнивание до 4 байт)
export function encodeBmp(img, x = 0, y = 0, w = img.width, h = img.height) {
  const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h, b = Buffer.alloc(size);
  b.write("BM", 0, "latin1"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34); b.writeInt32LE(3780, 38); b.writeInt32LE(3780, 42);
  for (let yy = 0; yy < h; yy++) {
    const dst = 54 + (h - 1 - yy) * row;
    for (let xx = 0; xx < w; xx++) {
      const s = ((y + yy) * img.width + (x + xx)) * 4;
      b[dst + xx * 3] = img.data[s + 2]; b[dst + xx * 3 + 1] = img.data[s + 1]; b[dst + xx * 3 + 2] = img.data[s];
    }
  }
  return b;
}

// Кусок картинки (x, y, w, h) → PNG (RGB, фильтр «Up» по строкам — плоская графика жмётся хорошо)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
export function encodePng(img, x = 0, y = 0, w = img.width, h = img.height) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let prev = Buffer.alloc(w * 3);
  for (let yy = 0; yy < h; yy++) {
    const line = Buffer.alloc(w * 3);
    for (let xx = 0; xx < w; xx++) { const s = ((y + yy) * img.width + (x + xx)) * 4; line[xx * 3] = img.data[s]; line[xx * 3 + 1] = img.data[s + 1]; line[xx * 3 + 2] = img.data[s + 2]; }
    const o = yy * (w * 3 + 1);
    raw[o] = 2; // Up
    for (let i = 0; i < line.length; i++) raw[o + 1 + i] = (line[i] - prev[i]) & 255;
    prev = line;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Цвет точки — «#RRGGBB» (для замеров по макету)
export const pixel = (img, x, y) => { const s = (y * img.width + x) * 4; return "#" + [0, 1, 2].map((i) => img.data[s + i].toString(16).padStart(2, "0")).join("").toUpperCase(); };
