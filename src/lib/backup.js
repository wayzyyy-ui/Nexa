/* Резервная копия NEXA: файл «.nexa-backup» — это ZIP (src/lib/zipStream.js):
     manifest.json        — формат, версия, когда и где сделана, что внутри и полная ли;
     data/<часть>.json    — записи: заметки, диалоги, расписание, память ассистента, папки,
                            сведения о файлах, настройки этого устройства;
     files/<номер>        — содержимое файлов (если человек его включил).
   Здесь — без интерфейса: что входит в копию, сборка, чтение с проверками и план восстановления
   (тесты tests/backup.test.mjs). Окна — src/ui/backup.jsx, запись в хранилища — NexaApp.
   Не входят (это не содержимое человека или оно само восстанавливается): устройства (каждое
   само записывает себя при входе), журналы «Активность» и безопасности, история передач Flow,
   общий буфер обмена (живёт минуты), уведомления, состояние синхронизации, вход, ключи и кэши. */
import { createZipWriter, openZip, ZipError } from "./zipStream.js";
import { cleanTags, NOTE_TITLE_MAX, NOTE_TEXT_MAX, USER_NOTES_MAX } from "./userNotes.js";

export const BACKUP_FORMAT = "nexa-backup";
export const BACKUP_VERSION = 1;          // версия формата; новая NEXA умеет читать старые (MIGRATIONS)
export const BACKUP_EXT = ".nexa-backup";
export const BACKUP_MIME = "application/zip";

// Части копии — в этом порядке и показываются
export const BACKUP_PARTS = [
  { id: "notes", label: "Заметки" },
  { id: "chats", label: "Диалоги с ИИ — Ассистентом" },
  { id: "schedule", label: "Расписание" },
  { id: "memory", label: "Память ассистента" },
  { id: "files", label: "Файлы и папки" },
  { id: "settings", label: "Настройки этого устройства" },
];
export const BACKUP_EXCLUDED = [
  "устройства — каждое само появится, когда вы войдёте на нём",
  "«Активность», журнал безопасности и уведомления",
  "история передач Flow и общий буфер обмена",
  "вход в аккаунт, ключи и служебные данные",
];

// Настройки этого устройства, которые имеет смысл перенести (простые строки в localStorage)
export const SETTINGS_KEYS = ["nexa-theme", "nexa-enter-sends", "nexa-city", "nexa-note-prefs", "nexa-tilt", "nexa-note-widget-hide", "nexa-hist-hidden"];

// Пределы: столько же разрешает база (notes.sql, schedule.sql, memory.sql, security-hardening.sql)
export const LIMITS = { notes: USER_NOTES_MAX, chats: 1000, schedule: 2000, memory: 50, folders: 500, files: 5000 };
const FILE_MAX_BYTES = 50 * 1024 * 1024;   // как у загрузки файлов (files.js)
const JSON_MAX_BYTES = 64 * 1024 * 1024;
const FILE_CATS = ["photo", "video", "doc", "music", "other"];

/* ── Проверка и очистка записей: из файла копии берём только известные поля нужных типов ── */
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v) => (Number.isFinite(v) ? v : 0);
const idOk = (v) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)) || (Number.isSafeInteger(v) && v >= 0);

