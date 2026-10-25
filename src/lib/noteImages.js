/* Картинки в заметках (src/screens/notes/images.jsx).
   Сведения о картинке лежат в самой заметке (note.images, см. userNotes.js), а байты — так же, как у файлов:
   - копия в IndexedDB этого браузера (ключ «<аккаунт или guest>:<id>»; выход из аккаунта стирает её вместе с файлами);
   - у вошедшего ещё и в его папке облака nexa-files: путь <uid>/<id>, id картинки всегда «ni-<uuid>».
   В списке «Файлы» картинки заметок не появляются (строки в таблице files для них не заводим).
   Большое фото перед сохранением уменьшаем (длинная сторона до IMAGE_SIDE_MAX): заметка остаётся лёгкой. */
import { useEffect, useState } from "react";
import { cacheKey, cachePut, cacheGet, cacheDel, uploadToCloud, removeFromCloud, fileUrl, forgetUrl, rememberLocal } from "./files.js";
import { newId } from "./sync.js";
import { clipboardReadImage } from "../native.js";

export const IMAGE_SIDE_MAX = 1600;               // длинная сторона после уменьшения, px
export const IMAGE_SOURCE_MAX = 25 * 1024 * 1024; // исходный файл больше — не берём
const OUT_QUALITY = 0.84;

// Только картинки, которые браузер умеет открыть (HEIC и т. п. — понятный отказ)
export function imageProblem(file) {
  if (!file) return "Не выбрано изображение";
  if (!/^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.type || "")) return "Такой формат не открывается — выберите PNG, JPG, WEBP или GIF";
  if (file.size > IMAGE_SOURCE_MAX) return "Картинка больше 25 МБ — выберите поменьше";
  return null;
}

// Уменьшить и перекодировать: { blob, w, h }. Прозрачность сохраняем (WEBP), остальное — JPEG
export async function shrinkImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const k = Math.min(1, IMAGE_SIDE_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    const alpha = /png|webp|gif|avif/i.test(file.type);
    if (!alpha) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.drawImage(bmp, 0, 0, w, h);
    const type = alpha ? "image/webp" : "image/jpeg";
    const blob = await new Promise((ok) => cv.toBlob(ok, type, OUT_QUALITY));
    if (!blob) throw new Error("encode");
    // Уменьшенное вышло больше исходного (мелкая картинка) — оставляем исходный файл
    return blob.size < file.size || k < 1 ? { blob, w, h } : { blob: file, w, h };
  } finally { bmp.close?.(); }
}

/* Положить картинку в хранилище этого устройства. Возвращает сведения для note.images
   (в облако — uploadNoteImage) */
export async function storeNoteImage(file, scope) {
  const bad = imageProblem(file);
  if (bad) throw new Error(bad);
  let packed;
  try { packed = await shrinkImage(file); } catch { throw new Error("Не получилось открыть картинку — возможно, файл повреждён"); }
  const id = `ni-${newId()}`;
  rememberLocal(scope, id, packed.blob); // память страницы + IndexedDB (до 25 МБ)
  const kept = await cachePut(cacheKey(scope, id), packed.blob); // дождаться записи: «Сохранено» не должно врать
  void kept;
  const name = String(file.name || "Изображение").replace(/\.[a-z0-9]{1,5}$/i, "").slice(0, 80) || "Изображение";
  return { id, name, w: packed.w, h: packed.h, size: packed.blob.size };
}

// Отправить в облако аккаунта. true — картинка там (или уже была)
export async function uploadNoteImage(uid, img, scope) {
  if (!uid) return false;
  const blob = await cacheGet(cacheKey(scope, img.id));
  if (!blob) return false;
  try {
    const { promise } = uploadToCloud({ uid, id: img.id, file: blob });
    await promise;
    return true;
  } catch (e) {
    return e?.kind === "exists"; // «уже есть» — загружено раньше
  }
}

/* Картинка из буфера обмена — только по нажатию кнопки. Сайт и ПК — navigator.clipboard.read;
   приложение Android — ещё @capacitor/clipboard (если отдаёт картинку как data:image/…).
   Ответ: { file } или { error } — понятная причина */
export async function readClipboardImage() {
  // Приложение: фото из буфера читает свой модуль (плагин буфера Capacitor картинки не отдаёт)
  const nat = await clipboardReadImage();
  if (nat === "old_app") return { error: "Чтобы вставлять фото из буфера, обновите NEXA до последней версии" };
  if (nat?.blob?.size) {
    const t = nat.blob.type || "image/png";
    return { file: new File([nat.blob], `Из буфера.${t.split("/")[1].replace("jpeg", "jpg")}`, { type: t }) };
  }
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const t = it.types.find((x) => /^image\/(png|jpeg|webp|gif)$/.test(x));
        if (t) {
          const blob = await it.getType(t);
          if (blob.size) return { file: new File([blob], `Из буфера.${t.split("/")[1].replace("jpeg", "jpg")}`, { type: t }) };
        }
      }
    }
  } catch { /* браузер не дал прочитать картинку — попробуем способ приложения */ }
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Clipboard } = await import("@capacitor/clipboard");
      const r = await Clipboard.read();
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(r?.value || "");
      if (m) {
        const bin = atob(m[2]);
        const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return { file: new File([buf], `Из буфера.${m[1].split("/")[1].replace("jpeg", "jpg")}`, { type: m[1] }) };
      }
    }
  } catch { /* нет доступа */ }
  return { error: "В буфере нет картинки — скопируйте фото и нажмите ещё раз. Ещё можно вставить его в текст заметки (долгое нажатие → «Вставить»)" };
}

// Картинку убрали из заметки (или удалили заметку): стираем копию здесь и в облаке
export async function purgeNoteImages(uid, scope, images) {
  for (const img of images || []) {
    forgetUrl(scope, img.id);
    await cacheDel(cacheKey(scope, img.id));
  }
  if (uid && (images || []).length) await removeFromCloud(uid, images.map((i) => `${uid}/${i.id}`)).catch(() => {});
}

/* Ссылка для <img>: копия здесь → подписанная ссылка облака. null — пока нет (или нет нигде).
   retry — сменить, чтобы попробовать ещё раз */
export function useNoteImageUrl(img, uid, scope, retry = 0) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    setUrl(null); setFailed(false);
    fileUrl({ id: img.id, name: img.name, path: uid ? `${uid}/${img.id}` : null }, scope)
      .then((u) => { if (off) return; if (u) setUrl(u); else setFailed(true); })
      .catch(() => { if (!off) setFailed(true); });
    return () => { off = true; };
  }, [img.id, uid, scope, retry]);
  return { url, failed };
}
