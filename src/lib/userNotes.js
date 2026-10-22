/* Заметки (раздел «Сегодня» → «Заметки»; не путать с уведомлениями — src/lib/notes.js): хранение, поиск, сортировка, подпись «сохранено» (без интерфейса — тесты tests/user-notes.test.mjs).
   Гость — только этот браузер (nexa-notes), вошедший — nexa-notes@<uid> и таблица notes
   (supabase/notes.sql, синхронизация — useCloudList, как у памяти и расписания).
   Заметка: { id (uuid), title, text, pinned, tags: [строки], archived, createdAt, updatedAt } — время в мс.
   tags и archived — колонки из notes.sql (повторный запуск добавит их в уже созданную таблицу);
   пока их в базе нет, облако их не хранит — они живут только на этом устройстве. */
import { isSensitive } from "./textcheck.js";

export const NOTE_TITLE_MAX = 200;
export const NOTE_TEXT_MAX = 100000;
export const USER_NOTES_MAX = 1000; // столько же разрешает база (supabase/notes.sql)
export const NOTE_TAGS_MAX = 10;   // тегов у одной заметки (база проверяет так же)
export const NOTE_TAG_LEN = 30;    // знаков в одном теге

/* Теги: без «#» и лишних пробелов, не длиннее NOTE_TAG_LEN, без повторов (без учёта регистра),
   не больше NOTE_TAGS_MAX. Порядок — как ввели */
export const cleanTag = (t) => String(t || "").replace(/^#+/, "").replace(/[\s,]+/g, " ").trim().slice(0, NOTE_TAG_LEN).trim();
export function cleanTags(list) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const t = cleanTag(raw), k = norm(t);
    if (!t || seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= NOTE_TAGS_MAX) break;
  }
  return out;
}
export const sameTags = (a, b) => (a || []).join("\n") === (b || []).join("\n");
const hasTag = (n, tag) => (n.tags || []).some((t) => norm(t) === norm(tag));

