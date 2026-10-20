/* Хранение содержимого файлов NEXA.

   Сведения о файле (имя, папка, размер, путь) и сами байты хранятся отдельно:
   - сведения — в списке файлов (fileStore в NexaApp); у вошедшего он
     синхронизируется с таблицей public.files (src/lib/sync.js);
   - байты вошедшего — в закрытой корзине Supabase Storage «nexa-files»,
     путь <id аккаунта>/<id файла>. Чужую папку правила корзины не дают ни
     прочитать, ни удалить (supabase/files-storage.sql);
   - байты гостя — только в этом браузере (IndexedDB), в облако не уходят;
   - копия в IndexedDB есть и у вошедшего — чтобы превью и открытие
     работали быстрее и без интернета.
   Открыть и скачать облачный файл — по временной подписанной ссылке (1 час). */
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const BUCKET = "nexa-files";
export const FILE_MAX_MB = 50;                 // такой же лимит стоит у корзины
const CACHE_MAX_BYTES = 25 * 1024 * 1024;      // в IndexedDB кладём файлы до 25 МБ
const SIGNED_TTL_S = 3600;                     // подписанная ссылка живёт час

/* ─── Проверки ─── */
// Опасное для браузера не принимаем: страницы, скрипты, программы
const BLOCKED_EXT = ["html", "htm", "xhtml", "js", "mjs", "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "jar", "apk", "dll"];
export function fileProblem(file) {
  const ext = (String(file.name).split(".").pop() || "").toLowerCase();
  if (file.size === 0) return "Файл пустой";
  if (file.size > FILE_MAX_MB * 1024 * 1024) return `Слишком большой — до ${FILE_MAX_MB} МБ`;
  if (BLOCKED_EXT.includes(ext) || /^(text\/html|application\/(x-)?(javascript|msdownload|x-msdos-program))/.test(file.type)) return "Такие файлы загружать нельзя";
  return null;
}
// Имя для показа: без управляющих символов и слэшей, не длиннее 120 символов.
// В пути хранилища имени нет вовсе — там только id, так что «../» ничего не сломает
export function safeFileName(name) {
  const clean = String(name || "").normalize("NFC").replace(/[\u0000-\u001f\u007f/\\]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "Без имени";
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, 120 - ext.length) + ext;
}

/* ─── IndexedDB: байты файлов в этом браузере ─── */
let dbPromise = null;
function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("nexa-files", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("blobs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null); // приватный режим и т.п. — просто без кэша
  }
  return dbPromise;
}
const tx = async (mode, fn) => {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    const t = db.transaction("blobs", mode);
    const out = fn(t.objectStore("blobs"));
    t.oncomplete = () => resolve(out?.result ?? null);
    t.onerror = t.onabort = () => resolve(null);
  });
};
// Ключ: «<id аккаунта или guest>:<id файла>»
export const cacheKey = (scope, id) => `${scope || "guest"}:${id}`;
export const cachePut = (key, blob) => (blob.size <= CACHE_MAX_BYTES ? tx("readwrite", (s) => s.put(blob, key)) : Promise.resolve(null));
export const cacheGet = (key) => tx("readonly", (s) => s.get(key));
export const cacheDel = (key) => tx("readwrite", (s) => s.delete(key));
// Стереть всё, что лежит под аккаунтом (при выходе)
export async function cacheClearScope(scope) {
  const db = await idb();
  if (!db) return;
  await new Promise((resolve) => {
    const t = db.transaction("blobs", "readwrite");
    const range = IDBKeyRange.bound(`${scope}:`, `${scope}:￿`);
    t.objectStore("blobs").delete(range);
    t.oncomplete = t.onerror = t.onabort = () => resolve();
  });
  urlCache.clear();
}

/* ─── Сколько места занято ─── */
// Лимит облачного хранилища на аккаунт — тот же, что в правиле files-storage.sql (2147483648 байт)
export const CLOUD_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
// Аккаунт: сколько занимают его файлы в корзине — считает сама база
// (nexa_storage_used: сумма размеров объектов Storage, не записей). null — не удалось
export async function cloudBytes() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("nexa_storage_used");
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}
// Гость: какие файлы реально лежат в IndexedDB этого браузера и сколько весят.
// Map id (строкой: у гостя id бывают числами) → байты, только из списка ids. null — IndexedDB недоступна
export async function localBytes(scope, ids) {
  const db = await idb();
  if (!db) return null;
  const want = new Set(ids.map(String));
  const prefix = `${scope || "guest"}:`;
  return new Promise((resolve) => {
    const sizes = new Map();
    const t = db.transaction("blobs", "readonly");
    const req = t.objectStore("blobs").openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      const id = String(c.key).slice(prefix.length);
      if (want.has(id) && typeof c.value?.size === "number") sizes.set(id, c.value.size);
      c.continue();
    };
    t.oncomplete = () => resolve(sizes);
    t.onerror = t.onabort = () => resolve(null);
  });
}

