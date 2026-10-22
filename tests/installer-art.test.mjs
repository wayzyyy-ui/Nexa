// Картинки установщика для ПК (scripts/lib/bitmap.mjs): PNG ↔ пиксели ↔ BMP. Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { encodePng, decodePng, encodeBmp } from "../scripts/lib/bitmap.mjs";

// Картинка 5 × 3: каждая точка своего цвета
const W = 5, H = 3;
const img = { width: W, height: H, data: Buffer.alloc(W * H * 4) };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = (y * W + x) * 4; img.data.set([x * 50, y * 80, (x + y) * 20, 255], d); }

test("PNG: записали и прочитали — те же точки", () => {
  const back = decodePng(encodePng(img));
  assert.equal(back.width, W); assert.equal(back.height, H);
  assert.deepEqual([...back.data], [...img.data]);
});

test("PNG: кусок картинки", () => {
  const part = decodePng(encodePng(img, 1, 1, 3, 2));
  assert.equal(part.width, 3); assert.equal(part.height, 2);
  assert.deepEqual([...part.data.subarray(0, 4)], [...img.data.subarray((1 * W + 1) * 4, (1 * W + 1) * 4 + 4)]);
});

test("BMP: заголовок, строки снизу вверх, выравнивание до 4 байт", () => {
  const b = encodeBmp(img);
  assert.equal(b.toString("latin1", 0, 2), "BM");
  assert.equal(b.readInt32LE(18), W); assert.equal(b.readInt32LE(22), H); assert.equal(b.readUInt16LE(28), 24);
  const row = Math.ceil((W * 3) / 4) * 4; // 16
  assert.equal(b.length, 54 + row * H);
  // первая строка файла — нижняя строка картинки; порядок цветов — B, G, R
  const s = ((H - 1) * W + 2) * 4;
  assert.deepEqual([...b.subarray(54 + 2 * 3, 54 + 2 * 3 + 3)], [img.data[s + 2], img.data[s + 1], img.data[s]]);
});

test("в git лежат картинки всех экранов и размеры для NSIS", () => {
  const dir = new URL("../desktop/src-tauri/installer/art/", import.meta.url);
  const nsh = fs.readFileSync(new URL("metrics.nsh", dir), "utf8");
  for (const name of ["header_install", "header_update", "title_welcome", "title_error", "btn_next", "btn_retry", "check_on"]) {
    assert.match(nsh, new RegExp(`!define NX_${name}_W \\d+`));
    for (const s of [100, 125, 150, 175, 200]) assert.ok(fs.existsSync(new URL(`${name}@${s}.png`, dir)), `${name}@${s}.png`);
  }
});
