/* Заметки (раздел «Сегодня» → «Заметки»; не путать с уведомлениями — src/lib/notes.js): хранение, поиск, сортировка, подпись «сохранено» (без интерфейса — тесты tests/user-notes.test.mjs).
   Гость — только этот браузер (nexa-notes), вошедший — nexa-notes@<uid> и таблица notes
   (supabase/notes.sql, синхронизация — useCloudList, как у памяти и расписания).
   Заметка: { id (uuid), title, text, pinned, createdAt, updatedAt } — время в мс. */

export const NOTE_TITLE_MAX = 200;
export const NOTE_TEXT_MAX = 100000;
export const USER_NOTES_MAX = 1000; // столько же разрешает база (supabase/notes.sql)

export const userNotesKey = (uid) => (uid ? `nexa-notes@${uid}` : "nexa-notes");

const isNote = (n) => n && typeof n.id === "string" && typeof n.title === "string" && typeof n.text === "string";
export function loadUserNotes(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v.filter(isNote) : [];
  } catch { return []; }
}

/* Записать список сразу (а не «когда-нибудь в эффекте»): так знаем, что запись правда прошла.
   false — браузер отказал (нет места, хранилище выключено) — «Сохранено» показывать нельзя */
export function writeUserNotes(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
}

// Закреплённые сверху, внутри групп — недавно изменённые первыми
export const sortNotes = (list) => [...list].sort((a, b) => (!!b.pinned - !!a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0));

// Пустая — ни заголовка, ни текста (такую новую заметку не создаём)
export const isBlank = (n) => !String(n?.title || "").trim() && !String(n?.text || "").trim();

// Что показать вместо заголовка: заголовок, иначе первая строка текста, иначе «Без названия»
export function noteTitle(n) {
  const t = String(n?.title || "").trim();
  if (t) return t;
  const first = String(n?.text || "").split("\n").map((s) => s.trim()).find(Boolean);
  return first ? first.slice(0, 80) : "Без названия";
}
// Короткий фрагмент текста (без первой строки, если она стала заголовком)
export function notePreview(n, max = 140) {
  const lines = String(n?.text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!String(n?.title || "").trim()) lines.shift();
  const s = lines.join(" ").replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// Поиск по заголовку и тексту: без регистра, «ё» = «е», все слова запроса должны найтись
const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
export function searchNotes(list, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((n) => { const hay = norm(n.title) + "\n" + norm(n.text); return words.every((w) => hay.includes(w)); });
}

// Применить правку (заголовок / текст / закрепление) — с обрезкой по лимитам и новым временем
export function applyEdit(list, id, patch, now = Date.now()) {
  const clean = { ...patch };
  if ("title" in clean) clean.title = String(clean.title || "").slice(0, NOTE_TITLE_MAX);
  if ("text" in clean) clean.text = String(clean.text || "").slice(0, NOTE_TEXT_MAX);
  if ("pinned" in clean) clean.pinned = !!clean.pinned;
  const old = list.find((n) => n.id === id);
  if (!old) return [{ id, title: "", text: "", pinned: false, createdAt: now, ...clean, updatedAt: now }, ...list];
  const same = Object.keys(clean).every((k) => old[k] === clean[k]);
  return same ? list : list.map((n) => (n.id === id ? { ...n, ...clean, updatedAt: now } : n));
}

/* Синхронизация с таблицей notes (useCloudList).
   Конфликт — заметку меняли и здесь, и на другом устройстве, пока они не видели друг друга:
   текст не теряем — оставляем более новую версию, а другую дописываем ниже под чертой */
const toIso = (ms) => new Date(ms || Date.now()).toISOString();
const toMs = (iso) => (iso ? Date.parse(iso) || 0 : 0);
export const NOTE_ROWS = {
  toRow: (n) => ({ id: n.id, title: n.title || "", text: n.text || "", pinned: !!n.pinned, created_at: toIso(n.createdAt) }),
  fromRow: (r) => ({ id: r.id, title: r.title || "", text: r.text || "", pinned: !!r.pinned, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  sort: sortNotes,
  label: (n) => noteTitle(n).slice(0, 40),
  resolve: (l, c) => {
    if (l.title === c.title && l.text === c.text) return null; // различались только закреплением — берём новее
    const [a, b] = (l.updatedAt || 0) >= (c.updatedAt || 0) ? [l, c] : [c, l];
    const other = [b.title.trim() && b.title !== a.title ? b.title.trim() : "", b.text !== a.text ? b.text : ""].filter(Boolean).join("\n");
    const text = other ? `${a.text}\n\n— Версия с другого устройства —\n${other}`.slice(0, NOTE_TEXT_MAX) : a.text;
    return { ...a, text, pinned: !!(a.pinned || b.pinned), updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) + 1 };
  },
};

/* Подпись под редактором — только то, что правда произошло.
   dirty — есть набранное, ещё не записанное; localFailed — браузер не записал;
   sync — состояние useCloudList ({ loading, error, text, pending, localOnly }) или null у гостя */
export function saveState({ dirty, localFailed, uid, online, sync }) {
  if (localFailed) return { kind: "error", text: "Не сохранилось на этом устройстве — в браузере нет места. Скопируйте текст, чтобы не потерять", retry: "local" };
  if (dirty) return { kind: "saving", text: "Сохраняем…" };
  if (!uid) return { kind: "local", text: "Сохранено на этом устройстве" };
  if (sync?.localOnly) return { kind: "local", text: "Сохранено на этом устройстве — облако для заметок ещё не настроено" };
  if (online === false) return { kind: "offline", text: "Сохранено на устройстве — в облако уйдёт, когда появится сеть" };
  if (sync?.error) return { kind: "error", text: sync.kind === "auth" ? "Сохранено на устройстве — в облако не ушло: войдите в аккаунт заново" : "Сохранено на устройстве, в облако пока не ушло", retry: "cloud" };
  if (sync?.loading || (sync?.pending || 0) > 0) return { kind: "saving", text: "Сохранено на устройстве — отправляем в облако…" };
  return { kind: "cloud", text: "Сохранено в облаке" };
}

// «Изменено 22 окт. в 14:05» / «сегодня в 14:05»
export function noteWhen(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms), t = new Date(now);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === t.toDateString()) return `сегодня в ${hm}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
  const sameYear = d.getFullYear() === t.getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
