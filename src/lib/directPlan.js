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

// Можно ли передать напрямую: файл, размер, устройство в сети и умеет (p2p в Presence)
export function directProblem(file, device) {
  if (typeof RTCPeerConnection !== "function") return "Этот браузер не умеет передавать напрямую";
  if (!file) return "Нет файла";
  if (file.size > DIRECT_MAX) return "Напрямую — до 1 ГБ. Больше — через облако";
  if (!device?.online) return "Устройство не в сети";
  if (!device.p2p) return "На том устройстве старая версия NEXA — обновите её";
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
    return m && typeof m === "object" && ["meta", "end", "ok"].includes(m.t) ? m : null;
  } catch { return null; }
}

/* Описание соединения, которое уходит другому устройству: только адреса своей сети.
   Лишнее (srflx / relay — если вдруг появились) выбрасываем: файл не должен идти через чужие серверы */
export function lanOnlySdp(sdp) {
  return String(sdp || "").split(/\r?\n/).filter((l) => !/^a=candidate:/.test(l) || / typ host( |$)/.test(l)).join("\r\n");
}
