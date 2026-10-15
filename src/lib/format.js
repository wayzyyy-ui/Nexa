// Мелкие помощники форматирования: склонения, размеры, время
import { formatBytes } from "./deviceInfo.js";

export const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

// Размер в МБ с разумной точностью: 0.004 (4 КБ), 5.5, 1240
export const toMb = (bytes) => (bytes >= 1e6 ? Math.round(bytes / 1e5) / 10 : Math.max(0.001, Math.round(bytes / 1000) / 1000));

// Склонение: plural(5, ["файл", "файла", "файлов"]) → "файлов"
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

// Размер файла в байтах: настоящий (size), у демо-файлов — из выдуманных мегабайт
export const fileBytes = (f) => (typeof f.size === "number" ? f.size : Math.round((f.mb || 0) * 1e6));

// Размер по-русски: «812 Б», «400 КБ», «5,5 МБ», «1,2 ГБ» (см. formatBytes)
export function formatSize(mb) {
  return formatBytes(Math.round(mb * 1e6));
}

// Дата: "Сегодня 08:42", "Вчера 20:14" или "3 окт."
export function formatWhen(f) {
  if (f.days === 0) return `Сегодня ${f.time}`;
  if (f.days === 1) return `Вчера ${f.time}`;
  const d = new Date(Date.now() - f.days * 86400000);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export const hhmm = (d) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const mbText = (b) => `${String((b / 1048576).toFixed(1)).replace(".", ",")} МБ`;

export const changesWord = (n) => `${n} ${plural(n, ["изменение", "изменения", "изменений"])}`;

export const waitWord = (n) => plural(n, ["ждёт", "ждут", "ждут"]);

/* ═══ ЖИВЫЕ ПОДПИСИ «КОГДА БЫЛ В СЕТИ» ═════════════════════════ */
// ms — когда устройство последний раз было активно (state.seenAt, миллисекунды)
// Когда получены сведения: «в 14:05», «вчера в 14:05», «3 окт. в 14:05»
export function sysTime(ms, now = Date.now()) {
  const d = new Date(ms), t = new Date(now);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === t.toDateString()) return `в ${hm}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${hm}`;
}

// Знак перед температурой: "+18", "-3", "0"
export const signed = (n) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);
