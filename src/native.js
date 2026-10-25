/* Связка NEXA с Android-приложением (Capacitor).
   Всё здесь срабатывает только внутри приложения — на сайте функции
   ничего не делают, и сайт работает как раньше. */
import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin } from "@capacitor/core";
import { isDesktop } from "./lib/platform.js";
import { desktopClipboardRead, desktopClipboardWrite, desktopNotify } from "./lib/desktop.js";
import { targetToLink } from "./lib/deeplink.js";
import { VERSION } from "./version.js";
import { LOGO_MARK_D, WORD_RECTS, WORD_PATHS, MONO_PATHS, MONO_RECTS, MONO_DOT, rectsSvg } from "./ui/brandArt.js";

// Запущены ли мы внутри Android-приложения (а не в браузере)
export const isNative = Capacitor.isNativePlatform();
// Приложение для ПК (Tauri, см. src/lib/platform.js): своего сервера рядом нет, как и у Android
export { isDesktop };

/* Адрес сервера ассистента.
   На сайте — пусто, запрос идёт на свой же адрес: /api/chat.
   В приложении (Android и ПК) сайта рядом нет, поэтому нужен полный адрес. Он берётся из
   файла .env.android / .env.desktop (VITE_API_BASE). Если его нет — запасной nexa-link.ru */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? (isNative || isDesktop ? "https://nexa-link.ru" : "")).replace(/\/+$/, "");
export const API_CHAT_URL = `${API_BASE}/api/chat`;

/* Проверка обновлений (только в приложении).
   На сайте рядом с nexa.apk лежит version.json (его пишет npm run copy:apk).
   Номер установленной версии — App.getInfo().build (versionCode из build.gradle).
   Сайт спрашиваем не чаще раза в 6 часов (при запуске и при возврате в приложение);
   между проверками — последний ответ из памяти (nexa-update-cache). force — спросить сейчас.
   Если на сайте новее: { version, versionCode, url (ссылка с номером версии), notes, size,
   sha256, signer, required }. required — версия старше minVersionCode: экран «Обновите приложение».
   Нет сети и ответа в памяти — null, приложение работает как обычно */
