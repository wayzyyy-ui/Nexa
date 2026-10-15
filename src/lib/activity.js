// Лента «Активность»: хранение и подписи времени
/* ═══ ЛЕНТА «АКТИВНОСТЬ» ══════════════════════════════════════
   События связи устройств: подключилось, отключилось, получен текст / файл /
   ссылка, устройство нашлось, экран заблокирован. Хранится в localStorage
   ЭТОГО браузера (nexa-activity или nexa-activity@<id>), последние 50.
   Это не общая история аккаунта: на другом устройстве — своя лента.
   Тексты сообщений, ссылки целиком и коды сюда не пишем */
export const ACTIVITY_MAX = 50;

export const activityTime = (at) => {
  const d = new Date(at), now = new Date();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${hm}`;
};

export const loadActivity = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v.slice(0, ACTIVITY_MAX) : []; } catch { return []; }
};
