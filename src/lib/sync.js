/* Синхронизация данных аккаунта с Supabase (устройства и чаты).

   Как это устроено:
   - Данные всегда живут локально (localStorage, ключи с id пользователя) —
     интерфейс работает с ними как раньше, даже без интернета.
   - Вошли и есть связь: при запуске берём список из облака и сводим
     с локальным (merge), потом каждое изменение через ~1 с отправляем в облако.
   - Спор «что новее» решает последняя запись: у кого updated_at больше.
   - Нет связи: работаем локально, изменения не теряются — при следующей
     удачной сводке они уйдут в облако.
   Таблицы описаны в supabase/sync-tables.sql. */
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";

export const SAVE_DELAY_MS = 1000; // пауза после последнего изменения перед отправкой

// Новый id в формате uuid — такой же, как в таблицах Supabase
export const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

const toIso = (ms) => new Date(ms || Date.now()).toISOString();
const toMs = (iso) => (iso ? new Date(iso).getTime() : 0);

/* ─── Заметки о синхронизации (в localStorage, у каждого аккаунта свои) ───
   synced  — id строк, которые точно есть в облаке (если их там больше нет —
             значит, удалили на другом устройстве);
   deleted — id, удалённые здесь, но ещё не удалённые в облаке (нет связи);
   ver     — какие версии облако подтвердило: id → [updatedAt здесь, updated_at в облаке].
             По ним видно, что изменили здесь и что — на другом устройстве (конфликт),
             и сколько изменений ещё ждут отправки — даже после перезапуска без сети */
const metaKey = (uid) => `nexa-sync@${uid}`;
function readMeta(uid, table) {
  try {
    const m = JSON.parse(localStorage.getItem(metaKey(uid)))?.[table];
    return { synced: m?.synced || [], deleted: m?.deleted || [], ver: m?.ver || {} };
  } catch { return { synced: [], deleted: [], ver: {} }; }
}
// Сколько изменений ещё не подтверждено облаком: новые и изменённые строки + удаления.
// Строка без заметки о версии, но из облака (старые заметки) — считаем сохранённой
export function pendingCount(list, meta) {
  const synced = new Set(meta.synced);
  const changed = list.filter((i) => { const v = meta.ver[i.id]; return v ? v[0] !== i.updatedAt : !synced.has(i.id); });
  return changed.length + meta.deleted.length;
}
function writeMeta(uid, table, meta) {
  try {
    const all = JSON.parse(localStorage.getItem(metaKey(uid)) || "{}");
    all[table] = meta;
    localStorage.setItem(metaKey(uid), JSON.stringify(all));
  } catch {}
}
export const clearMeta = (uid) => { try { localStorage.removeItem(metaKey(uid)); } catch {} };

/* ─── Запросы к Supabase ─── */
async function fetchRows(table) {
  // Свои повторы клиента выключены: паузы и число попыток решает useCloudList (RETRY_DELAYS_MS),
  // иначе попытки перемножаются (4 наших × 4 клиента)
  const { data, error } = await supabase.from(table).select("*").order("created_at").retry(false);
  if (error) throw error;
  return data || [];
}
/* Необязательные колонки: появляются после ручной миграции (например,
   chats.pinned — supabase/chats-pinned.sql). Пока миграцию не запустили,
   облако отвечает «нет такой колонки» — тогда шлём строки без неё
   (до перезапуска приложения), а значение живёт только в браузере. */
const OPTIONAL_COLUMNS = { chats: ["pinned"] };
const missingColumns = new Set(); // "chats.pinned" — колонки в базе нет
const withoutMissing = (table, rows) => {
  const drop = (OPTIONAL_COLUMNS[table] || []).filter((c) => missingColumns.has(`${table}.${c}`));
  if (!drop.length) return rows;
  return rows.map((r) => { const o = { ...r }; drop.forEach((c) => delete o[c]); return o; });
};
// Ошибка «не найдена колонка X» — какую из необязательных колонок она называет
const missingOptional = (table, e) => {
  const msg = String(e?.message || "");
  if (String(e?.code) !== "PGRST204" && !/column/i.test(msg)) return null;
  return (OPTIONAL_COLUMNS[table] || []).find((c) => msg.includes(`'${c}'`) || msg.includes(`"${c}"`)) || null;
};

