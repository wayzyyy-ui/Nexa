import test from "node:test";
import assert from "node:assert/strict";
import { clipDefaultName, clipFinalName, clipStamp } from "../src/lib/clipFile.js";

// native.js тянет Capacitor — для чистых правил он не нужен, но импорт должен пройти
test("имя по умолчанию", () => {
  const d = new Date(2026, 9, 23, 14, 5);
  assert.equal(clipStamp(d), "2026-10-23 14-05");
  assert.equal(clipDefaultName("text", d), "Буфер обмена 2026-10-23 14-05.txt");
  assert.equal(clipDefaultName("image", d), "Буфер обмена 2026-10-23 14-05.png");
});
test("итоговое имя", () => {
  assert.equal(clipFinalName("заметка", "text"), "заметка.txt");
  assert.equal(clipFinalName("план.md", "text"), "план.md");
  assert.equal(clipFinalName("a/b:c", "text"), "a b c.txt");
  assert.equal(clipFinalName("   ", "text"), null);
  assert.equal(clipFinalName("фото.doc", "image", "image/png"), "фото.png");
  assert.equal(clipFinalName("фото", "image", "image/jpeg"), "фото.jpg");
});