const UPDATE_CACHE = "nexa-update-cache";
export const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
// Приложение для ПК живёт в трее неделями, а после выпуска узнать о новой версии нужно быстро —
// version.json крошечный, поэтому спрашиваем свежий не реже раза в 5 минут
const DESKTOP_EVERY_MS = 5 * 60 * 1000;
// Последний ответ version.json { at, latest } — его же читает обновление веб-части (src/lib/ota.js)
export const readUpdateCache = () => { try { return JSON.parse(localStorage.getItem(UPDATE_CACHE)); } catch { return null; } };
export async function checkForUpdate({ force = false } = {}) {
  if (!isNative && !isDesktop) return null;
  try {
    // Приложение для ПК: своя версия = VERSION, установщик не знает versionCode (см. desktopUpdate ниже)
    const info = isDesktop ? { build: 0 } : await (await import("@capacitor/app")).App.getInfo(); // build — versionCode установленного приложения
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(UPDATE_CACHE)); } catch {}
    let latest = cached?.latest || null;
    if (force || !cached || Date.now() - cached.at > (isDesktop ? DESKTOP_EVERY_MS : UPDATE_EVERY_MS)) {
      const res = await fetch(`${API_BASE}/version.json?t=${Date.now()}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        latest = await res.json().catch(() => latest);
        try { localStorage.setItem(UPDATE_CACHE, JSON.stringify({ at: Date.now(), latest })); } catch {}
      }
    }
    if (isDesktop) return desktopUpdate(latest);
    if (!latest || !(Number(latest.versionCode) > Number(info.build))) return null;
    const path = latest.apkUrl || `${latest.url || "/nexa.apk"}?v=${latest.versionCode}`;
    return {
      version: String(latest.version || ""),
      versionCode: Number(latest.versionCode),
      url: /^https:\/\//.test(path) ? path : `${API_BASE}${path}`,
      notes: Array.isArray(latest.notes) ? latest.notes.filter((x) => typeof x === "string").slice(0, 12) : [],
      size: Number(latest.size) || 0,
      sha256: typeof latest.sha256 === "string" ? latest.sha256 : "",
      signer: typeof latest.signer === "string" ? latest.signer : "",
      required: Number(info.build) < Number(latest.minVersionCode || 0),
    };
  } catch {
    return null;
  }
}

/* Приложение для ПК: блок desktop в version.json (пишет npm run release:desktop):
   { version, url: "/nexa-setup.exe", exeUrl, size, sha256, notes, minVersion }.
   Новее установленной (VERSION) — показываем «Обновить»; старше minVersion — экран «Обновите NEXA».
   Сама установка — модуль обновлений Tauri с проверкой подписи (updater.rs) */
const verNum = (v) => { const [a = 0, b = 0, c = 0] = String(v || "").split(".").map((x) => parseInt(x, 10) || 0); return a * 1e6 + b * 1e3 + c; };
/* «Вышла NEXA X» системным уведомлением, даже когда NEXA закрыта (UpdateCheckWorker.java,
   раз в ~6 часов при сети). Сюда — что уже знает сама NEXA: последняя версия из version.json,
   которую она видела (о ней не уведомляем — карточка «Обновить» уже была), текущая веб-часть,
   включены ли уведомления. Только Android-приложение; старый APK без метода — молча ничего */
export async function updateWatch(on) {
  if (!updPlugin) return;
  let latest = null;
  try { latest = JSON.parse(localStorage.getItem(UPDATE_CACHE))?.latest || null; } catch {}
  const known = [latest?.version, latest?.web?.version].filter((v) => typeof v === "string").sort((a, b) => verNum(b) - verNum(a))[0] || VERSION;
  await updPlugin.watch({ url: `${API_BASE}/version.json`, web: VERSION, known, on: !!on }).catch(() => {});
}

function desktopUpdate(latest) {
  const d = latest?.desktop;
  if (!d || typeof d.version !== "string" || !(verNum(d.version) > verNum(VERSION))) return null;
  const path = typeof d.exeUrl === "string" ? d.exeUrl : "/nexa-setup.exe";
  return {
    version: d.version,
    url: /^https:\/\//.test(path) ? path : `${API_BASE}${path}`, // на всякий случай — скачать в браузере
    notes: Array.isArray(d.notes) ? d.notes.filter((x) => typeof x === "string").slice(0, 12) : [],
    size: Number(d.size) || 0,
    required: !!d.minVersion && verNum(VERSION) < verNum(d.minVersion),
    desktop: true,
  };
}

/* ─── Обновление изнутри (NexaUpdatePlugin.java) ───
   Скачать APK в кэш с прогрессом и отменой → проверить размер и SHA-256 →
   открыть системный установщик. Тихой установки нет: Android всегда спрашивает */
const updPlugin = isNative ? registerPlugin("NexaUpdate") : null;
export async function updateDownload(info, onProgress) {
  const sub = updPlugin.addListener("progress", (e) => onProgress?.(e.loaded, e.total));
  try { return await updPlugin.download({ url: info.url, size: info.size || 0, sha256: info.sha256 || "" }); }
  finally { Promise.resolve(sub).then((h) => h?.remove()).catch(() => {}); }
}
export const updateCancel = () => updPlugin?.cancel().catch(() => {});
export async function updateCanInstall() { try { return (await updPlugin.canInstall()).allowed; } catch { return false; } }
export const updateOpenSettings = () => updPlugin?.openInstallSettings().catch(() => {});
export const updateInstall = () => updPlugin.install();
export async function updateSigner() { try { return (await updPlugin.signer()).sha256 || ""; } catch { return ""; } }
export const updateCleanup = () => updPlugin?.cleanup().catch(() => {});

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
   3) Фирменная заставка (макет автора 2026-10-23), одна шкала ~1,8 с от готовности интерфейса:
      грани логотипа расходятся и тают, на их месте линиями прорисовывается знак NEXA,
      фон мягко переходит в градиент Главной; знак поднимается, под ним проявляется слово NEXA,
      внизу — «Разработано mono.engineering». Потом заставка растворяется, интерфейс
      проявляется под ней (прозрачность + сдвиг на 8 px — nx-intro в appStyles.js).
      Двигаются только transform, opacity и stroke-dashoffset векторных фигур.
   При «уменьшить движение» — без сдвигов и прорисовки: заставка просто появляется и тает, короче.
   Только при настоящем запуске страницы (холодный старт, перезапуск после обновления веб-части):
   возврат из фона, смена разделов и перерисовки её не трогают.
   Цвета — как в assets/logo_splash.svg и тёмной теме; фон — цвет заставки (не цвет темы),
   иначе в светлой теме был бы скачок */
const SPLASH_BG = "#01090F"; // как windowSplashScreenBackground в styles.xml
const SPLASH_BG_2 = "#031B2C"; // --home-bg-b тёмной темы: тот же градиент, что у Главной
const BOOT_INK = "#F2FAFF", BOOT_MINT = "#00FFDF";
const BOOT_FACETS = [
  ["nx-boot-f1", "M735.977 854.646L617.779 491.514L322.477 780.644Z", 'fill="#F2FAFF" fill-opacity="0.17"'],
  ["nx-boot-f2", "M722.457 237.212L798.145 743.09L322.197 555.698Z", 'fill="#F2FAFF" fill-opacity="0.39"'],
  ["nx-boot-f3", "M201.633 409.381L503.169 110.956L624.687 484.289L322.501 780.716Z", 'fill="url(#nx-boot-g)"'],
];
// Когда что начинается (мс от готовности интерфейса): BOOT_OUT — заставка тает, BOOT_DONE — убрана
const BOOT_OUT = 1750, BOOT_OUT_REDUCED = 700, BOOT_FADE = 480;
// Переход в Главную: слово NEXA летит в шапку за BOOT_LAND, потом за BOOT_SWAP сменяется логотипом шапки
// Медленнее, чем было (680 / 160): на загруженном телефоне короткий перелёт «рвался»
const BOOT_LAND = 950, BOOT_SWAP = 240;
function mountBootLogo() {
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)", soft = "cubic-bezier(0.4, 0, 0.2, 1)";
  const style = document.createElement("style");
  style.textContent = `
    #nx-boot { position: fixed; inset: 0; z-index: 2147483000; background: ${SPLASH_BG}; pointer-events: none; overflow: hidden; }
    #nx-boot > * { position: absolute; }
    .nx-boot-bg { inset: 0; opacity: 0; background: linear-gradient(160deg, ${SPLASH_BG} 0%, ${SPLASH_BG} 45%, ${SPLASH_BG_2} 100%); }
    /* Системный логотип: та же точка и размер, что у заставки Android */
    .nx-boot-splash { left: 50%; top: 50%; width: 288px; height: 288px; margin: -144px 0 0 -144px; overflow: visible; }
    .nx-boot-splash path { will-change: transform, opacity; }
    /* Знак линиями: сначала в центре (на месте граней), потом поднимается к слову */
    .nx-boot-mark { left: 50%; top: 50%; width: min(36vw, 168px); transform: translate(-50%, -50%); will-change: transform; }
    .nx-boot-mark svg { display: block; width: 100%; height: auto; overflow: visible; }
    /* Прорисовка: штрих «1, промежуток 2» сдвинут чуть больше чем на длину — на старте ни одного
       отрезка нулевой длины (иначе закруглённые концы видны точками); плюс короткое проявление */
    .nx-boot-mark path { stroke-dasharray: 1 2; stroke-dashoffset: 1.002; opacity: 0; }
    .nx-boot-word { left: 50%; top: 50%; width: min(78vw, 340px); transform: translate(-50%, calc(-50% + 14px)); opacity: 0; }
    .nx-boot-word svg { display: block; width: 100%; height: auto; }
    .nx-boot-made { left: 0; right: 0; bottom: calc(7vh + var(--sab, 0px)); display: flex; flex-direction: column; align-items: center; gap: 12px; opacity: 0;
      font: 400 12px/1 Manrope, system-ui, sans-serif; color: ${BOOT_INK}; }
    .nx-boot-made span { opacity: 0.45; }
    .nx-boot-made svg { display: block; height: 15px; width: auto; }

    .nx-boot-go .nx-boot-bg { opacity: 1; transition: opacity 900ms ${soft}; }
    .nx-boot-go .nx-boot-splash path { opacity: 0; transition: transform 700ms ${ease}, opacity 420ms ${soft} 80ms; }
    .nx-boot-go .nx-boot-f1 { transform: translate(50px, 140px); }
    .nx-boot-go .nx-boot-f2 { transform: translate(140px, -50px); }
    .nx-boot-go .nx-boot-f3 { transform: translate(-130px, -100px); }
    .nx-boot-go .nx-boot-mark path { stroke-dashoffset: 0; opacity: 1; transition: stroke-dashoffset 760ms ${soft} 140ms, opacity 160ms ease 140ms; }
    .nx-boot-go .nx-boot-mark { transform: translate(-50%, calc(-50% - 22vh)); transition: transform 680ms ${ease} 640ms; }
    .nx-boot-go .nx-boot-word { opacity: 1; transform: translate(-50%, -50%); transition: opacity 560ms ${soft} 820ms, transform 680ms ${ease} 820ms; }
    .nx-boot-go .nx-boot-made { opacity: 1; transition: opacity 560ms ${soft} 1000ms; }
    .nx-boot-out #nx-boot { opacity: 0; transition: opacity ${BOOT_FADE}ms ${soft}; }
    /* Переход в Главную (nx-boot-land, без общего затухания): фон растворяется — под ним интерфейс;
       знак уходит вверх и тает, подпись гаснет вниз; слово NEXA летит в шапку (transform задаёт bootLand) */
    .nx-boot-word { will-change: transform; }
    .nx-boot-land #nx-boot { opacity: 1; background-color: transparent; transition: background-color 760ms ${soft} 80ms; }
    .nx-boot-land .nx-boot-bg { opacity: 0; transition: opacity 760ms ${soft} 80ms; }
    .nx-boot-land .nx-boot-mark { opacity: 0; transform: translate(-50%, calc(-50% - 22vh - 48px)) scale(0.72);
      transition: transform ${BOOT_LAND}ms ${ease}, opacity 560ms ${soft}; }
    .nx-boot-land .nx-boot-made { opacity: 0; transform: translateY(14px); transition: opacity 440ms ${soft}, transform 600ms ${ease}; }
    .nx-boot-land .nx-boot-word svg { transition: fill ${BOOT_LAND}ms ${soft}; }
    .nx-boot-swap .nx-boot-word { opacity: 0; transition: opacity ${BOOT_SWAP}ms linear !important; }
    /* Пока слово летит, логотип шапки скрыт — потом он проявляется ровно на его месте */
    .nx-boot-land:not(.nx-boot-swap) .nx-home-head svg[aria-label="NEXA"] { opacity: 0; }
    .nx-boot-swap .nx-home-head svg[aria-label="NEXA"] { transition: opacity ${BOOT_SWAP}ms linear; }
    @media (prefers-reduced-motion: reduce) {
      #nx-boot *, .nx-boot-go #nx-boot * { transition: none !important; }
      .nx-boot-go .nx-boot-splash { opacity: 0; }
      .nx-boot-go .nx-boot-splash path { transform: none; }
      .nx-boot-go .nx-boot-mark { transform: translate(-50%, calc(-50% - 22vh)); }
      .nx-boot-out #nx-boot { transition: opacity 260ms ease !important; }
    }`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.id = "nx-boot";
  el.setAttribute("aria-hidden", "true");
  const wordPaths = WORD_PATHS.map((p) => `<path d="${p.d}"${p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ""}/>`).join("");
  el.innerHTML = `<div class="nx-boot-bg"></div>
    <svg class="nx-boot-splash" viewBox="0 0 288 288" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="nx-boot-g" x1="503.169" y1="110.956" x2="322.501" y2="780.716" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F2FAFF" stop-opacity="0.54"/><stop offset="1" stop-color="#F2FAFF" stop-opacity="0.46"/>
      </linearGradient></defs>
      <g transform="translate(57.65 60.59) scale(0.1727)">
        ${BOOT_FACETS.map(([cls, d, fill]) => `<path class="${cls}" d="${d}" ${fill}/>`).join("")}
      </g></svg>
    <div class="nx-boot-mark"><svg viewBox="0 0 46 45" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${LOGO_MARK_D}" pathLength="1" stroke="${BOOT_INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="nx-boot-word"><svg viewBox="0 0 149 25" fill="${BOOT_INK}" xmlns="http://www.w3.org/2000/svg">${rectsSvg(WORD_RECTS)}${wordPaths}</svg></div>
    <div class="nx-boot-made"><span>Разработано</span>
      <svg viewBox="0 0 911 77" xmlns="http://www.w3.org/2000/svg"><g fill="${BOOT_INK}" fill-opacity="0.85">${MONO_PATHS.map((d) => `<path d="${d}"/>`).join("")}${rectsSvg(MONO_RECTS)}</g>
        <circle cx="${MONO_DOT.cx}" cy="${MONO_DOT.cy}" r="${MONO_DOT.r}" fill="${BOOT_MINT}"/></svg></div>`;
  document.body.appendChild(el);
}

/* Плавный переход из заставки в Главную: слово NEXA уменьшается и «садится» точно на логотип
   в шапке телефонной Главной (позиция и размер — по настоящему логотипу, цвет — его цвет темы);
   знак и подпись уходят, фон растворяется, блоки Главной всплывают по очереди (nx-rise ждал,
   пока заставка на экране, — .nx-intro-wait в appStyles.js). false — шапки нет, нужен запасной путь */
function bootLand(root) {
  const word = document.querySelector(".nx-boot-word");
  const target = document.querySelector(".nx-home-head svg[aria-label='NEXA']");
  // Шапка и все её родители не всплывают (nx-rise): иначе логотип сдвинулся бы за время перелёта
  // и слово село бы мимо. Блоки ниже шапки всплывают как обычно
  for (let n = target; n && n !== document.body && n.id !== "root"; n = n.parentElement) n.style.animation = "none";
  const t = target?.getBoundingClientRect();
  if (!word || !t || !t.width || t.bottom <= 0 || t.top >= innerHeight) return false;
  const w = word.getBoundingClientRect();
  const dx = t.left + t.width / 2 - (w.left + w.width / 2);
  const dy = t.top + t.height / 2 - (w.top + w.height / 2);
  const k = t.width / w.width;
  const fill = getComputedStyle(target).color;
  root.classList.remove("nx-intro-wait");
  root.classList.add("nx-intro-go", "nx-intro-land", "nx-boot-land");
  // Перелёт — со следующего кадра: в этом кадре браузер ещё рисует проявившуюся Главную,
  // и старт движения в нём на телефоне проглатывался рывком
  requestAnimationFrame(() => requestAnimationFrame(() => {
    word.style.transition = `transform ${BOOT_LAND}ms cubic-bezier(0.65, 0, 0.25, 1)`;
    word.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${k})`;
    const svg = word.querySelector("svg");
    if (svg) svg.style.fill = fill;
  }));
  setTimeout(() => {
    root.classList.add("nx-boot-swap");
    setTimeout(() => {
      document.getElementById("nx-boot")?.remove();
      // nx-intro-land оставляем: иначе #root сменил бы анимацию и проявился бы второй раз
      root.classList.remove("nx-boot-land", "nx-boot-swap");
    }, BOOT_SWAP + 40);
  }, BOOT_LAND + 40);
  return true;
}