const CLEAN = {
  notes: (n) => (n && idOk(n.id) ? {
    id: n.id, title: str(n.title, NOTE_TITLE_MAX), text: str(n.text, NOTE_TEXT_MAX), pinned: !!n.pinned,
    tags: cleanTags(n.tags), archived: !!n.archived, createdAt: num(n.createdAt), updatedAt: num(n.updatedAt) || num(n.createdAt),
  } : null),
  chats: (c) => {
    if (!c || !idOk(c.id) || !Array.isArray(c.messages)) return null;
    const messages = c.messages.slice(-2000).map(cleanMessage).filter(Boolean);
    return { id: c.id, title: str(c.title, 200), messages, pinned: !!c.pinned, createdAt: num(c.createdAt), updatedAt: num(c.updatedAt) || num(c.createdAt) };
  },
  schedule: (it) => (it && idOk(it.id) && /^\d{4}-\d{2}-\d{2}$/.test(it.date) && /^\d{2}:\d{2}$/.test(it.time) && str(it.title, 120).trim() ? {
    id: it.id, date: it.date, time: it.time, title: str(it.title, 120), place: str(it.place, 200), createdAt: num(it.createdAt), updatedAt: num(it.updatedAt),
  } : null),
  memory: (m) => (m && idOk(m.id) && str(m.text, 200).trim() ? {
    id: m.id, text: str(m.text, 200), always: !!m.always, createdAt: num(m.createdAt), updatedAt: num(m.updatedAt),
  } : null),
  folders: (f) => (f && idOk(f.id) && str(f.name, 80).trim() ? {
    id: f.id, name: str(f.name, 80), parent: idOk(f.parent) ? f.parent : null, createdAt: num(f.createdAt), updatedAt: num(f.updatedAt),
  } : null),
  files: (f) => (f && idOk(f.id) && str(f.name, 200).trim() ? {
    id: f.id, name: str(f.name, 200), cat: FILE_CATS.includes(f.cat) ? f.cat : "other", folder: idOk(f.folder) ? f.folder : null,
    mime: /^[a-z]+\/[A-Za-z0-9.+-]{1,80}$/.test(f.mime || "") ? f.mime : "", size: Math.max(0, num(f.size)),
    device: str(f.device, 60), addedAt: num(f.addedAt) || num(f.createdAt),
    content: typeof f.content === "string" && /^files\/\d{1,6}$/.test(f.content) ? f.content : null,
  } : null),
};
function cleanMessage(m) {
  if (!m || (m.role !== "user" && m.role !== "ai") || typeof m.text !== "string") return null;
  const out = { role: m.role, text: m.text.slice(0, 100000) };
  if (Number.isFinite(m.at)) out.at = m.at;
  for (const k of ["action", "error", "partial"]) if (m[k] === true) out[k] = true;
  if (typeof m.id === "string") out.id = m.id.slice(0, 64);
  if (typeof m.actionLabel === "string") out.actionLabel = m.actionLabel.slice(0, 80);
  if (m.file && typeof m.file.name === "string") out.file = { name: m.file.name.slice(0, 200), ext: str(m.file.ext, 12), size: Math.max(0, num(m.file.size)) };
  return out;
}
const cleanSettings = (s) => {
  const out = {};
  if (s && typeof s === "object") for (const k of SETTINGS_KEYS) if (typeof s[k] === "string" && s[k].length <= 4000) out[k] = s[k];
  return out;
};
export function cleanList(part, list) {
  const ok = [], seen = new Set();
  let bad = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const r = CLEAN[part](raw);
    if (!r || seen.has(String(r.id))) { bad++; continue; }
    seen.add(String(r.id)); ok.push(r);
  }
  return { list: ok, bad };
}

// Отпечаток владельца: SHA-256 от id аккаунта (сам id в файл не пишем); гость — "guest"
export async function ownerTag(uid) {
  if (!uid) return "guest";
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode("nexa-backup:" + uid));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Сборка ──
   data — { notes, chats, schedule, memory, folders, files, settings } как в приложении;
   parts — какие части включить (Set id); withContent — класть ли содержимое файлов;
   getBlob(file, signal) → Blob | null — содержимое файла (своё: копия в браузере или своя корзина).
   onProgress({ done, total, text }) — настоящий прогресс по байтам. Отмена — signal (ZipError "abort").
   Не скачался файл — копия всё равно собирается, но manifest.complete = false и список missing */
