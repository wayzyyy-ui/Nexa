// Заметки (src/lib/userNotes.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortNotes, searchNotes, noteTitle, notePreview, applyEdit, isBlank, NOTE_ROWS, saveState, NOTE_TITLE_MAX, NOTE_TEXT_MAX } from "../src/lib/userNotes.js";

const n = (id, extra = {}) => ({ id, title: "", text: "", pinned: false, createdAt: 1, updatedAt: 1, ...extra });

test("закреплённые сверху, внутри — свежие первыми", () => {
  const list = [n("a", { updatedAt: 5 }), n("b", { updatedAt: 9 }), n("c", { pinned: true, updatedAt: 1 })];
  assert.deepEqual(sortNotes(list).map((x) => x.id), ["c", "b", "a"]);
});

test("поиск по заголовку и тексту, без регистра, ё = е, все слова", () => {
  const list = [n("a", { title: "Покупки", text: "молоко, хлеб" }), n("b", { title: "Ёлка", text: "Купить игрушки" }), n("c", { text: "встреча в пятницу" })];
  assert.deepEqual(searchNotes(list, "МОЛОКО").map((x) => x.id), ["a"]);
  assert.deepEqual(searchNotes(list, "елка").map((x) => x.id), ["b"]);
  assert.deepEqual(searchNotes(list, "встреча пятницу").map((x) => x.id), ["c"]);
  assert.deepEqual(searchNotes(list, "встреча субботу"), []);
  assert.equal(searchNotes(list, "   ").length, 3);
});

test("заголовок и фрагмент: без заголовка — первая строка текста", () => {
  assert.equal(noteTitle(n("a", { title: "  План " })), "План");
  assert.equal(noteTitle(n("a", { text: "\n Первая строка\nвторая" })), "Первая строка");
  assert.equal(noteTitle(n("a")), "Без названия");
  assert.equal(notePreview(n("a", { text: "Первая\nвторая  строка\n\nтретья" })), "вторая строка третья");
  assert.equal(notePreview(n("a", { title: "Т", text: "раз\nдва" })), "раз два");
  assert.ok(notePreview(n("a", { title: "Т", text: "я".repeat(500) })).length <= 140);
});

test("правка: новое время, лимиты, без изменений — тот же список", () => {
  const list = [n("a", { title: "x" })];
  assert.equal(applyEdit(list, "a", { title: "x" }, 50), list);
  const e = applyEdit(list, "a", { title: "y".repeat(500), text: "т".repeat(NOTE_TEXT_MAX + 10), pinned: 1 }, 50)[0];
  assert.equal(e.title.length, NOTE_TITLE_MAX); assert.equal(e.text.length, NOTE_TEXT_MAX);
  assert.equal(e.pinned, true); assert.equal(e.updatedAt, 50);
  const added = applyEdit(list, "new", { text: "привет" }, 70);
  assert.equal(added.length, 2); assert.equal(added[0].id, "new"); assert.equal(added[0].createdAt, 70);
  assert.ok(isBlank(n("z", { title: "  ", text: "\n" }))); assert.ok(!isBlank(n("z", { text: "a" })));
});

test("конфликт: текст обеих версий сохраняется", () => {
  const l = n("a", { title: "Список", text: "здесь", updatedAt: 10 });
  const c = n("a", { title: "Список", text: "там", updatedAt: 20 });
  const r = NOTE_ROWS.resolve(l, c);
  assert.ok(r.text.startsWith("там")); assert.ok(r.text.includes("здесь")); assert.ok(r.updatedAt > 20);
  // различались только закреплением — ничего не дописываем, берётся новее
  assert.equal(NOTE_ROWS.resolve(n("a", { pinned: true }), n("a")), null);
});

test("строка базы ↔ заметка", () => {
  const row = NOTE_ROWS.toRow(n("a", { title: "T", text: "x", pinned: true, createdAt: Date.parse("2026-10-22T10:00:00Z") }));
  assert.deepEqual(row, { id: "a", title: "T", text: "x", pinned: true, created_at: "2026-10-22T10:00:00.000Z" });
  const back = NOTE_ROWS.fromRow({ ...row, updated_at: "2026-10-22T11:00:00Z" });
  assert.equal(back.updatedAt, Date.parse("2026-10-22T11:00:00Z")); assert.equal(back.pinned, true);
});

test("подпись «сохранено» — только правда", () => {
  assert.equal(saveState({ dirty: true, uid: "u" }).kind, "saving");
  assert.equal(saveState({ localFailed: true, uid: "u" }).retry, "local");
  assert.equal(saveState({ uid: null }).text, "Сохранено на этом устройстве");
  assert.equal(saveState({ uid: "u", online: false, sync: { pending: 1 } }).kind, "offline");
  assert.equal(saveState({ uid: "u", online: true, sync: { pending: 2 } }).kind, "saving");
  assert.equal(saveState({ uid: "u", online: true, sync: { loading: true, pending: 0 } }).kind, "saving");
  assert.equal(saveState({ uid: "u", online: true, sync: { error: {}, text: "Нет связи" } }).retry, "cloud");
  assert.equal(saveState({ uid: "u", online: true, sync: { localOnly: true } }).kind, "local");
  assert.equal(saveState({ uid: "u", online: true, sync: { ok: true, pending: 0 } }).kind, "cloud");
});
