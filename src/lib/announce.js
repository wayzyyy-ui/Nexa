/* Разовые объявления для вошедших в аккаунт: «вышло что-то новое». Показываются обычным уведомлением
   (всплывающее + колокольчик, категория «Обновления», выключается общим переключателем уведомлений).
   Каждое объявление — один раз на аккаунт на этом устройстве (`nexa-announce@<uid>`: список показанных id).
   Новое объявление: добавить строку в ANNOUNCEMENTS — старые не повторяются. Только в приложении, без сервера
   и без рассылки: человек увидит его при следующем открытии NEXA. Тесты — tests/announce.test.mjs */

export const ANNOUNCEMENTS = [
  {
    id: "mini-1",
    title: "Встречайте NEXA mini-1 — нашу нейросеть",
    text: "Простые просьбы — «открой файлы», «тёмная тема», «что у меня сегодня» — ассистент теперь понимает сам, прямо на устройстве. Помочь ей учиться можно в Настройках → «Улучшение ассистента».",
    toastText: "Простые просьбы ассистент теперь понимает сам, прямо на устройстве",
    target: { tab: "assistant" },
  },
];

export const announceKey = (uid) => `nexa-announce@${uid}`;

export function loadSeen(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(announceKey(uid)) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
export function saveSeen(uid, seen) {
  try { localStorage.setItem(announceKey(uid), JSON.stringify(seen.slice(-50))); } catch { /* нет места — покажем ещё раз, не страшно */ }
}

// Что ещё не показывали этому аккаунту (гостю и «без аккаунта» — ничего)
export function unseenAnnouncements(uid, seen, list = ANNOUNCEMENTS) {
  if (!uid) return [];
  const have = new Set(seen);
  return list.filter((a) => !have.has(a.id));
}