export async function buildBackup({ uid, appVersion, platform, data, parts, withContent, getBlob, signal, onProgress, now = new Date() }) {
  const zip = createZipWriter({ date: now });
  const enc = new TextEncoder();
  const has = (p) => parts.has(p);
  const json = {};
  const add = (p, list) => { json[p] = cleanList(p, list).list; };
  if (has("notes")) add("notes", data.notes);
  if (has("chats")) add("chats", data.chats);
  if (has("schedule")) add("schedule", data.schedule);
  if (has("memory")) add("memory", data.memory);
  const files = has("files") ? cleanList("files", data.files).list : [];
  if (has("files")) json.folders = cleanList("folders", data.folders).list;
  if (has("settings")) json.settings = cleanSettings(data.settings);

  const contentFiles = withContent ? files : [];
  // Скачиваем по исходной записи: в очищенной нет пути в облаке (в файл копии он не пишется)
  const original = new Map((data.files || []).map((f) => [String(f.id), f]));
  const total = Math.max(1, contentFiles.reduce((s, f) => s + (f.size || 0), 0) + 4096);
  let done = 0;
  const tick = (n, text) => { done += n; onProgress?.({ done: Math.min(done, total), total, text }); };
  const missing = [];
  // Содержимое файлов — по одному: скачали → в архив → дальше (в памяти один файл за раз)
  for (let i = 0; i < contentFiles.length; i++) {
    const f = contentFiles[i];
    if (signal?.aborted) throw new ZipError("abort", "Отменено");
    tick(0, `Файл ${i + 1} из ${contentFiles.length}: ${f.name}`);
    let blob = null, reason = "нет содержимого на этом устройстве и в облаке";
    try { blob = await getBlob(original.get(String(f.id)) || f, signal); } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw new ZipError("abort", "Отменено");
      reason = "не скачался — нет связи или файл недоступен";
    }
    if (!blob) { missing.push({ name: f.name, reason }); tick(f.size || 0); continue; }
    if (blob.size > FILE_MAX_BYTES) { missing.push({ name: f.name, reason: "больше 50 МБ" }); tick(f.size || 0); continue; }
    const path = `files/${String(i).padStart(6, "0")}`;
    await zip.add(path, blob, { signal, onBytes: (n) => tick(n, `Файл ${i + 1} из ${contentFiles.length}: ${f.name}`) });
    f.content = path;
    f.size = blob.size;
  }
  if (has("files")) json.files = files;
  tick(0, "Записываем заметки, диалоги и расписание");
  for (const [p, value] of Object.entries(json)) await zip.add(`data/${p}.json`, new Blob([enc.encode(JSON.stringify(value))]), { signal });

  const counts = {};
  for (const p of BACKUP_PARTS) if (has(p.id)) {
    if (p.id === "files") counts.files = { count: files.length, folders: json.folders.length, withContent: files.filter((f) => f.content).length, contentRequested: !!withContent };
    else if (p.id === "settings") counts.settings = { count: Object.keys(json.settings).length };
    else counts[p.id] = { count: json[p.id].length };
  }
  const manifest = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, app: String(appVersion || ""), createdAt: now.toISOString(),
    source: { account: !!uid, owner: await ownerTag(uid), platform: String(platform || "") },
    parts: counts, missing,
    // Полная — только если всё выбранное записано и (если просили) содержимое всех файлов на месте
    complete: missing.length === 0,
  };
  await zip.add("manifest.json", JSON.stringify(manifest), { signal });
  tick(4096, "Готово");
  return { blob: zip.finish(), manifest };
}

/* ── Совместимость форматов ──
   Каждая будущая версия формата добавляет шаг «из N в N+1» сюда, и старые копии
   открываются новой NEXA. Копия новее, чем знает эта NEXA, — честный отказ */
const MIGRATIONS = {
  // 1: (manifest, data) => ({ manifest: { ...manifest, version: 2 }, data })  — пример будущего шага
};
export function migrate(manifest, data) {
  let m = manifest, d = data;
  while (m.version < BACKUP_VERSION) {
    const step = MIGRATIONS[m.version];
    if (!step) throw new ZipError("old", `Копия в старом формате (${m.version}), который эта NEXA уже не читает`);
    ({ manifest: m, data: d } = step(m, d));
  }
  return { manifest: m, data: d };
}

/* ── Чтение с проверками ──
   Возвращает { manifest, data, contentOf(path), zip, warnings }. Любая ошибка — ZipError с понятным text.
   В архиве допустимы только известные записи; данные — только чистые JSON, проверенные CLEAN */
