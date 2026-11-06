// Google Календарь — правила без интерфейса и сети (тесты tests/gcal.test.mjs)
import { sortSchedule } from "./schedule.js";

export const GCAL_REFRESH_MS = 15 * 60 * 1000;  // само обновляется раз в 15 минут
export const GCAL_RETURN_MS = 2 * 60 * 1000;    // при возврате в NEXA — не чаще раза в 2 минуты
export const GCAL_WAIT_MS = 5 * 60 * 1000;      // сколько ждём подключения во внешнем браузере
export const GCAL_POLL_MS = 3000;
export const GCAL_PARAM = "gcal";               // сайт вернулся от Google: /?gcal=ok

export const GCAL_FAIL = {
  denied: "Без доступа к календарю подключить его не получится.",
  expired: "Время подключения вышло. Попробуйте ещё раз.",
  upstream: "Google сейчас не отвечает. Попробуйте позже.",
  reconnect: "Google больше не даёт доступ — подключите календарь заново.",
  server: "Не получилось подключить календарь. Попробуйте позже.",
  network: "Нет связи — попробуйте, когда появится интернет.",
  not_configured: "Подключение календаря пока не настроено.",
};

/* Что показываем в расписании: свои дела + дела из Google (только для показа).
   Дела из Google помечены external — их нельзя менять и они не уходят в таблицу schedule */
export function mergeSchedule(own, external) {
  if (!external?.length) return own;
  return sortSchedule([...own, ...external.map((it) => ({ ...it, external: true }))]);
}

// Сохранённое на устройстве: только правильные записи (localStorage мог испортиться)
export function readCache(raw) {
  try {
    const v = JSON.parse(raw);
    if (!v || v.connected !== true || !Array.isArray(v.items)) return null;
    const items = v.items.filter((it) => it && typeof it.id === "string" && typeof it.title === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(it.date) && /^\d{2}:\d{2}$/.test(it.time));
    return { connected: true, items, at: Number(v.at) || 0 };
  } catch { return null; }
}