/* Закреплённые здесь, пока колонки pinned в базе не было (только id, без текста).
   После миграции облако отдаст по ним pinned = false — по этому списку
   приложение вернёт закрепление и отправит его в облако (см. NexaApp) */
const LOCAL_PINS_KEY = "nexa-pins-local";
const readLocalPins = () => { try { return JSON.parse(localStorage.getItem(LOCAL_PINS_KEY)) || []; } catch { return []; } };
const writeLocalPins = (ids) => { try { ids.length ? localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(ids)) : localStorage.removeItem(LOCAL_PINS_KEY); } catch {} };
export const isLocalPin = (id) => readLocalPins().includes(id);
function noteLocalPins(rows, sentWithColumn) {
  const pins = new Set(readLocalPins());
  if (!pins.size && sentWithColumn) return;
  for (const r of rows) {
    // Ушло в облако вместе с pinned — облако знает правду, помнить больше не нужно
    if (sentWithColumn || !r.pinned) pins.delete(r.id);
    else pins.add(r.id);
  }
  writeLocalPins([...pins]);
}

// Отправить строки и удаления. Возвращает Map id → updated_at из облака (мс):
// облако само ставит это время, по нему потом видно, меняли ли строку на другом устройстве.
// Upsert по id — повторная отправка той же строки не создаёт дубля
async function pushRows(table, upserts, deletes) {
  const confirmed = new Map();
  if (upserts.length) {
    const send = () => supabase.from(table).upsert(withoutMissing(table, upserts)).select("id, updated_at");
    let { data, error } = await send();
    const col = error && missingOptional(table, error);
    if (col) {
      missingColumns.add(`${table}.${col}`);
      ({ data, error } = await send());
    }
    if (error) throw error;
    (data || []).forEach((r) => confirmed.set(r.id, toMs(r.updated_at)));
    if (table === "chats") noteLocalPins(upserts, !missingColumns.has("chats.pinned"));
  }
  if (deletes.length) {
    const { error } = await supabase.from(table).delete().in("id", deletes);
    if (error) throw error;
  }
  return confirmed;
}
// «Удалить мои данные»: все устройства и чаты этого пользователя
export async function deleteAllMine(uid) {
  // Сначала содержимое файлов в хранилище (папка <id аккаунта>/), потом записи
  await removeAllStorage(uid);
  for (const table of ["devices", "chats", "files", "file_folders", "schedule", "push_tokens", "memory"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", uid);
    // Таблиц файлов, расписания и push-адресов может ещё не быть (не запущены
    // files-storage.sql, schedule.sql, push-tokens.sql, memory.sql) — это не ошибка
    if (error && !((table.startsWith("file") || table === "schedule" || table === "push_tokens" || table === "memory") && isMissingTable(error))) throw error;
  }
  clearMeta(uid);
}
export const isMissingTable = (e) => ["42P01", "PGRST205"].includes(String(e?.code)) || /does not exist|could not find the table/i.test(String(e?.message));
// Все объекты аккаунта в корзине файлов — пачками по 100
async function removeAllStorage(uid) {
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.storage.from("nexa-files").list(uid, { limit: 100 });
    if (error || !data?.length) return; // корзины ещё нет или пусто
    const { error: rmErr } = await supabase.storage.from("nexa-files").remove(data.map((o) => `${uid}/${o.name}`));
    if (rmErr) throw rmErr;
  }
}

/* По времени сообщений (at) история делится на «Сегодня», «Вчера»…
   У старых диалогов времени в сообщениях нет, и в облаке updated_at
   станет «сейчас» при любой отправке (например, при переносе гостевых
   диалогов) — диалог переехал бы в «Сегодня». Поэтому перед отправкой
   последнему сообщению без времени ставим время прежнего изменения диалога */
function withLastAt(c) {
  const msgs = c.messages || [];
  if (!msgs.length || msgs.some((m) => m?.at)) return msgs;
  const at = c.updatedAt || c.createdAt || Date.now();
  return msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, at } : m));
}

