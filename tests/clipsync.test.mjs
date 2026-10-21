// Общий буфер обмена: что отправлять, защита от петли, срок жизни (src/lib/clipsync.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { clipDecision, clipHash, clipExp, clipMerge, clipPurge, clipFromRow, loadClipPrefs, CLIP_MAX } from "../src/lib/clipsync.js";

const now = 1_800_000_000_000;

test("обычный текст отправляется", () => {
  assert.deepEqual(clipDecision({ text: "Купить хлеб и молоко", now }), { send: true });
});

test("пустое и пробелы — нет", () => {
  assert.equal(clipDecision({ text: "", now }).skip, "empty");
  assert.equal(clipDecision({ text: "   \n\t", now }).skip, "empty");
  assert.equal(clipDecision({ text: null, now }).skip, "empty");
});

test("лимит 10 000 знаков", () => {
  assert.deepEqual(clipDecision({ text: "а".repeat(CLIP_MAX), now }), { send: true });
  assert.equal(clipDecision({ text: "а".repeat(CLIP_MAX + 1), now }).skip, "long");
});

test("повтор только что отправленного — нет", () => {
  const text = "Адрес: ул. Ленина, 1";
  assert.equal(clipDecision({ text, lastSent: clipHash(text), now }).skip, "same");
  assert.deepEqual(clipDecision({ text, lastSent: clipHash("другое"), now }), { send: true });
});

test("петля: полученное с другого устройства обратно не уходит, пока живо", () => {
  const text = "Встреча в 15:00";
  const got = { id: "1", text, mine: false, exp: now + 60000 };
  assert.equal(clipDecision({ text, received: [got], now }).skip, "loop");
  // запись истекла — это уже новое копирование
  assert.deepEqual(clipDecision({ text, received: [{ ...got, exp: now - 1 }], now }), { send: true });
  // своё отправленное — не «петля» (его ловит lastSent)
  assert.deepEqual(clipDecision({ text, received: [{ ...got, mine: true }], now }), { send: true });
});

test("похожее на пароль — нет", () => {
  assert.equal(clipDecision({ text: "пароль: Qw3rty!x9", now }).skip, "sensitive");
  assert.equal(clipDecision({ text: "aB3dE5fG7hJ9kL1mN3pQ5", now }).skip, "sensitive");
});

test("срок жизни: 1 / 10 / 60 минут, неизвестное — 10", () => {
  assert.equal(clipExp(1, now) - now, 60000);
  assert.equal(clipExp(60, now) - now, 3600000);
  assert.equal(clipExp(5, now) - now, 600000);
  assert.deepEqual(loadClipPrefs(null), { on: false, ttl: 10 }); // по умолчанию выключено
  assert.deepEqual(loadClipPrefs({ on: true, ttl: 60 }), { on: true, ttl: 60 });
  assert.deepEqual(loadClipPrefs({ on: "yes", ttl: 3 }), { on: false, ttl: 10 });
});

test("список: без повторов и просроченных, новые сверху", () => {
  const a = { id: "a", at: now - 2000, exp: now + 1000 }, b = { id: "b", at: now - 1000, exp: now + 1000 }, old = { id: "c", at: now - 5000, exp: now - 1 };
  assert.deepEqual(clipMerge([a, old], [b, a], now).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(clipPurge([a, old], now).map((x) => x.id), ["a"]);
});

test("строка таблицы → запись; зашифрованное и битое — пропускаем", () => {
  const row = { id: "x", text: "т", from_device: "me", from_name: "ПК", created_at: new Date(now).toISOString(), expires_at: new Date(now + 60000).toISOString(), enc: 0 };
  assert.equal(clipFromRow(row, "me").mine, true);
  assert.equal(clipFromRow({ ...row, enc: 1 }, "me"), null);
  assert.equal(clipFromRow({ ...row, expires_at: "нет" }, "me"), null);
});
