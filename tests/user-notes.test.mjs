// Заметки (src/lib/userNotes.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortNotes, searchNotes, noteTitle, notePreview, applyEdit, isBlank, NOTE_ROWS, saveState, NOTE_TITLE_MAX, NOTE_TEXT_MAX,
  cleanTags, allTags, filterNotes, mergeVersions, checklistStats, toggleCheckAt, continueChecklist, toggleChecklistLines, NOTE_TAGS_MAX, CONFLICT_MARK } from "../src/lib/userNotes.js";

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
  assert.deepEqual(row, { id: "a", title: "T", text: "x", pinned: true, tags: [], archived: false, images: [], created_at: "2026-10-22T10:00:00.000Z" });
  // колонок tags / archived в базе ещё нет — полей нет совсем (NexaApp оставит то, что было на устройстве)
  const old = NOTE_ROWS.fromRow({ id: "a", title: "T", text: "x", pinned: false });
  assert.ok(!("tags" in old) && !("archived" in old));
  assert.deepEqual(NOTE_ROWS.fromRow({ ...row, tags: ["#Дом", "дом"], archived: true }).tags, ["Дом"]);
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

test("теги: без #, без повторов, лимиты; поиск и фильтр по тегу", () => {
  assert.deepEqual(cleanTags(["#Работа", "работа", "  ", "дом, сад", "я".repeat(50)]), ["Работа", "дом сад", "я".repeat(30)]);
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `т${i}`)).length, NOTE_TAGS_MAX);
  const list = [n("a", { tags: ["Дом"] }), n("b", { tags: ["дом", "работа"] }), n("c", { tags: ["работа"], archived: true })];
  assert.deepEqual(allTags(list), [{ tag: "Дом", count: 2 }, { tag: "работа", count: 1 }]);
  assert.deepEqual(filterNotes(list, { tag: "ДОМ" }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(filterNotes(list, { view: "archive" }).map((x) => x.id), ["c"]);
  assert.deepEqual(filterNotes(list).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(searchNotes(list, "#работа").map((x) => x.id), ["b", "c"]);
  const e = applyEdit(list, "a", { tags: ["#x", "X"], archived: 1 }, 9)[0];
  assert.deepEqual(e.tags, ["x"]); assert.equal(e.archived, true);
  assert.equal(applyEdit(list, "a", { tags: ["Дом"] }), list); // те же теги — без изменений
});

test("конфликт в редакторе: обе версии и теги вместе", () => {
  const m = mergeVersions({ title: "Т", text: "моё", tags: ["a"] }, { title: "Т", text: "чужое", tags: ["b", "a"] });
  assert.equal(m.text, `моё\n\n${CONFLICT_MARK}\nчужое`); assert.deepEqual(m.tags, ["a", "b"]);
  assert.equal(mergeVersions({ title: "Т", text: "x", tags: [] }, { title: "Т", text: "x", tags: [] }).text, "x");
  // различались только тегами — не «только закрепление»: решает resolve
  assert.deepEqual(NOTE_ROWS.resolve(n("a", { tags: ["x"], updatedAt: 1 }), n("a", { tags: ["y"], updatedAt: 2 })).tags, ["y", "x"]);
});

test("чек-листы: счёт, отметка нажатием, Enter, кнопка", () => {
  assert.deepEqual(checklistStats("☐ хлеб\n☑ молоко\nпросто текст\n  ☑ сыр"), { done: 2, total: 3 });
  assert.equal(toggleCheckAt("☐ хлеб", 0), "☑ хлеб");
  assert.equal(toggleCheckAt("☐ хлеб", 1), "☑ хлеб");
  assert.equal(toggleCheckAt("☐ хлеб", 4), null); // в середине слова — обычный курсор
  assert.equal(toggleCheckAt("а\n☑ б", 2), "а\n☐ б");
  assert.deepEqual(continueChecklist("☐ хлеб", 6), { text: "☐ хлеб\n☐ ", pos: 9 });
  assert.deepEqual(continueChecklist("☐ хлеб\n☐ ", 9), { text: "☐ хлеб\n", pos: 7 }); // пустой пункт — конец списка
  assert.equal(continueChecklist("текст", 5), null);
  assert.deepEqual(toggleChecklistLines("а\nб", 0, 3), { text: "☐ а\n☐ б", pos: 7 });
  assert.equal(toggleChecklistLines("☐ а\n☑ б", 0, 7).text, "а\nб");
});

test("виджет: одна закреплённая заметка, без архива; текст без лишних пустых строк", async () => {
  const { widgetNote, WIDGET_LINES } = await import("../src/lib/userNotes.js");
  assert.deepEqual(widgetNote([n("a", { text: "x" })]), { state: "empty" });
  assert.deepEqual(widgetNote([n("a", { pinned: true, text: "x" })], { signedOut: true }), { state: "signedOut" });
  assert.equal(widgetNote([n("a", { pinned: true, archived: true, text: "x" })]).state, "empty");
  const list = [n("old", { pinned: true, title: "Старая", updatedAt: 1 }), n("new", { pinned: true, title: "Новая", text: "\n\nраз\n\n\n\nдва  \n\n", updatedAt: 5 }), n("free", { title: "Не закреплена", updatedAt: 9 })];
  const w = widgetNote(list);
  assert.equal(w.id, "new"); assert.equal(w.title, "Новая"); assert.equal(w.text, "раз\n\nдва"); assert.equal(w.updatedAt, 5);
  // без заголовка: первая строка — заголовок, в тексте не повторяется
  assert.deepEqual([widgetNote([n("a", { pinned: true, text: "Покупки\n☐ хлеб\n☑ сыр" })])].map((x) => [x.title, x.text, x.check])[0], ["Покупки", "☐ хлеб\n☑ сыр", "☑ 1 из 2"]);
  // длинный текст режется
  const long = widgetNote([n("a", { pinned: true, title: "Т", text: Array.from({ length: 40 }, (_, i) => `строка ${i}`).join("\n") })]);
  assert.equal(long.text.split("\n").length, WIDGET_LINES); assert.ok(long.text.endsWith("…"));
  assert.ok(widgetNote([n("a", { pinned: true, title: "Т", text: "я".repeat(5000) })]).text.length <= 601);
});

test("виджет: скрытие текста и секреты", async () => {
  const { widgetNote } = await import("../src/lib/userNotes.js");
  const h = widgetNote([n("a", { pinned: true, title: "Дневник", text: "личное" })], { hide: true });
  assert.deepEqual([h.state, h.hidden, h.title, h.text, h.check], ["note", "hide", "", "", ""]);
  const s = widgetNote([n("a", { pinned: true, title: "Почта", text: "логин: ivan\npassword: hunter2" })]);
  assert.deepEqual([s.hidden, s.title, s.text], ["secret", "", ""]);
  const s2 = widgetNote([n("a", { pinned: true, title: "Wi-Fi", text: "дома\nKx8Lm29pQzT" })]);
  assert.equal(s2.hidden, "secret");
  assert.equal(widgetNote([n("a", { pinned: true, title: "Покупки", text: "молоко" })]).hidden, "");
});
