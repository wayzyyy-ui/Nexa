// Сведения о файлах (nexa-files): категории, папки, подписи. Содержимое — src/lib/files.js
import { formatBytes } from "./deviceInfo.js";
import { C } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { formatWhen, fileBytes } from "./format.js";

// Категории хранилища. gb — сколько места занято, devices — на каких
// устройствах лежат эти файлы (сумма должна совпадать с gb).
// Форма складки на диаграмме:
//   flex   — ширина сегмента,
//   clip   — сама фигура (точки многоугольника в % от сегмента),
//   top, h — сдвиг сверху и высота: складки стоят "лесенкой", а не в ряд,
//   labelX — где начинается подпись внутри фигуры,
//   facet  — угол тёмной грани, которая делает стекло "согнутым".
export const MEDIA_CATS = [
  { id: "photo", label: "Фото", gb: 96, pct: 38, from: C.foldDeep, to: C.foldBlue, icon: Icon.image,
    flex: 2.2, clip: "polygon(0 100%, 30% 4%, 100% 0, 72% 96%)", top: "8%", h: "86%", labelX: "30%", facet: "118deg",
    devices: [["Смартфон", 61], ["Ноутбук", 27], ["Облако", 8]] },
  { id: "video", label: "Видео", gb: 68, pct: 27, from: C.foldDeep, to: C.foldBlue, icon: Icon.video,
    flex: 1.7, clip: "polygon(0 100%, 28% 12%, 54% 0, 100% 80%, 94% 100%)", top: "16%", h: "84%", labelX: "27%", facet: "150deg",
    devices: [["Смартфон", 40], ["Ноутбук", 22], ["ТВ", 6]] },
  { id: "doc", label: "Документы", gb: 49, pct: 20, from: C.foldBlue, to: C.foldCyan, icon: Icon.doc,
    flex: 1.5, clip: "polygon(0 78%, 40% 6%, 100% 0, 74% 100%, 28% 96%)", top: "0%", h: "94%", labelX: "28%", facet: "100deg",
    devices: [["Ноутбук", 38], ["Облако", 9], ["Смартфон", 2]] },
  { id: "music", label: "Музыка", gb: 24, pct: 10, from: C.foldCyan, to: C.foldMint, icon: Icon.music,
    flex: 1.2, clip: "polygon(6% 100%, 30% 6%, 100% 0, 82% 96%)", top: "6%", h: "90%", labelX: "30%", facet: "108deg",
    devices: [["Смартфон", 14], ["Ноутбук", 7], ["Часы", 3]] },
  { id: "other", label: "Другое", gb: 10, pct: 5, from: C.foldMint, to: C.foldGreen, icon: Icon.archive,
    flex: 1.1, clip: "polygon(0 96%, 14% 0, 100% 12%, 94% 88%)", top: "12%", h: "80%", labelX: "26%", facet: "128deg",
    devices: [["Ноутбук", 6], ["Облако", 4]] },
];

// Папки. parent — id родительской папки (null — лежит в корне).
export const FOLDERS = [
  { id: "photo", name: "Фото", parent: null },
  { id: "camera", name: "Камера", parent: "photo" },
  { id: "screens", name: "Скриншоты", parent: "photo" },
  { id: "video", name: "Видео", parent: null },
  { id: "docs", name: "Документы", parent: null },
  { id: "study", name: "Учёба", parent: "docs" },
  { id: "music", name: "Музыка", parent: null },
  { id: "other", name: "Разное", parent: null },
];

/* ---------- ЗАГРУЖЕННЫЕ ФАЙЛЫ (localStorage) ----------
   Под FILES_KEY лежат только сведения, без содержимого файлов
   (оно не влезет в браузерное хранилище):
   added   — файлы, которые пользователь добавил сам
             { id, name, cat, folder, device, mb, addedAt };
   removed — id удалённых демо-файлов;
   renamed — новые имена { id: "имя" };
   folders — папки, созданные пользователем { id, name, parent }. */
export const FILES_KEY = "nexa-files";

export function loadFileStore(key = FILES_KEY) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
  return {
    added: raw?.added || [], removed: raw?.removed || [],
    renamed: raw?.renamed || {}, folders: raw?.folders || [],
  };
}

// Категория по типу файла: картинка → "Фото", видео, звук, документы, остальное
export const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "csv", "md", "pages", "key", "numbers"];

// Новый файл без выбранной папки (добавили в корень «Хранилища», из буфера, «Поделиться»…) —
// сразу в папку по типу: фото → «Фото», видео → «Видео», документы → «Документы», музыка → «Музыка», прочее → «Разное»
const AUTO_FOLDER = { photo: "photo", video: "video", doc: "docs", music: "music", other: "other" };
export const autoFolder = (file) => AUTO_FOLDER[catFromFile(file)] || "other";

export function catFromFile(file) {
  const type = file.type || "";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (type.startsWith("image/") || ext === "heic" || ext === "heif") return "photo"; // HEIC часто приходит без типа
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "music";
  if (DOC_EXT.includes(ext) || type === "application/pdf" || type.startsWith("text/")) return "doc";
  return "other";
}

// У загруженного файла есть точное время (addedAt), а список
// работает с "days" и "time", как у демо-файлов — пересчитываем
export function withWhen(f) {
  const d = new Date(f.addedAt);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return {
    ...f,
    days: Math.max(0, Math.round((start(new Date()) - start(d)) / 86400000)),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

// С какого устройства добавлен файл: сенсорный экран — смартфон, иначе ноутбук
export const uploadDevice = () =>
  (window.matchMedia?.("(pointer: coarse)").matches ? "Смартфон" : "Ноутбук");

// Название папки для подписей; null — корень "Хранилище"
export const folderName = (folders, id) => (id ? folders.find((f) => f.id === id)?.name || "Хранилище" : "Хранилище");

// Сортировка "сначала новые"
export function sortByRecent(list) {
  const key = (f) => {
    const [h, m] = f.time.split(":").map(Number);
    return f.days * 1440 - (h * 60 + m);
  };
  return [...list].sort((a, b) => key(a) - key(b));
}

export const catOf = (f) => MEDIA_CATS.find((c) => c.id === f.cat);

export const fileMeta = (f) => `${catOf(f).label} · ${formatWhen(f)} · ${formatBytes(fileBytes(f))}`;

/* Миниатюра файла: цветная плашка по категории + иконка.
   У фото угол градиента зависит от id, поэтому карточки не одинаковые. */
// Чьи файлы сейчас на экране: id аккаунта или "guest". Ставит NexaApp при каждой
// отрисовке — миниатюры по нему находят содержимое (облако или этот браузер)
export let FILE_SCOPE = "guest";
// Ставит NexaApp при каждой отрисовке: импортированную переменную нельзя менять из другого модуля
export function setFileScope(scope) { FILE_SCOPE = scope; }

// Оттенок градиента по id (id бывает числом у демо и строкой-uuid у настоящих файлов)
export const idHue = (id) => [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