/* ─── Загрузка в облако с прогрессом и отменой ─── */
// Через XMLHttpRequest: только он сообщает, сколько уже отправлено.
// Возвращает { promise, abort }. promise → { path } или ошибка { kind, text }
export function uploadToCloud({ uid, id, file, onProgress }) {
  const xhr = new XMLHttpRequest();
  const path = `${uid}/${id}`;
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw { kind: "auth", text: "Войдите заново — сессия закончилась" };
    const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, "");
    await new Promise((resolve, reject) => {
      xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = "";
        try { msg = JSON.parse(xhr.responseText)?.message || ""; } catch {}
        const err = uploadError(xhr.status, msg);
        // База отказывает общими словами — сами сверяем, не кончилось ли место (квота 2 ГБ)
        if (err.kind !== "denied" && err.kind !== "server") return reject(err);
        cloudBytes().then((used) => reject(used != null && used + file.size > CLOUD_QUOTA_BYTES
          ? { kind: "quota", text: "Место в облаке закончилось — заняты все 2 ГБ. Удалите ненужные файлы" }
          : err));
      };
      xhr.onerror = () => reject({ kind: "network", text: "Нет связи — файл не загрузился" });
      xhr.onabort = () => reject({ kind: "abort", text: "Загрузка отменена" });
      xhr.send(file);
    });
    return { path };
  })();
  return { promise, abort: () => { try { xhr.abort(); } catch {} } };
}
function uploadError(status, msg) {
  const m = String(msg).toLowerCase();
  if (status === 413 || m.includes("size")) return { kind: "size", text: `Слишком большой — до ${FILE_MAX_MB} МБ` };
  if (m.includes("bucket not found")) return { kind: "setup", text: "Облачное хранилище ещё не настроено" };
  if (status === 401 || status === 403 || m.includes("row-level security") || m.includes("unauthorized")) {
    return { kind: "denied", text: m.includes("quota") ? "Место в облаке закончилось" : "Нет доступа к хранилищу" };
  }
  if (status === 409) return { kind: "exists", text: "Такой файл уже есть" };
  return { kind: "server", text: "Не загрузилось — попробуйте ещё раз" };
}

/* ─── Удаление из облака: не вышло (нет сети) — запоминаем и повторяем позже ─── */
const trashKey = (uid) => `nexa-files-trash@${uid}`;
const readTrash = (uid) => { try { const v = JSON.parse(localStorage.getItem(trashKey(uid))); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeTrash = (uid, list) => { try { list.length ? localStorage.setItem(trashKey(uid), JSON.stringify(list)) : localStorage.removeItem(trashKey(uid)); } catch {} };
export async function removeFromCloud(uid, paths) {
  // Только свои пути: «<uid>/…» (правила хранилища всё равно не пустят к чужим)
  const mine = paths.filter((p) => typeof p === "string" && p.startsWith(`${uid}/`));
  if (!mine.length || !supabase) return;
  writeTrash(uid, [...new Set([...readTrash(uid), ...mine])]);
  await flushTrash(uid);
}
export async function flushTrash(uid) {
  const list = readTrash(uid);
  if (!list.length || !supabase || navigator.onLine === false) return;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  if (!error) writeTrash(uid, []);
}

/* ─── Ссылка на содержимое: память → IndexedDB → облако ─── */
const urlCache = new Map(); // ключ → { url, until, local }
export async function fileUrl(file, scope, { download } = {}) {
  const key = cacheKey(scope, file.id);
  if (!download) {
    const hit = urlCache.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const blob = await cacheGet(key);
    if (blob) {
      const url = URL.createObjectURL(blob);
      urlCache.set(key, { url, until: Infinity, local: true });
      return url;
    }
  }
  if (!file.path || !supabase || !scope) return null;
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(file.path, SIGNED_TTL_S, download ? { download: safeFileName(file.name) } : undefined);
  if (error || !data?.signedUrl) return null;
  if (!download) urlCache.set(key, { url: data.signedUrl, until: Date.now() + (SIGNED_TTL_S - 60) * 1000 });
  return data.signedUrl;
}
/* Для ассистента (src/lib/attach.js): содержимое файла и подписанная ссылка на облако.
   Байты: копия в этом браузере (IndexedDB), нет — скачиваем из своей корзины.
   Ссылка — всегда настоящая облачная (на час), не ссылка на копию в браузере */
export async function fileBlob(file, scope, signal) {
  const local = await cacheGet(cacheKey(scope, file.id));
  if (local) return local;
  if (!file.path || !supabase || !scope || scope === "guest") return null;
  const url = await signedFileUrl(file);
  if (!url) return null;
  const r = await fetch(url, { signal });
  return r.ok ? r.blob() : null;
}
export async function signedFileUrl(file) {
  if (!file.path || !supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, SIGNED_TTL_S);
  return error ? null : data?.signedUrl || null;
}
// Забыть ссылку (файл удалён) — и освободить память
export function forgetUrl(scope, id) {
  const key = cacheKey(scope, id);
  const hit = urlCache.get(key);
  if (hit?.local) URL.revokeObjectURL(hit.url);
  urlCache.delete(key);
}
// Положить только что загруженный файл в кэш, чтобы превью было сразу
export function rememberLocal(scope, id, blob) {
  const key = cacheKey(scope, id);
  urlCache.set(key, { url: URL.createObjectURL(blob), until: Infinity, local: true });
  cachePut(key, blob);
}

/* Хук: ссылка на содержимое файла (или null, пока не готова / нет содержимого).
   enabled — только для настоящих файлов (у демо-файлов содержимого нет) */
export function useFileUrl(file, scope, enabled = true) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!enabled || !file) { setUrl(null); return; }
    let off = false;
    fileUrl(file, scope).then((u) => { if (!off) setUrl(u); }).catch(() => {});
    return () => { off = true; };
  }, [file?.id, file?.path, scope, enabled]);
  return url;
}