const ENTRY_RE = /^(manifest\.json|data\/(notes|chats|schedule|memory|folders|files|settings)\.json|files\/\d{6})$/;
export async function readBackup(file, { signal } = {}) {
  const zip = await openZip(file);
  for (const name of zip.entries.keys()) if (!ENTRY_RE.test(name)) throw new ZipError("corrupt", "В файле есть посторонние записи — это не копия NEXA или её изменили");
  if (!zip.entries.has("manifest.json")) throw new ZipError("corrupt", "Это не резервная копия NEXA: нет описания (manifest.json)");
  let manifest;
  try { manifest = JSON.parse(await zip.text("manifest.json", { maxBytes: 1024 * 1024, signal })); } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError("corrupt", "Описание копии повреждено");
  }
  if (!manifest || manifest.format !== BACKUP_FORMAT || !Number.isInteger(manifest.version) || manifest.version < 1) throw new ZipError("corrupt", "Это не резервная копия NEXA");
  if (manifest.version > BACKUP_VERSION) throw new ZipError("newer", `Копию сделала более новая NEXA (формат ${manifest.version}). Обновите NEXA и откройте её снова`);
  let data = {};
  const warnings = [];
  for (const part of ["notes", "chats", "schedule", "memory", "folders", "files", "settings"]) {
    const name = `data/${part}.json`;
    if (!zip.entries.has(name)) continue;
    let raw;
    try { raw = JSON.parse(await zip.text(name, { maxBytes: JSON_MAX_BYTES, signal })); } catch (e) {
      if (e instanceof ZipError) throw e;
      throw new ZipError("corrupt", `Часть «${name}» повреждена`);
    }
    if (part === "settings") { data.settings = cleanSettings(raw); continue; }
    const { list, bad } = cleanList(part, raw);
    if (bad) warnings.push(`${partLabel(part)}: пропущено повреждённых записей — ${bad}`);
    data[part] = list.slice(0, LIMITS[part]);
    if (list.length > LIMITS[part]) warnings.push(`${partLabel(part)}: больше ${LIMITS[part]} — лишние не восстановятся`);
  }
  ({ manifest, data } = migrate(manifest, data));
  // Содержимое файла должно быть в архиве и совпадать по размеру
  for (const f of data.files || []) {
    if (!f.content) continue;
    const e = zip.entries.get(f.content);
    if (!e || e.usize !== f.size || e.usize > FILE_MAX_BYTES) { warnings.push(`Файл «${f.name}»: содержимое в копии повреждено — восстановятся только сведения`); f.content = null; }
  }
  return { manifest, data, warnings, contentOf: (path, opts) => zip.read(path, { maxBytes: FILE_MAX_BYTES, ...opts }) };
}
const partLabel = (id) => (id === "folders" ? "Папки" : BACKUP_PARTS.find((p) => p.id === id)?.label || id);

// Что внутри — для предпросмотра
export function backupSummary({ manifest, data }) {
  const files = data.files || [];
  return {
    notes: (data.notes || []).length, chats: (data.chats || []).length, schedule: (data.schedule || []).length,
    memory: (data.memory || []).length, folders: (data.folders || []).length, files: files.length,
    filesWithContent: files.filter((f) => f.content).length, settings: Object.keys(data.settings || {}).length,
    present: BACKUP_PARTS.filter((p) => (p.id === "files" ? data.files : data[p.id]) !== undefined).map((p) => p.id),
    complete: !!manifest.complete, missing: Array.isArray(manifest.missing) ? manifest.missing.slice(0, 50) : [],
    createdAt: manifest.createdAt, app: manifest.app, account: !!manifest.source?.account,
  };
}

/* ── План восстановления (без записи) ──
   current — что есть сейчас ({ notes, chats, schedule, memory, folders, files });
   backup — data из readBackup; parts — что восстанавливать (Set);
   mode: "merge" — объединить (ничего не удаляем), "replace" — заменить выбранные части копией
   (файлы никогда не удаляются — только добавляются);
   sameOwner — копия этого же аккаунта (тогда id сохраняем: повторное восстановление не плодит дубли);
   иначе (другой аккаунт, гость ↔ аккаунт) — новые id (id в облаке общие на всех — чужой id отклонит база),
   а одинаковое по содержимому не дублируем. newId(kind) — новый id ("file" — у гостя число).
   Возвращает { next: { notes, … } — новые списки выбранных частей, files: [план файлов], report } */
