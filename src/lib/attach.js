/* Вложения для ИИ-ассистента: файл из «Файлов» NEXA или с устройства.

   Подготовка идёт здесь, в браузере, и ничего никуда не отправляет —
   содержимое уходит на сервер только вместе с вопросом, когда человек
   нажал «Отправить» (api/chat.js, поле attachment).

   Что умеем:
   - текст (TXT, MD, CSV, JSON, код…) — читаем сами, отправляем текстом;
   - DOCX, PPTX, ODT — достаём текст из архива (DecompressionStream);
   - PDF и картинки (PNG, JPG, WEBP, HEIC) — Gemini читает их сам:
     до INLINE_MAX байт отправляем прямо в запросе, а файл из облака
     аккаунта до CLOUD_MAX — временной ссылкой, по которой сервер скачает
     его из нашей корзины (в другие хранилища файл не попадает).
   Чего не умеем — честное сообщение, а не «анализ» по имени файла */

// Запрос к серверу на Vercel — не больше 4,5 МБ, в base64 файл растёт на треть
export const INLINE_MAX = 2.5 * 1024 * 1024;
// Gemini принимает запрос до 20 МБ (тоже base64) — с запасом
export const CLOUD_MAX = 12 * 1024 * 1024;
const TEXT_FILE_MAX = 8 * 1024 * 1024;   // текстовый файл / документ — читаем до 8 МБ
export const TEXT_CHARS = 100000;        // в модель — не больше 100 тыс. знаков текста

const TEXT_EXT = ["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "ini", "rtf", "tex",
  "py", "js", "ts", "jsx", "tsx", "java", "kt", "c", "h", "cpp", "cs", "go", "rb", "php", "sql", "css", "sh", "swift"];
const IMAGE_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
const DRAW_EXT = ["gif", "bmp"]; // такие картинки перерисовываем в JPEG
// Понятные советы для частых неподдерживаемых форматов
const ADVICE = {
  xlsx: "Таблицы Excel ассистент пока не читает — сохраните лист как CSV",
  xls: "Таблицы Excel ассистент пока не читает — сохраните лист как CSV",
  ods: "Таблицы ассистент пока не читает — сохраните лист как CSV",
  doc: "Старый формат Word ассистент не читает — сохраните как DOCX или PDF",
  ppt: "Старый формат PowerPoint ассистент не читает — сохраните как PPTX или PDF",
  pages: "Сохраните документ как PDF или DOCX", key: "Сохраните презентацию как PDF или PPTX", numbers: "Сохраните таблицу как CSV",
  zip: "Архивы ассистент не открывает — приложите нужный файл отдельно", rar: "Архивы ассистент не открывает — приложите нужный файл отдельно", "7z": "Архивы ассистент не открывает — приложите нужный файл отдельно",
};
export const SUPPORTED_HINT = "PDF, DOCX, PPTX, TXT, MD, CSV, JSON и картинки (PNG, JPG, WEBP)";

