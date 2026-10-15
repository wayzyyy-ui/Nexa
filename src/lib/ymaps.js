// Яндекс Карты, JavaScript API v3: ленивая загрузка скрипта (один раз на всё приложение) и общие помощники.
// Ключ — VITE_YANDEX_MAPS_KEY (в код не вписывать)
/* ═══ БЫСТРЫЕ ДЕЙСТВИЯ С РЕАЛЬНЫМ УСТРОЙСТВОМ ═════════════════
   Найти, заблокировать экран NEXA, отправить файл, открыть ссылку.
   act — действия из NexaApp: { find, lock, sendFile, cancelSend, openLink, reconnect },
   st — их состояние для этого устройства: { find, lock, send: { state, progress, error } } */
/* Карта «где устройство» — Яндекс Карты, JavaScript API v3.
   Скрипт api-maps.yandex.ru/v3 подключается сам, при первом показе карты, и только один раз
   на всё приложение (loadYmaps). Ключ — VITE_YANDEX_MAPS_KEY из переменных окружения:
   ключ JS API публичный (он всё равно виден в адресе скрипта), защищает его ограничение
   по HTTP Referer в кабинете разработчика Яндекса. Нет ключа, нет сети, API не ответил —
   заглушка с координатами и ссылкой «Открыть в Яндекс Картах».
   Условия Яндекса: логотип и ссылки на карте (copyrights) не прячем и ничем не закрываем */
export const YMAPS_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY || "";

export const YMAPS_TIMEOUT_MS = 15000; // дольше 15 с скрипт не ждём

export let ymapsLoading = null;        // одна загрузка на всё приложение

export function loadYmaps() {
  if (window.ymaps3) return window.ymaps3.ready.then(() => window.ymaps3);
  if (!ymapsLoading) {
    ymapsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YMAPS_KEY)}&lang=ru_RU`;
      s.async = true;
      const timer = setTimeout(() => fail(new Error("timeout")), YMAPS_TIMEOUT_MS);
      // Не загрузилось — убираем тег, чтобы следующая попытка (например, когда вернётся сеть) шла заново
      const fail = (e) => { clearTimeout(timer); if (!window.ymaps3) { s.remove(); ymapsLoading = null; } reject(e); };
      s.onload = () => {
        if (!window.ymaps3) return fail(new Error("no-api"));
        window.ymaps3.ready.then(() => { clearTimeout(timer); resolve(window.ymaps3); }, fail);
      };
      s.onerror = () => fail(new Error("network"));
      document.head.appendChild(s);
    });
  }
  return ymapsLoading;
}

// Тема карты — как у NEXA (читаем атрибут data-theme у <html>)
export const ymapsTheme = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

// Ссылка на эту точку в Яндекс Картах (метка pt и масштаб z)
export const yandexMapsUrl = (lat, lon) => `https://yandex.ru/maps/?pt=${lon.toFixed(6)},${lat.toFixed(6)}&z=17&l=map`;