export async function startIntro() {
  if (!isNative) return;
  const root = document.documentElement;
  if (root.classList.contains("nx-boot-go")) return; // уже запускали
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    // Под заставкой уже лежит такой же логотип — смена незаметна
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch {}
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Короткая пауза, чтобы системная заставка успела уйти, и сразу раскрываемся
  setTimeout(() => {
    requestAnimationFrame(() => {
      root.classList.add("nx-boot-go");
      // Переход в интерфейс. Таймеры одноразовые — только при запуске
      setTimeout(() => {
        if (!reduced && bootLand(root)) return;
        // Запасной путь (нет шапки Главной, «уменьшение движения»): заставка просто тает
        root.classList.remove("nx-intro-wait");
        root.classList.add("nx-intro-go", "nx-boot-out");
        setTimeout(() => document.getElementById("nx-boot")?.remove(), BOOT_FADE + 60);
      }, reduced ? BOOT_OUT_REDUCED : BOOT_OUT);
    });
  }, 60);
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

/* ─── Виджеты рабочего стола (плагин NexaWidgets, android/…/widgets) ───
   Виджеты читают данные из памяти Android (SharedPreferences), поэтому
   работают и при закрытом приложении. Приложение передаёт туда:
   - расписание — то же, что на экране «Сегодня» (только сегодня и дальше, без описаний);
   - город, выбранный в NEXA (не выбран — виджет погоды берёт Казань).
   На сайте и в старых версиях приложения без плагина ничего не делают. */
const NexaWidgets = registerPlugin("NexaWidgets");
let widgetSchedule = null;   // последнее расписание (для отправки при уходе в фон)
let widgetSent = "";         // что уже отправлено — одинаковое не шлём повторно
const dayKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function widgetsSetSchedule(list, force = false) {
  if (!isNative || !Array.isArray(list)) return;
  widgetSchedule = list;
  const today = dayKeyOf(new Date());
  const items = list
    .filter((it) => it && typeof it.date === "string" && it.date >= today && typeof it.time === "string" && it.title)
    .slice(0, 200)
    .map((it) => ({ date: it.date, time: it.time, title: String(it.title).slice(0, 120) }));
  const json = JSON.stringify(items);
  if (!force && json === widgetSent) return;
  widgetSent = json;
  NexaWidgets.setSchedule({ items }).catch(() => {});
}

// Город из настроек NEXA: { city, lat, lon } или null (не выбран — Казань)
// Город погоды для виджета: выбранный в NEXA { city, lat, lon } (null — Казань) и адрес
// нашего сервера — виджет сам берёт погоду с <api>/api/weather (?lat&lon или ?city=kazan)
export function widgetsSetCity(c) {
  if (!isNative) return;
  const api = API_BASE || "https://nexa-link.ru";
  NexaWidgets.setCity(c ? { city: c.city, lat: c.lat, lon: c.lon, api } : { city: null, api }).catch(() => {});
}

// Приложение уходит в фон: ещё раз отдать расписание и перерисовать виджеты
export function widgetsFlush() {
  if (!isNative) return;
  if (widgetSchedule) widgetsSetSchedule(widgetSchedule, true);
  if (widgetNoteData) widgetsSetNote(widgetNoteData, true);
  NexaWidgets.refresh().catch(() => {});
}

/* Виджет «Заметки»: одна закреплённая заметка — то, что посчитал widgetNote (src/lib/userNotes.js).
   В Android уходит только она (заголовок и начало текста), не весь список.
   APK без этого метода (старше 0.14.3) отвечает ошибкой — молча пропускаем */
let widgetNoteData = null;
let widgetNoteSent = "";
export function widgetsSetNote(data, force = false) {
  if (!isNative || !data) return;
  widgetNoteData = data;
  const json = JSON.stringify(data);
  if (!force && json === widgetNoteSent) return;
  widgetNoteSent = json;
  NexaWidgets.setNote(data).catch(() => { widgetNoteSent = ""; });
}

// Нажали на виджет: cb("today" | "home"). Возвращает функцию отписки
export function onWidgetTab(cb) {
  if (!isNative) return () => {};
  const handle = NexaWidgets.addListener("openTab", (e) => { if (e?.tab === "today" || e?.tab === "home") cb(e.tab); });
  return () => { Promise.resolve(handle).then((h) => h?.remove()).catch(() => {}); };
}

// Виджет «Заметки»: cb({ id }) — открыть заметку, cb({ create: true }) — новая, cb({}) — список заметок
export function onWidgetNote(cb) {
  if (!isNative) return () => {};
  const handle = NexaWidgets.addListener("openNote", (e) => {
    if (e?.create) cb({ create: true });
    else if (typeof e?.id === "string" && /^[0-9a-f-]{8,64}$/i.test(e.id)) cb({ id: e.id });
    else cb({});
  });
  return () => { Promise.resolve(handle).then((h) => h?.remove()).catch(() => {}); };
}

/* ─── Файлы в приложении: «Скачать» и «Открыть» (модуль NexaFiles, Java) ───
   Встроенный браузер приложения сам не скачивает файлы и не открывает их
   в других приложениях. src — { url } (подписанная ссылка облака) или
   { blob } (файл гостя из браузерного хранилища). Ответ — true / false. */
const NexaFiles = registerPlugin("NexaFiles");
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
export async function nativeFile(action, { url, blob, name, mime }) {
  if (!isNative) return false;
  const data = url ? { url } : { base64: await blobToBase64(blob) };
  try {
    await NexaFiles[action === "save" ? "save" : "open"]({ ...data, name, mime: mime || "" });
    return true;
  } catch {
    return false;
  }
}

/* Большой файл (резервная копия) — в «Загрузки» телефона по кускам по 3 МБ: весь архив одной строкой
   в память не берём. onProgress(записано, всего). Отмена — signal (кусок дописывается, файл удаляется).
   APK без streamStart (до 0.14.4) — файлы до 40 МБ по-старому, больше — честный отказ "old_app".
   Ответ: "saved" | "cancelled"; ошибка — исключение с кодом */
export async function nativeSaveLarge(blob, { name, mime, signal, onProgress }) {
  if (!isNative) throw new Error("not_app");
  let token;
  try {
    ({ token } = await NexaFiles.streamStart({ name, mime: mime || "" }));
  } catch (e) {
    if (!/not implemented|not_implemented/i.test(String(e?.message || e))) throw new Error("save_failed");
    if (blob.size > 40 * 1024 * 1024) throw new Error("old_app");
    await NexaFiles.save({ base64: await blobToBase64(blob), name, mime: mime || "" });
    onProgress?.(blob.size, blob.size);
    return "saved";
  }
  const CH = 3 * 1024 * 1024;
  try {
    for (let pos = 0; pos < blob.size; pos += CH) {
      if (signal?.aborted) { await NexaFiles.streamCancel({ token }).catch(() => {}); return "cancelled"; }
      await NexaFiles.streamWrite({ token, base64: await blobToBase64(blob.slice(pos, pos + CH)) });
      onProgress?.(Math.min(pos + CH, blob.size), blob.size);
    }
    await NexaFiles.streamFinish({ token });
    return "saved";
  } catch {
    await NexaFiles.streamCancel({ token }).catch(() => {});
    throw new Error("save_failed");
  }
}

/* ─── «Рядом»: файл на соседний телефон без интернета (NexaNearbyPlugin.java, Nearby Connections) ───
   Только Android-приложение. nearby(method, args) — вызов модуля (нет модуля / старый APK — ошибка
   "unsupported"); onNearby(event, cb) — события found / lost / request / waiting / progress / sent /
   received / failed / disconnected / stopped (см. NexaNearbyPlugin.java).
   nearbyStage(blob) — положить файл во временный файл отправки кусками по 3 МБ → token */
const nearbyPlugin = isNative ? registerPlugin("NexaNearby") : null;
export const nearbySupported = !!nearbyPlugin;
export async function nearby(method, args = {}) {
  if (!nearbyPlugin) { const e = new Error("unsupported"); e.code = "unsupported"; throw e; }
  try { return await nearbyPlugin[method](args); }
  catch (e) {
    if (/not implemented|not_implemented/i.test(String(e?.message || e))) { const x = new Error("unsupported"); x.code = "unsupported"; throw x; }
    throw e;
  }
}
export function onNearby(event, cb) {
  if (!nearbyPlugin) return () => {};
  const h = nearbyPlugin.addListener(event, (e) => cb(e));
  return () => { Promise.resolve(h).then((x) => x?.remove()).catch(() => {}); };
}
export async function nearbyStage(blob, { signal, onProgress } = {}) {
  const { token } = await nearby("stageStart");
  const CH = 3 * 1024 * 1024;
  try {
    for (let pos = 0; pos < blob.size; pos += CH) {
      if (signal?.aborted) throw new Error("cancelled");
      await nearby("stageWrite", { token, base64: await blobToBase64(blob.slice(pos, pos + CH)) });
      onProgress?.(Math.min(pos + CH, blob.size), blob.size);
    }
    return token;
  } catch (e) {
    await nearby("stageDrop", { token }).catch(() => {});
    throw e;
  }
}
// Принятый файл целиком в память страницы (для «В Файлы NEXA»): кусками по 3 МБ
export async function nearbyReadReceived(id, { mime, name } = {}) {
  const parts = [];
  let offset = 0, size = Infinity;
  while (offset < size) {
    const r = await nearby("readReceived", { id, offset, length: 3 * 1024 * 1024 });
    size = r.size;
    const bin = atob(r.base64 || "");
    if (!bin.length) break;
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    parts.push(buf);
    offset += buf.length;
  }
  return new File(parts, name || "file", { type: mime || "" });
}

/* ─── NEXA Flow: буфер обмена ───
   Только по действию человека: читаем буфер, когда нажали «Вставить
   скопированное», пишем — когда нажали «Копировать» (или включено
   «Сразу копировать полученное»). Сами в фоне ничего не читаем.
   Приложение: модуль @capacitor/clipboard (встроенный браузер Android
   не даёт сайту читать буфер). Сайт: navigator.clipboard — чтение спросит
   разрешение у браузера, на старых браузерах и без https его нет.
   Приложение для ПК — свои команды окна (src/lib/desktop.js): WebView2 на чтение
   буфера показывает вопрос «Сайт tauri.localhost хочет…». */
export async function clipboardRead() {
  try {
    if (isNative) {
      const { Clipboard } = await import("@capacitor/clipboard");
      const r = await Clipboard.read();
      return { text: typeof r?.value === "string" && /text/i.test(r.type || "text") ? r.value : "" };
    }
    if (isDesktop) return { text: await desktopClipboardRead() };
    if (!navigator.clipboard?.readText) return { error: "Этот браузер не даёт читать буфер — вставьте текст сами (долгое нажатие → «Вставить»)" };
    return { text: await navigator.clipboard.readText() };
  } catch {
    return { error: isDesktop ? "Не получилось прочитать буфер — вставьте текст сами (Ctrl+V)" : "Нет доступа к буферу — разрешите его в браузере или вставьте текст сами" };
  }
}
export async function clipboardWrite(text) {
  try {
    if (isNative) {
      const { Clipboard } = await import("@capacitor/clipboard");
      await Clipboard.write({ string: text });
      return true;
    }
    if (isDesktop) { await desktopClipboardWrite(text); return true; }
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}
/* Картинку — в буфер обмена (кнопка «Копировать» у фото). blobPromise — обещание Blob картинки:
   на сайте ClipboardItem создаётся сразу по нажатию (иначе Safari откажет), а байты подъедут потом.
   Буфер браузера принимает только PNG — остальное перерисовываем в PNG.
   Android-приложение — свой модуль (NexaFiles.copyImage: файл в кэш, в буфер — ссылка на него);
   APK без него (до 0.14.5) — пробуем как сайт. Ответ: true | "old_app" | false */
const toPng = async (blob) => {
  if (!blob) throw new Error("no_blob");
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close?.();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("png"))), "image/png"));
};
export async function clipboardWriteImage(blobPromise, name = "photo") {
  if (isNative) {
    try {
      const blob = await blobPromise;
      if (!blob) return false;
      await NexaFiles.copyImage({ base64: await blobToBase64(blob), name });
      return true;
    } catch (e) {
      if (!/not implemented|не реализ/i.test(String(e?.message || e?.code || ""))) return false;
    }
  }
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return isNative ? "old_app" : false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": Promise.resolve(blobPromise).then(toPng) })]);
    return true;
  } catch { return isNative ? "old_app" : false; }
}
/* Картинка из буфера обмена (только Android-приложение): плагин буфера Capacitor отдаёт лишь текст,
   поэтому читаем свой модуль. Только по нажатию человека. Ответ: { blob } | null (картинки нет) | "old_app" (APK без метода) */