export const extOf = (name) => {
  const s = String(name || ""); const dot = s.lastIndexOf(".");
  return dot > 0 ? s.slice(dot + 1).toLowerCase() : "";
};
// Какой это вид для ассистента: text | doc | pdf | image | null (не поддерживается)
export function attachKind(name, mime = "") {
  const ext = extOf(name);
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["docx", "pptx", "odt", "odp"].includes(ext)) return "doc";
  if (IMAGE_MIME[ext] || DRAW_EXT.includes(ext) || /^image\/(png|jpe?g|webp|heic|heif|gif|bmp)$/.test(mime)) return "image";
  if (TEXT_EXT.includes(ext) || (/^text\//.test(mime) && !/html/.test(mime))) return "text";
  return null;
}
// Почему файл не подойдёт (по имени и типу) — или null
export function attachUnsupported(name, mime = "") {
  if (attachKind(name, mime)) return null;
  const ext = extOf(name);
  if (ADVICE[ext]) return ADVICE[ext];
  if (/^(audio|video)\//.test(mime) || ["mp3", "wav", "ogg", "m4a", "mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "Аудио и видео ассистент пока не разбирает";
  return `Этот формат ассистент не читает. Подходят: ${SUPPORTED_HINT}`;
}
// Подпись формата: «PDF», «DOCX», «Текст»…
export const formatLabel = (name) => (extOf(name) || "файл").toUpperCase();

class AttachError extends Error { constructor(text) { super(text); this.userText = text; } }
const fail = (text) => { throw new AttachError(text); };
const mb = (n) => `${String(Math.round((n / 1048576) * 10) / 10).replace(".", ",")} МБ`;

/* Подготовить вложение.
   src: { name, size, mime, blob? (File/Blob), getBlob? () → Blob, signedUrl? () → url, cloud? }
   Возвращает { kind, name, mime, text?, data?, url?, truncated?, pages? } для сервера
   или бросает ошибку с понятным текстом (err.userText). signal — отмена */
export async function prepareAttachment(src, signal) {
  const name = src.name, ext = extOf(name);
  const kind = attachKind(name, src.mime);
  if (!kind) fail(attachUnsupported(name, src.mime));
  if (!src.size) fail("Файл пустой — читать нечего");
  const check = () => { if (signal?.aborted) throw new DOMException("cancel", "AbortError"); };

  // Большой PDF или картинка из облака аккаунта: сервер сам скачает по ссылке
  // (большую картинку с устройства не отклоняем — ниже уменьшим её в JPEG)
  if (kind === "pdf" && src.size > INLINE_MAX) {
    if (!src.cloud) fail(`С устройства ассистент принимает PDF до ${mb(INLINE_MAX)}. Добавьте файл в «Файлы» — оттуда прочитает до ${mb(CLOUD_MAX)}`);
    if (src.size > CLOUD_MAX) fail(`PDF больше ${mb(CLOUD_MAX)} ассистент не прочитает — сожмите или разделите файл`);
  }
  const viaUrl = src.cloud && src.size > INLINE_MAX && src.size <= CLOUD_MAX
    && (kind === "pdf" || (kind === "image" && IMAGE_MIME[ext] && ext !== "heic" && ext !== "heif"));
  if (viaUrl) {
    const url = await src.signedUrl?.();
    check();
    if (!url) fail(navigator.onLine === false ? "Нет связи — не получилось получить файл из облака" : "Не получилось получить файл из облака — попробуйте ещё раз");
    return { kind, name, mime: kind === "pdf" ? "application/pdf" : IMAGE_MIME[ext], url };
  }
  if ((kind === "text" || kind === "doc") && src.size > TEXT_FILE_MAX) fail(`Слишком большой документ — ассистент читает до ${mb(TEXT_FILE_MAX)}`);

  // Остальное — читаем байты здесь
  let blob;
  try { blob = src.blob || await src.getBlob?.(); } catch (e) { if (e?.name === "AbortError") throw e; blob = null; }
  check();
  if (!blob) fail(navigator.onLine === false ? "Нет связи — не получилось получить файл" : "Не получилось прочитать файл — его содержимого нет на этом устройстве");
  const buf = new Uint8Array(await blob.arrayBuffer().catch(() => fail("Не получилось прочитать файл — возможно, он повреждён")));
  check();

  if (kind === "pdf") {
    if (!headHas(buf, "%PDF-") || !tailHas(buf, "%%EOF")) fail("PDF повреждён или не до конца скачан — откройте его и сохраните заново");
    if (tailHas(buf, "/Encrypt", 64 * 1024)) fail("PDF защищён паролем — снимите защиту и приложите снова");
    return { kind, name, mime: "application/pdf", data: toBase64(buf) };
  }
  if (kind === "image") return prepareImage(buf, ext, name, check);
  if (kind === "text") {
    const text = decodeText(buf);
    return withText(name, text, "text");
  }
  // DOCX / PPTX / ODT
  const text = await docText(buf, ext, check);
  return withText(name, text, ext);
}
function withText(name, text, source) {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) fail("В файле нет текста — читать нечего");
  const truncated = clean.length > TEXT_CHARS;
  return { kind: "text", source, name, mime: "text/plain", text: truncated ? clean.slice(0, TEXT_CHARS) : clean, truncated, chars: clean.length };
}

/* ─── Текст: UTF-8, если не вышло — Windows-1251 (старые русские файлы) ─── */
function decodeText(buf) {
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) fail("Похоже, это не текстовый файл — внутри двоичные данные");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch {}
  try { return new TextDecoder("windows-1251").decode(buf); } catch {}
  fail("Не получилось прочитать текст — неизвестная кодировка");
}