// Все теги неархивных заметок со счётчиком: [{ tag, count }] — частые первыми, потом по алфавиту
export function allTags(list) {
  const m = new Map();
  for (const n of list) {
    if (n.archived) continue;
    for (const t of n.tags || []) { const k = norm(t); const e = m.get(k); if (e) e.count++; else m.set(k, { tag: t, count: 1 }); }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ru"));
}

// Что показать в списке: view — "active" (без архива) или "archive"; tag — только с этим тегом
export function filterNotes(list, { view = "active", tag = null } = {}) {
  return list.filter((n) => (view === "archive" ? !!n.archived : !n.archived) && (!tag || hasTag(n, tag)));
}

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
function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
export function searchNotes(list, query) {
  const words = norm(query).split(/\s+/).map((w) => w.replace(/^#+/, "")).filter(Boolean);
  if (!words.length) return list;
  return list.filter((n) => { const hay = norm(n.title) + "\n" + norm(n.text) + "\n" + norm((n.tags || []).join(" ")); return words.every((w) => hay.includes(w)); });
}

// Применить правку (заголовок / текст / закрепление) — с обрезкой по лимитам и новым временем
export function applyEdit(list, id, patch, now = Date.now()) {
  const clean = { ...patch };
  if ("title" in clean) clean.title = String(clean.title || "").slice(0, NOTE_TITLE_MAX);
  if ("text" in clean) clean.text = String(clean.text || "").slice(0, NOTE_TEXT_MAX);
  if ("pinned" in clean) clean.pinned = !!clean.pinned;
  if ("archived" in clean) clean.archived = !!clean.archived;
  if ("tags" in clean) clean.tags = cleanTags(clean.tags);
  const old = list.find((n) => n.id === id);
  if (!old) return [{ id, title: "", text: "", pinned: false, tags: [], archived: false, createdAt: now, ...clean, updatedAt: now }, ...list];
  const same = Object.keys(clean).every((k) => (k === "tags" ? sameTags(old.tags, clean.tags) : old[k] === clean[k]));
  return same ? list : list.map((n) => (n.id === id ? { ...n, ...clean, updatedAt: now } : n));
}

/* Синхронизация с таблицей notes (useCloudList).
   Конфликт — заметку меняли и здесь, и на другом устройстве, пока они не видели друг друга:
   текст не теряем — оставляем более новую версию, а другую дописываем ниже под чертой */
const toIso = (ms) => new Date(ms || Date.now()).toISOString();
const toMs = (iso) => (iso ? Date.parse(iso) || 0 : 0);
export const NOTE_ROWS = {
  toRow: (n) => ({ id: n.id, title: n.title || "", text: n.text || "", pinned: !!n.pinned, tags: cleanTags(n.tags), archived: !!n.archived, created_at: toIso(n.createdAt) }),
  // tags / archived — только если колонки уже есть в базе (иначе поля нет совсем)
  fromRow: (r) => ({
    id: r.id, title: r.title || "", text: r.text || "", pinned: !!r.pinned,
    ...(r.tags === undefined ? {} : { tags: cleanTags(r.tags) }),
    ...(r.archived === undefined ? {} : { archived: !!r.archived }),
    createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at),
  }),
  sort: sortNotes,
  label: (n) => noteTitle(n).slice(0, 40),
  resolve: (l, c) => {
    if (l.title === c.title && l.text === c.text && sameTags(l.tags, c.tags)) return null; // различались только закреплением / архивом — берём новее
    const [a, b] = (l.updatedAt || 0) >= (c.updatedAt || 0) ? [l, c] : [c, l];
    return { ...mergeVersions(a, b), pinned: !!(a.pinned || b.pinned), archived: !!a.archived, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) + 1 };
  },
};

/* Две версии одной заметки в одну, без потерь: основа — a, а то, чем отличается b,
   дописываем ниже под чертой; теги — из обеих версий. Так же решает открытый редактор,
   если заметку изменили на другом устройстве, пока здесь печатали */
export const CONFLICT_MARK = "— Версия с другого устройства —";
export function mergeVersions(a, b) {
  const other = [String(b.title || "").trim() && b.title !== a.title ? b.title.trim() : "", b.text !== a.text ? b.text : ""].filter(Boolean).join("\n");
  const text = other ? `${a.text}\n\n${CONFLICT_MARK}\n${other}`.slice(0, NOTE_TEXT_MAX) : a.text;
  return { ...a, text, tags: cleanTags([...(a.tags || []), ...(b.tags || [])]) };
}

/* Чек-листы прямо в тексте, без отдельного редактора: строка «☐ дело» — пункт, «☑ дело» — сделано.
   Значок — один знак, поэтому текст остаётся обычным текстом (синхронизация, поиск и копирование
   работают как раньше). Нажатие на значок отмечает пункт, Enter в пункте начинает следующий */
export const CHECK_OPEN = "☐";
export const CHECK_DONE = "☑";
const CHECK_RE = /^(\s*)([☐☑]) ?/;
const lineAt = (text, pos) => { const start = text.lastIndexOf("\n", pos - 1) + 1; const e = text.indexOf("\n", pos); return { start, end: e < 0 ? text.length : e }; };

// Сколько пунктов и сколько сделано: { done, total } (нет пунктов — total 0)
export function checklistStats(text) {
  let done = 0, total = 0;
  for (const l of String(text || "").split("\n")) { const m = CHECK_RE.exec(l); if (m) { total++; if (m[2] === CHECK_DONE) done++; } }
  return { done, total };
}
// Курсор встал на значок пункта (нажали на него) — текст с отмеченным / снятым пунктом, иначе null
export function toggleCheckAt(text, pos) {
  const { start, end } = lineAt(text, pos);
  const m = CHECK_RE.exec(text.slice(start, end));
  if (!m) return null;
  const at = start + m[1].length; // где стоит значок
  if (pos < at || pos > at + 1) return null;
  const mark = text[at] === CHECK_DONE ? CHECK_OPEN : CHECK_DONE;
  return text.slice(0, at) + mark + text.slice(at + 1);
}
/* Enter в пункте: в непустом — новая строка с «☐ »; в пустом — убрать значок
   (как в обычных списках: второй Enter заканчивает список). Не пункт — null */
export function continueChecklist(text, pos) {
  const { start, end } = lineAt(text, pos);
  const line = text.slice(start, end);
  const m = CHECK_RE.exec(line);
  if (!m || pos < start + m[0].length) return null;
  if (!line.slice(m[0].length).trim()) return { text: text.slice(0, start) + text.slice(end), pos: start };
  const add = `\n${m[1]}${CHECK_OPEN} `;
  return { text: text.slice(0, pos) + add + text.slice(pos), pos: pos + add.length };
}
// Кнопка «Чек-лист»: строки выделения (или строка с курсором) становятся пунктами; если уже все пункты — обычными строками
export function toggleChecklistLines(text, from, to = from) {
  const s = lineAt(text, from).start, e = lineAt(text, to).end;
  const lines = text.slice(s, e).split("\n");
  const all = lines.every((l) => CHECK_RE.test(l));
  const next = lines.map((l) => (all ? l.replace(CHECK_RE, "$1") : CHECK_RE.test(l) ? l : l.replace(/^(\s*)/, `$1${CHECK_OPEN} `))).join("\n");
  return { text: text.slice(0, s) + next + text.slice(e), pos: s + next.length };
}

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

/* Виджет «NEXA · Заметки» (Android, android/…/widgets/NotesWidget.java): что ему передать.
   Только ОДНА заметка — закреплённая (из нескольких закреплённых — изменённая последней), не из архива.
   Весь список в Android не уходит. Текст — до WIDGET_LINES строк и WIDGET_CHARS знаков,
   без пустых строк по краям и без повторяющихся пустых строк.
   hide — «Скрывать текст на виджете» (Настройки): видно только, что заметка есть.
   Похожее на пароль, ключ или код (isSensitive — те же правила, что у Flow и памяти)
   не показывается никогда. signedOut — вышли из аккаунта: виджет ничего не показывает.
   Ответ: { state: "note" | "empty" | "signedOut", id, title, text, hidden: "" | "hide" | "secret", updatedAt, check } */
export const WIDGET_LINES = 14;
export const WIDGET_CHARS = 600;
export function widgetNote(list, { hide = false, signedOut = false } = {}) {
  if (signedOut) return { state: "signedOut" };
  const n = sortNotes((list || []).filter((x) => x.pinned && !x.archived))[0];
  if (!n) return { state: "empty" };
  const lines = String(n.text || "").split("\n").map((l) => l.replace(/\s+$/, ""));
  if (!String(n.title || "").trim()) { // первая непустая строка стала заголовком — в тексте её не повторяем
    const i = lines.findIndex((l) => l.trim());
    if (i >= 0) lines.splice(0, i + 1);
  }
  const body = [];
  for (const l of lines) {
    if (!l.trim() && (!body.length || !body[body.length - 1].trim())) continue; // пустые — не подряд и не в начале
    body.push(l);
  }
  while (body.length && !body[body.length - 1].trim()) body.pop();
  let text = body.slice(0, WIDGET_LINES).join("\n");
  const cut = body.length > WIDGET_LINES || text.length > WIDGET_CHARS;
  if (text.length > WIDGET_CHARS) text = text.slice(0, WIDGET_CHARS);
  if (cut) text = text.replace(/\s+$/, "") + "…";
  const secret = isSensitive(n.title) || isSensitive(n.text) || String(n.text || "").split("\n").some((l) => isSensitive(l));
  const hidden = hide ? "hide" : secret ? "secret" : "";
  const { done, total } = checklistStats(n.text);
  return {
    state: "note", id: n.id, updatedAt: n.updatedAt || n.createdAt || 0, hidden,
    title: hidden ? "" : noteTitle(n),
    text: hidden ? "" : text,
    check: !hidden && total ? `☑ ${done} из ${total}` : "",
  };
}
