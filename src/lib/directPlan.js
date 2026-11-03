/* Прямая передача файла между своими устройствами (2026-10-27) — правила без сети и интерфейса.
   Ход — src/lib/direct.js, тесты — tests/direct.test.mjs.
   Соединение — WebRTC (канал данных) только внутри одной сети: без серверов STUN/TURN (решение автора),
   поэтому устройства в разных сетях честно не соединятся — тогда предлагаем облако, как раньше */

export const DIRECT_MAX = 1024 * 1024 * 1024;  // 1 ГБ: файл собирается в памяти получателя
export const CHUNK = 64 * 1024;                // кусок в канале данных
export const READ_BLOCK = 1024 * 1024;         // столько читаем с диска за раз
export const HIGH_WATER = 4 * 1024 * 1024;     // в очереди канала больше — ждём, пока уйдёт (16 МБ браузер уже не принимает)
export const LOW_WATER = 1024 * 1024;
export const ASK_MS = 60000;                   // ждём «Принять» на том устройстве
export const CONNECT_MS = 15000;               // ждём, пока устройства соединятся
export const STALL_MS = 20000;                 // передача молчит дольше — обрыв
export const ICE_MS = 2500;                    // сбор своих адресов в сети (обычно меньше секунды)

// Без внешних серверов: только адреса в своей сети
export const RTC_CONFIG = { iceServers: [] };

export const DIRECT_FILES_MAX = 50;
// Передаём только имя, никогда путь; файлы не открываются автоматически.
export function directName(name) {
  const leaf = String(name || "файл").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, "_").replace(/[. ]+$/g, "").trim();
  const clean = (!leaf || /^\.+$/.test(leaf) ? "файл" : leaf).slice(0, 180);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
}
export function directManifest(files) {
  return Array.from(files || []).map((f) => ({ name: directName(f.name), size: f.size, mime: String(f.type || f.mime || "").slice(0, 255) }));
}
export function validManifest(files, total) {
  return Array.isArray(files) && files.length > 0 && files.length <= DIRECT_FILES_MAX
    && files.every((f) => f && typeof f.name === "string" && f.name.length > 0 && f.name.length <= 255
      && Number.isSafeInteger(f.size) && f.size >= 0 && typeof f.mime === "string" && f.mime.length <= 255)
    && files.reduce((n, f) => n + f.size, 0) === total && total <= DIRECT_MAX;
}
export function directBatch(input) {
  const files = Array.isArray(input) ? input : [input];
  const manifest = directManifest(files);
  const size = manifest.reduce((n, f) => n + f.size, 0);
  if (!validManifest(manifest, size)) throw new Error("Выберите от 1 до 50 файлов общим размером до 1 ГБ");
  const file = files.length === 1 ? files[0] : new File(files, `Файлы NEXA · ${files.length}`, { type: "application/octet-stream" });
  return { file, manifest };
}
export function splitDirectFiles(blob, manifest) {
  if (!validManifest(manifest, blob.size)) throw new Error("Файлы пришли не целиком");
  let offset = 0;
  const names = new Set();
  return manifest.map((f) => {
    const base = directName(f.name);
    let name = base, n = 1;
    // Совпавшие имена в одной передаче не заменяют друг друга.
    while (names.has(name.toLocaleLowerCase())) {
      const dot = base.lastIndexOf(".");
      name = dot > 0 ? `${base.slice(0, dot)} (${n++})${base.slice(dot)}` : `${base} (${n++})`;
    }
    names.add(name.toLocaleLowerCase());
    const part = blob.slice(offset, offset + f.size, f.mime); offset += f.size;
    return { ...f, name, blob: part };
  });
}

// Можно ли передать напрямую: файл, размер, устройство в сети и умеет (p2p в Presence)
export function directProblem(file, device) {
  if (typeof RTCPeerConnection !== "function") return "Этот браузер не умеет передавать напрямую";
  if (!file) return "Нет файла";
  const files = Array.isArray(file) ? file : [file];
  if (!files.length || files.length > DIRECT_FILES_MAX) return "Выберите от 1 до 50 файлов";
  if (files.some((f) => !f || !Number.isSafeInteger(f.size) || f.size < 0)) return "Не получилось прочитать размер файла";
  if (files.reduce((n, f) => n + f.size, 0) > DIRECT_MAX) return "Напрямую — до 1 ГБ. Больше — через облако";
  if (!device?.online) return "Устройство не в сети";
  if (!device.p2p) return "На том устройстве старая версия NEXA — обновите её";
  if (files.length > 1 && !device.p2pBatch) return "Для нескольких файлов обновите NEXA на принимающем устройстве";
  return null;
}

// Тексты сбоев (для плашки и всплывающего)
export const DIRECT_FAIL = {
  declined: "Отклонили на том устройстве",
  busy: "То устройство сейчас принимает другой файл",
  noanswer: "Не ответили — откройте NEXA на том устройстве",
  connect: "Не соединились напрямую — устройства должны быть в одной сети Wi-Fi",
  stall: "Передача оборвалась",
  cancel: "Передачу отменили",
  size: "Файл пришёл не целиком",
  failed: "Не получилось",
};

// Шапка и конец передачи — короткие строки JSON; всё остальное — куски файла
export const metaMsg = (file) => JSON.stringify({ t: "meta", name: String(file.name || "файл").slice(0, 255), size: file.size, mime: file.type || "" });
export function parseCtl(data) {
  if (typeof data !== "string" || data.length > 2000) return null;
  try {
    const m = JSON.parse(data);
    return m && typeof m === "object" && ["meta", "end", "ok", "progress"].includes(m.t) ? m : null;
  } catch { return null; }
}

/* Описание соединения, которое уходит другому устройству: только адреса своей сети.
   Лишнее (srflx / relay — если вдруг появились) выбрасываем: файл не должен идти через чужие серверы */
export function lanOnlySdp(sdp) {
  return String(sdp || "").split(/\r?\n/).filter((l) => !/^a=candidate:/.test(l) || / typ host( |$)/.test(l)).join("\r\n");
}
