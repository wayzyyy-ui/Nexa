/* Связка NEXA с Android-приложением (Capacitor).
   Всё здесь срабатывает только внутри приложения — на сайте функции
   ничего не делают, и сайт работает как раньше. */
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

// Запущены ли мы внутри Android-приложения (а не в браузере)
export const isNative = Capacitor.isNativePlatform();

/* Адрес сервера ассистента.
   На сайте — пусто, запрос идёт на свой же адрес: /api/chat.
   В приложении сайта рядом нет, поэтому нужен полный адрес. Он берётся из
   файла .env.android (VITE_API_BASE). Если его нет — запасной nexa-link.ru */
const API_BASE = (import.meta.env.VITE_API_BASE ?? (isNative ? "https://nexa-link.ru" : "")).replace(/\/+$/, "");
export const API_CHAT_URL = `${API_BASE}/api/chat`;

/* Проверка обновлений (только в приложении).
   На сайте рядом с nexa.apk лежит version.json — номер версии этого APK
   (его пишет npm run release:android). Если там номер больше, чем у
   установленного приложения, возвращаем { version, url } — можно обновиться.
   Нет сети или файла — тихо возвращаем null, приложение работает как обычно */
export async function checkForUpdate() {
  if (!isNative) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo(); // build — число версии установленного приложения
    const res = await fetch(`${API_BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const latest = await res.json();
    if (!latest || !(Number(latest.versionCode) > Number(info.build))) return null;
    // ?v= — чтобы телефон не взял старый файл из кэша
    return { version: latest.version, url: `${API_BASE}${latest.url || "/nexa.apk"}?v=${latest.versionCode}` };
  } catch {
    return null;
  }
}

/* Скачать обновление: открываем ссылку на APK — Capacitor отдаёт внешние
   адреса системному браузеру, он скачивает файл, а Android предлагает
   установить его поверх старого приложения (данные сохраняются) */
export function openUpdate(url) {
  window.location.href = url;
}

/* Значки статус-бара и нижней полосы — под цвет темы.
   Сами полосы прозрачные (приложение рисуется до краёв экрана), под ними
   виден фон страницы, поэтому их цвет и так совпадает с темой.
   Тёмная тема — светлые значки, светлая — тёмные */
export function setSystemBarsTheme(theme) {
  if (!isNative) return;
  SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

/* Появление интерфейса из размытия в приложении.
   Пока приложение грузится, Android показывает заставку — если начать
   анимацию сразу, она пройдёт под заставкой и её не увидят. Поэтому:
   интерфейс ждёт скрытым (класс nx-intro-wait), потом убираем заставку
   и в тот же момент запускаем проявление (класс nx-intro-go) */
export async function startIntro() {
  if (!isNative) return;
  const root = document.documentElement;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {}
  requestAnimationFrame(() => {
    root.classList.remove("nx-intro-wait");
    root.classList.add("nx-intro-go");
  });
}

// Запрет масштабирования двумя пальцами — только в приложении
// (на сайте зум оставляем: он нужен людям с плохим зрением)
if (isNative) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !/user-scalable/.test(meta.content)) {
    meta.content += ", maximum-scale=1, user-scalable=no";
  }
  document.documentElement.classList.add("nx-native", "nx-intro-wait");
  // Подстраховка: если по какой-то причине startIntro не сработал,
  // через 4 секунды всё равно показываем интерфейс и убираем заставку
  setTimeout(() => {
    if (document.documentElement.classList.contains("nx-intro-wait")) startIntro();
  }, 4000);
}
