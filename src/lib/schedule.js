// Расписание «Сегодня»: даты, сортировка, ближайшее дело, хранение nexa-schedule
import { plural } from "./format.js";

// Старый пример расписания. Сейчас по умолчанию расписание пустое, а этот
// список нужен только чтобы узнать и убрать пример, сохранённый раньше.
// place — где проходит (видно только на телефоне)
export const SCHEDULE = [
  { time: "09:30", title: "Лекция по проектированию", place: "Колледж" },
  { time: "11:00", title: "Встреча с куратором", place: "Колледж" },
  { time: "13:00", title: "Обед", place: "Кафе у дома" },
  { time: "14:30", title: "Работа над дипломом", place: "Дома" },
  { time: "17:00", title: "Тренировка", place: "Фитнес-клуб" },
];

// Своё расписание хранится в браузере; пока его нет — показываем пример выше
export const SCHEDULE_KEY = "nexa-schedule";

// День в виде "2026-10-11" — так дела привязаны к дате
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayFromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

// Сначала по дате, внутри дня — по времени
export const sortSchedule = (list) => [...list].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.time.localeCompare(b.time));

// Дела на конкретный день
export const itemsOn = (list, key) => list.filter((it) => it.date === key);

// Ближайшее дело, которое ещё не началось (старые дела без даты — сегодняшние)
export function nextScheduleItem(list, now = new Date()) {
  const today = dayKey(now);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const ahead = list.map((it) => ({ ...it, date: it.date || today }))
    .filter((it) => it.date > today || (it.date === today && (it.time || "") >= hm));
  return sortSchedule(ahead)[0] || null;
}

// «Сегодня», «Завтра» или «14 окт.»
export function scheduleDayLabel(key) {
  const t = new Date(); const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1);
  if (key === dayKey(t)) return "Сегодня";
  if (key === dayKey(tomorrow)) return "Завтра";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Пример, который раньше сохранялся сам: те же дела в том же количестве
export const isOldExample = (list) => list.length === SCHEDULE.length &&
  SCHEDULE.every((x) => list.some((y) => y.time === x.time && y.title === x.title));

// По умолчанию расписание пустое. Если в браузере остался старый пример — тоже пустое.
// Старые дела без даты считаем сегодняшними
export const SCHEDULE_MIGRATED_KEY = "nexa-schedule-migrated"; // кому уже перенесли дела этого браузера в облако

export const scheduleMigrated = () => { try { return JSON.parse(localStorage.getItem(SCHEDULE_MIGRATED_KEY) || "[]"); } catch { return []; } };

export const loadSchedule = (key = SCHEDULE_KEY) => {
  try {
    // Аккаунт впервые на этом устройстве: берём дела, что уже есть в браузере
    // (раньше расписание было общим) — иначе они бы пропали с экрана
    const uid = key.startsWith(SCHEDULE_KEY + "@") ? key.slice(SCHEDULE_KEY.length + 1) : null;
    if (uid && localStorage.getItem(key) === null && !scheduleMigrated().includes(uid)) return loadSchedule(SCHEDULE_KEY);
    const v = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(v)) return isOldExample(v) ? [] : sortSchedule(v.map((it) => (it.date ? it : { ...it, date: dayKey() })));
  } catch {}
  return [];
};

// Минуты от начала дня: "14:30" → 870
export const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

// ЭКРАН "СЕГОДНЯ" — расписание (таймлайн) + погода на сегодня и завтра.
// На компьютере: расписание слева, погода справа, ещё правее складка.
// На телефоне сначала погода, под ней расписание (порядок меняет CSS).
// «Через 20 минут», «Через 1 ч 15 мин», «Сейчас»
export function untilText(diff) {
  if (diff <= 0) return "Сейчас";
  if (diff < 60) return `Через ${diff} ${plural(diff, ["минуту", "минуты", "минут"])}`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `Через ${h} ч${m ? ` ${m} мин` : ""}`;
}

// Время по умолчанию для нового дела — следующий целый час
export const nextHour = () => `${String((new Date().getHours() + 1) % 24).padStart(2, "0")}:00`;

/* Полоса дней над расписанием: сегодня, завтра и ещё 5 дней вперёд.
   Под днём — точка, если на него уже есть дела */
export const DAYS_AHEAD = 14; // полоса дней на «Сегодня»: сегодня и ещё 13 (листается вбок)