/* ─── Как строки таблиц files и file_folders выглядят в приложении ─── */
const toIso = (ms) => new Date(ms || Date.now()).toISOString();
const toMs = (iso) => (iso ? new Date(iso).getTime() : 0);
export const FILE_ROWS = {
  toRow: (f) => ({
    id: f.id, name: f.name, cat: f.cat, folder: f.folder ?? null, mime: f.mime || null,
    size_bytes: f.size ?? null, device: f.device || null, storage_path: f.path || null, created_at: toIso(f.createdAt),
  }),
  fromRow: (r) => ({
    id: r.id, name: r.name, cat: r.cat || "other", folder: r.folder ?? null, mime: r.mime || "", size: r.size_bytes ?? 0,
    device: r.device || "", path: r.storage_path || null, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at),
  }),
  sort: (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
  label: (f) => f.name || "Файл",
};
export const FOLDER_ROWS = {
  toRow: (f) => ({ id: f.id, name: f.name, parent: f.parent ?? null, created_at: toIso(f.createdAt) }),
  fromRow: (r) => ({ id: r.id, name: r.name, parent: r.parent ?? null, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  sort: (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
  label: (f) => f.name || "Папка",
};

/* ─── Очередь загрузок без сети (только вошедший) ───
   Файл, который не удалось загрузить из-за сети, ждёт здесь: сведения —
   в localStorage (nexa-upload-queue@<id>), содержимое — в IndexedDB этого
   браузера (ключ «<id аккаунта>:queue:<id файла>», при выходе стирается вместе
   с остальными копиями). Загружается снова, когда NexaApp открыт и есть сеть —
   в фоне браузер и система этого не гарантируют. id файла не меняется, поэтому
   повтор не создаёт дубль: если файл уже в облаке, хранилище ответит «уже есть» */
const queueKey = (uid) => `nexa-upload-queue@${uid}`;
const queueBlob = (uid, id) => `${uid}:queue:${id}`;
export function readUploadQueue(uid) {
  try { const v = JSON.parse(localStorage.getItem(queueKey(uid))); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeUploadQueue(uid, list) {
  try { list.length ? localStorage.setItem(queueKey(uid), JSON.stringify(list)) : localStorage.removeItem(queueKey(uid)); } catch {}
}
// Поставить в очередь: false — не получилось сохранить содержимое (нет IndexedDB / места)
export async function enqueueUpload(uid, item, blob) {
  await tx("readwrite", (st) => st.put(blob, queueBlob(uid, item.id)));
  if (!(await cacheGet(queueBlob(uid, item.id)))) return false; // проверяем, что содержимое правда сохранилось
  writeUploadQueue(uid, [...readUploadQueue(uid).filter((q) => q.id !== item.id), item]);
  return true;
}
export function patchUploadQueue(uid, id, patch) {
  writeUploadQueue(uid, readUploadQueue(uid).map((q) => (q.id === id ? { ...q, ...patch } : q)));
}
export async function dequeueUpload(uid, id) {
  writeUploadQueue(uid, readUploadQueue(uid).filter((q) => q.id !== id));
  await cacheDel(queueBlob(uid, id));
}
export const queuedBlob = (uid, id) => cacheGet(queueBlob(uid, id));
// Удалений из облака, которые ждут связи (см. removeFromCloud)
export const trashCount = (uid) => readTrash(uid).length;
