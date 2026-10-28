/* Отчёты о сбоях без личных данных — правила (тесты tests/crash-report.test.mjs). Ход — src/lib/crashes.js,
   сервер — api/errors.js (он же ещё раз прогоняет всё через эти же функции: клиенту не верим).

   Что уходит: вид сбоя (ошибка / необработанное обещание / падение экрана), имя ошибки, текст ошибки
   после очистки, до 8 строк «где упало» (функция, файл сборки без адреса, строка и столбец), версия NEXA,
   платформа (сайт / Android / ПК), раздел (home, files…), браузер с номером версии. Отпечаток сбоя (fp)
   склеивает одинаковые. Что НЕ уходит: аккаунт, устройство, адреса страниц и файлов, IP (сервер его не пишет),
   почты, номера, ключи, id, длинные строки в кавычках (там бывает текст человека). */

const MAX_MSG = 300;
const MAX_FRAMES = 8;

// Текст ошибки без личного: почты, ссылки (только адрес сайта), ключи и токены, id, длинные числа, длинные цитаты
export function scrubText(s, max = MAX_MSG) {
  return String(s ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<почта>")
    .replace(/\b(?:https?|wss?|file|blob|capacitor|tauri):\/\/([^\s/'"`)]+)[^\s'"`)]*/gi, (m, host) => `<${/^[\w.-]+$/.test(host) ? host.toLowerCase() : "адрес"}>`)
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, "<ключ>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, "<ключ>")
    .replace(/\b[0-9a-f]{20,}\b/gi, "<ключ>")
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "<номер>")
    .replace(/\d{5,}/g, "<число>")
    .replace(/(["'«`])([^"'»`]{31,})(["'»`])/g, "$1<текст>$3")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Строка «где упало» → { fn, file, line, col } или null. Файл — только имя (assets/index-3f2a.js → index-3f2a.js)
const FRAME_RES = [
  /^\s*at (?:async )?(.*?) \(?((?:[a-z-]+:\/\/|\/)[^\s)]+?):(\d+):(\d+)\)?\s*$/i, // Chrome / Edge / WebView
  /^\s*at (?:async )?()((?:[a-z-]+:\/\/|\/)[^\s)]+?):(\d+):(\d+)\s*$/i,
  /^\s*(.*?)@(.*?):(\d+):(\d+)\s*$/,                                           // Firefox / Safari
];
export function parseFrame(line) {
  for (const re of FRAME_RES) {
    const m = String(line).match(re);
    if (!m) continue;
    const url = m[2];
    if (/^(chrome|moz|safari)(-web)?-extension:/i.test(url)) return { ext: true };
    const file = url.split(/[?#]/)[0].split("/").pop() || "";
    if (!/^[\w.@-]{1,80}$/.test(file)) return null;
    const fn = scrubText(m[1] || "", 60).replace(/[^\w.$<> /-]/g, "");
    return { fn, file, line: Number(m[3]), col: Number(m[4]) };
  }
  return null;
}
export function parseStack(stack) {
  const out = [];
  let ext = 0;
  for (const l of String(stack || "").split("\n")) {
    const f = parseFrame(l);
    if (!f) continue;
    if (f.ext) { ext++; continue; }
    out.push(f);
    if (out.length >= MAX_FRAMES) break;
  }
  return { frames: out, ext };
}

// Браузер без подробностей: «Chrome 140», «Safari 18», «Firefox 131», «Edge 140», «WebView 140»
export function browserLabel(ua = "") {
  const v = (re) => (ua.match(re) || [])[1];
  if (/; wv\)/.test(ua) && v(/Chrome\/(\d+)/)) return `WebView ${v(/Chrome\/(\d+)/)}`;
  if (v(/Edg\/(\d+)/)) return `Edge ${v(/Edg\/(\d+)/)}`;
  if (v(/Firefox\/(\d+)/)) return `Firefox ${v(/Firefox\/(\d+)/)}`;
  if (v(/Chrome\/(\d+)/)) return `Chrome ${v(/Chrome\/(\d+)/)}`;
  if (/Safari\//.test(ua) && v(/Version\/(\d+)/)) return `Safari ${v(/Version\/(\d+)/)}`;
  return "Другой";
}

// Шум, а не наш сбой: чужие скрипты без подробностей, служебное предупреждение браузера, отмены запросов
export function isNoise(name, message) {
  const m = String(message || "");
  return /^Script error\.?$/i.test(m) || /ResizeObserver loop/i.test(m) || name === "AbortError" || /^(The user aborted a request|signal is aborted)/i.test(m);
}

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
// Отпечаток: одинаковые сбои — один отпечаток (числа и номера строк в тексте не мешают)
export const crashFingerprint = (r) => fnv([r.kind, r.name, r.message.replace(/<[^>]+>|\d+/g, "#"), r.frames[0] ? `${r.frames[0].file}:${r.frames[0].line}` : ""].join("|"));

export const KINDS = ["error", "rejection", "render"];
export const PLATFORMS = ["web", "android", "desktop"];
const SCREEN_RE = /^[a-z][a-z-]{0,20}$/;

/* Отчёт из ошибки. ctx — { kind, version, platform, screen, ua }. null — не отправляем (шум, всё в расширениях) */
export function makeReport(err, ctx) {
  const name = scrubText(err?.name || (typeof err === "string" ? "Error" : "Unknown"), 40).replace(/[^\w]/g, "") || "Error";
  const message = scrubText(err?.message ?? (typeof err === "string" ? err : ""));
  if (isNoise(name, message)) return null;
  const { frames, ext } = parseStack(err?.stack);
  if (!frames.length && ext) return null; // сбой целиком в расширении браузера
  const r = {
    kind: KINDS.includes(ctx.kind) ? ctx.kind : "error",
    name, message, frames,
    version: /^\d+\.\d+\.\d+$/.test(ctx.version || "") ? ctx.version : "0.0.0",
    platform: PLATFORMS.includes(ctx.platform) ? ctx.platform : "web",
    screen: SCREEN_RE.test(ctx.screen || "") ? ctx.screen : "",
    browser: browserLabel(ctx.ua || ""),
  };
  r.fp = crashFingerprint(r);
  return r;
}

// Сервер: присланный отчёт → чистый (или null). Те же правила, что у клиента, — клиенту не верим
export function cleanReport(x) {
  if (!x || typeof x !== "object") return null;
  const frames = Array.isArray(x.frames) ? x.frames.slice(0, MAX_FRAMES).map((f) => {
    if (!f || typeof f !== "object") return null;
    const file = String(f.file || "");
    if (!/^[\w.@-]{1,80}$/.test(file)) return null;
    const line = Number(f.line), col = Number(f.col);
    return { fn: scrubText(f.fn || "", 60).replace(/[^\w.$<> /-]/g, ""), file, line: Number.isInteger(line) && line >= 0 && line < 1e7 ? line : 0, col: Number.isInteger(col) && col >= 0 && col < 1e7 ? col : 0 };
  }).filter(Boolean) : [];
  const r = {
    kind: KINDS.includes(x.kind) ? x.kind : "error",
    name: scrubText(x.name || "Error", 40).replace(/[^\w]/g, "") || "Error",
    message: scrubText(x.message || ""),
    frames,
    version: /^\d+\.\d+\.\d+$/.test(x.version || "") ? x.version : "0.0.0",
    platform: PLATFORMS.includes(x.platform) ? x.platform : "web",
    screen: SCREEN_RE.test(x.screen || "") ? x.screen : "",
    browser: /^(Chrome|Edge|Firefox|Safari|WebView) \d{1,4}$|^Другой$/.test(x.browser || "") ? x.browser : "Другой",
  };
  if (isNoise(r.name, r.message)) return null;
  r.fp = crashFingerprint(r);
  return r;
}

// Сколько отправлять: один отпечаток — раз за запуск, не больше 10 за запуск и 30 за день с устройства
export const CRASH_PER_RUN = 10, CRASH_PER_DAY = 30;
export function allowSend(fp, seen, day, today) {
  if (seen.has(fp) || seen.size >= CRASH_PER_RUN) return { ok: false, day };
  const d = day?.day === today ? day : { day: today, n: 0 };
  if (d.n >= CRASH_PER_DAY) return { ok: false, day: d };
  return { ok: true, day: { day: today, n: d.n + 1 } };
}
