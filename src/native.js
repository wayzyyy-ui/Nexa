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
export const API_BASE = (import.meta.env.VITE_API_BASE ?? (isNative ? "https://nexa-link.ru" : "")).replace(/\/+$/, "");
export const API_CHAT_URL = `${API_BASE}/api/chat`;

/* Проверка обновлений (только в приложении).
   На сайте рядом с nexa.apk лежит version.json — номер версии этого APK
   (его пишет npm run release:android). Если там номер больше, чем у
   установленного приложения, возвращаем { version, url, required } — можно обновиться.
   required: true — версия приложения старше minVersionCode из version.json,
   то есть запрещена: приложение покажет экран «Эта версия устарела».
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
    return {
      version: latest.version,
      url: `${API_BASE}${latest.url || "/nexa.apk"}?v=${latest.versionCode}`,
      required: Number(info.build) < Number(latest.minVersionCode || 0),
    };
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

/* Вибрация (экран «Устройство ищут»). В приложении — через плагин Haptics,
   на сайте — navigator.vibrate (на iPhone в браузере её нет — тогда просто тихо) */
export async function vibrate(ms = 400) {
  try {
    if (isNative) {
      const { Haptics } = await import("@capacitor/haptics");
      await Haptics.vibrate({ duration: ms });
    } else {
      navigator.vibrate?.(ms);
    }
  } catch {}
}

/* Сканер QR — только в приложении (Google Code Scanner: свой экран камеры,
   разрешение на камеру не нужно). Возвращает текст из QR, null — отменили,
   { error } — сканер недоступен. Первый раз Android может докачать модуль сканера */
export const canScanQr = isNative;
export async function scanQr() {
  if (!isNative) return { error: "Сканер есть только в приложении NEXA" };
  try {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      // Модуля ещё нет — просим Android его скачать и ждём (до 30 секунд)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 30000);
        BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (e) => {
          if (e.state === 4) { clearTimeout(timer); resolve(); }          // готово
          if (e.state === 3 || e.state === 5) { clearTimeout(timer); reject(new Error("install")); } // отменено / ошибка
        });
        BarcodeScanner.installGoogleBarcodeScannerModule().catch(reject);
      });
    }
    // Закрыли сканер («Назад» или крестик) — Google отвечает ошибкой; это не сбой, просто null
    try {
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
      return barcodes?.[0]?.rawValue ?? null;
    } catch { return null; }
  } catch (e) {
    // Человек закрыл сканер — это не ошибка
    if (/cancel/i.test(String(e?.message))) return null;
    return { error: "Не получилось открыть сканер. Введите код вручную." };
  }
}

/* Значки статус-бара и нижней полосы — под цвет темы.
   Сами полосы прозрачные (приложение рисуется до краёв экрана), под ними
   виден фон страницы, поэтому их цвет и так совпадает с темой.
   Тёмная тема — светлые значки, светлая — тёмные */
export function setSystemBarsTheme(theme) {
  if (!isNative) return;
  SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

/* Запуск приложения — бесшовно и без размытия.
   1) Android показывает заставку: тёмный фон и векторный логотип
      (res/drawable/splash_icon.xml, 288dp, логотип в круге 192dp).
   2) Пока грузится интерфейс, поверх него лежит #nx-boot — тот же логотип,
      того же размера и в той же точке экрана (центр, 288×288). Убираем
      системную заставку — на экране ничего не меняется, прыжка нет.
   3) Грани логотипа чуть разъезжаются и тают (только прозрачность и сдвиг
      векторных фигур), фон уходит, интерфейс проявляется (прозрачность + сдвиг).
   При «уменьшить движение» — только плавное исчезновение, без сдвигов.
   Цвета — как в assets/logo_splash.svg; фон — цвет заставки (не цвет темы),
   иначе в светлой теме был бы скачок */
const SPLASH_BG = "#01090F"; // как windowSplashScreenBackground в styles.xml
const BOOT_FACETS = [
  ["nx-boot-f1", "M735.977 854.646L617.779 491.514L322.477 780.644Z", 'fill="#F2FAFF" fill-opacity="0.17"'],
  ["nx-boot-f2", "M722.457 237.212L798.145 743.09L322.197 555.698Z", 'fill="#F2FAFF" fill-opacity="0.39"'],
  ["nx-boot-f3", "M201.633 409.381L503.169 110.956L624.687 484.289L322.501 780.716Z", 'fill="url(#nx-boot-g)"'],
];
function mountBootLogo() {
  const style = document.createElement("style");
  style.textContent = `
    #nx-boot { position: fixed; inset: 0; z-index: 2147483000; background: ${SPLASH_BG};
      display: flex; align-items: center; justify-content: center; pointer-events: none; }
    #nx-boot svg { display: block; width: 288px; height: 288px; flex-shrink: 0; overflow: visible; }
    #nx-boot path { transition: transform 560ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease 140ms; }
    .nx-boot-go #nx-boot { opacity: 0; transition: opacity 420ms ease 200ms; }
    .nx-boot-go .nx-boot-f1 { transform: translate(30px, 90px); opacity: 0; }
    .nx-boot-go .nx-boot-f2 { transform: translate(90px, -30px); opacity: 0; }
    .nx-boot-go .nx-boot-f3 { transform: translate(-80px, -60px); opacity: 0; }
    @media (prefers-reduced-motion: reduce) {
      #nx-boot path { transition: none; }
      .nx-boot-go #nx-boot path { transform: none; }
      .nx-boot-go #nx-boot { transition: opacity 300ms ease; }
    }`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.id = "nx-boot";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<svg viewBox="0 0 288 288" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="nx-boot-g" x1="503.169" y1="110.956" x2="322.501" y2="780.716" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F2FAFF" stop-opacity="0.54"/><stop offset="1" stop-color="#F2FAFF" stop-opacity="0.46"/>
    </linearGradient></defs>
    <g transform="translate(57.65 60.59) scale(0.1727)">
      ${BOOT_FACETS.map(([cls, d, fill]) => `<path class="${cls}" d="${d}" ${fill}/>`).join("")}
    </g></svg>`;
  document.body.appendChild(el);
}

export async function startIntro() {
  if (!isNative) return;
  const root = document.documentElement;
  if (root.classList.contains("nx-boot-go")) return; // уже запускали
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    // Под заставкой уже лежит такой же логотип — смена незаметна
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {}
  // Ждём, пока системная заставка растворится, и только тогда раскрываемся
  setTimeout(() => {
    requestAnimationFrame(() => {
      root.classList.remove("nx-intro-wait");
      root.classList.add("nx-intro-go", "nx-boot-go");
      setTimeout(() => document.getElementById("nx-boot")?.remove(), 900);
    });
  }, 220);
}

// Запрет масштабирования двумя пальцами — только в приложении
// (на сайте зум оставляем: он нужен людям с плохим зрением)
if (isNative) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !/user-scalable/.test(meta.content)) {
    meta.content += ", maximum-scale=1, user-scalable=no";
  }
  document.documentElement.classList.add("nx-native", "nx-intro-wait");
  // Тот же логотип, что на заставке Android, — сразу поверх интерфейса
  mountBootLogo();
  // Подстраховка: если по какой-то причине startIntro не сработал,
  // через 4 секунды всё равно показываем интерфейс и убираем заставку
  setTimeout(() => {
    if (!document.documentElement.classList.contains("nx-boot-go")) startIntro();
  }, 4000);
}