export async function clipboardReadImage() {
  if (!isNative) return null;
  try {
    const r = await NexaFiles.readClipboardImage();
    if (!r?.found || !r.base64) return null;
    const bin = atob(r.base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { blob: new Blob([bytes], { type: r.mime || "image/png" }) };
  } catch (e) {
    return /not implemented|не реализ/i.test(String(e?.message || e?.code || "")) ? "old_app" : null;
  }
}
// Текст из «Поделиться» другого приложения (только Android): cb(text). Возвращает отписку
export function onSharedText(cb) {
  if (!isNative) return () => {};
  const handle = registerPlugin("NexaShare").addListener("sharedText", (e) => { if (typeof e?.text === "string" && e.text.trim()) cb(e.text); });
  return () => { Promise.resolve(handle).then((h) => h?.remove()).catch(() => {}); };
}

/* Панель быстрых действий из будущей EXE-версии (Windows).
   Глобальное сочетание клавиш (работает, даже когда окно NEXA свёрнуто) браузер
   дать не может — его зарегистрирует сама оболочка EXE. Договорённость: её
   preload-скрипт кладёт в window.nexaDesktop функцию onQuickPanel(cb), которая
   вызывает cb по сочетанию и возвращает отписку. На сайте и в Android такого
   объекта нет — функция ничего не делает (там работает Ctrl/⌘ + K внутри страницы) */
export function onDesktopQuickPanel(cb) {
  const bridge = typeof window !== "undefined" ? window.nexaDesktop : null;
  if (typeof bridge?.onQuickPanel !== "function") return () => {};
  try {
    const off = bridge.onQuickPanel(() => cb());
    return typeof off === "function" ? off : () => {};
  } catch { return () => {}; }
}

/* ─── Системные уведомления (src/App.jsx: notify) ───
   Приложение: @capacitor/local-notifications — свой канал Android на каждую
   категорию (человек может настроить их и в настройках телефона), разрешение
   POST_NOTIFICATIONS на Android 13+. Показываем, пока приложение запущено
   (открыто или свёрнуто); напоминания о делах ставим заранее через систему —
   они придут и при закрытом приложении (Android может слегка задержать их
   в режиме экономии заряда).
   Сайт на компьютере: Notification API браузера — только пока вкладка открыта.
   Сайт на телефоне: без service worker браузер их не показывает — не обещаем */
export const NOTE_CHANNELS = {
  files: "Файлы", flow: "Текст и ссылки", devices: "Устройства",
  sync: "Синхронизация и связь", schedule: "Расписание", updates: "Обновления",
};
let localNotes = null;
// Модуль отдаём в обёртке { api }: сам объект плагина Capacitor нельзя возвращать из async —
// JavaScript примет его за «обещание», вызовет .then, и плагин ответит ошибкой
const ln = async () => (localNotes ||= { api: (await import("@capacitor/local-notifications")).LocalNotifications });
// "app" — приложение, "desktop" — приложение для ПК, "web" — браузер на компьютере, "none" — нельзя
export function systemNotifyKind() {
  if (isNative) return "app";
  // Приложение для ПК: WebView2 молча отказывает сайту в уведомлениях (проверено) —
  // показываем уведомления Windows через оболочку (desktop.rs). Разрешение спрашивать не нужно:
  // выключают их в «Параметрах Windows» → «Уведомления»
  if (isDesktop) return "desktop";
  if (typeof Notification === "undefined") return "none";
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "none" : "web";
}
// Разрешение: "granted" | "denied" | "prompt" | "unsupported". request — спросить человека
export async function systemNotifyPermission(request = false) {
  const kind = systemNotifyKind();
  try {
    if (kind === "app") {
      const { api: L } = await ln();
      const st = request ? await L.requestPermissions() : await L.checkPermissions();
      return st.display === "granted" ? "granted" : st.display === "denied" ? "denied" : "prompt";
    }
    if (kind === "desktop") return "granted";
    if (kind === "web") {
      if (request && Notification.permission === "default") await Notification.requestPermission();
      return Notification.permission === "default" ? "prompt" : Notification.permission;
    }
  } catch {}
  return "unsupported";
}
// Номер уведомления для Android — целое число из ключа события (одно событие — один номер)
function noteNumber(key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 1) % 2000000000 || 1;
}
let channelsMade = false;
async function makeChannels(L) {
  if (channelsMade) return;
  channelsMade = true;
  for (const [id, name] of Object.entries(NOTE_CHANNELS)) {
    await L.createChannel({ id: `nexa-${id}`, name, importance: id === "schedule" ? 4 : 3, visibility: 0 }).catch(() => {});
  }
}
// Показать системное уведомление сейчас. Возвращает true, если показали
export async function systemNotify({ cat, title, body, target, key }) {
  const kind = systemNotifyKind();
  try {
    if (kind === "app") {
      const { api: L } = await ln();
      await makeChannels(L);
      await L.schedule({ notifications: [{ id: noteNumber(key), title, body: body || "", channelId: `nexa-${cat}`, smallIcon: "ic_stat_nexa", extra: { target: target || null } }] });
      return true;
    }
    // Нажатие на уведомление Windows возвращается ссылкой nexa:// (onDesktopOpen в App.jsx)
    if (kind === "desktop") return desktopNotify(title, body, targetToLink(target));
    if (kind === "web" && Notification.permission === "granted") {
      const n = new Notification(title, { body: body || "", tag: key, icon: "/icons/icon-192.png" });
      n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent("nexa-note-open", { detail: target || null })); n.close(); };
      return true;
    }
  } catch {}
  return false;
}
// Напоминания о делах — заранее, через систему (только приложение).
// items: [{ key, at (мс, когда показать), title, body, target }]; старые наши напоминания снимаем
export async function scheduleReminders(items) {
  if (!isNative) return;
  try {
    const { api: L } = await ln();
    await makeChannels(L);
    const { notifications } = await L.getPending();
    const ours = notifications.filter((n) => n.extra?.reminder);
    if (ours.length) await L.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    const future = items.filter((it) => it.at > Date.now() + 5000).slice(0, 40);
    if (!future.length) return;
    await L.schedule({ notifications: future.map((it) => ({
      id: noteNumber(it.key), title: it.title, body: it.body || "", channelId: "nexa-schedule", smallIcon: "ic_stat_nexa",
      schedule: { at: new Date(it.at), allowWhileIdle: true }, extra: { target: it.target || null, reminder: true, key: it.key },
    })) });
  } catch {}
}
// Нажали на системное уведомление: cb(target). Возвращает отписку
export function onSystemNoteOpen(cb) {
  const web = (e) => cb(e.detail);
  window.addEventListener("nexa-note-open", web);
  let handle = null;
  if (isNative) handle = ln().then(({ api }) => api.addListener("localNotificationActionPerformed", (e) => cb(e.notification?.extra?.target || null))).catch(() => null);
  return () => { window.removeEventListener("nexa-note-open", web); Promise.resolve(handle).then((h) => h?.remove()).catch(() => {}); };
}