/* ─── Как строки таблиц выглядят в приложении ───
   Элемент списка: { id, createdAt, updatedAt, ...поля } — время в миллисекундах */
/* Расписание (таблица schedule, supabase/schedule.sql). В приложении поле даты
   называется date, в базе — day (слово date в SQL служебное) */
export const SCHEDULE_ROWS = {
  toRow: (it) => ({ id: it.id, day: it.date, time: it.time, title: it.title || "", place: it.place || "", created_at: toIso(it.createdAt) }),
  fromRow: (r) => ({ id: r.id, date: r.day, time: r.time, title: r.title, place: r.place || "", createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  sort: (list) => [...list].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || "")),
};

export const CHAT_ROWS = {
  // pinned — «Закреплено». Шлём всегда целиком (true/false), поэтому значение
  // в облаке не затирается; без колонки в базе см. OPTIONAL_COLUMNS выше
  toRow: (c) => ({ id: c.id, title: c.title || "", messages: withLastAt(c), pinned: !!c.pinned, created_at: toIso(c.createdAt) }),
  fromRow: (r) => ({
    id: r.id, title: r.title || "", messages: r.messages || [], createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at),
    // Колонки ещё нет — поля нет вовсе: приложение оставит закрепление из браузера
    ...(r.pinned === undefined ? {} : { pinned: !!r.pinned }),
  }),
  // Новые диалоги сверху
  sort: (list) => [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  label: (c) => c.title || "Диалог",
  /* Конфликт: диалог дописали и здесь, и на другом устройстве (например, оба без сети).
     Ничего не теряем: объединяем сообщения обеих версий без повторов, по времени */
  resolve: (l, c) => {
    const key = (m) => `${m?.role}|${m?.at || ""}|${m?.text}`;
    const seen = new Set(), all = [];
    for (const m of [...(c.messages || []), ...(l.messages || [])]) {
      const k = key(m);
      if (!seen.has(k)) { seen.add(k); all.push(m); }
    }
    if (all.every((m) => m?.at)) all.sort((a, b) => a.at - b.at);
    return { ...c, ...l, messages: all, updatedAt: Date.now() };
  },
};
export const DEVICE_ROWS = {
  toRow: (d) => ({ id: d.id, name: d.name, type: d.type, state: d.state || {}, created_at: toIso(d.createdAt) }),
  fromRow: (r) => ({ id: r.id, name: r.name, type: r.type, state: r.state || {}, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  // В порядке добавления
  sort: (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
  label: (d) => d.name || "Устройство",
};
SCHEDULE_ROWS.label = (it) => `${it.time || ""} ${it.title || "Дело"}`.trim();

/* Сводим локальный список с облачным. Правила:
   - удалили здесь без связи → удаляем и в облаке (а если там за это время
     изменили — удаление отменяем и берём изменённую версию);
   - есть и там, и тут: менялось только здесь → отправляем; только там → берём облако;
     менялось в обоих местах — конфликт: resolve (диалоги — объединяем сообщения)
     или более новая версия;
   - есть только тут: новое → отправляем; уже было в облаке, а теперь нет →
     удалили на другом устройстве: убираем и тут, если здесь не меняли
     (меняли — оставляем и отправляем снова).
   Без заметки о версии (старые данные) — как раньше: кто новее, тот и прав.
   conflicts — что решили сами, чтобы честно сказать об этом человеку */
export function mergeLists(local, cloud, meta, resolve) {
  const deleted = new Set(meta.deleted), synced = new Set(meta.synced), ver = meta.ver || {};
  const localById = new Map(local.map((i) => [i.id, i]));
  const cloudIds = new Set(cloud.map((c) => c.id));
  const result = [], upserts = [], deletes = [], conflicts = [];
  // true / false — точно знаем; null — заметки о версии нет
  const changedHere = (l) => { const v = ver[l.id]; return v ? l.updatedAt !== v[0] : null; };
  const changedThere = (c) => { const v = ver[c.id]; return v && v[1] ? c.updatedAt !== v[1] : null; };
  for (const c of cloud) {
    const l = localById.get(c.id);
    if (deleted.has(c.id)) {
      if (changedThere(c)) { result.push(c); conflicts.push({ id: c.id, kind: "deletedHere", item: c }); }
      else deletes.push(c.id);
      continue;
    }
    if (!l) { result.push(c); continue; }
    const here = changedHere(l), there = changedThere(c);
    if (here && there) {
      const merged = resolve ? resolve(l, c) : null;
      const pick = merged || ((l.updatedAt || 0) >= (c.updatedAt || 0) ? l : c);
      conflicts.push({ id: c.id, kind: merged ? "merged" : pick === l ? "keptHere" : "keptThere", item: pick });
      result.push(pick);
      if (pick !== c) upserts.push(pick);
    } else if (here || (here === null && (l.updatedAt || 0) > (c.updatedAt || 0))) {
      result.push(l); upserts.push(l);
    } else result.push(c);
  }
  for (const l of local) {
    if (cloudIds.has(l.id)) continue;
    if (synced.has(l.id)) {
      if (changedHere(l)) { result.push(l); upserts.push(l); conflicts.push({ id: l.id, kind: "deletedThere", item: l }); }
      continue;
    }
    result.push(l); upserts.push(l);
  }
  return { result, upserts, deletes, conflicts };
}

// Понятный текст, почему не вышло поговорить с облаком
export function syncErrorText(e) {
  const msg = String(e?.message || "").toLowerCase();
  const code = String(e?.code || "");
  if ((typeof navigator !== "undefined" && navigator.onLine === false) || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
    return "Нет связи, работаем локально";
  }
  if (code === "42P01" || code === "PGRST205" || msg.includes("could not find the table") || msg.includes("does not exist")) {
    return "Облако ещё не настроено, работаем локально";
  }
  if (code === "42501" || msg.includes("permission denied") || msg.includes("row-level security") || msg.includes("jwt")) {
    return "Нет доступа к облаку, работаем локально";
  }
  return "Не удалось сохранить в облако, работаем локально";
}
/* Что за ошибка — от этого зависит, повторять ли:
   offline — браузер знает, что сети нет: ждём события «online»;
   network / server — повторяем сами несколько раз с паузами;
   auth / setup / denied — повтор не поможет: нужен вход или настройка облака */
export function syncErrorKind(e) {
  const msg = String(e?.message || "").toLowerCase();
  const code = String(e?.code || "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) return "network";
  if (code === "42P01" || code === "PGRST205" || msg.includes("could not find the table") || msg.includes("does not exist")) return "setup";
  if (msg.includes("jwt") || code === "PGRST301" || code === "401") return "auth";
  if (code === "42501" || msg.includes("permission denied") || msg.includes("row-level security")) return "denied";
  return "server";
}
// Паузы перед повторами после сбоя: потом — только вручную или когда вернётся связь
export const RETRY_DELAYS_MS = [3000, 10000, 30000];

/* Хук синхронизации одного списка (устройства, чаты, файлы, папки, расписание).
   uid       — id вошедшего (null — гость: хук ничего не делает);
   table     — имя таблицы;
   value     — локальное состояние (то, что хранит приложение);
   setValue  — как его заменить (без лишних отметок времени);
   toList / fromList — перевод состояния в список { id, updatedAt, … } и обратно;
   rows      — CHAT_ROWS, DEVICE_ROWS…; rows.resolve — как объединить конфликт (необязательно);
   migrate   — для чатов: { prepare(local, cloudRows) → список с перенесёнными гостевыми
               диалогами или null, migrated() — отметить, что перенос сделан };
   onStatus  — состояние: { loading, pending } | { ok, pending, at } |
               { error, text, kind, pending, nextAt (когда следующий повтор) или gaveUp };
               pending — сколько изменений ещё не подтверждено облаком;
   onConflict — список решённых конфликтов [{ id, kind, item }] (сказать человеку);
   onPushed  — правки этого устройства ушли в облако (сказать остальным «обновитесь»).
               После простой сводки при входе не вызывается — иначе устройства
               гоняли бы друг другу «обновись» по кругу */
export function useCloudList({ uid, table, value, setValue, toList, fromList, rows, migrate, onStatus, onPushed, onConflict }) {
  const latest = useRef(value);
  latest.current = value;
  const ready = useRef(false);        // сводка с облаком прошла — можно отправлять изменения
  const timer = useRef(null);
  const pendingSend = useRef(null); // отправка, которая ждёт паузы SAVE_DELAY_MS (её можно запустить сразу)
  const retryTimer = useRef(null);
  const attempts = useRef(0);         // сколько повторов подряд уже было
  const lastStatus = useRef({});
  const [retry, setRetry] = useState(0);
  const status = useRef(onStatus);
  status.current = onStatus;
  const pushed = useRef(onPushed);
  pushed.current = onPushed;
  const conflicted = useRef(onConflict);
  conflicted.current = onConflict;

  // Состояние + сколько ждёт отправки (по подтверждённым облаком версиям)
  const report = (st) => {
    if (st) lastStatus.current = st;
    if (!uid) return;
    const pending = pendingCount(toList(latest.current), readMeta(uid, table));
    status.current?.({ ...lastStatus.current, pending });
  };
  // Сбой: сеть или сервер — повторяем с паузами (не больше RETRY_DELAYS_MS.length раз),
  // остальное (нет входа, нет прав, облако не настроено) — повтор не поможет
  const failed = (e) => {
    const kind = syncErrorKind(e);
    clearTimeout(retryTimer.current);
    let nextAt = null;
    if ((kind === "network" || kind === "server") && attempts.current < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[attempts.current++];
      nextAt = Date.now() + delay;
      retryTimer.current = setTimeout(() => setRetry((n) => n + 1), delay);
    }
    report({ error: e, text: syncErrorText(e), kind, nextAt, gaveUp: !nextAt && kind !== "offline" });
  };
  // Подтверждённые облаком версии: id → [updatedAt здесь, updated_at в облаке]
  const confirm = (meta, items, cloudTimes) => {
    const ver = { ...meta.ver };
    for (const i of items) ver[i.id] = [i.updatedAt, cloudTimes.get(i.id) ?? null]; // нет времени облака — сравним по-старому
    return ver;
  };

  // Связь вернулась — сводим заново (заодно уйдёт всё, что накопилось без сети)
  useEffect(() => {
    const again = () => { attempts.current = 0; setRetry((n) => n + 1); };
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, []);

  // При входе, после восстановления связи и при повторе: берём облако и сводим с локальным
  useEffect(() => {
    ready.current = false;
    clearTimeout(retryTimer.current);
    if (!uid || !supabase) return;
    let cancelled = false;
    report({ loading: true });
    (async () => {
      try {
        // Браузер уже знает, что сети нет, — не ждём, сразу работаем локально
        if (navigator.onLine === false) throw new Error("network: offline");
        const cloudRows = await fetchRows(table);
        if (cancelled) return;
        const orig = toList(latest.current);
        let local = orig;
        // Старые локальные id (не uuid) облако не примет — выдаём новые
        local = local.map((i) => (isUuid(i.id) ? i : { ...i, id: newId(), updatedAt: Date.now() }));
        const moved = migrate?.prepare(local, cloudRows);
        if (moved) local = moved;
        const meta = readMeta(uid, table);
        const cloudList = cloudRows.map(rows.fromRow);
        const { result, upserts, deletes, conflicts } = mergeLists(local, cloudList, meta, rows.resolve);
        const times = await pushRows(table, upserts.map(rows.toRow), deletes);
        if (cancelled) return;
        if (moved) migrate.migrated();
        const sorted = rows.sort(result);
        // Версии: взятое из облака — как есть, отправленное — с временем, которое поставило облако
        const sent = new Set(upserts.map((i) => i.id));
        const ver = {};
        for (const i of sorted) {
          if (sent.has(i.id)) ver[i.id] = [i.updatedAt, times.get(i.id) ?? null];
          else ver[i.id] = [i.updatedAt, i.updatedAt];
        }
        writeMeta(uid, table, { synced: sorted.map((i) => i.id), deleted: [], ver });
        ready.current = true;
        attempts.current = 0;
        /* Пока шла сводка (запросы к облаку — это время), человек мог добавить,
           изменить или удалить что-то здесь. Такие правки не затираем: новое и
           изменённое оставляем (уйдёт следующей отправкой), удалённое не возвращаем.
           Функцией: в одном хранилище бывают два списка (файлы и папки) —
           берём самое свежее состояние, чтобы не затереть соседний список */
        const before = new Map(orig.map((i) => [i.id, i.updatedAt]));
        const keepEdits = (cur) => {
          const now = toList(cur), byId = new Map(sorted.map((i) => [i.id, i]));
          const nowIds = new Set(now.map((i) => i.id));
          for (const i of now) {
            if (!before.has(i.id) && !byId.has(i.id)) byId.set(i.id, i);           // появилось во время сводки
            else if (before.has(i.id) && before.get(i.id) !== i.updatedAt) byId.set(i.id, i); // изменили во время сводки
          }
          for (const id of before.keys()) if (isUuid(id) && !nowIds.has(id)) byId.delete(id); // удалили во время сводки
          return fromList(rows.sort([...byId.values()]), cur);
        };
        setValue((prev) => keepEdits(prev));
        latest.current = keepEdits(latest.current);
        report({ ok: true, at: Date.now() });
        if (conflicts.length) conflicted.current?.(conflicts);
        // Что-то из этого устройства ушло (накопилось без сети) — пусть остальные перечитают
        if (upserts.length || deletes.length) pushed.current?.();
      } catch (e) {
        if (!cancelled) failed(e);
      }
    })();
    return () => { cancelled = true; };
  }, [uid, retry]);

  // Изменения: удалённое запоминаем сразу (чтобы удалить в облаке даже после
  // перезагрузки без сети), отправку делаем через секунду после последней правки
  useEffect(() => {
    if (!uid || !supabase) return;
    const ids = new Set(toList(value).map((i) => i.id));
    const meta = readMeta(uid, table);
    const gone = meta.synced.filter((id) => !ids.has(id));
    if (gone.length) {
      writeMeta(uid, table, {
        ...meta,
        synced: meta.synced.filter((id) => ids.has(id)),
        deleted: [...new Set([...meta.deleted, ...gone])],
      });
    }
    report();
    if (!ready.current) return;
    clearTimeout(timer.current);
    const send = async () => {
      pendingSend.current = null;
      const list = toList(latest.current);
      const m0 = readMeta(uid, table);
      // Ждёт отправки: версия не совпадает с подтверждённой облаком; удаления — из заметок
      const upserts = list.filter((i) => { const v = m0.ver[i.id]; return v ? v[0] !== i.updatedAt : !m0.synced.includes(i.id); });
      const deletes = m0.deleted;
      if (!upserts.length && !deletes.length) return;
      try {
        if (navigator.onLine === false) throw new Error("network: offline");
        const times = await pushRows(table, upserts.map(rows.toRow), deletes);
        const m = readMeta(uid, table);
        const ver = confirm(m, upserts, times);
        deletes.forEach((id) => delete ver[id]);
        writeMeta(uid, table, {
          synced: [...new Set([...m.synced.filter((id) => !deletes.includes(id)), ...upserts.map((i) => i.id)])],
          deleted: m.deleted.filter((id) => !deletes.includes(id)),
          ver,
        });
        attempts.current = 0;
        report({ ok: true, at: Date.now() });
        pushed.current?.();
      } catch (e) {
        failed(e);
      }
    };
    pendingSend.current = send;
    timer.current = setTimeout(send, SAVE_DELAY_MS);
  }, [value, uid]);

  // NEXA уходит в фон (свернули, заблокировали экран, закрывают): не ждём паузу —
  // Android вскоре «замораживает» приложение, и отложенная отправка ушла бы только при следующем открытии
  useEffect(() => {
    const now = () => {
      if (!pendingSend.current) return;
      clearTimeout(timer.current);
      pendingSend.current();
    };
    const hidden = () => { if (document.visibilityState === "hidden") now(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", now);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", now); };
  }, []);

  // Ушли из аккаунта — неотправленное не теряется: оно в локальном списке,
  // при следующем входе сводка отправит его
  useEffect(() => () => { clearTimeout(timer.current); pendingSend.current = null; clearTimeout(retryTimer.current); }, [uid]);

  return { retry: () => { attempts.current = 0; setRetry((n) => n + 1); } };
}