/* ─── Картинки: проверяем, что открываются; большие и «не те» форматы — в JPEG ─── */
async function prepareImage(buf, ext, name, check) {
  const mime = IMAGE_MIME[ext];
  // HEIC браузер обычно не рисует — отправляем как есть (Gemini его понимает)
  if (ext === "heic" || ext === "heif") {
    if (buf.length > INLINE_MAX) fail(`Картинка HEIC больше ${mb(INLINE_MAX)} — сохраните её как JPG`);
    return { kind: "image", name, mime, data: toBase64(buf) };
  }
  let bmp;
  try { bmp = await createImageBitmap(new Blob([buf], { type: mime || `image/${ext}` })); }
  catch { fail("Картинка повреждена — не получилось её открыть"); }
  check();
  if (mime && buf.length <= INLINE_MAX && Math.max(bmp.width, bmp.height) <= 3072) { bmp.close?.(); return { kind: "image", name, mime, data: toBase64(buf) }; }
  // Уменьшаем до 2048 точек по длинной стороне и сохраняем в JPEG
  const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!out || out.size > INLINE_MAX) fail("Картинка слишком большая — уменьшите её и приложите снова");
  return { kind: "image", name, mime: "image/jpeg", data: toBase64(new Uint8Array(await out.arrayBuffer())), resized: true };
}

/* ─── DOCX / PPTX / ODT — это ZIP-архивы с XML внутри ─── */
async function docText(buf, ext, check) {
  if (typeof DecompressionStream === "undefined") fail("Этот браузер не умеет открывать такие документы — сохраните файл как PDF");
  let zip;
  try { zip = readZip(buf); } catch { fail(`Файл повреждён — не получилось открыть его как ${ext.toUpperCase()}`); }
  const get = async (n) => { const e = zip.get(n); if (!e) return null; const t = await unzipEntry(buf, e); check(); return t; };
  try {
    if (ext === "docx") {
      const xml = await get("word/document.xml");
      if (xml == null) fail("Файл повреждён — внутри нет текста документа");
      return xmlText(xml, "w");
    }
    if (ext === "pptx") {
      const slides = [...zip.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      if (!slides.length) fail("В презентации нет слайдов с текстом");
      const parts = [];
      for (let i = 0; i < slides.length; i++) parts.push(`Слайд ${i + 1}:\n${xmlText(await get(slides[i]), "a")}`);
      return parts.join("\n\n");
    }
    const xml = await get("content.xml"); // ODT / ODP
    if (xml == null) fail("Файл повреждён — внутри нет текста документа");
    return xmlText(xml, "text");
  } catch (e) {
    if (e instanceof AttachError || e?.name === "AbortError") throw e;
    fail(`Файл повреждён — не получилось прочитать ${ext.toUpperCase()}`);
  }
}
// Текст из XML документа: абзацы — с новой строки, табуляции и переносы — как есть
function xmlText(xml, ns) {
  return String(xml || "")
    .replace(new RegExp(`<${ns}:(tab)\\b[^>]*/>`, "g"), "\t")
    .replace(new RegExp(`<${ns}:(br|line-break)\\b[^>]*/>`, "g"), "\n")
    .replace(new RegExp(`</${ns}:(p|h)>`, "g"), "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()];
      if (named) return named;
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return ""; }
    });
}
// Оглавление ZIP: имя → { method, size, offset }
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map(), dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip");
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    out.set(dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
async function unzipEntry(buf, e) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error("zip");
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = buf.subarray(start, start + e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error("zip");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/* ─── Мелочи ─── */
// Подпись формата в начале файла (иногда перед ней бывает пара служебных байт)
const headHas = (buf, s) => new TextDecoder("latin1").decode(buf.subarray(0, 1024)).includes(s);
function tailHas(buf, s, span = 2048) {
  const tail = new TextDecoder("latin1").decode(buf.subarray(Math.max(0, buf.length - span)));
  return tail.includes(s);
}
function toBase64(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
