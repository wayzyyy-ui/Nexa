// Уведомления: колокольчик (nexa-notifications), категории и настройки, ключи без дублей (claimNote)
import { Icon } from "../ui/icons.jsx";

/* ═══ ЦЕНТР УВЕДОМЛЕНИЙ ═════════════════════════════════════
   Колокольчик в верхней строке: число непрочитанных, по нажатию —
   панель с последними 20 событиями и кнопкой «Очистить».
   notes = { items: [{ id, at, title, text, kind }], seenAt } — seenAt:
   когда панель открывали в последний раз (всё, что позже, — новое) */
export const NOTES_KEY = "nexa-notifications";

export const NOTES_MAX = 20;

export const loadNotes = () => {
  try { const v = JSON.parse(localStorage.getItem(NOTES_KEY)); if (v && Array.isArray(v.items)) return v; } catch {}
  return { items: [], seenAt: 0 };
};

/* ═══ ЕДИНЫЕ УВЕДОМЛЕНИЯ (notify в NexaApp) ═══
   Категории — у каждой две настройки (nexa-note-prefs, на этом устройстве):
   app — в приложении (всплывающее + колокольчик), system — системное
   (Android-приложение; сайт на компьютере — пока вкладка открыта).
   В Настройках это один переключатель на категорию (app; выключили — молчит везде)
   и один общий «Системные уведомления» (system у всех включённых категорий).
   В колокольчик попадают только события этих категорий; ответы на действия
   человека («Файл переименован», «Тема переключена») — только всплывающие.
   Лента «Активность» — отдельно: журнал связи устройств, её не трогаем */
export const NOTE_CATS = [
  { id: "files", label: "Файлы", sub: "Файл отправлен или не отправлен, пришёл файл", icon: Icon.folder },
  { id: "flow", label: "Текст и ссылки", sub: "Пришло с другого устройства", icon: Icon.shareUp },
  { id: "devices", label: "Устройства", sub: "Новое устройство в аккаунте, устройство нашлось", icon: Icon.phone },
  { id: "sync", label: "Синхронизация и связь", sub: "Не удалось сохранить в облако, связь восстановлена, конфликты", icon: Icon.refresh },
  { id: "schedule", label: "Расписание", sub: "За 15 минут до дела", icon: Icon.calendar },
  { id: "updates", label: "Обновления", sub: "Вышла новая версия приложения", icon: Icon.download },
];

export const NOTE_PREFS_KEY = "nexa-note-prefs";

export const loadNotePrefs = () => {
  const prefs = Object.fromEntries(NOTE_CATS.map((c) => [c.id, { app: true, system: false }]));
  try {
    const v = JSON.parse(localStorage.getItem(NOTE_PREFS_KEY));
    if (v) for (const c of NOTE_CATS) if (v[c.id]) prefs[c.id] = { app: v[c.id].app !== false, system: v[c.id].app !== false && !!v[c.id].system }; // выключенная категория молчит и в системе
  } catch {}
  return prefs;
};

/* Одно событие — одно уведомление, даже если пришло несколько сигналов
   (повтор события, две вкладки одного браузера, повторная синхронизация).
   Ключ события помним сутки; между вкладками — под общим замком (Web Locks) */
export const NOTE_CLAIMS_KEY = "nexa-note-claims";

export function claimNow(key) {
  try {
    const now = Date.now(), all = JSON.parse(localStorage.getItem(NOTE_CLAIMS_KEY) || "{}");
    for (const k in all) if (now - all[k] > 86400000) delete all[k];
    if (all[key]) return false;
    all[key] = now;
    localStorage.setItem(NOTE_CLAIMS_KEY, JSON.stringify(all));
  } catch {}
  return true;
}

export const claimNote = (key) => (!key ? Promise.resolve(true)
  : navigator.locks?.request ? navigator.locks.request("nexa-note-claims", () => claimNow(key)) : Promise.resolve(claimNow(key)));

// Время события: «только что», «5 мин назад», «в 14:05», «вчера в 14:05», «3 окт. в 14:05»
export function noteTime(at) {
  const diff = Math.max(0, Date.now() - at);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const d = new Date(at);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `в ${hm}`;
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${hm}`;
}