/* ─── Bluetooth (только приложение Android, NexaBluetoothPlugin.java) ───
   Список уже сопряжённых с телефоном устройств: часы, наушники и т.п.
   Ничего не ищет и не подключает. Браузер такого списка не даёт — на сайте недоступно */
const btPlugin = isNative ? registerPlugin("NexaBluetooth") : null;
export const btAvailable = isNative;
// { supported, enabled, permission: "granted" | "denied" | "prompt" }
export async function btStatus() {
  if (!btPlugin) return { supported: false };
  try { return await btPlugin.status(); } catch { return { supported: false }; }
}
export async function btRequest() {
  if (!btPlugin) return { supported: false };
  try { return await btPlugin.requestPermission(); } catch { return btStatus(); }
}
// { enabled, devices: [{ id, name, kind, connected, battery? }] } или { error }
export async function btBonded() {
  if (!btPlugin) return { error: "unsupported" };
  try { return await btPlugin.bonded(); } catch (e) { return { error: e?.code || "error", message: e?.message || "" }; }
}
export function onBtChange(cb) {
  if (!btPlugin) return () => {};
  const h = btPlugin.addListener("changed", () => cb());
  return () => { Promise.resolve(h).then((x) => x?.remove()).catch(() => {}); };
}

/* ─── Push «Найти устройство» (NexaPushPlugin.java + api/push.js) ───
   pushToken() — адрес этого приложения для push (Firebase); не настроен — { error: "not_configured" }.
   onPushOpen(cb) — нажали на уведомление «Устройство ищут»: cb({ type: "find", id, from }) */
