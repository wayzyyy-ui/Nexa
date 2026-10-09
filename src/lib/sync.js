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
   deleted — id, удалённые здесь, но ещё не удалённые в облаке (нет связи) */
const metaKey = (uid) => `nexa-sync@${uid}`;
function readMeta(uid, table) {
  try {
    const m = JSON.parse(localStorage.getItem(metaKey(uid)))?.[table];
    return { synced: m?.synced || [], deleted: m?.deleted || [] };
  } catch { return { synced: [], deleted: [] }; }
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
  const { data, error } = await supabase.from(table).select("*").order("created_at");
  if (error) throw error;
  return data || [];
}
async function pushRows(table, upserts, deletes) {
  if (upserts.length) {
    const { error } = await supabase.from(table).upsert(upserts);
    if (error) throw error;
  }
  if (deletes.length) {
    const { error } = await supabase.from(table).delete().in("id", deletes);
    if (error) throw error;
  }
}
// «Удалить мои данные»: все устройства и чаты этого пользователя
export async function deleteAllMine(uid) {
  for (const table of ["devices", "chats"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", uid);
    if (error) throw error;
  }
  clearMeta(uid);
}

/* ─── Как строки таблиц выглядят в приложении ───
   Элемент списка: { id, createdAt, updatedAt, ...поля } — время в миллисекундах */
export const CHAT_ROWS = {
  toRow: (c) => ({ id: c.id, title: c.title || "", messages: c.messages || [], created_at: toIso(c.createdAt) }),
  fromRow: (r) => ({ id: r.id, title: r.title || "", messages: r.messages || [], createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  // Новые диалоги сверху
  sort: (list) => [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
};
export const DEVICE_ROWS = {
  toRow: (d) => ({ id: d.id, name: d.name, type: d.type, state: d.state || {}, created_at: toIso(d.createdAt) }),
  fromRow: (r) => ({ id: r.id, name: r.name, type: r.type, state: r.state || {}, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  // В порядке добавления
  sort: (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
};

/* Сводим локальный список с облачным. Правила:
   - удалили здесь без связи → удаляем и в облаке;
   - есть и там, и тут → берём более свежую версию (updated_at);
   - есть только тут: новое → отправляем; уже было в облаке, а теперь нет →
     удалили на другом устройстве, убираем и тут */
export function mergeLists(local, cloud, meta) {
  const deleted = new Set(meta.deleted), synced = new Set(meta.synced);
  const localById = new Map(local.map((i) => [i.id, i]));
  const cloudIds = new Set(cloud.map((c) => c.id));
  const result = [], upserts = [], deletes = [];
  for (const c of cloud) {
    if (deleted.has(c.id)) { deletes.push(c.id); continue; }
    const l = localById.get(c.id);
    if (l && (l.updatedAt || 0) > (c.updatedAt || 0)) { result.push(l); upserts.push(l); }
    else result.push(c);
  }
  for (const l of local) {
    if (cloudIds.has(l.id) || synced.has(l.id)) continue;
    result.push(l); upserts.push(l);
  }
  return { result, upserts, deletes };
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

/* Хук синхронизации одного списка (устройства или чаты).
   uid       — id вошедшего (null — гость: хук ничего не делает);
   table     — "devices" или "chats";
   value     — локальное состояние (то, что хранит приложение);
   setValue  — как его заменить (без лишних отметок времени);
   toList / fromList — перевод состояния в список { id, updatedAt, … } и обратно;
   rows      — CHAT_ROWS или DEVICE_ROWS;
   migrate   — для чатов: { prepare(local, cloudRows) → список с перенесёнными гостевыми
               диалогами или null, migrated() — отметить, что перенос сделан };
   onStatus  — сообщить состояние: { loading } | { ok } | { error, text } */
export function useCloudList({ uid, table, value, setValue, toList, fromList, rows, migrate, onStatus }) {
  const latest = useRef(value);
  latest.current = value;
  const baseline = useRef(new Map()); // что уже лежит в облаке: id → updatedAt
  const ready = useRef(false);        // сводка с облаком прошла — можно отправлять изменения
  const timer = useRef(null);
  const [retry, setRetry] = useState(0);
  const status = useRef(onStatus);
  status.current = onStatus;

  // Связь вернулась — сводим заново (заодно уйдёт всё, что накопилось без сети)
  useEffect(() => {
    const again = () => setRetry((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, []);

  // При входе (и после восстановления связи): берём облако и сводим с локальным
  useEffect(() => {
    ready.current = false;
    if (!uid || !supabase) return;
    let cancelled = false;
    status.current?.({ loading: true });
    (async () => {
      try {
        // Браузер уже знает, что сети нет, — не ждём повторных попыток, сразу работаем локально
        if (navigator.onLine === false) throw new Error("network: offline");
        const cloudRows = await fetchRows(table);
        if (cancelled) return;
        let local = toList(latest.current);
        // Старые локальные id (не uuid) облако не примет — выдаём новые
        local = local.map((i) => (isUuid(i.id) ? i : { ...i, id: newId(), updatedAt: Date.now() }));
        const moved = migrate?.prepare(local, cloudRows);
        if (moved) local = moved;
        const meta = readMeta(uid, table);
        const { result, upserts, deletes } = mergeLists(local, cloudRows.map(rows.fromRow), meta);
        await pushRows(table, upserts.map(rows.toRow), deletes);
        if (cancelled) return;
        if (moved) migrate.migrated();
        const sorted = rows.sort(result);
        writeMeta(uid, table, { synced: sorted.map((i) => i.id), deleted: [] });
        baseline.current = new Map(sorted.map((i) => [i.id, i.updatedAt]));
        ready.current = true;
        setValue(fromList(sorted, latest.current));
        status.current?.({ ok: true });
      } catch (e) {
        if (!cancelled) status.current?.({ error: e, text: syncErrorText(e) });
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
        synced: meta.synced.filter((id) => ids.has(id)),
        deleted: [...new Set([...meta.deleted, ...gone])],
      });
    }
    if (!ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const list = toList(latest.current);
      const upserts = list.filter((i) => baseline.current.get(i.id) !== i.updatedAt);
      const now = new Set(list.map((i) => i.id));
      const deletes = [...baseline.current.keys()].filter((id) => !now.has(id));
      if (!upserts.length && !deletes.length) return;
      try {
        await pushRows(table, upserts.map(rows.toRow), deletes);
        upserts.forEach((i) => baseline.current.set(i.id, i.updatedAt));
        deletes.forEach((id) => baseline.current.delete(id));
        const m = readMeta(uid, table);
        writeMeta(uid, table, {
          synced: [...new Set([...m.synced.filter((id) => !deletes.includes(id)), ...upserts.map((i) => i.id)])],
          deleted: m.deleted.filter((id) => !deletes.includes(id)),
        });
        status.current?.({ ok: true });
      } catch (e) {
        status.current?.({ error: e, text: syncErrorText(e) });
      }
    }, SAVE_DELAY_MS);
  }, [value, uid]);

  // Ушли из аккаунта — неотправленное не теряется: оно в локальном списке,
  // при следующем входе сводка отправит его
  useEffect(() => () => clearTimeout(timer.current), [uid]);

  return { retry: () => setRetry((n) => n + 1) };
}