const normText = (t) => String(t || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const FINGER = {
  notes: (n) => normText(n.title) + "\n" + normText(n.text),
  chats: (c) => normText(c.title) + "\n" + (c.messages[0] ? normText(c.messages[0].text) + "@" + (c.messages[0].at || 0) : ""),
  schedule: (it) => `${it.date} ${it.time} ${normText(it.title)}`,
  memory: (m) => normText(m.text),
  folders: (f) => `${f.parent || ""}/${normText(f.name)}`,
};
export function planRestore({ current, backup, parts, mode, sameOwner, newId }) {
  const next = {}, report = {};
  const folderMap = new Map(); // id папки в копии → id у нас
  for (const part of ["notes", "chats", "schedule", "memory", "folders"]) {
    const want = part === "folders" ? parts.has("files") : parts.has(part);
    if (!want || !backup[part]) continue;
    const cur = current[part] || [];
    const r = { added: 0, updated: 0, same: 0, limit: 0, replaced: mode === "replace" && part !== "folders" ? cur.length : 0 };
    let list;
    if (mode === "replace" && part !== "folders") {
      list = [];
    } else {
      list = cur.map((x) => x);
    }
    const byId = new Map(list.map((x, i) => [String(x.id), i]));
    const prints = new Map(list.map((x) => [FINGER[part](x), x]));
    for (const item0 of backup[part]) {
      let item = { ...item0 };
      if (part === "folders" && item.parent) item.parent = folderMap.get(String(item.parent)) ?? null;
      if (sameOwner) {
        const at = byId.get(String(item.id));
        if (at !== undefined) {
          // Тот же id: берём версию из копии, только если она новее
          if ((item.updatedAt || 0) > (list[at].updatedAt || 0)) { list[at] = item; r.updated++; } else r.same++;
          if (part === "folders") folderMap.set(String(item0.id), list[at].id);
          continue;
        }
      } else {
        const twin = prints.get(FINGER[part](item));
        if (twin) { r.same++; if (part === "folders") folderMap.set(String(item0.id), twin.id); continue; }
        item.id = newId(part);
      }
      if (list.length >= LIMITS[part]) { r.limit++; continue; }
      if (part === "folders") folderMap.set(String(item0.id), item.id);
      list.push(item); byId.set(String(item.id), list.length - 1); prints.set(FINGER[part](item), item);
      r.added++;
    }
    next[part] = list;
    report[part] = r;
  }
  // Файлы: только добавляем. Уже есть (тот же id у своего аккаунта или то же имя и размер) — пропускаем
  const files = [];
  if (parts.has("files") && backup.files) {
    const cur = current.files || [];
    const ids = new Set(cur.map((f) => String(f.id)));
    const prints = new Set(cur.map((f) => `${normText(f.name)}|${f.size || 0}`));
    let count = cur.length;
    for (const f of backup.files) {
      const folder = f.folder == null ? null : (folderMap.get(String(f.folder)) ?? (isBaseFolder(f.folder) ? f.folder : null));
      if ((sameOwner && ids.has(String(f.id))) || prints.has(`${normText(f.name)}|${f.size || 0}`)) { files.push({ meta: f, action: "skip", reason: "уже есть" }); continue; }
      if (!f.content) { files.push({ meta: f, action: "skip", reason: "в копии нет содержимого" }); continue; }
      if (count >= LIMITS.files) { files.push({ meta: f, action: "skip", reason: "слишком много файлов" }); continue; }
      count++;
      files.push({ meta: { ...f, id: sameOwner ? f.id : newId("file"), folder }, action: "add" });
    }
    report.files = { add: files.filter((x) => x.action === "add").length, skip: files.filter((x) => x.action === "skip").length };
  }
  return { next, files, report };
}
// Основные папки NEXA (FOLDERS в fileStore.js без вложенных) — у всех одинаковые id
const BASE_FOLDERS = ["photo", "video", "docs", "music", "other"];
const isBaseFolder = (id) => BASE_FOLDERS.includes(String(id));

// Имя файла копии: «NEXA — копия 2026-10-22.nexa-backup»
export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `NEXA-копия-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${BACKUP_EXT}`;
}