const pushPlugin = isNative ? registerPlugin("NexaPush") : null;
export async function pushToken() {
  if (!pushPlugin) return { error: "unsupported" };
  try { return await pushPlugin.token(); } catch (e) { return { error: e?.code || "error" }; }
}
export function onPushOpen(cb) {
  if (!pushPlugin) return () => {};
  const h = pushPlugin.addListener("pushOpen", (e) => cb(e));
  return () => { Promise.resolve(h).then((x) => x?.remove()).catch(() => {}); };
}

/* «Поиск этого устройства» при закрытой NEXA (NexaPushPlugin → NexaLocator.java).
   locateNativeSet(allow) — передать переключатель из Настроек (push обрабатывается без веб-части);
   locateNativeStatus() — { location, background, needsBackground } или null (не приложение / старый APK);
   locateOpenSettings() — страница разрешений NEXA в настройках Android («разрешать всегда») */
export async function locateNativeSet(allow) {
  if (!pushPlugin) return false;
  try { await pushPlugin.setLocate({ allow: !!allow }); return true; } catch { return false; }
}
export async function locateNativeStatus() {
  if (!pushPlugin) return null;
  try { return await pushPlugin.locateStatus(); } catch { return null; }
}
export async function locateOpenSettings() {
  if (!pushPlugin) return false;
  try { await pushPlugin.openLocateSettings(); return true; } catch { return false; }
}
