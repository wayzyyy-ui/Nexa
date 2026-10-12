import { useState, useEffect, useLayoutEffect, useRef, useId, startTransition, useSyncExternalStore } from "react";
// flushSync нужен для плавной смены темы: React обновляет экран сразу,
// пока браузер делает снимок для анимации
import { flushSync, createPortal } from "react-dom";
// Подключаем свой логотип из папки assets
import foldSvg from "./assets/fold.svg";
import { runSpectrum } from "./lib/spectrum.js";
// Всё, что нужно только внутри Android-приложения (на сайте ничего не делает)
import { isNative, API_CHAT_URL, setSystemBarsTheme, checkForUpdate, openUpdate, startIntro, vibrate, canScanQr, scanQr, API_BASE, widgetsSetSchedule, widgetsSetCity, widgetsFlush, onWidgetTab } from "./native.js";
import { App as CapApp } from "@capacitor/app";
// QR-код со ссылкой на сайт (блок установки на компьютере)
import QRCode from "qrcode";
// Плавная прокрутка колёсиком мыши (см. useSmoothScroll)
import Lenis from "lenis";
import "lenis/dist/lenis.css";
// Аккаунты: клиент Supabase и список разрешённых почт
import { supabase, authAvailable } from "./lib/supabase.js";
import { isAllowedEmail, looksLikeEmail, DOMAIN_NOT_ALLOWED_MESSAGE } from "./lib/allowedEmailDomains.js";
// Синхронизация устройств и чатов аккаунта с облаком
import { useCloudList, CHAT_ROWS, DEVICE_ROWS, newId, deleteAllMine, isLocalPin } from "./lib/sync.js";
import { useThisDeviceSys, thisDeviceKind, KIND_LABEL, formatBytes, batteryText, netText, diskText, sysShort, sameSys, NO_DATA } from "./lib/deviceInfo.js";
// Связь устройств в реальном времени: кто онлайн, передача текста и ссылок
import { useDeviceLink, safeUrl, TEXT_MAX, PAIR_ALPHABET, PAIR_CODE_RE, deviceIdentity, cleanSys } from "./lib/realtime.js";
// Содержимое файлов: облако (Supabase Storage) у вошедшего, IndexedDB у гостя
import {
  fileProblem, safeFileName, uploadToCloud, removeFromCloud, flushTrash, fileUrl, useFileUrl, forgetUrl,
  rememberLocal, cacheDel, cacheKey, cacheClearScope, FILE_ROWS, FOLDER_ROWS, FILE_MAX_MB,
  cloudBytes, localBytes, CLOUD_QUOTA_BYTES,
} from "./lib/files.js";
const VERSION = "0.8.17";


/* =========================================================================
   NEXA — демо-интерфейс экосистемы
   Файл состоит из пяти частей:
   1. Токены дизайна — цвета и шрифты (объект C)
   2. Иконки — все svg-иконки, которые используются в интерфейсе
   3. Складка (FoldHero) — фирменный визуал экосистемы
   4. Общие блоки — навигация, шапка, строки списков
   5. Экраны — Главная, Сегодня, Медиа, Файлы, Ассистент, Настройки
   6. App — корневой компонент, который переключает экраны
   ========================================================================= */

/* ---------- 1. ТОКЕНЫ ДИЗАЙНА ----------
   Меняешь цвет здесь — он поменяется сразу везде, где используется.
   Не нужно искать и менять hex-код в каждом месте по отдельности. */
const C = {
  bg: "var(--bg)",               // фон всего приложения
  panel: "var(--panel)",         // фон панелей и кнопок в навигации
  border: "var(--border)",       // основной цвет тонких границ
  borderSoft: "var(--border-soft)", // граница чуть мягче, для мелких элементов
  text: "var(--text)",           // основной цвет текста
  muted: "var(--muted)",         // приглушённый текст (подписи, метаданные)
  mutedSoft: "var(--muted-soft)",// ещё более приглушённый текст (даты, футер)
  blue: "var(--blue)",           // фирменный синий (локальное устройство)
  blueDark: "var(--blue-dark)",  // синий для теневой стороны градиентов
  blueLight: "var(--blue-light)",// синий для световой стороны градиентов
  mint: "var(--mint)",           // фирменный мятный (связь, облако)
  mintDark: "var(--mint-dark)",  // мятный для теней и фона активных элементов
  mintLight: "var(--mint-light)",// мятный для света
  green: "var(--green)",         // статус "онлайн"
  red: "var(--red)",             // статус "не в сети"
  onAccent: "var(--on-accent)",  // текст и иконки на мятной или синей заливке
  chip: "var(--chip)",           // нейтральная заливка: выключенный переключатель, заглушки
  textStrong: "var(--text-strong)", // выделенный текст (жирный в ответах ассистента)
  textSoft: "var(--text-soft)",  // текст внутри пузыря ассистента
  panel2: "var(--panel-2)",      // второй тон панели для лёгкого градиента
  glass: "var(--glass)",         // полупрозрачная панель таб-бара
  glassBorder: "var(--glass-border)",
  hover: "var(--hover)",         // лёгкая подсветка кнопок (наведение)
  pressed: "var(--pressed)",     // подложка нажатой кнопки
  borderStrong: "var(--border-strong)", // заметная обводка карточек (Медиа, Файлы)
  onFold: "var(--on-fold)",      // белый текст на цветных складках (в обеих темах)
  // Цвета складок-стёкол на экранах "Медиа" и "Файлы". Это как картинка,
  // поэтому в обеих темах они одинаковые
  foldDeep: "var(--fold-deep)",  // глубокий синий
  foldBlue: "var(--fold-blue)",  // яркий синий
  foldCyan: "var(--fold-cyan)",  // голубой
  foldMint: "var(--fold-mint)",  // мятный
  foldGreen: "var(--fold-green)",// зелёный
};

/* ---------- ТЕМА ----------
   Выбор темы хранится в localStorage и вешается атрибутом data-theme на <html>.
   Применяем сразу при загрузке модуля, чтобы не было вспышки не той темы. */
const THEME_KEY = "nexa-theme";
function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {}
  return "dark";
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  setSystemBarsTheme(theme); // в приложении: значки статус-бара под тему
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

// Смена темы с плавным переходом.
// update — функция, которая меняет состояние React (подсветку кнопки и т.п.).
// Если браузер умеет View Transitions (Chrome, Edge, свежий Safari), старый
// и новый вид экрана плавно перетекают друг в друга целиком.
// Если не умеет, включаем на 400 мс CSS-переходы цветов у всех элементов.
/* ---------- СИНХРОНИЗАЦИЯ ВКЛАДОК ----------
   Несколько вкладок NEXA живут как одно приложение: изменения
   (устройства, файлы, расписание, уведомления, чаты, тема) рассылаются
   через BroadcastChannel, и остальные вкладки сразу их подхватывают.
   TAB_ID — метка своей вкладки, чтобы не принимать собственные сообщения. */
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nexa-sync") : null;
const TAB_ID = Math.random().toString(36).slice(2);

// Записать событие в центр уведомлений (без всплывающего тоста).
// Слушает NexaApp (событие "nexa-log"), так можно писать из любого места
function logEvent(note) {
  window.dispatchEvent(new CustomEvent("nexa-log", { detail: note }));
}

// fromOtherTab — тему сменили в другой вкладке: просто повторяем,
// не рассылая обратно и не записывая событие второй раз
function switchTheme(theme, update, fromOtherTab) {
  const run = () => { applyTheme(theme); if (update) flushSync(update); };
  if (!fromOtherTab) {
    syncChannel?.postMessage({ key: THEME_KEY, value: theme, from: TAB_ID });
    logEvent({ title: "Тема переключена", text: theme === "dark" ? "Тёмная" : "Светлая", kind: "theme" });
  }
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Без анимации: так настроено в системе, вкладка в фоне или тему сменили
  // в другой вкладке (переход в скрытой вкладке браузер всё равно обрывает)
  if (reduce || document.hidden || fromOtherTab) { run(); return; }

  if (document.startViewTransition) {
    const t = document.startViewTransition(run);
    // Если переход оборвался (например, вкладку свернули) — тема уже сменилась, это не ошибка
    t.ready?.catch(() => {});
    t.finished?.catch(() => {});
    return;
  }

  const root = document.documentElement;
  root.classList.add("nx-theme-anim");
  run();
  setTimeout(() => root.classList.remove("nx-theme-anim"), 400);
}
applyTheme(readTheme());
// Тему сменили в другой вкладке — меняем и здесь (Настройки узнают по "nexa-theme-change")
syncChannel?.addEventListener("message", (e) => {
  if (e.data?.key !== THEME_KEY || e.data.from === TAB_ID) return;
  switchTheme(e.data.value, null, true);
  window.dispatchEvent(new Event("nexa-theme-change"));
});

/* useState, который сам сохраняется в localStorage под key и делится
   с другими вкладками. load(key) — как прочитать значение.
   Пришедшее из другой вкладки сохраняем, но обратно не рассылаем.
   key может смениться (вошли в аккаунт или вышли) — тогда значение
   читается заново из нового места, старое остаётся лежать под своим ключом */
function useSharedState(key, load) {
  const [state, setState] = useState(() => ({ key, value: load(key) }));
  // Ключ сменился — сразу берём значение нового ключа
  const cur = state.key === key ? state : { key, value: load(key) };
  if (cur !== state) setState(cur);
  const fromRemote = useRef(false);
  const savedKey = useRef(null); // под каким ключом сохраняли в прошлый раз
  useEffect(() => {
    try { localStorage.setItem(cur.key, JSON.stringify(cur.value)); } catch {}
    // Начальное значение и значение после смены ключа не рассылаем
    const switched = savedKey.current !== cur.key;
    savedKey.current = cur.key;
    if (switched) return;
    if (fromRemote.current) { fromRemote.current = false; return; }
    syncChannel?.postMessage({ key: cur.key, value: cur.value, from: TAB_ID });
  }, [cur]);
  useEffect(() => {
    if (!syncChannel) return;
    const onMessage = (e) => {
      if (e.data?.key !== key || e.data.from === TAB_ID) return;
      fromRemote.current = true;
      setState({ key, value: e.data.value });
    };
    syncChannel.addEventListener("message", onMessage);
    return () => syncChannel.removeEventListener("message", onMessage);
  }, [key]);
  // Как обычный setState: можно передать значение или функцию от старого
  const setValue = useRef((v) => setState((st) => ({ key: st.key, value: typeof v === "function" ? v(st.value) : v }))).current;
  return [cur.value, setValue];
}


// Два шрифта: Space Grotesk для заголовков (класс ng-display),
// Inter для всего остального текста.
const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'NexaNumbers', 'Raleway', sans-serif";

/* ---------- 2. ИКОНКИ ----------
   Каждая иконка — обычная svg-картинка, нарисованная прямо кодом.
   p.c — цвет обводки, p.s — размер в пикселях.
   Если захочешь заменить какую-то иконку на свою (например SVG из Figma),
   просто вставь свой <svg>...</svg> внутрь соответствующей стрелочной функции,
   сохранив те же параметры (c, s), либо см. инструкцию по импорту SVG-файла
   как картинки через <img src={...} />. */
const Icon = {
  home: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V20h2.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  list: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" strokeLinecap="round" />
    </svg>
  ),
  image: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-5 3 3 3-4 5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  folder: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" strokeLinejoin="round" />
    </svg>
  ),
  sparkle: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9 12 3.5Z" strokeLinejoin="round" />
    </svg>
  ),
  gear: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.13-1.35l2-1.55-2-3.46-2.37.96A7 7 0 0 0 14.35 5L14 2.5h-4L9.65 5a7 7 0 0 0-2.15 1.6l-2.37-.96-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .46.05.9.13 1.35l-2 1.55 2 3.46 2.37-.96c.62.66 1.35 1.2 2.15 1.6L9.65 21.5h4L14 19a7 7 0 0 0 2.15-1.6l2.37.96 2-3.46-2-1.55c.08-.45.13-.89.13-1.35Z" strokeLinejoin="round" />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M20 20l-4.8-4.8" strokeLinecap="round" />
    </svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5 19.5c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5" strokeLinecap="round" />
    </svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c || C.mutedSoft} strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  up: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c || C.onAccent} strokeWidth="2">
      <path d="M12 19V6M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  phone: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  ),
  // Планшет: лежит горизонтально, сверху по центру — камера-черточка
  tablet: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M11 8h2" strokeLinecap="round" />
    </svg>
  ),
  laptop: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="10.5" rx="1.5" />
      <path d="M2.5 19h19" strokeLinecap="round" />
    </svg>
  ),
  watch: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 16v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
  buds: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M7 9v5.5a2.5 2.5 0 0 0 5 0V9" strokeLinecap="round" />
      <path d="M17 9v5.5a2.5 2.5 0 0 1-5 0V9" strokeLinecap="round" />
      <circle cx="9.5" cy="7" r="2.2" />
      <circle cx="14.5" cy="7" r="2.2" />
    </svg>
  ),
  tv: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" strokeLinecap="round" />
    </svg>
  ),
  calendar: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  ),
  pin: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  ),
  bell: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" strokeLinejoin="round" />
      <path d="M10 18.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  ),
  chat: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5v-7Z" strokeLinejoin="round" />
    </svg>
  ),
  megaphone: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 10v3.5l3-.6 8 3.3V7.3l-8 3.3-3-.6Z" strokeLinejoin="round" />
      <path d="M15 6v12" strokeLinecap="round" />
    </svg>
  ),
  mail: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M3.5 6.5h17v11h-17z" strokeLinejoin="round" />
      <path d="M3.5 6.5 12 13l8.5-6.5" strokeLinejoin="round" />
    </svg>
  ),
  moon: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M15.5 3.5 8 6.5 5.5 13l4 7 7.5-1.5A8 8 0 0 1 15.5 3.5Z" strokeLinejoin="round" />
    </svg>
  ),
  lock: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M5 10.5h14v9.5H5z" strokeLinejoin="round" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" strokeLinecap="round" />
    </svg>
  ),
  logout: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8v.01" strokeLinecap="round" />
    </svg>
  ),
  plus: (p) => (
  <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
  ),
  archive: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="4.5" width="16" height="4" rx="1" />
      <path d="M5.5 8.5v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8M10 13h4" strokeLinecap="round" />
    </svg>
  ),
  dots: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
      <circle cx="6" cy="12" r="1.2" fill={p.c} /><circle cx="12" cy="12" r="1.2" fill={p.c} /><circle cx="18" cy="12" r="1.2" fill={p.c} />
    </svg>
  ),
    copy: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" strokeLinecap="round" />
    </svg>
  ),
  refresh: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  edit: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  drive: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M7 9h6" strokeLinecap="round" />
      <path d="M3.5 13.5h17" />
      <circle cx="16.5" cy="16.3" r="0.6" fill={p.c} />
    </svg>
  ),
  arrowLeft: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="2">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Иконки для "Медиа" и "Файлов"
  video: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5-4.5-2.5Z" strokeLinejoin="round" />
    </svg>
  ),
  doc: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M6 3.5h8l4 4v13H6v-17Z" strokeLinejoin="round" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  music: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M9 17.5V6l10-2v11.5" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17" cy="15.5" r="2" />
    </svg>
  ),
  close: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  ),
  trash: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  share: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6.5h14V13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // «Поделиться» для инструкции установки: квадрат со срезанным углом (складка)
  // и стрелка вверх — узнаётся, но нарисована по-своему
  shareUp: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M9 9H5.5v11.5h13V12.5L15 9" strokeLinejoin="round" />
      <path d="M12 15V3.5M8.5 7 12 3.5 15.5 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Скачать: стрелка вниз в «лоток»
  download: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 17v3h14v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  send: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 11.5 20 4l-6 16-2.5-6.5L4 11.5ZM11.5 13.5 20 4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  // Плеер: воспроизвести, пауза, следующий / предыдущий трек
  play: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" strokeLinejoin="round" />
    </svg>
  ),
  pause: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M8.5 5.5v13M15.5 5.5v13" strokeLinecap="round" />
    </svg>
  ),
  next: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6" style={p.flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 6.5v11l8-5.5-8-5.5ZM18 6v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Питание: разомкнутое кольцо с чертой сверху (подключить / отключить)
  power: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M7.5 6.5a7.5 7.5 0 1 0 9 0M12 3.5v8" strokeLinecap="round" />
    </svg>
  ),
  // Батарея (режим энергосбережения)
  battery: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3" y="7.5" width="16" height="9" rx="1" />
      <path d="M21 10.5v3M6 10.5v3" strokeLinecap="round" />
    </svg>
  ),
  // Сеть: три столбика по возрастанию — уровень сигнала
  signal: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M4 19v-3h3v3zM10.5 19v-7h3v7zM17 19V7h3v12z" />
    </svg>
  ),
  // Не беспокоить: круг с чертой
  dnd: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  ),
  // Внимание / ошибка: острый треугольник со знаком "!"
  alert: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 3.5 21 19.5H3L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 9.5v4.5M12 16.6v.4" strokeLinecap="round" />
    </svg>
  ),
};

/* ---------- 3. СКЛАДКА — фирменный визуал (FoldHero) ----------
   Три треугольные грани (polygon), каждая со своим градиентом.
   Это векторная картинка (svg), а не растровое изображение, поэтому
   она чёткая на любом размере экрана.
   size — задаёт ширину картинки в пикселях, высота считается сама
   пропорционально (чтобы форма не искажалась). */
function FoldHero({ size = 340 }) {
  return (
    <img
      src={foldSvg}
      alt="NEXA"
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

/* Складка Главной: раскрывается при первом открытии Главной за сессию
   (~1,2 с), при подключении нового устройства коротко «вздыхает» гранями,
   слегка смещается за курсором / наклоном и при прокрутке.
   Анимируются только transform и opacity граней — без размытия и фильтров.
   Как устроено: в покое — та же картинка fold.svg (с тенями). На время
   движения поверх неё — те же три грани отдельными SVG-путями без теней;
   в конце они плавно уступают место картинке.
   При «уменьшении движения» — сразу неподвижная картинка.
   count — сколько устройств (выросло — значит подключили новое) */
const FOLD_INTRO_KEY = "nexa-fold-intro"; // в sessionStorage: раскрытие уже было
const HOME_FACETS = [
  { cls: "f-c", d: "M279 376.606L511.939 146.071L605.813 434.474L372.371 663.466L279 376.606Z", g: 2, o: 0.4 },
  { cls: "f-b", d: "M681.341 243.604L739.811 634.399L372.137 489.638L681.341 243.604Z", g: 1, o: 0.39 },
  { cls: "f-a", d: "M691.785 720.578L600.477 440.055L372.353 663.411L691.785 720.578Z", g: 0, o: 0.4 },
];
// Градиенты граней — как в fold.svg (картинка-источник складки)
const HOME_FACET_GRADS = [
  { x1: 496.742, y1: 548.079, x2: 691.785, y2: 720.578, from: "var(--fold-hf-a1)", to: "var(--fold-hf-a2)" },
  { x1: 681.341, y1: 243.604, x2: 609.363, y2: 582.509, from: "var(--fold-hf-b1)", to: "var(--fold-hf-b2)" },
  { x1: 513.592, y1: 151.148, x2: 370.686, y2: 658.289, from: "var(--fold-hf-c1)", to: "var(--fold-hf-c2)" },
];
const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function HomeFold({ size, count = 0 }) {
  const ref = useRef(null);
  useBackdropMotion(ref); // --px / --py (курсор, наклон) и --sy (прокрутка)
  const uid = useId().replace(/:/g, "");
  // "intro" — раскрытие, "pulse" — «вздох», "settle" — грани уступают картинке, null — покой
  const [phase, setPhase] = useState(() => {
    try { return !reducedMotion() && !sessionStorage.getItem(FOLD_INTRO_KEY) ? "intro" : null; } catch { return null; }
  });
  useEffect(() => { if (phase === "intro") try { sessionStorage.setItem(FOLD_INTRO_KEY, "1"); } catch {} }, []);
  // Подключили новое устройство — короткое движение граней
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current && !reducedMotion()) setPhase((p) => (p === "intro" ? p : "pulse"));
    prevCount.current = count;
  }, [count]);
  // Смена фаз — по таймеру длительности, а не по концу CSS-анимации:
  // у скрытой складки (вторая раскладка Главной) анимация не идёт и конца не сообщает
  useEffect(() => {
    if (!phase) return;
    const next = phase === "settle" ? null : "settle";
    const t = setTimeout(() => setPhase(next), { intro: 1200, pulse: 760, settle: 320 }[phase]);
    return () => clearTimeout(t);
  }, [phase]);
  const moving = phase === "intro" || phase === "pulse";
  return (
    <div ref={ref} style={{ width: size, height: size, position: "relative" }}>
      {/* Лёгкий параллакс: за курсором / наклоном и чуть вверх при прокрутке */}
      <div style={{
        position: "absolute", inset: 0, transition: BACKDROP_EASE,
        transform: "translate(calc(var(--px, 0) * 6px), calc(var(--py, 0) * 5px - var(--sy, 0) * 12px))",
      }}>
        <img src={foldSvg} alt="NEXA" style={{
          width: size, height: size, display: "block",
          opacity: moving ? 0 : 1, transition: moving ? "none" : "opacity 300ms ease",
        }} />
        {phase && (
          <svg viewBox="0 0 829 861" preserveAspectRatio="none" aria-hidden="true"
            className={`nx-homefold is-${phase}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              {HOME_FACET_GRADS.map((g, i) => (
                <linearGradient key={i} id={`${uid}g${i}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">
                  <stop style={{ stopColor: g.from }} />
                  <stop offset="1" style={{ stopColor: g.to }} />
                </linearGradient>
              ))}
            </defs>
            <g style={{ mixBlendMode: "screen" }}>
              {HOME_FACETS.map((f) => (
                <path key={f.cls} className={f.cls} d={f.d} fill={`url(#${uid}g${f.g})`} fillOpacity={f.o} />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

/* ---------- ФОН ЭКРАНОВ ----------
   Тонкая геометрия за содержимым, низкий контраст в обеих темах.
   BackdropFolds — грани складки в углах (все экраны),
   BackdropGrid — техническая сетка с метками (экран «Настройки»).
   Двигается только в ответ на курсор (компьютер), наклон телефона
   и прокрутку: курсор или наклон задают CSS-переменные --px/--py
   (от -1 до 1), прокрутка — --sy (от 0 до 1). React при этом не
   перерисовывается, меняется только transform.
   При «уменьшении движения» фон неподвижный. */
/* ПЛАВНАЯ ПРОКРУТКА. Колёсико мыши на компьютере прокручивает страницу
   рывками; Lenis сглаживает это — страница мягко «доезжает».
   Только на компьютере с мышью/тачпадом: на телефоне палец и так плавный.
   Не трогаем: экран ассистента (у чата своя прокрутка), открытые окна
   (страница под ними заблокирована) и внутренние списки — они крутятся
   как обычно. При «уменьшении движения» выключено */
// Внутри этих элементов колёсико работает по-обычному
const NATIVE_SCROLL = '.nx-scroll, .nx-viewer, [role="dialog"], [role="menu"], .nx-notes, textarea';
function useSmoothScroll(enabled) {
  useEffect(() => {
    const mq = window.matchMedia;
    if (!enabled || !mq || !mq("(pointer: fine)").matches || mq("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12, // насколько быстро догоняет: меньше — мягче
      prevent: (node) => document.body.style.overflow === "hidden" || !!node.closest?.(NATIVE_SCROLL),
    });
    return () => lenis.destroy();
  }, [enabled]);
}

/* Наклон телефона (гироскоп). На iPhone датчик доступен только после
   разрешения, которое можно спросить лишь по нажатию — поэтому там
   по умолчанию выключено и включается в «Настройках». На Android — сразу. */
const TILT_KEY = "nexa-tilt"; // "on" | "off" в localStorage
// Разрешение нужно только на iPhone/iPad. Свежий Chrome тоже знает
// requestPermission, но сам ничего не спрашивает — поэтому проверяем именно iOS
// (iPad в режиме «как компьютер» выдаёт себя за Mac с сенсорным экраном)
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/* Где открыт сайт — от этого зависит, как предлагать установку:
   "installed" — уже внутри приложения или на экране «Домой» (ничего не предлагаем),
   "ios" — телефон или планшет Apple, "android" — телефон с Android, "desktop" — компьютер */
function installPlatform() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  if (isNative || standalone) return "installed";
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}
const APK_URL = "/nexa.apk";
const tiltNeedsPermission = () =>
  isIOS() && typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
function readTilt() {
  try { const v = localStorage.getItem(TILT_KEY); if (v) return v === "on"; } catch {}
  return !tiltNeedsPermission();
}
// Включить/выключить. На iPhone при включении спрашиваем разрешение.
// Возвращает, что в итоге получилось
async function saveTilt(on) {
  if (on && tiltNeedsPermission()) {
    try { on = (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { on = false; }
  }
  try { localStorage.setItem(TILT_KEY, on ? "on" : "off"); } catch {}
  window.dispatchEvent(new Event("nexa-tilt")); // фон подхватит новое значение
  return on;
}

function useBackdropMotion(ref) {
  // Меняется, когда в «Настройках» переключили наклон — тогда переподключаемся
  const [tiltTick, setTiltTick] = useState(0);
  useEffect(() => {
    const bump = () => setTiltTick((t) => t + 1);
    window.addEventListener("nexa-tilt", bump);
    return () => window.removeEventListener("nexa-tilt", bump);
  }, []);
  useEffect(() => {
    const el = ref.current;
    const mq = window.matchMedia;
    if (!el || !mq || mq("(prefers-reduced-motion: reduce)").matches) return;
    const fine = mq("(min-width: 769px) and (pointer: fine)").matches;
    let frame = 0, px = 0, py = 0;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // Не чаще одного раза за кадр, даже если события приходят чаще
    const apply = () => {
      frame = 0;
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      el.style.setProperty("--sy", Math.min(1, window.scrollY / 800).toFixed(3));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(apply); };
    // Компьютер: за курсором
    const move = (e) => {
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      queue();
    };
    // Телефон: наклон влево-вправо (gamma) и от себя-к себе (beta).
    // Наклон считаем от положения, в котором держали телефон в начале
    let base = null;
    const tilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      if (base === null) base = e.beta;
      px = clamp(e.gamma / 25);
      py = clamp((e.beta - base) / 25);
      queue();
    };
    const tiltOn = !fine && readTilt();
    if (fine) window.addEventListener("pointermove", move, { passive: true });
    if (tiltOn) window.addEventListener("deviceorientation", tilt);
    // iPhone: если наклон уже включали, разрешение после перезагрузки
    // спрашиваем по первому нажатию на экран
    const ask = () => DeviceOrientationEvent.requestPermission().catch(() => {});
    const askNeeded = tiltOn && tiltNeedsPermission();
    if (askNeeded) window.addEventListener("click", ask, { once: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("deviceorientation", tilt);
      if (askNeeded) window.removeEventListener("click", ask);
      window.removeEventListener("scroll", queue);
      cancelAnimationFrame(frame);
    };
  }, [ref, tiltTick]);
}

// Слой фона: от боковой панели до правого края (на телефоне — весь экран)
const backdropLayer = {
  position: "fixed", top: 0, right: 0, bottom: 0, left: 78,
  zIndex: 0, pointerEvents: "none", overflow: "hidden",
};
// Мягко догоняет курсор, без рывков
const BACKDROP_EASE = "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";

// Линии граней: продолжают наклоны фирменной складки.
// mint — линия сгиба, остальные — края граней
function FoldCornerLines() {
  // Бледные линии: видны как геометрия, но не спорят с текстом поверх
  const edge = { stroke: `color-mix(in srgb, ${C.blue} 20%, transparent)` };
  const crease = { stroke: `color-mix(in srgb, ${C.mint} 18%, transparent)` };
  return (
    <svg viewBox="0 0 380 340" width={300} height={268} fill="none" strokeWidth="1" style={{ display: "block", overflow: "visible" }}>
      <path d="M0 236 L238 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M0 340 L98 170 L380 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M98 170 L238 0" style={crease} vectorEffect="non-scaling-stroke" />
      <path d="M0 124 L124 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M0 236 L98 170" style={crease} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BackdropFolds() {
  const ref = useRef(null);
  useBackdropMotion(ref);
  return (
    <div ref={ref} className="nx-backdrop" aria-hidden="true" style={backdropLayer}>
      {/* Левый верхний угол: поворачивается вокруг своего угла */}
      <div className="nx-bd-tl" style={{
        position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transition: BACKDROP_EASE,
        transform: "rotate(calc(var(--px, 0) * 1.4deg + var(--sy, 0) * 2deg)) translate(calc(var(--px, 0) * 5px), calc(var(--py, 0) * 5px))",
      }}>
        <FoldCornerLines />
      </div>
      {/* Правый нижний угол: те же грани, развёрнутые на 180°, двигаются навстречу */}
      <div className="nx-bd-br" style={{
        position: "absolute", bottom: 0, right: 0, transformOrigin: "100% 100%", transition: BACKDROP_EASE,
        transform: "rotate(calc(var(--px, 0) * -1.4deg - var(--sy, 0) * 2deg)) translate(calc(var(--px, 0) * -5px), calc(var(--py, 0) * -5px))",
      }}>
        <div style={{ transform: "rotate(180deg)" }}><FoldCornerLines /></div>
      </div>
    </div>
  );
}

// Сетка как на чертеже: мелкий шаг 32px, крупный 128px, по краям метки
const GRID_STEP = 32, GRID_MAJOR = 128;
function BackdropGrid() {
  const ref = useRef(null);
  useBackdropMotion(ref);
  const minor = `color-mix(in srgb, ${C.text} 3.5%, transparent)`;
  const major = `color-mix(in srgb, ${C.text} 7%, transparent)`;
  const label = { position: "absolute", fontSize: 9, fontFamily: "monospace", color: C.mutedSoft, opacity: 0.7, letterSpacing: "0.08em" };
  // Сетка на 24px шире экрана со всех сторон — при сдвиге за курсором края не оголяются
  const PAD = 24;
  return (
    <div ref={ref} className="nx-backdrop" aria-hidden="true" style={backdropLayer}>
      <div style={{
        position: "absolute", inset: -PAD, transition: BACKDROP_EASE,
        transform: "translate(calc(var(--px, 0) * -6px), calc(var(--py, 0) * -6px))",
        backgroundImage:
          `linear-gradient(${major} 1px, transparent 1px), linear-gradient(90deg, ${major} 1px, transparent 1px),` +
          `linear-gradient(${minor} 1px, transparent 1px), linear-gradient(90deg, ${minor} 1px, transparent 1px)`,
        backgroundSize: `${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_STEP}px ${GRID_STEP}px, ${GRID_STEP}px ${GRID_STEP}px`,
      }}>
        {/* Метки-координаты: буквы сверху, номера слева — у каждой крупной линии */}
        {Array.from({ length: 20 }, (_, i) => (
          <span key={`c${i}`} className="nx-bd-label" style={{ ...label, top: PAD + 6, left: i * GRID_MAJOR + 5 }}>
            {String.fromCharCode(65 + i)}
          </span>
        ))}
        {Array.from({ length: 12 }, (_, i) => i > 0 && (
          <span key={`r${i}`} className="nx-bd-label nx-bd-row" style={{ ...label, left: PAD + 6, top: i * GRID_MAJOR + 4 }}>
            {String(i).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- 4. ОБЩИЕ БЛОКИ ----------
   Эти компоненты используются на нескольких экранах сразу,
   поэтому вынесены отдельно, а не продублированы в каждом экране. */

// Список разделов бокового меню: id (внутреннее имя), label (подпись для title),
// icon (функция-иконка из объекта Icon выше).
// Чтобы поменять порядок разделов в навигации — просто поменяй порядок строк тут.
const NAV = [
  { id: "home", label: "Главная", icon: Icon.home },
  { id: "today", label: "Сегодня", icon: Icon.list },
  { id: "media", label: "Медиа", icon: Icon.image },
  { id: "files", label: "Файлы", icon: Icon.folder },
  { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
  { id: "settings", label: "Настройки", icon: Icon.gear },
];
function MobileTabBar({ active, onChange }) {
  // Главная — по центру (главный раздел), остальные по бокам
  const mobileNav = [
    { id: "today",     label: "Сегодня",   icon: Icon.calendar },
    { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
    { id: "home",      label: "Главная",   icon: Icon.home, main: true },
    { id: "media",     label: "Медиа",     icon: Icon.image },
    { id: "files",     label: "Файлы",     icon: Icon.folder },
  ];
  const homeIndex = mobileNav.findIndex((i) => i.main);

  // Ширина одной ячейки в процентах (при пяти вкладках это 20%)
  const slotWidth = 100 / mobileNav.length;

  // pos: где сейчас стоит подсветка (номер вкладки, -1 если раздела нет в панели).
  // Храним отдельно от active, чтобы подсветка стартовала сразу при нажатии,
  // а не ждала, пока приложение перерисует новый экран.
  const [pos, setPos] = useState(() => mobileNav.findIndex((i) => i.id === active));

  // Запоминаем последнюю вкладку из панели, чтобы подсветка не прыгала в начало,
  // когда открыт раздел вне панели
  const lastPos = useRef(pos >= 0 ? pos : homeIndex);
  useEffect(() => { if (pos >= 0) lastPos.current = pos; }, [pos]);

  // Если раздел сменился не нажатием на панель (например, через карточку
  // ассистента на главной), подтягиваем подсветку к нему
  useEffect(() => {
    setPos(mobileNav.findIndex((i) => i.id === active));
  }, [active]);

  const handleClick = (item, index) => {
    if (item.id === active) return;
    setPos(index); // подсветка поехала сразу
    // Экран меняем со следующего кадра и в режиме «перехода»: React рисует
    // тяжёлый новый экран по кусочкам и не замораживает анимацию подсветки
    requestAnimationFrame(() => startTransition(() => onChange(item.id)));
  };

  const shownIndex = pos >= 0 ? pos : lastPos.current;

  return (
    <div
      className="ng-mobile-tabbar"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200, display: "none" }}
    >
      {/* Сама панель: во всю ширину, прижата к низу, скруглены только верхние углы.
          Снизу отступ под системную полоску телефона */}
      <div style={{
        background: C.panel,
        border: `1px solid ${C.borderStrong}`,
        borderBottom: "none",
        borderRadius: "24px 24px 0 0",
        padding: "0 12px var(--sab)",
        display: "flex",
      }}>
        <div style={{ position: "relative", flex: 1, display: "flex", height: 68 }}>

          {/* Движущаяся подсветка: один элемент, который едет к нужной ячейке */}
          <div className="nx-tab-move" style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${slotWidth}%`,
            transform: `translateX(${shownIndex * 100}%)`,
            opacity: pos === -1 ? 0 : 1,
            // Плавное движение без отскока, поэтому за край панели не вылезает
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
            willChange: "transform",   // просит браузер анимировать на видеокарте, без рывков
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              width: 52,
              height: 42,
              boxSizing: "border-box",
              borderRadius: 14,
              background: C.chip,
              // На Главной рамка подсветки мятная
              border: `1px solid ${shownIndex === homeIndex ? `color-mix(in srgb, ${C.mint} 55%, transparent)` : C.borderStrong}`,
              transition: "border-color 300ms ease",
            }} />
          </div>

          {mobileNav.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleClick(item, index)}
              aria-label={item.label}
              aria-current={index === pos ? "page" : undefined}
              style={{
                flex: 1,
                height: "100%",
                position: "relative",
                zIndex: 1,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.text,
              }}
            >
              {/* Главная чуть заметнее: мятный значок крупнее остальных */}
              {item.main ? item.icon({ c: C.mint, s: 25 }) : item.icon({ c: "currentColor", s: 22 })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
// Боковая навигация слева. active — id текущего активного раздела,
// onChange — функция, которая вызывается при клике (переключает экран).
function Sidebar({ active, onChange }) {
  return (
      <div
      className="ng-sidebar" style={{
      width: 78, minWidth: 78, boxSizing: "border-box", background: C.bg, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0",
    }}>
      {NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onChange(item.id)}
            style={{
              width: 44, height: 44, borderRadius: 4, cursor: "pointer",
              // Активная иконка заливается мятным, неактивная — тёмным фоном панели
              background: isActive ? C.mint : C.panel,
              border: `1px solid ${isActive ? C.mint : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 140ms ease, border-color 140ms ease",
            }}
          >
            {item.icon({ c: isActive ? C.onAccent : C.text, s: 19 })}
          </button>
        );
      })}
    </div>
  );
}

// Верхняя строка справа (время/дата, поиск, профиль). children — то, что
// передаём внутрь при вызове компонента (см. использование в App).
// Лежит поверх экрана в правом верхнем углу и не занимает свою полосу,
// поэтому заголовки всех экранов стоят на одной высоте с часами.
function TopBar({ children }) {
  return (
    <div className="ng-topbar" style={{
      position: "absolute", top: 0, right: 0, zIndex: 50,
      display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, padding: "24px 40px 0",
    }}>
      {children}
    </div>
  );
}

/* ═══ ЦЕНТР УВЕДОМЛЕНИЙ ═════════════════════════════════════
   Колокольчик в верхней строке: число непрочитанных, по нажатию —
   панель с последними 20 событиями и кнопкой «Очистить».
   notes = { items: [{ id, at, title, text, kind }], seenAt } — seenAt:
   когда панель открывали в последний раз (всё, что позже, — новое) */
const NOTES_KEY = "nexa-notifications";
const NOTES_MAX = 20;
const loadNotes = () => {
  try { const v = JSON.parse(localStorage.getItem(NOTES_KEY)); if (v && Array.isArray(v.items)) return v; } catch {}
  return { items: [], seenAt: 0 };
};

// «только что», «5 мин назад», «2 ч назад», «вчера в 14:05», «3 окт.»
function noteTime(at) {
  const diff = Math.max(0, Date.now() - at);
  const min = Math.round(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const d = new Date(at);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `${Math.round(min / 60)} ч назад`;
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Значок события: по виду (kind) или по словам в заголовке
function noteIcon(n) {
  const t = `${n.kind || ""} ${n.title || ""}`.toLowerCase();
  if (/theme|тем/.test(t)) return Icon.sparkle;
  if (/файл|папк|ссылк/.test(t)) return Icon.folder;
  if (/дел|расписан|schedule/.test(t)) return Icon.calendar;
  if (/device|устройств|подключ|отключ|сигнал|отправлено/.test(t)) return Icon.phone;
  return Icon.bell;
}

function NotificationBell({ notes, onSeen, onClear }) {
  const [open, setOpen] = useState(false);
  const [seenBefore, setSeenBefore] = useState(0); // что было новым в момент открытия
  const ref = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, right: 0 }); // где показать панель (под колокольчиком)
  const unread = notes.items.filter((n) => n.at > notes.seenAt).length;

  // Закрываем по клику мимо и по Esc
  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      const inside = ref.current?.contains(e.target) || panelRef.current?.contains(e.target);
      if (!inside) setOpen(false);
    };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", down);
    window.addEventListener("touchstart", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setSeenBefore(notes.seenAt);
      onSeen(); // открыли — всё прочитано
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="nx-icon-btn" onClick={toggle} aria-label={unread ? `Уведомления: новых ${unread}` : "Уведомления"}
        aria-expanded={open} style={{
          ...btnReset, width: 34, height: 34, borderRadius: 4, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {Icon.bell({ c: C.text, s: 18 })}
        {/* Счётчик новых: при каждом новом событии мягко «выпрыгивает» */}
        {unread > 0 && (
          <span key={unread} className="nx-pop" style={{
            position: "absolute", top: 2, right: 1, minWidth: 15, height: 15, padding: "0 4px", boxSizing: "border-box",
            borderRadius: 8, background: C.mint, color: C.onAccent, fontSize: 9.5, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Панель выносим в корень страницы (portal): так она точно поверх
          всплывающих тостов, а не внутри слоя верхней строки */}
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Уведомления" className="nx-pop nx-notes" style={{
          position: "fixed", top: pos.top, right: pos.right, width: 340, zIndex: 600, textAlign: "left",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 8, overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 14 }}>Уведомления</span>
            <button type="button" className="nx-link-btn" onClick={onClear} disabled={!notes.items.length}
              style={{ ...btnReset, fontSize: 12, color: C.muted }}>
              Очистить
            </button>
          </div>
          {notes.items.length === 0 ? (
            <div style={{ padding: "26px 16px", textAlign: "center", fontSize: 12.5, color: C.mutedSoft, lineHeight: 1.5 }}>
              Пока тихо. Здесь появятся события:<br />файлы, устройства, тема, расписание.
            </div>
          ) : (
            <div className="nx-scroll nx-stagger" style={{ maxHeight: 380, overflowY: "auto" }}>
              {notes.items.map((n) => (
                <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{
                    width: 28, height: 28, flexShrink: 0, borderRadius: 4, border: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {noteIcon(n)({ c: C.mint, s: 14 })}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      {/* Мятная точка — событие появилось после прошлого открытия */}
                      {n.at > seenBefore && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.mint, flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                    </div>
                    {n.text && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.text}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: C.mutedSoft, whiteSpace: "nowrap", marginTop: 1 }}>{noteTime(n.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function TimeDate() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

 return (
  <div className="ng-timedate" style={{ textAlign: "right" }}>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: C.text,
      }}
    >
      {time}
    </div>

    <div
      style={{
        fontSize: 12,
        color: C.muted,
        textTransform: "capitalize",
      }}
    >
      {date}
    </div>
  </div>
  );
}

// onClick необязательный: если передан, кнопка становится нажимаемой.
function IconBtn({ icon, s = 18, onClick, label }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={label}
      style={{
        width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {icon({ c: C.text, s })}
    </div>
  );
}

// Логотип NEXA. Это тот же SVG из Figma (assets/logo.svg), только вставлен
// прямо в код. Все фигуры залиты fill="currentColor", то есть берут цвет
// текста: в тёмной теме логотип белый, в светлой тёмный. Отдельный чёрный
// файл не нужен, иначе в тёмной теме он пропал бы на фоне.
function Logo({ small }) {
  const h = small ? 28 : 36;
  return (
    <svg
      viewBox="0 0 149 25" height={h} width={(h * 149) / 25}
      fill="currentColor" role="img" aria-label="NEXA"
      style={{ color: C.text, marginBottom: 20, marginRight: 20, display: "block" }}
    >
      <rect y="0.128967" width="2.89847" height="23.7675" />
      <rect x="25.521" y="0.143463" width="2.89847" height="23.7675" />
      <path d="M129.539 0.151154H132.437L118.687 23.9031H115.789L129.539 0.151154Z" />
      <path d="M134.201 0.151154H131.302L145.113 23.9031H148.011L134.201 0.151154Z" />
      <rect x="40.2455" y="0.143463" width="2.89847" height="23.7675" />
      <rect x="43.144" y="2.66751" width="2.52403" height="23.624" transform="rotate(-90 43.144 2.66751)" />
      <rect x="43.144" y="23.8965" width="2.5248" height="23.624" transform="rotate(-90 43.144 23.8965)" />
      <rect x="49.5683" y="13.2896" width="2.5248" height="13.2019" transform="rotate(-90 49.5683 13.2896)" />
      <path d="M0.966423 2.29059L2.89298 0.125062L27.4566 21.754L25.5301 23.9195L0.966423 2.29059Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M78.689 0H82.5192L89.789 9.25263H85.9467L78.689 0Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M89.7889 14.5148H85.9587L78.6889 23.7675H82.5312L89.7889 14.5148Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M103.963 0H100.133L92.8628 9.25263H96.705L103.963 0Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M92.8628 14.5148H96.693L103.963 23.7675H100.121L92.8628 14.5148Z" />
    </svg>
  );
}

// Универсальная строка списка (используется в карточке устройств,
// настройках, и т.д.): иконка слева, заголовок+подпись, что-то справа
// (например статус) и стрелка-шеврон.
function Row({ leftIcon, title, subtitle, right, accent }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 18px", borderBottom: `1px solid ${C.border}`, gap: 14,
    }}>
      {/* Левая часть: иконка + текст — занимает всё свободное место */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        {leftIcon && (
          <div style={{
            width: 42, height: 42, borderRadius: 4, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {leftIcon}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, textAlign: "left", lineHeight: 1.2 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 3, textAlign: "left", lineHeight: 1.3 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Правая часть: индикатор + стрелка — фиксированной ширины */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {right}
        {accent !== false && <span className="nx-chev">{Icon.chevron({})}</span>}
      </div>
    </div>
  );
}

// Маленький цветной кружок-индикатор статуса (онлайн/оффлайн).
function Dot({ color }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

/* ---------- 5. ЭКРАНЫ ---------- */
// Карточка одного устройства — для мобильной 2×2 сетки.
function DeviceCard({ device }) {
  const { icon, name, status, online } = device;
  return (
    <div style={{
      position: "relative",
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "16px 16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minHeight: 128,
      boxSizing: "border-box",
    }}>
      {/* Индикатор статуса — точка в правом верхнем углу */}
      <span style={{
        position: "absolute", top: 14, right: 14,
        width: 8, height: 8, borderRadius: "50%",
        background: online ? C.green : C.red,
      }} />

      {/* Иконка устройства */}
      <div style={{
        width: 36, height: 36,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon({ c: C.text, s: 30 })}
      </div>

      {/* Название и статус — прижаты к низу */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 15, fontWeight: 500, textAlign: "left" }}>{name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2, textAlign: "left" }}>{status}</div>
      </div>

      {/* Стрелка — правый нижний угол */}
      <div style={{ position: "absolute", bottom: 12, right: 12, color: C.mutedSoft }}>
        {Icon.chevron({ c: C.mutedSoft, s: 14 })}
      </div>
    </div>
  );
}
// Устройства пользователя. Лежат снаружи экранов, потому что ими
// пользуются и «Главная», и общий поиск
// battery — заряд в % (null — работает от сети), memory — объём памяти в ГБ,
// alias — короткое имя, под которым устройство записано в данных файлов,
// lastSeen — когда было в сети (показываем, если устройство отключено).
// online здесь — состояние по умолчанию; в приложении его можно переключать.
const DEVICES = [
  { id: "phone",  icon: Icon.phone,  name: "Смартфон",  battery: 92,   memory: 256, online: true,  lastSeen: "только что" },
  { id: "laptop", icon: Icon.laptop, name: "Ноутбук",   battery: 41,   memory: 512, online: false, lastSeen: "вчера в 22:14" },
  { id: "watch",  icon: Icon.watch,  name: "Часы",      battery: 64,   memory: 32,  online: true,  lastSeen: "только что" },
  { id: "tv",     icon: Icon.tv,     name: "Телевизор", battery: null, memory: 64,  online: true,  lastSeen: "только что", alias: "ТВ" },
];

// Какие устройства можно добавить. battery и memory — стартовые данные
// нового устройства (battery: null — работает от сети)
const DEVICE_TYPES = [
  { type: "phone",  icon: Icon.phone,  name: "Смартфон",  battery: 100,  memory: 128 },
  { type: "laptop", icon: Icon.laptop, name: "Ноутбук",   battery: 78,   memory: 512 },
  { type: "tablet", icon: Icon.tablet, name: "Планшет",   battery: 86,   memory: 256 },
  { type: "watch",  icon: Icon.watch,  name: "Часы",      battery: 100,  memory: 32 },
  { type: "buds",   icon: Icon.buds,   name: "Наушники",  battery: 90,   memory: 1 },
  { type: "tv",     icon: Icon.tv,     name: "Телевизор", battery: null, memory: 64 },
];
const deviceType = (type) => DEVICE_TYPES.find((t) => t.type === type) || DEVICE_TYPES[0];

// Название без повторов: "Планшет" → если занято, "Планшет 2", "Планшет 3"…
function uniqueDeviceName(base, names) {
  if (!names.includes(base)) return base;
  let i = 2;
  while (names.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// Настройки устройства по умолчанию (переключатели в окне устройства)
const DEVICE_DEFAULTS = { sync: true, dnd: false, saver: false };
const DEVICES_KEY = "nexa-devices"; // ключ в localStorage

/* Что лежит в localStorage под DEVICES_KEY:
   { v: 2, state, added, removed }
   state   — настройки и статус каждого устройства по id;
   added   — устройства, которые пользователь добавил сам;
   removed — id удалённых исходных устройств.
   Раньше там лежал только state — такой старый формат тоже читаем. */
function loadDeviceStore(key = DEVICES_KEY) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
  if (raw && raw.v === 2) {
    return { v: 2, state: raw.state || {}, added: raw.added || [], removed: raw.removed || [], updated: raw.updated || {} };
  }
  return { v: 2, state: raw || {}, added: [], removed: [], updated: {} };
}

/* Устройства аккаунта ↔ строки таблицы devices (см. src/lib/sync.js).
   В облаке у устройства: name, type и state — всё остальное одним объектом
   (заряд, память, в сети ли, переключатели). updated — когда меняли (для спора «что новее») */
function devicesToList(store) {
  return store.added.map((d) => {
    const { id, type, name, createdAt, ...rest } = d;
    return { id, type, name, createdAt: createdAt || 0, updatedAt: store.updated?.[id] || createdAt || 0, state: { ...rest, ...store.state[id] } };
  });
}
function devicesFromList(list, prev) {
  return {
    v: 2, removed: prev?.removed || [],
    added: list.map((i) => ({
      id: i.id, type: i.type, name: i.name, createdAt: i.createdAt,
      battery: i.state.battery ?? null, memory: i.state.memory ?? deviceType(i.type).memory,
      online: i.state.online ?? true, lastSeen: i.state.lastSeen || "только что",
    })),
    state: Object.fromEntries(list.map((i) => {
      const { battery, memory, lastSeen, ...st } = i.state;
      return [i.id, st];
    })),
    updated: Object.fromEntries(list.map((i) => [i.id, i.updatedAt])),
  };
}

// Подпись статуса: "Онлайн • 92%", "Онлайн" или "Не в сети".
// Реальное устройство: онлайн — по Presence, заряд и сеть — только настоящие (d.sys)
const deviceStatus = (d) => d.real
  ? [realStatus(d), d.online ? sysShort(d.sys) : ""].filter(Boolean).join(" • ")
  : !d.online ? "Не в сети" : d.battery != null ? `Онлайн • ${d.battery}%` : "Онлайн";

// Сколько ГБ занимают файлы на устройстве.
// Демо — по выдуманным цифрам хранилища, аккаунт — по своим файлам
const deviceUsed = (d, files = [], demo = true) => demo
  ? MEDIA_CATS.reduce((sum, c) => sum + c.devices
    .filter(([n]) => n === d.name || n === d.alias)
    .reduce((s, [, gb]) => s + gb, 0), 0)
  : Math.round(files.filter((f) => f.device === d.name || f.device === d.alias).reduce((s, f) => s + f.mb, 0) / 100) / 10;

// ЭКРАН "ГЛАВНАЯ" — список устройств + складка + карточка ассистента
// devices — устройства с текущим состоянием (в сети или нет) из App,
// onOpenDevice открывает окно устройства
// onAddDevice — открыть окно добавления,
// onRestoreDevices — вернуть исходные (canRestore — есть ли что возвращать)
/* ═══ ЖИВЫЕ СВЯЗИ НА ГЛАВНОЙ ═══════════════════════════════
   Тонкие линии от каждого устройства в списке к складке-«хабу».
   В сети — сплошная мятная линия, не в сети — серый пунктир.
   По линии пробегает точка только по событию: при открытии Главной,
   когда устройство подключилось/добавилось и когда на него отправили
   файл (тогда точка бежит от хаба к устройству). Постоянного движения нет.
   Где строки и хаб, ищем по меткам data-link-id / data-link-hub внутри
   родительского блока (он должен быть position: relative). */
const PULSE_MS = 900;
function DeviceLinks({ devices, received }) {
  const selfRef = useRef(null);
  const [geo, setGeo] = useState(null); // { w, h, lines: [{ id, online, x1, y1, x2, y2 }] }
  const [pulses, setPulses] = useState([]);
  const deviceKey = devices.map((d) => `${d.id}:${d.online}`).join("|");

  // Пересчёт координат: при смене размера блока и при изменении списка.
  // Родителя берём через свой элемент — он точно уже на странице
  useLayoutEffect(() => {
    const wrap = selfRef.current?.parentElement;
    if (!wrap) return;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const hubEl = wrap.querySelector("[data-link-hub]");
      if (!box.width || !hubEl) return setGeo(null); // блок скрыт (например, на телефоне)
      const hub = hubEl.getBoundingClientRect();
      const rows = [...wrap.querySelectorAll("[data-link-id]")];
      const n = rows.length;
      const lines = rows.map((el, i) => {
        const r = el.getBoundingClientRect();
        const d = devices.find((x) => x.id === el.dataset.linkId);
        const x1 = r.right - box.left, y1 = r.top + r.height / 2 - box.top;
        // Короткий горизонтальный отвод — у всех линий излом на одной вертикали
        const xm = x1 + 26;
        // Вход в складку: точки на её левой грани (на картинке грань идёт
        // от 34.5%/44% до 45%/77% размера), сверху вниз по порядку строк,
        // поэтому линии не пересекаются
        const t = n === 1 ? 0.5 : 0.12 + (0.76 * i) / (n - 1);
        const x2 = hub.left + hub.width * (0.345 + 0.105 * t) - box.left - 3;
        const y2 = hub.top + hub.height * (0.44 + 0.327 * t) - box.top;
        return { id: el.dataset.linkId, online: !!d?.online, pts: [[x1, y1], [xm, y1], [x2, y2]] };
      });
      setGeo({ w: box.width, h: box.height, lines });
    };
    measure();
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [deviceKey]);

  // Когда пускать точку: сравниваем с тем, что было в прошлый раз
  const prevOnline = useRef(null);
  const prevReceived = useRef(new Set());
  useEffect(() => {
    if (!geo || !geo.lines.length) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const first = prevOnline.current === null;
    const out = [];
    geo.lines.forEach((l, i) => {
      const wasOnline = first ? false : prevOnline.current[l.id];
      const gotFile = received[l.id] && !prevReceived.current.has(l.id);
      if (gotFile) out.push({ ...l, back: true, delay: i * 120 });          // файл: от хаба к устройству
      else if (l.online && !wasOnline) out.push({ ...l, delay: first ? i * 140 : 0 }); // подключилось / первое открытие
    });
    prevOnline.current = Object.fromEntries(geo.lines.map((l) => [l.id, l.online]));
    prevReceived.current = new Set(Object.keys(received));
    if (!reduce && out.length) {
      const stamp = Date.now();
      setPulses((p) => [...p, ...out.map((o, k) => ({ ...o, key: `${stamp}-${k}` }))]);
    }
  }, [geo, received]);

  return (
    <div ref={selfRef} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {geo && <svg width={geo.w} height={geo.h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {geo.lines.map((l) => (
          <g key={l.id}>
            <polyline points={l.pts.map((q) => q.join(",")).join(" ")} fill="none" strokeWidth="1" strokeLinejoin="miter"
              strokeDasharray={l.online ? undefined : "3 5"}
              style={{
                stroke: l.online
                  ? `color-mix(in srgb, ${C.mint} ${received[l.id] ? 70 : 32}%, transparent)`
                  : C.borderStrong,
                transition: "stroke 400ms ease",
              }} />
            {/* Узелки-ромбы: у края списка и там, где линия входит в грань складки */}
            {[l.pts[0], l.pts[2]].map(([x, y], k) => (
              <rect key={k} x={x - 2} y={y - 2} width="4" height="4" transform={`rotate(45 ${x} ${y})`}
                style={{ fill: l.online ? C.mint : C.borderStrong }} />
            ))}
          </g>
        ))}
      </svg>}
      {pulses.map((p) => (
        <LinkPulse key={p.key} p={p} onDone={() => setPulses((list) => list.filter((x) => x.key !== p.key))} />
      ))}
    </div>
  );
}

// Одна точка, которая один раз пробегает по линии и исчезает
function LinkPulse({ p, onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useLayoutEffect(() => {
    const pts = p.back ? [...p.pts].reverse() : p.pts;
    // Длины участков — чтобы на каждом точка шла с одной скоростью
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    let run = 0;
    const frames = pts.map((q, i) => {
      if (i) run += seg[i - 1];
      return { transform: `translate(${q[0]}px, ${q[1]}px)`, offset: run / total };
    });
    // Появляется в начале и гаснет в конце
    frames[0].opacity = 0;
    frames[frames.length - 1].opacity = 0;
    for (let i = 1; i < frames.length - 1; i++) frames[i].opacity = 1;
    const a = ref.current.animate(frames, { duration: PULSE_MS, delay: p.delay, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" });
    a.onfinish = () => doneRef.current();
    return () => a.cancel();
  }, []);
  return (
    <span ref={ref} style={{
      position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%",
      background: C.mint, opacity: 0, willChange: "transform, opacity",
    }} />
  );
}

// received — у каких устройств отметка «Получен файл» { id: { name } }
// update — вышла новая версия приложения (баннер «Обновить», только в приложении)
// loading — устройства аккаунта ещё грузятся из облака
// findState / onFind — «Найти» у реальных устройств (подключённых по коду)
// activityBlock — компактная лента «Активность» (только у вошедшего)
function ScreenHome({ devices, received = {}, update, loading, findState = {}, onFind, activityBlock, onNavigate, onOpenDevice, onAddDevice, onRestoreDevices, canRestore }) {
  // Сколько устройств сейчас в сети — для счётчика рядом с заголовком
  const onlineCount = devices.filter((d) => d.online).length;
  // Подпись под устройством: статус и «это устройство»
  const statusOf = (d) => [deviceStatus(d), d.isSelf && "это устройство"].filter(Boolean).join(" · ");
  // «Найти» — только у реального устройства в сети и не у себя
  const findable = (d) => d.real && d.online && !d.isSelf && onFind;

  // Пустой список: добавить новое или вернуть исходные.
  // Пока грузим из облака — вместо «Устройств пока нет» заготовка строк
  const empty = devices.length === 0 && (loading ? <DevicesSkeleton /> : (
    <EmptyState
      compact
      title="Устройств пока нет"
      text="Подключите новое устройство, и оно появится здесь"
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={onAddDevice}>
            Добавить устройство
          </StateButton>
          {canRestore && <StateButton onClick={onRestoreDevices}>Вернуть исходные</StateButton>}
        </div>
      }
    />
  ));

  return (
    <div className="ng-screen ng-home" style={{ padding: "28px 40px 40px", textAlign: "left" }}>

      {/* ══════════ ДЕСКТОПНАЯ ВЕРСИЯ ══════════ */}
      {/* Высота — почти на всё окно (минус футер и отступы), а содержимое
          стоит по центру по вертикали, чтобы снизу не было пустоты */}
      <div className="ng-home-desktop">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 40, position: "relative" }}>
          {/* Связи рисуются первыми — складка и карточки лежат поверх линий */}
          <DeviceLinks devices={devices} received={received} />
          {/* Левая колонка: заголовок + список */}
          <div>
            <div style={{
              fontSize: 30, letterSpacing: "0.2em",
              color: C.text, marginBottom: 14,
            }}>
              ВАША ЭКОСИСТЕМА
            </div>
            <div className="ng-display" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
              Все устройства в одной системе
            </div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 14, marginBottom: 30 }}>
              Синхронизировано. Работает. Рядом с вами
            </div>
            {/* В приложении на планшете: баннер обновления над списком устройств */}
            {update && <div style={{ marginTop: -12, marginBottom: 24 }}><UpdateBanner update={update} /></div>}

            <div className="nx-stagger" style={{ border: `1px solid ${C.border}`, borderRadius: 16 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "16px 18px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Устройства</span>
                <span title="В сети" style={{
                  display: "flex", alignItems: "center",
                  gap: 6, fontSize: 13, color: C.muted,
                }}>
                  {onlineCount} <Dot color={C.green} />
                </span>
              </div>
              {empty}
              {/* Каждая строка — кнопка: открывает окно устройства */}
              {devices.map((d) => (
                // Обёртка: «Найти» — отдельная кнопка рядом, а не внутри строки-кнопки
                <div key={d.id} style={{ position: "relative" }}>
                  <button data-link-id={d.id} type="button" className="nx-row-btn" onClick={() => onOpenDevice(d.id)}
                    style={{ ...btnReset, display: "block", width: "100%" }}>
                    <Row
                      leftIcon={d.icon({ c: C.text, s: 19 })}
                      title={d.name}
                      subtitle={statusOf(d)}
                      right={<>
                        {received[d.id] && <ReceivedTag name={received[d.id].name} />}
                        {findable(d) && <span style={{ width: 108 }} />}
                        <Dot color={d.online ? C.green : C.red} />
                      </>}
                    />
                  </button>
                  {findable(d) && (
                    <FindChip state={findState[d.device_id]} onClick={() => onFind(d)}
                      style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)" }} />
                  )}
                </div>
              ))}
              {/* Последняя строка — "Добавить устройство" */}
              {devices.length > 0 && (
                <button type="button" className="nx-row-btn" onClick={onAddDevice}
                  style={{ ...btnReset, display: "block", width: "100%", borderRadius: "0 0 16px 16px" }}>
                  <Row
                    leftIcon={Icon.plus({ c: C.mint, s: 18 })}
                    title="Добавить устройство"
                    subtitle="Смартфон, планшет, часы и другие"
                    accent={false}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Правая колонка: складка сверху, AI-карточка снизу.
              Отступ сверху — чтобы складка не залезала под часы */}
          <div style={{ display: "flex", flexDirection: "column", paddingTop: 48 }}>
            {/* Складка крупнее за счёт scale: место в раскладке остаётся
                прежним (340px), поэтому остальные блоки не сдвигаются.
                Края картинки прозрачные, так что на соседей она не «наезжает» */}
            <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div data-link-hub style={{ transform: "scale(1.4)", transformOrigin: "center" }}>
                <HomeFold size={340} count={devices.length} />
              </div>
            </div>
            <div
              onClick={() => onNavigate("assistant")}
              style={{
                marginTop: "auto",
                border: `1px solid ${C.border}`, borderRadius: 16,
                padding: "16px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: `linear-gradient(90deg, color-mix(in srgb, ${C.blueDark} 33%, transparent), color-mix(in srgb, ${C.mintDark} 33%, transparent))`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: C.mintDark,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.sparkle({ c: C.mint, s: 18 })}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>AI - Ассистент</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Чем могу помочь?</div>
                </div>
              </div>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                border: `1px solid ${C.borderSoft}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {Icon.chevron({ c: C.text })}
              </div>
            </div>
          </div>
        </div>
        {activityBlock && <div style={{ marginTop: 36 }}>{activityBlock}</div>}
      </div>

      {/* ══════════ МОБИЛЬНАЯ ВЕРСИЯ ══════════ */}
      <div className="ng-home-mobile">
        {/* Логотип + eyebrow */}
        <div className="ng-home-logo" style={{ marginBottom: 20 }}>
          <Logo small />
          <div style={{
            fontSize: 11, letterSpacing: "0.12em",
            color: C.muted, marginTop: 4, textTransform: "uppercase",
          }}>
            Ваша экосистема
          </div>
        </div>

         {/* Hero */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ng-display" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
              Все устройства в одной системе
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
              Синхронизировано. Работает. Рядом с вами
            </div>
          </div>
          {/* Складка крупнее и чуть выше — вровень с заголовком */}
          <div style={{ flexShrink: 0, alignSelf: "flex-start", margin: "-34px -14px 0 -10px" }}>
            <HomeFold size={168} count={devices.length} />
          </div>
        </div>

        {/* В приложении: вышла новая версия — предлагаем обновиться */}
        <UpdateBanner update={update} />
        {/* Предложение установить приложение (только телефон в браузере) */}
        <InstallBanner onHowTo={() => {
          onNavigate("settings");
          setTimeout(() => document.getElementById("nx-install")?.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
        }} />

        {/* Мои устройства */}
        <div style={{ marginTop: 24 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 14,
          }}>
            <div className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>
              Мои устройства
            </div>
            <div title="В сети" style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 14 }}>
              <span>{onlineCount}</span>
              <Dot color={C.green} />
            </div>
          </div>
          {empty && <div style={{ border: `1px solid ${C.border}`, borderRadius: 14 }}>{empty}</div>}
          <div className="nx-stagger" style={{
            display: "grid",
            // minmax(0, 1fr) — длинное название не раздвигает колонку
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10, position: "relative",
          }}>
            {/* Карточка — кнопка: открывает окно устройства */}
            {devices.map((d) => (
              <div key={d.id} style={{ position: "relative", minWidth: 0, display: "flex" }}>
              <button
                type="button"
                data-link-id={d.id}
                className="nx-row-btn"
                onClick={() => onOpenDevice(d.id)}
                style={{
                  ...btnReset,
                  border: `1px solid ${C.border}`, borderRadius: 14,
                  padding: 14, cursor: "pointer", position: "relative",
                  display: "flex", flexDirection: "column", gap: 10,
                  minHeight: 96, minWidth: 0, flex: 1,
                }}
              >
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex" }}>
                  <Dot color={d.online ? C.green : C.red} />
                </div>
                <div style={{ width: 26, height: 26 }}>
                  {d.icon({ c: C.text, s: 24 })}
                </div>
                <div style={{ marginTop: "auto", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  {/* Только что получен файл — отметка вместо статуса */}
                  {received[d.id]
                    ? <div style={{ marginTop: 3 }}><ReceivedTag name={received[d.id].name} compact /></div>
                    : <div style={{ fontSize: 13, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusOf(d)}</div>}
                </div>
              </button>
              {findable(d) && (
                <FindChip compact state={findState[d.device_id]} onClick={() => onFind(d)}
                  style={{ position: "absolute", top: 8, right: 28 }} />
              )}
              </div>
            ))}
            {/* Последняя карточка — "Добавить": пунктирная рамка, мятный плюс */}
            {devices.length > 0 && (
              <button
                type="button"
                className="nx-row-btn"
                onClick={onAddDevice}
                style={{
                  ...btnReset,
                  border: `1px dashed ${C.borderStrong}`, borderRadius: 14,
                  padding: 14, display: "flex", flexDirection: "column", gap: 10,
                  minHeight: 96, minWidth: 0,
                }}
              >
                <div style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {Icon.plus({ c: C.mint, s: 22 })}
                </div>
                <div style={{ marginTop: "auto", fontSize: 14, fontWeight: 500 }}>Добавить устройство</div>
              </button>
            )}
          </div>
        </div>

        {/* AI-карточка */}
        <div
          onClick={() => onNavigate("assistant")}
          style={{
            marginTop: 20,
            border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 14,
            background: `linear-gradient(90deg, color-mix(in srgb, ${C.blueDark} 33%, transparent), color-mix(in srgb, ${C.mintDark} 33%, transparent))`,
            cursor: "pointer",
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: C.mintDark,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {Icon.sparkle({ c: C.mint, s: 20 })}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>AI - Ассистент</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Чем могу помочь?</div>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            border: `1px solid ${C.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {Icon.chevron({ c: C.text })}
          </div>
        </div>
        {activityBlock && <div style={{ marginTop: 20 }}>{activityBlock}</div>}
      </div>

    </div>
  );
}

/* ═══ ЖИВЫЕ ПОДПИСИ «КОГДА БЫЛ В СЕТИ» ═════════════════════════ */
// ms — когда устройство последний раз было активно (state.seenAt, миллисекунды)
// Когда получены сведения: «в 14:05», «вчера в 14:05», «3 окт. в 14:05»
function sysTime(ms, now = Date.now()) {
  const d = new Date(ms), t = new Date(now);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === t.toDateString()) return `в ${hm}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${hm}`;
}
function lastSeenText(ms, now = Date.now()) {
  if (typeof ms !== "number" || !ms) return "Не в сети";
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Был в сети только что";
  if (min < 60) return `Был в сети ${min} ${plural(min, ["минуту", "минуты", "минут"])} назад`;
  const h = Math.floor(min / 60);
  const d = new Date(ms), t = new Date(now);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (h < 6) return `Был в сети ${h} ${plural(h, ["час", "часа", "часов"])} назад`;
  if (d.toDateString() === t.toDateString()) return `Был в сети сегодня в ${hm}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Был в сети вчера в ${hm}`;
  return `Был в сети ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${hm}`;
}
// Подпись реального устройства: «Онлайн» по Presence, иначе — когда был в сети
const realStatus = (d) => (d.online ? "Онлайн" : lastSeenText(d.seenAt));

/* ═══ ЛЕНТА «АКТИВНОСТЬ» ══════════════════════════════════════
   События связи устройств: подключилось, отключилось, получен текст / файл /
   ссылка, устройство нашлось, экран заблокирован. Хранится в localStorage
   ЭТОГО браузера (nexa-activity или nexa-activity@<id>), последние 50.
   Это не общая история аккаунта: на другом устройстве — своя лента.
   Тексты сообщений, ссылки целиком и коды сюда не пишем */
const ACTIVITY_MAX = 50;
const ACTIVITY_ICON = {
  connect: (c) => Icon.phone({ c, s: 15 }),
  disconnect: (c) => Icon.phone({ c, s: 15 }),
  text: (c) => Icon.chat({ c, s: 15 }),
  file: (c) => Icon.download({ c, s: 15 }),
  found: (c) => Icon.search({ c, s: 15 }),
  lock: (c) => Icon.lock({ c, s: 15 }),
  link: (c) => Icon.shareUp({ c, s: 15 }),
  sent: (c) => Icon.send({ c, s: 15 }),
};
const activityTime = (at) => {
  const d = new Date(at), now = new Date();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${hm}`;
};
const loadActivity = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v.slice(0, ACTIVITY_MAX) : []; } catch { return []; }
};

// Список событий: значок в квадратике, подпись, время справа
function ActivityList({ items, limit }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div>
      {list.map((it, i) => {
        const tone = it.kind === "disconnect" ? C.mutedSoft : it.kind === "connect" ? C.green : C.mint;
        return (
          <div key={it.id} className={i === 0 ? "nx-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 4, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {(ACTIVITY_ICON[it.kind] || ACTIVITY_ICON.sent)(tone)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
              {it.text && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.text}</div>}
            </div>
            <span style={{ fontSize: 12, color: C.mutedSoft, flexShrink: 0, whiteSpace: "nowrap" }}>{activityTime(it.at)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Компактный блок на Главной: последние 4 события и «Вся активность»
function ActivityBlock({ items, onOpen }) {
  return (
    <section aria-label="Активность" style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px 6px", background: C.bg, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>Активность</span>
        <button type="button" className="nx-link-btn" onClick={onOpen} style={{
          ...btnReset, fontSize: 12.5, color: C.mutedSoft, borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 2,
        }}>
          Вся активность →
        </button>
      </div>
      {items.length === 0
        ? <div style={{ fontSize: 13, color: C.mutedSoft, padding: "10px 0 12px" }}>Здесь появятся события ваших устройств: подключения, файлы, поиск.</div>
        : <ActivityList items={items} limit={4} />}
    </section>
  );
}

// Отдельный экран «Активность»: все события и «Очистить» с подтверждением
function ScreenActivity({ items, onBack, onClear }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") (confirm ? setConfirm(false) : onBack()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm]);
  const ghost = { ...btnReset, padding: "7px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div className="ng-screen" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 820 }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "18px 0 6px" }}>
        <div className="ng-display nx-page-title" style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1 }}>Активность</div>
        {items.length > 0 && !confirm && (
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(true)} style={ghost}>Очистить</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.mutedSoft, marginBottom: 18, lineHeight: 1.5 }}>
        События этого устройства, последние {ACTIVITY_MAX}. На других устройствах — своя лента.
      </div>
      {confirm && (
        <div role="alert" className="nx-pop" style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", marginBottom: 16, borderRadius: 4,
          border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, background: `color-mix(in srgb, ${C.red} 8%, transparent)`,
        }}>
          <span style={{ flex: "1 1 200px", fontSize: 13.5 }}>Очистить всю ленту на этом устройстве? Вернуть не получится.</span>
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={ghost}>Отмена</button>
          <button type="button" className="nx-ghost-btn" onClick={() => { onClear(); setConfirm(false); }} style={{ ...ghost, borderColor: C.red, color: C.red }}>Очистить</button>
        </div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 18px", background: C.bg }}>
        {items.length === 0
          ? <div style={{ fontSize: 13.5, color: C.mutedSoft, padding: "18px 0" }}>Пока пусто. Подключите устройство по коду — его события появятся здесь.</div>
          : <ActivityList items={items} />}
      </div>
    </div>
  );
}

/* ═══ ДЕМОНСТРАЦИОННАЯ БЛОКИРОВКА ЭКРАНА ══════════════════════
   Закрывает только интерфейс NEXA на этом устройстве. Это не системная
   блокировка телефона — так и написано на экране */
function LockOverlay({ from, onUnlock }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nx-lock-title" style={{
      position: "fixed", inset: 0, zIndex: 940, background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "calc(var(--sat) + 24px) 24px calc(var(--sab) + 24px)",
    }}>
      <span className="nx-pop" style={{ width: 64, height: 64, borderRadius: 4, border: `1px solid ${C.borderStrong}`, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 30 }}>
        <span style={{ transform: "rotate(-45deg)", display: "flex" }}>{Icon.lock({ c: C.mint, s: 26 })}</span>
      </span>
      <div id="nx-lock-title" className="ng-display" style={{ fontSize: 30, lineHeight: 1.15 }}>NEXA заблокирована</div>
      <div style={{ fontSize: 14.5, color: C.muted, marginTop: 10, maxWidth: 340, lineHeight: 1.5 }}>
        Заблокировали с устройства «{from}».
      </div>
      <button type="button" className="nx-primary" onClick={onUnlock} autoFocus style={{
        ...btnReset, marginTop: 28, padding: "14px 40px", fontSize: 16, fontWeight: 500, borderRadius: 999,
        border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
      }}>
        Разблокировать
      </button>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 18, maxWidth: 320, lineHeight: 1.5 }}>
        Это демонстрация: закрыт только экран NEXA, телефон не заблокирован и данные не защищены.
      </div>
    </div>
  );
}

/* ═══ БЫСТРЫЕ ДЕЙСТВИЯ С РЕАЛЬНЫМ УСТРОЙСТВОМ ═════════════════
   Найти, заблокировать экран NEXA, отправить файл, открыть ссылку.
   act — действия из NexaApp: { find, lock, sendFile, cancelSend, openLink, reconnect },
   st — их состояние для этого устройства: { find, lock, send: { state, progress, error } } */
function RealDeviceActions({ d, act, st = {}, linkOnline }) {
  const [url, setUrl] = useState("");
  const [urlNote, setUrlNote] = useState(null);
  const fileRef = useRef(null);
  if (d.isSelf) return null;
  // Почему действия недоступны (null — доступны)
  const why = !linkOnline ? "Нет связи с облаком — проверьте интернет" : !d.online ? "Устройство не в сети — действия появятся, когда на нём откроют NEXA" : null;
  const send = st.send || {};
  const sending = send.state === "uploading";
  const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap" };
  const off = (x) => (why ? { ...x, color: C.mutedSoft, cursor: "not-allowed" } : x);
  const goLink = (e) => {
    e.preventDefault();
    const safe = safeUrl(url);
    if (!safe) { setUrlNote("Нужна ссылка, которая начинается с http:// или https://"); return; }
    act.openLink(d, safe).then((ok) => { setUrlNote(ok ? null : "Не отправилось — попробуйте ещё раз"); if (ok) setUrl(""); });
  };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
      <div style={{ fontSize: 12.5, color: C.mutedSoft, marginBottom: 10 }}>Быстрые действия</div>
      <div className="nx-quick-actions" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <FindChip state={st.find} onClick={() => act.find(d)} style={off({ ...pill })} />
        <button type="button" className="nx-ghost-btn" disabled={!!why || st.lock === "locked"} onClick={() => act.lock(d)} style={off(pill)}>
          {Icon.lock({ c: why ? C.mutedSoft : C.text, s: 14 })} {st.lock === "locked" ? "Заблокировано" : "Заблокировать экран"}
        </button>
        <button type="button" className="nx-ghost-btn" disabled={!!why || sending} onClick={() => fileRef.current?.click()} style={off(pill)}>
          {Icon.send({ c: why ? C.mutedSoft : C.text, s: 14 })} Отправить файл
        </button>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) act.sendFile(d, f); }} />
      </div>
      {/* Отправка файла: настоящий процент, отмена; ошибка — честно */}
      {send.state && (
        <div role={send.state === "error" ? "alert" : "status"} style={{ marginTop: 10, fontSize: 12.5, color: send.state === "error" ? C.red : C.muted }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sending ? <Spinner s={11} /> : send.state === "done" ? Icon.check({ c: C.green, s: 13 }) : Icon.alert({ c: C.red, s: 13 })}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sending ? `Отправляем «${send.name}» — ${Math.round((send.progress || 0) * 100)}%` : send.state === "done" ? `«${send.name}» отправлен` : send.error}
            </span>
            {sending && <button type="button" onClick={() => act.cancelSend(d)} style={{ ...btnReset, fontSize: 12.5, color: C.mutedSoft, textDecoration: "underline", textUnderlineOffset: 3 }}>Отменить</button>}
          </div>
          {sending && (
            <div style={{ height: 2, background: C.border, marginTop: 8 }}>
              <div style={{ height: "100%", width: `${Math.max(2, (send.progress || 0) * 100)}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`, transition: "width 200ms linear" }} />
            </div>
          )}
        </div>
      )}
      {/* Открыть ссылку на устройстве */}
      <form onSubmit={goLink} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="nx-input" value={url} onChange={(e) => { setUrl(e.target.value); setUrlNote(null); }} disabled={!!why}
          type="url" inputMode="url" placeholder="https://…" aria-label="Ссылка, которую открыть на устройстве"
          style={{ flex: 1, minWidth: 0, background: "transparent", color: C.text, fontSize: 14, fontFamily: "inherit", border: `1px solid ${C.borderStrong}`, borderRadius: 4, padding: "8px 12px", outline: "none" }} />
        <button type="submit" className="nx-ghost-btn" disabled={!!why || !url.trim()} style={off(pill)}>
          {Icon.shareUp({ c: why ? C.mutedSoft : C.text, s: 14 })} Открыть на устройстве
        </button>
      </form>
      {urlNote && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginTop: 6 }}>{urlNote}</div>}
      {why && <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 10, lineHeight: 1.5 }}>{why}</div>}
      {!d.online && linkOnline && (
        <button type="button" className="nx-ghost-btn" onClick={act.reconnect} style={{ ...pill, marginTop: 10 }}>
          {Icon.refresh({ c: C.text, s: 14 })} Подключить снова
        </button>
      )}
    </div>
  );
}

/* Заголовок раздела на Главной — как «Мои устройства»: маленькая надпись
   сверху (eyebrow), крупный заголовок и что-то справа (статус, счётчик) */
function SectionHead({ eyebrow, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.mutedSoft, marginBottom: 6 }}>{eyebrow}</div>}
        <div className="ng-display" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

// Скошенный ярлык — как чипсы пути в «Файлах» (складка)
const SkewTag = ({ children, active = true, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: 1, whiteSpace: "nowrap",
    padding: "5px 13px 5px 12px", color: C.onFold,
    clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)",
    background: active
      ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`
      : `linear-gradient(90deg, ${C.foldDeep}, color-mix(in srgb, ${C.foldBlue} 70%, ${C.foldDeep}))`,
    ...style,
  }}>{children}</span>
);

// Маленькая контурная складка — для пустых состояний и приглашений
const OutlineFold = ({ s = 44 }) => (
  <svg viewBox="0 0 44 32" width={s} height={s * 32 / 44} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <polygon points="2,26 14,3 28,8 18,30" style={{ stroke: C.borderStrong }} strokeWidth="1" />
    <polygon points="18,30 28,8 42,14 34,29" style={{ stroke: C.mint }} strokeWidth="1" opacity="0.7" />
  </svg>
);

/* ═══ НАЙТИ УСТРОЙСТВО ════════════════════════════════════════ */
const FIND_RING_MS = 60 * 1000; // сигнал сам выключается через минуту

// Кнопка «Найти» на карточке реального устройства и её состояния
function FindChip({ state, onClick, compact, style }) {
  const look = {
    ringing: { text: "Ищем…", color: C.text, icon: <Spinner s={11} /> },
    found: { text: "Нашлось", color: C.green, icon: Icon.check({ c: C.green, s: 13 }) },
    timeout: { text: "Не ответило", color: C.mutedSoft, icon: null },
  }[state] || { text: "Найти", color: C.text, icon: Icon.search({ c: C.text, s: 13 }) };
  return (
    <button type="button" className="nx-ghost-btn" onClick={onClick} disabled={state === "ringing"}
      aria-label={state ? look.text : "Найти устройство"}
      style={{
        ...btnReset, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        padding: compact ? "4px 9px" : "6px 12px", fontSize: compact ? 11.5 : 12.5, borderRadius: 999,
        border: `1px solid ${C.borderStrong}`, color: look.color, background: C.bg, ...style,
      }}>
      {look.icon}{compact && !state ? null : null}{look.text}
    </button>
  );
}

/* Экран «Устройство ищут» поверх всего: вибрация, тихий повторяющийся
   сигнал (Web Audio) и большая кнопка «Нашёл». Сам выключается через минуту.
   Браузер может не разрешить звук без нажатия — тогда просто без звука */
function FindOverlay({ from, onFound, onTimeout }) {
  const found = useRef(onFound); found.current = onFound;
  const timeout = useRef(onTimeout); timeout.current = onTimeout;
  useEffect(() => {
    let ctx = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { ctx = new AC(); ctx.resume?.().catch(() => {}); }
    } catch {}
    const beep = () => {
      vibrate(400);
      if (!ctx || ctx.state !== "running") return;
      try {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.3);
      } catch {}
    };
    beep();
    const tick = setInterval(beep, 1500);
    const stop = setTimeout(() => timeout.current?.(), FIND_RING_MS);
    const onKey = (e) => { if (e.key === "Escape") found.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(tick); clearTimeout(stop);
      window.removeEventListener("keydown", onKey);
      try { navigator.vibrate?.(0); } catch {}
      ctx?.close?.().catch(() => {});
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nx-find-title" className="nx-find-overlay" style={{
      position: "fixed", inset: 0, zIndex: 950, background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "calc(var(--sat) + 24px) 24px calc(var(--sab) + 24px)",
    }}>
      {/* Расходящиеся квадратные волны — «сигнал»; при reduced motion неподвижны */}
      <div aria-hidden="true" style={{ position: "relative", width: 150, height: 150, marginBottom: 36 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="nx-find-wave" style={{
            position: "absolute", inset: 0, border: `1px solid ${C.mint}`, borderRadius: 4,
            transform: "rotate(45deg)", animationDelay: `${i * 600}ms`,
          }} />
        ))}
        <span style={{ position: "absolute", inset: 46, border: `1px solid ${C.mint}`, borderRadius: 4, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "rotate(-45deg)", display: "flex" }}>{Icon.search({ c: C.mint, s: 24 })}</span>
        </span>
      </div>
      <div id="nx-find-title" className="ng-display" style={{ fontSize: 30, lineHeight: 1.15 }}>Устройство ищут</div>
      <div style={{ fontSize: 14.5, color: C.muted, marginTop: 10, maxWidth: 320, lineHeight: 1.5 }}>
        Вас зовёт «{from}». Нажмите, когда найдёте — сигнал выключится.
      </div>
      <button type="button" className="nx-primary" onClick={() => found.current?.()} autoFocus style={{
        ...btnReset, marginTop: 30, padding: "16px 48px", fontSize: 17, fontWeight: 500, borderRadius: 999,
        border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        display: "inline-flex", alignItems: "center", gap: 10,
      }}>
        {Icon.check({ c: C.onFold, s: 18 })} Нашёл
      </button>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 16 }}>Сигнал выключится сам через минуту</div>
    </div>
  );
}

/* ═══ ПОДКЛЮЧЕНИЕ УСТРОЙСТВА ПО КОДУ / QR ═════════════════════
   Устройство с окном «Подключить устройство» выдаёт одноразовый код (6 символов,
   2 минуты). Подключаемое устройство (вход в тот же аккаунт) шлёт pair.claim с кодом,
   выдавшее сверяет код у себя и отвечает pair.ok или pair.fail.
   Код живёт только в памяти выдавшего устройства и никуда не пишется */
const PAIR_TTL_MS = 2 * 60 * 1000;     // код действует 2 минуты
const PAIR_MAX_TRIES = 5;              // неверных попыток до блокировки
const PAIR_LOCK_MS = 60 * 1000;        // блокировка на минуту
const PAIR_ANSWER_MS = 6000;           // сколько ждём ответа на код
const PAIR_LOCK_KEY = "nexa-pair-lock"; // у подключаемого: { wrong, until }
// Адрес для QR: на сайте — свой, в приложении — сайт NEXA
// Что за QR отсканировали: { pair: КОД } — подключение, { login: КОД } — вход
function parseNexaQr(text) {
  try {
    const u = new URL(String(text).trim());
    const pair = (u.searchParams.get("pair") || "").toUpperCase();
    const login = (u.searchParams.get("login") || "").toUpperCase();
    if (PAIR_CODE_RE.test(pair)) return { pair };
    if (PAIR_CODE_RE.test(login)) return { login };
  } catch {}
  return null;
}
const pairUrl = (code) => `${isNative ? "https://nexa-link.ru" : location.origin}/?pair=${code}`;
// Случайный код из «непохожих» символов (криптостойкий генератор)
function makePairCode() {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => PAIR_ALPHABET[n % PAIR_ALPHABET.length]).join("");
}
const readPairLock = () => { try { return JSON.parse(localStorage.getItem(PAIR_LOCK_KEY)) || { wrong: 0, until: 0 }; } catch { return { wrong: 0, until: 0 }; } };
const savePairLock = (v) => { try { localStorage.setItem(PAIR_LOCK_KEY, JSON.stringify(v)); } catch {} };
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/* Окно «Подключить устройство» на устройстве, которое выдаёт код.
   session — { code, expiresAt, used, lockedUntil } (живёт в NexaApp) */
// onClaim — ввели код с другого экрана; onScan — сканировать QR (только в приложении)
function PairModal({ session, online, onNewCode, onDemo, onClose, onClaim, onScan }) {
  const [mode, setMode] = useState("show"); // "show" — показать код, "enter" — ввести чужой
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  const left = session ? session.expiresAt - now : 0;
  const expired = !session || left <= 0;
  const locked = session && session.lockedUntil > now;
  const step = (n, text) => (
    <li style={{ display: "flex", gap: 10, fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 4, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.text, marginTop: 1 }}>{n}</span>
      <span>{text}</span>
    </li>
  );
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      // Фон под окном «Добавить устройство» слегка размыт (разрешённое исключение)
      background: `color-mix(in srgb, ${C.bg} 55%, transparent)`,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-pair-title" className="nx-viewer-panel nx-pop nx-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14,
          boxSizing: "border-box", textAlign: "left", padding: "20px 22px 22px",
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-pair-title" style={{ fontFamily: fontDisplay, fontSize: 24, lineHeight: 1.15 }}>Подключить устройство</div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>Телефон или другой компьютер — с входом в ту же почту</div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Два направления: это устройство показывает код или вводит чужой */}
        <div role="tablist" aria-label="Способ подключения" className="nx-seg" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", marginTop: 18 }}>
          {[["show", "Показать код"], ["enter", "У меня есть код"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} style={{
              ...btnReset, flex: 1, padding: "9px 14px", fontSize: 13, whiteSpace: "nowrap", textAlign: "center",
              background: mode === id ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
              color: mode === id ? C.onAccent : C.muted, fontWeight: mode === id ? 500 : 400,
            }}>{label}</button>
          ))}
        </div>

        {!online ? (
          <div style={{ marginTop: 18 }}>
            <StateNote kind="error">Нет связи — подключение по коду сейчас недоступно. Проверьте интернет.</StateNote>
          </div>
        ) : mode === "enter" ? (
          <div style={{ marginTop: 4 }}>
            <PairCodeForm onClaim={(code) => { onClaim?.(code); onClose(); }} />
            {onScan && (
              <button type="button" className="nx-ghost-btn" onClick={() => { onClose(); onScan(); }} style={{
                ...btnReset, marginTop: 12, width: "100%", padding: "11px 16px", fontSize: 13.5, borderRadius: 999,
                border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {Icon.search({ c: C.text, s: 15 })} Сканировать QR с другого экрана
              </button>
            )}
          </div>
        ) : (
          <div className="nx-pair-body" style={{ display: "flex", gap: 20, marginTop: 20, alignItems: "stretch" }}>
            {/* QR ведёт на сайт с ?pair=КОД — камера телефона откроет его сама */}
            <div style={{ flexShrink: 0 }}>
              <SkewTag>Камерой телефона</SkewTag>
              <div style={{ marginTop: 10, opacity: expired || locked ? 0.25 : 1, transition: "opacity 200ms ease" }}>
                {session && <QrCode text={pairUrl(session.code)} size={164} radius={0} label="QR-код для подключения устройства" />}
              </div>
            </div>
            {/* Тонкая вертикальная грань между способами */}
            <div className="nx-pair-or" aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.mutedSoft, fontSize: 11.5 }}>
              <span style={{ flex: 1, width: 1, background: C.border }} />или<span style={{ flex: 1, width: 1, background: C.border }} />
            </div>
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
              <SkewTag active={false} style={{ alignSelf: "flex-start" }}>Кодом вручную</SkewTag>
              {/* Код по клеткам — как поле ввода на другом устройстве */}
              <div aria-label="Код подключения" style={{ display: "flex", gap: 5, marginTop: 14, userSelect: "all" }}>
                {(session?.code || "").split("").map((ch, i) => (
                  <span key={i} style={{
                    width: 34, height: 46, flexShrink: 0, boxSizing: "border-box",
                    border: `1px solid ${expired || locked ? C.border : C.borderStrong}`, borderRadius: 4,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontDisplay, fontSize: 22, color: expired || locked ? C.mutedSoft : C.text,
                    background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`,
                  }}>{ch}</span>
                ))}
              </div>
              {/* Сколько осталось: полоса тает вместе со временем */}
              <div aria-hidden="true" style={{ height: 3, marginTop: 14, background: `color-mix(in srgb, ${C.text} 8%, transparent)` }}>
                <div style={{
                  height: "100%", width: `${expired || locked ? 0 : Math.max(0, Math.min(100, (left / PAIR_TTL_MS) * 100))}%`,
                  background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, transition: "width 500ms linear",
                }} />
              </div>
              <div role="status" style={{ fontSize: 13, marginTop: 8, color: locked || expired ? C.red : C.muted }}>
                {locked ? `Много неверных попыток. Снова через ${mmss(session.lockedUntil - now)}`
                  : expired ? "Код истёк"
                  : <>Действует ещё <span style={{ fontFamily: fontDisplay, color: C.text }}>{mmss(left)}</span></>}
              </div>
              {(expired || locked) && (
                <button type="button" className="nx-primary" onClick={onNewCode} style={{
                  ...btnReset, marginTop: 12, alignSelf: "flex-start", padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 999,
                  border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  {Icon.refresh({ c: C.onFold, s: 14 })} Новый код
                </button>
              )}
            </div>
          </div>
        )}

        {mode === "show" && (
          <ol style={{ listStyle: "none", margin: "20px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {step(1, "Наведите камеру телефона на QR — откроется NEXA, останется войти и подтвердить")}
            {step(2, "Или на другом устройстве: «Добавить устройство» → «У меня есть код»")}
          </ol>
        )}

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.mutedSoft }}>
          Хотите просто посмотреть, как это выглядит?{" "}
          <button type="button" onClick={onDemo} style={{ ...btnReset, fontSize: 12.5, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Добавить демо-устройство
          </button>
        </div>
      </div>
    </div>
  );
}

/* Окно на подключаемом устройстве: «Подключаем…» → «Подключено» или ошибка.
   claim — { phase: "waiting" | "ok" | "error", text } */
function PairStatusDialog({ claim, onClose }) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const ok = claim.phase === "ok", waiting = claim.phase === "waiting";
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 320, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-claim-title" className="nx-viewer-panel nx-pop" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(380px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "22px 22px 20px", boxSizing: "border-box", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <span style={{ width: 48, height: 48, borderRadius: 4, transform: "rotate(45deg)", border: `1px solid ${ok ? C.green : waiting ? C.mint : C.red}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ transform: "rotate(-45deg)", display: "flex" }}>
              {waiting ? <Spinner s={18} /> : ok ? Icon.check({ c: C.green, s: 20 }) : Icon.alert({ c: C.red, s: 20 })}
            </span>
          </span>
        </div>
        <div id="nx-claim-title" style={{ fontFamily: fontDisplay, fontSize: 22 }}>{waiting ? "Подключаем…" : ok ? "Подключено" : "Не получилось"}</div>
        <div role="status" style={{ fontSize: 13.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {waiting ? "Проверяем код на другом устройстве" : ok ? "Это устройство теперь в списке ваших устройств" : claim.text}
        </div>
        <button type="button" className="nx-ghost-btn" onClick={onClose} style={{
          ...btnReset, marginTop: 18, padding: "9px 22px", fontSize: 13.5, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text,
        }}>
          {waiting ? "Скрыть" : ok ? "Готово" : "Закрыть"}
        </button>
      </div>
    </div>
  );
}

// Ввод кода с другого экрана (внизу колонки «Онлайн» в «Связи устройств»)
function PairCodeForm({ onClaim }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (clean.length === 6) { onClaim(clean); setCode(""); } }}
      style={{ marginTop: 16 }}>
      <label htmlFor="nx-pair-code" style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 3 }}>Подключить по коду</label>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginBottom: 10, lineHeight: 1.4 }}>Код — на экране другого устройства: «Добавить устройство» → «Показать код»</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="nx-pair-code" className="nx-input" value={clean} onChange={(e) => setCode(e.target.value)}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="······"
          style={{
            flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: fontDisplay, fontSize: 19,
            letterSpacing: "0.32em", textAlign: "center", textTransform: "uppercase",
            border: `1px solid ${C.borderStrong}`, borderRadius: 4, padding: "8px 10px", outline: "none",
          }} />
        <button type="submit" className={clean.length === 6 ? "nx-primary" : "nx-ghost-btn"} disabled={clean.length !== 6} style={{
          ...btnReset, flexShrink: 0, padding: "8px 16px", fontSize: 13, borderRadius: 999, fontWeight: 500,
          ...(clean.length === 6
            ? { border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }
            : { border: `1px solid ${C.borderStrong}`, color: C.mutedSoft }),
        }}>
          Подключить
        </button>
      </div>
    </form>
  );
}

/* ═══ СВЯЗЬ УСТРОЙСТВ (Supabase Realtime, src/lib/realtime.js) ═══
   Блок на Главной: кто из устройств аккаунта онлайн, «Передать» текст или
   ссылку и «Входящее». Демо-устройства тут ни при чём — это настоящие окна
   и приложения, где выполнен вход в тот же аккаунт */
const peerLabel = (d) => `${d.kind === "app" ? "Приложение" : "Сайт"} · ${d.platform === "mobile" ? "телефон" : "компьютер"}`;
const LINK_STATUS = {
  online: "На связи", connecting: "Подключаемся…", offline: "Нет связи", denied: "Канал не настроен", off: "",
};
// Время входящего: «14:05» сегодня, иначе «3 окт., 14:05»
const inboxTime = (ts) => {
  const d = new Date(ts), today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return today ? hm : `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${hm}`;
};
// Скопировать текст: буфер обмена, а если он недоступен — старый способ
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

// Шапка колонки внутри панели — как шапка списка «Устройства»
const LinkColHead = ({ title, right }) => (
  <div className="nx-link-colhead" style={{
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "14px 18px", borderBottom: `1px solid ${C.border}`, minHeight: 22,
  }}>
    <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
    {right}
  </div>
);

// Пусто в колонке: контурная складка и короткая подсказка
const LinkEmpty = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", fontSize: 12.5, color: C.mutedSoft, lineHeight: 1.5 }}>
    <OutlineFold s={40} /> <span>{children}</span>
  </div>
);

// Одно входящее: от кого, текст (только как текст), «Копировать» и «Открыть» для ссылок
function InboxItem({ item, onRemove }) {
  const [copied, setCopied] = useState(false);
  const url = safeUrl(item.text);
  const small = { ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 12, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, textDecoration: "none" };
  return (
    <div className="nx-pop nx-inbox-item" style={{ padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SkewTag active={!!url}>{url ? "Ссылка" : "Текст"}</SkewTag>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.mutedSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.from_name} · {inboxTime(item.ts)}
        </span>
        <button type="button" className="nx-icon-btn" onClick={() => onRemove(item.id)} aria-label="Убрать из входящих" style={{
          ...btnReset, width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.mutedSoft, s: 13 })}
        </button>
      </div>
      {/* Текст выводим только как текст — React сам экранирует всё, HTML не вставляется */}
      <div className="nx-scroll" style={{
        fontSize: 14, lineHeight: 1.45, marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 132, overflowY: "auto",
        color: url ? C.mint : C.text,
      }}>
        {item.text}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className="nx-ghost-btn" onClick={async () => { if (await copyText(item.text)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }} style={small}>
          {copied ? Icon.check({ c: C.green, s: 13 }) : Icon.copy({ c: C.text, s: 13 })} {copied ? "Скопировано" : "Копировать"}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="nx-ghost-btn" style={small}>
            {Icon.shareUp({ c: C.text, s: 13 })} Открыть
          </a>
        )}
      </div>
    </div>
  );
}

/* Связь с реальным устройством — на его экране (DeviceScreen).
   Чужое устройство: «Передать» текст или ссылку и «Входящее» от него.
   Это устройство: всё, что сюда пришло. link — результат useDeviceLink */
function DeviceMessages({ d, link }) {
  const [text, setText] = useState("");
  const [sendState, setSendState] = useState("idle"); // idle | loading | success | error
  const [note, setNote] = useState(null);
  const online = link.status === "online";
  const items = d.isSelf ? link.inbox : link.inbox.filter((it) => it.from_device === d.device_id);
  const canSend = online && d.online && !d.isSelf;

  const send = async () => {
    if (sendState === "loading" || !canSend) return;
    setSendState("loading"); setNote(null);
    const res = await link.send(text, d.device_id);
    if (res.ok) { setText(""); setSendState("success"); setTimeout(() => setSendState("idle"), 1500); }
    else { setNote(res.error); setSendState("error"); setTimeout(() => setSendState("idle"), 1800); }
  };

  const card = { border: `1px solid ${C.border}`, borderRadius: 14, background: C.bg, overflow: "hidden", textAlign: "left" };
  return (
    <section aria-label="Связь с устройством" className="nx-msg-grid" style={{ ...card, marginTop: 24 }}>
      {!d.isSelf && (
        <form className="nx-link-col" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <LinkColHead title={`Передать на «${d.name}»`} right={text.length > TEXT_MAX - 300 && (
            <span style={{ fontSize: 12, color: text.length > TEXT_MAX ? C.red : C.mutedSoft }}>{text.length}/{TEXT_MAX}</span>
          )} />
          <div style={{ padding: "16px 18px 18px" }}>
            <textarea
              className="nx-input" value={text} rows={3} maxLength={TEXT_MAX}
              onChange={(e) => { setText(e.target.value); setNote(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
              placeholder="Текст или ссылка"
              aria-label={`Текст или ссылка для «${d.name}»`}
              style={{
                display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 84,
                background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`, color: C.text, fontSize: 15, fontFamily: "inherit", lineHeight: 1.45,
                border: `1px solid ${C.borderStrong}`, borderRadius: 4, padding: "11px 13px", outline: "none",
              }}
            />
            {!canSend && (
              <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 10 }}>
                {!online ? "Нет связи — отправить не получится" : "Устройство не в сети — отправить можно, когда на нём откроют NEXA"}
              </div>
            )}
            {note && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginTop: 10 }}>{note}</div>}
            <StateButton
              variant="primary" state={sendState}
              labels={{ loading: "Отправляем…", success: "Отправлено", error: "Не отправилось" }}
              icon={Icon.send({ c: C.onFold, s: 14 })}
              disabled={!canSend || !text.trim()}
              onClick={send}
              style={{ marginTop: 14, width: "100%", padding: "11px 16px", borderRadius: 999, fontSize: 13.5 }}
            >
              Отправить
            </StateButton>
          </div>
        </form>
      )}
      <div className="nx-link-col">
        <LinkColHead title={d.isSelf ? "Пришло на это устройство" : `Входящее от «${d.name}»`} right={items.length > 0 && (
          <span style={{ fontSize: 13, color: C.muted }}>{items.length}</span>
        )} />
        <div style={{ padding: "4px 18px 14px" }}>
          {items.length === 0 ? (
            <div style={{ paddingTop: 8 }}>
              <LinkEmpty>{d.isSelf ? "Пока ничего не пришло. Отправьте текст или ссылку с другого своего устройства." : "Пока ничего не приходило с этого устройства."}</LinkEmpty>
            </div>
          ) : (
            <div className="nx-scroll nx-inbox-list" style={{ maxHeight: 420, overflowY: "auto" }}>
              {items.map((it) => <InboxItem key={it.id} item={it} onRemove={link.removeInbox} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Значок погоды: ромб в круге
const weatherMark = (s = 24) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={C.text} strokeWidth="1.3">
    <circle cx="12" cy="12" r="10.5" />
    <polygon points="12,6.5 17.5,12 12,17.5 6.5,12" />
  </svg>
);

// Знак перед температурой: "+18", "-3", "0"
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// Крупная температура, за градусом острая складка.
// tone — цвет складки: мятный для ясной погоды, серый для пасмурной.
// rain — идёт дождь: вдоль складки падают мятные капли
function TempFold({ temp, tone, rain }) {
  return (
    <div className="nx-temp" style={{ position: "relative", display: "inline-flex", alignItems: "flex-start", paddingRight: 22, flexShrink: 0 }}>
      {rain && <RainDrops />}
      {/* Складка: светлая у верхней вершины и тающая книзу */}
      <div aria-hidden="true" style={{
        position: "absolute", top: -8, bottom: 0, left: "36%", right: 0,
        clipPath: "polygon(0 22%, 100% 0, 42% 100%)",
        background: `linear-gradient(to bottom left, ${tone}, transparent 80%)`,
      }} />
      <span style={{ position: "relative", fontFamily: fontDisplay, fontSize: 64, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.03em" }}>
        {signed(temp)}
      </span>
      <span style={{ position: "relative", fontFamily: fontDisplay, fontSize: 40, lineHeight: 0.8, marginLeft: 2 }}>°</span>
    </div>
  );
}

/* Капли дождя: короткие косые штрихи, яркие на «голове» и тающие к хвосту.
   Наклон — как у складки. При появлении капли трижды пролетают вниз
   и остаются на месте неподвижными штрихами (бесконечного движения нет).
   x, y — где капля (в % от складки), len — длина, d — задержка, o — яркость */
const RAIN_DROPS = [
  [8, 30, 16, 0, 0.5], [18, 8, 22, 420, 0.8], [27, 46, 14, 180, 0.45], [34, 20, 26, 620, 0.9],
  [42, 60, 18, 300, 0.55], [50, 4, 20, 820, 0.7], [57, 36, 30, 120, 1], [64, 70, 16, 540, 0.5],
  [70, 18, 18, 720, 0.65], [77, 52, 24, 260, 0.85], [84, 6, 14, 960, 0.5], [90, 34, 20, 380, 0.7],
  [24, 76, 12, 680, 0.4], [46, 88, 14, 80, 0.45],
];
function RainDrops() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "24%", right: -14, top: -26, bottom: -18, pointerEvents: "none" }}>
      {RAIN_DROPS.map(([x, y, len, d, o], i) => (
        <span key={i} className="nx-drop" style={{
          position: "absolute", left: `${x}%`, top: `${y}%`, width: 1.6, height: len, borderRadius: 1,
          opacity: o, animationDelay: `${d}ms`,
          background: `linear-gradient(to bottom, transparent, ${C.mint})`,
        }} />
      ))}
    </div>
  );
}

// Карточка погоды (на экране "Сегодня" их две: на сегодня и на завтра).
// city и details необязательные: у карточки "на завтра" их нет.
// art — показать складку внутри карточки (только на телефоне, как в макете).
// note — своя подпись под состоянием вместо «Ощущается как …» (для завтра)
// cityNote — мелкая подпись после города: откуда взялось местоположение
// veil — «вуаль», когда настоящих данных нет: { kind: "loading" | "error", text, onRetry }.
//   Значения размываются, поверх — сообщение и кнопка «Обновить»
// footer — строка внизу карточки (например «Обновлено в 14:32»),
// grow — карточка растягивается на всю свободную высоту, значения встают по центру
// onCity — нажатие на город (открыть выбор), cityPicker — сам выбор, если открыт
// rain — идёт дождь (капли на складке температуры)
function WeatherCard({ title, date, city, cityNote, temp, cond, feels, note, tone, rain, details, art, veil, footer, grow, onCity, cityPicker }) {
  return (
    <div className="nx-weather" style={{
      position: "relative", overflow: "hidden",
      border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "22px 24px",
      display: "flex", flexDirection: "column", boxSizing: "border-box",
      ...(grow ? { flex: 1 } : {}),
    }}>
      {art && (
        <div className="nx-weather-art" aria-hidden="true" style={{ display: "none", position: "absolute", right: -8, top: 44 }}>
          <FoldHero size={128} />
        </div>
      )}

      {/* Шапка: на компьютере "Погода" и дата, под ними город;
          на телефоне "Погода" прячется, город и дата встают в одну строку */}
      <div className="nx-weather-head" style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto",
        gridTemplateAreas: `"title date" "city city"`, alignItems: "center", columnGap: 12,
      }}>
        <div className="nx-weather-title" style={{ gridArea: "title", display: "flex", alignItems: "center", gap: 14, fontFamily: fontDisplay, fontSize: 20 }}>
          {weatherMark()} {title}
        </div>
        <div className="nx-weather-date" style={{ gridArea: "date", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{date}</div>
        {/* Пока погоды нет (грузится или ошибка), город тоже размыт — как и значения под ним */}
        {cityPicker}
        {city && !cityPicker && (
          <button type="button" onClick={onCity} title="Выбрать город" className="nx-weather-city nx-link-btn" aria-hidden={veil ? true : undefined} style={{
            ...btnReset, cursor: onCity ? "pointer" : "default",
            gridArea: "city", display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: C.muted, marginTop: 8, minWidth: 0,
            ...(veil ? { filter: "blur(5px)", opacity: 0.45, userSelect: "none" } : {}),
          }}>
            <span className="nx-weather-pin" style={{ display: "flex", width: 24, justifyContent: "center", flexShrink: 0 }}>{Icon.pin({ c: C.muted, s: 20 })}</span>
            {/* Длинное название города обрезается многоточием, подпись не съезжает */}
            <span className="nx-weather-cityname" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
            {cityNote && (
              <span className="nx-weather-note" style={{ flexShrink: 0, marginLeft: -6, fontSize: 11, color: C.mutedSoft, whiteSpace: "nowrap" }}>· {cityNote}</span>
            )}
            {/* Город не определился — подсказываем, что его можно указать */}
            {city === "—" && <span style={{ fontSize: 11, color: C.mint, whiteSpace: "nowrap" }}>указать</span>}
          </button>
        )}
      </div>

      {/* Значения погоды. Если настоящих данных нет (veil), они размыты,
          а поверх — сообщение: «загружаем» или «не удалось + Обновить».
          flex: 1 + центр — в растянутой карточке значения стоят посередине.
          minHeight — чтобы сообщение с кнопкой не вылезало за край карточки */}
      <div style={{
        position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        minHeight: veil ? 150 : undefined,
      }}>
        <div aria-hidden={veil ? true : undefined} style={veil ? {
          filter: "blur(8px)", opacity: 0.45, pointerEvents: "none", userSelect: "none",
        } : { transition: "filter 300ms ease, opacity 300ms ease" }}>
          <div className="nx-weather-main" style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            <TempFold temp={temp} tone={tone} rain={rain} />
            <div>
              <div style={{ fontSize: 20 }}>{cond}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{note || `Ощущается как ${signed(feels)}°`}</div>
            </div>
          </div>

          {details && (
            <div className="nx-weather-details" style={{ position: "relative", display: "flex", marginTop: 26 }}>
              {details.map((d, i) => (
                <div key={d.label} className="nx-weather-detail" style={{
                  flex: 1, minWidth: 0,
                  paddingLeft: i ? 16 : 0,
                  borderLeft: i ? `1px solid ${C.borderStrong}` : "none",
                }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{d.label}</div>
                  <div className="nx-weather-value" style={{ fontSize: 19, fontWeight: 300, color: C.muted, marginTop: 2, whiteSpace: "nowrap" }}>{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {veil && (
          <div role={veil.kind === "error" ? "alert" : "status"} className="nx-pop" style={{
            position: "absolute", inset: 0, marginTop: 12,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, textAlign: "center",
          }}>
            {veil.kind === "loading" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.muted }}>
                <Spinner /> Загружаем погоду…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.4 }}>
                  Не удалось загрузить погоду
                  {veil.text && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>{veil.text}</div>}
                </div>
                <button type="button" className="nx-ghost-btn" onClick={veil.onRetry} style={{
                  ...btnReset, display: "flex", alignItems: "center", gap: 8,
                  // Кнопка-«таблетка», как кнопки в окне устройства
                  border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 18px", fontSize: 13,
                  background: C.panel,
                }}>
                  {Icon.refresh({ c: C.text, s: 14 })} Обновить
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
    </div>
  );
}

// Старый пример расписания. Сейчас по умолчанию расписание пустое, а этот
// список нужен только чтобы узнать и убрать пример, сохранённый раньше.
// place — где проходит (видно только на телефоне)
const SCHEDULE = [
  { time: "09:30", title: "Лекция по проектированию", place: "Колледж" },
  { time: "11:00", title: "Встреча с куратором", place: "Колледж" },
  { time: "13:00", title: "Обед", place: "Кафе у дома" },
  { time: "14:30", title: "Работа над дипломом", place: "Дома" },
  { time: "17:00", title: "Тренировка", place: "Фитнес-клуб" },
];

// Своё расписание хранится в браузере; пока его нет — показываем пример выше
const SCHEDULE_KEY = "nexa-schedule";
// День в виде "2026-10-11" — так дела привязаны к дате
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayFromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
// Сначала по дате, внутри дня — по времени
const sortSchedule = (list) => [...list].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.time.localeCompare(b.time));
// Дела на конкретный день
const itemsOn = (list, key) => list.filter((it) => it.date === key);
// Пример, который раньше сохранялся сам: те же дела в том же количестве
const isOldExample = (list) => list.length === SCHEDULE.length &&
  SCHEDULE.every((x) => list.some((y) => y.time === x.time && y.title === x.title));
// По умолчанию расписание пустое. Если в браузере остался старый пример — тоже пустое.
// Старые дела без даты считаем сегодняшними
const loadSchedule = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SCHEDULE_KEY));
    if (Array.isArray(v)) return isOldExample(v) ? [] : sortSchedule(v.map((it) => (it.date ? it : { ...it, date: dayKey() })));
  } catch {}
  return [];
};
// Минуты от начала дня: "14:30" → 870
const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

/* ---------- РЕАЛЬНАЯ ПОГОДА (Open-Meteo) ----------
   Бесплатный сервис без ключа, браузер ходит в него напрямую.
   Город — Казань. Обновляем раз в 15 минут. */
// Адрес погоды собирается по координатам — так одни и те же данные
// можно получать для любого города, а не только для Казани
const weatherUrl = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code" +
  "&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=16"; // 16 дней — максимум бесплатного прогноза
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 10000;   // дольше 10 секунд ответа не ждём

// Понятная причина, почему погода не загрузилась (для строки под карточкой)
function weatherErrorText(err, timedOut) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "нет интернета";
  if (timedOut) return "сервис погоды не ответил";
  // "Failed to fetch" / "Load failed" — запрос не дошёл: сеть, VPN или блокировщик
  if (err instanceof TypeError) return "нет связи с сервисом погоды";
  return err.message || "неизвестная ошибка";
}

// Заглушки: показываются, пока погода грузится или если загрузить не вышло,
// чтобы карточки не пустели. Даты — сегодня и завтра, не захардкожены.
const WEATHER_FALLBACK = {
  now: { temp: 18, feels: 17, wind: 3, humidity: 62, pressure: 758, code: 0, date: new Date() },
  tomorrow: { temp: 12, min: 7, code: 3, date: new Date(Date.now() + 86400000) },
};

// WMO-код погоды → русский текст и цвет складки:
// мятный — ясно и почти ясно, серый — облачно, осадки, туман
/* Значок погоды в нашем стиле: тонкие линии и «облако»-грань (параллелограмм).
   Солнце — мятное, облака — серые грани, осадки — мятные штрихи/точки */
function weatherKind(code) {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "partly";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloud";
}
function WeatherGlyph({ code, s = 20 }) {
  const kind = weatherKind(code);
  const mint = { stroke: C.mint }, gray = { stroke: C.muted };
  const cloud = (pts, o = 1) => <polygon points={pts} strokeWidth="1.3" strokeLinejoin="round" style={{ stroke: C.muted, fill: `color-mix(in srgb, ${C.muted} ${Math.round(o * 35)}%, transparent)` }} />;
  const rays = (cx, cy, r1, r2, n) => Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    return <line key={i} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)} strokeWidth="1.4" strokeLinecap="round" style={mint} />;
  });
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {kind === "sun" && <><circle cx="12" cy="12" r="4" strokeWidth="1.5" style={{ ...mint, fill: `color-mix(in srgb, ${C.mint} 25%, transparent)` }} />{rays(12, 12, 6.6, 9, 8)}</>}
      {kind === "partly" && <><circle cx="9" cy="9" r="3.2" strokeWidth="1.4" style={mint} />{rays(9, 9, 5.2, 7, 6)}{cloud("5,20 9,13 21,13 17,20")}</>}
      {kind === "cloud" && <>{cloud("8,15 12,7 22,7 18,15", 0.5)}{cloud("2,20 6,12 17,12 13,20")}</>}
      {kind === "fog" && [8, 12, 16].map((y, i) => <line key={y} x1={3 + i * 2} y1={y} x2={21 - (2 - i) * 2} y2={y} strokeWidth="1.5" strokeLinecap="round" style={gray} />)}
      {kind === "rain" && <>{cloud("3,13 7,5 21,5 17,13")}{[7, 12, 17].map((x) => <line key={x} x1={x} y1="16" x2={x - 2} y2="21" strokeWidth="1.5" strokeLinecap="round" style={mint} />)}</>}
      {kind === "snow" && <>{cloud("3,13 7,5 21,5 17,13")}{[[7, 17], [12, 20], [17, 17]].map(([x, y]) => <rect key={x} x={x - 1.3} y={y - 1.3} width="2.6" height="2.6" transform={`rotate(45 ${x} ${y})`} style={{ fill: C.mint }} />)}</>}
      {kind === "storm" && <>{cloud("3,12 7,4 21,4 17,12")}<path d="M13 13 9.5 18h4L11 22.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={mint} /></>}
    </svg>
  );
}

function weatherCodeToText(code) {
  const clear = { tone: C.mint };
  // rain — идут осадки каплями (морось, дождь, ливень, гроза): на складке будут капли
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const gray = { tone: C.muted, rain };
  if (code === 0) return { text: "Ясно", ...clear };
  if (code === 1) return { text: "Почти ясно", ...clear };
  if (code === 2) return { text: "Переменная облачность", ...clear };
  if (code === 3) return { text: "Пасмурно", ...gray };
  if (code === 45 || code === 48) return { text: "Туман", ...gray };
  if (code >= 51 && code <= 55) return { text: "Морось", ...gray };
  if (code === 56 || code === 57) return { text: "Ледяная морось", ...gray };
  if (code === 61 || code === 63) return { text: "Дождь", ...gray };
  if (code === 65) return { text: "Сильный дождь", ...gray };
  if (code === 66 || code === 67) return { text: "Ледяной дождь", ...gray };
  if (code === 71 || code === 73) return { text: "Снег", ...gray };
  if (code === 75) return { text: "Сильный снег", ...gray };
  if (code === 77) return { text: "Снежная крупа", ...gray };
  if (code >= 80 && code <= 82) return { text: "Ливень", ...gray };
  if (code === 85 || code === 86) return { text: "Снегопад", ...gray };
  if (code === 95) return { text: "Гроза", ...gray };
  if (code === 96 || code === 99) return { text: "Гроза с градом", ...gray };
  return { text: "Облачно", ...gray }; // неизвестный код — нейтрально
}

// Дата для карточки: «7 октября 2026», по времени Казани
function formatWeatherDate(date) {
  // Без timeZone — берётся часовой пояс устройства пользователя
  const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  // Год берём отдельной частью: иначе некоторые браузеры допишут «г.»
  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric" })
    .formatToParts(date).find((p) => p.type === "year").value;
  return `${dayMonth} ${year}`;
}

// "2026-10-07" из ответа → дата. Берём полдень по UTC, чтобы
// при переводе во время Казани день точно не съехал
const dayFromIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

// Разбор ответа Open-Meteo в наш вид. Единицы:
// ветер км/ч → м/с (÷3.6), давление гПа → мм рт. ст. (×0.750062), температура — целая
function parseWeather(data) {
  const c = data.current;
  const d = data.daily;
  if (!c || !d || !Array.isArray(d.time) || d.time.length < 2) throw new Error("Неполный ответ погоды");
  return {
    now: {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      wind: Math.round(c.wind_speed_10m / 3.6),
      humidity: Math.round(c.relative_humidity_2m),
      pressure: Math.round(c.surface_pressure * 0.750062),
      code: c.weather_code,
      date: dayFromIso(d.time[0]),
    },
    tomorrow: {
      temp: Math.round(d.temperature_2m_max[1]),
      min: Math.round(d.temperature_2m_min[1]),
      code: d.weather_code[1],
      date: dayFromIso(d.time[1]),
    },
    // Прогноз по дням (до 16): днём (max), ночью (min) и код погоды.
    // Последний день сервис иногда присылает пустым (null) — такие дни
    // пропускаем, иначе округление превратит пустоту в «0°»
    days: d.time
      .map((iso, i) => ({ iso, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], code: d.weather_code[i] }))
      .filter((x) => x.max != null && x.min != null && x.code != null)
      .map((x) => ({ date: dayFromIso(x.iso), max: Math.round(x.max), min: Math.round(x.min), code: x.code })),
  };
}

// Подпись дня в прогнозе: «Сегодня», «Завтра» или «Пт, 9 окт.»
function forecastDayLabel(date, index) {
  if (index === 0) return "Сегодня";
  if (index === 1) return "Завтра";
  const s = date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- МЕСТОПОЛОЖЕНИЕ ----------
   Определяем город двумя способами одновременно:
   1) геолокация браузера — точные координаты, но браузер спросит разрешение;
   2) ipapi.co — примерно по IP-адресу, без разрешений.
   Приоритет у геолокации: ответ по IP ставим не раньше чем через 1,5 секунды,
   чтобы геолокация успела «победить». Пока ничего не пришло — Казань. */
// Пока город не определён — прочерк. Погода для этого случая берётся
// по запасным координатам (центр Поволжья), пока город не найдётся
const DEFAULT_LOCATION = { city: "—", lat: 55.79, lon: 49.11, source: "default" };
const CITY_KEY = "nexa-city"; // город, выбранный вручную
const readManualCity = () => {
  try { const v = JSON.parse(localStorage.getItem(CITY_KEY)); if (v && v.city && v.lat != null) return { ...v, source: "manual" }; } catch {}
  return null;
};

/* Общие данные экрана «Сегодня»: расписание, город и последняя
   загруженная погода. Ими пользуются и экран «Сегодня», и ассистент
   (сводка «что у меня сегодня»). Экран обновляет город и погоду,
   когда они загружаются. */
const TODAY = {
  schedule: [],
  city: DEFAULT_LOCATION.city, lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon,
  weather: null, weatherAt: 0,
};

// Погода для сводки: свежая из TODAY, а если её нет — загружаем сами
// (ждём не дольше 5 секунд). Не вышло — null, сводка обойдётся без погоды
async function getTodayWeather() {
  if (TODAY.weather && Date.now() - TODAY.weatherAt < WEATHER_REFRESH_MS * 2) return TODAY.weather;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(weatherUrl(TODAY.lat, TODAY.lon), { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`ответ сервера ${res.status}`);
    TODAY.weather = parseWeather(await res.json());
    TODAY.weatherAt = Date.now();
    return TODAY.weather;
  } catch {
    return TODAY.weather;
  } finally {
    clearTimeout(timer);
  }
}
const GEO_TIMEOUT_MS = 6000;        // дольше 6 секунд геолокацию не ждём
const GEO_CACHE_MS = 10 * 60 * 1000; // браузер может отдать координаты из кэша за 10 минут
const IP_GRACE_MS = 1500;           // столько ждём геолокацию, прежде чем поставить город по IP
const CITY_LOOKUP_MS = 3000;        // дольше 3 секунд название города не ждём

// Подпись под городом на карточке погоды: откуда взялось местоположение
const LOCATION_SOURCE_TEXT = {
  geo: "определено точно",
  ip: "примерно по IP",
  default: "не определено",
  manual: "выбран вами",
};

/* Местоположение по IP: пробуем несколько бесплатных сервисов по очереди
   (у каждого бывают лимиты и блокировки). Ответ — { lat, lon } или null.
   С VPN по IP определится город сервера VPN — для точности есть геолокация
   и ручной выбор города */
const IP_SERVICES = [
  ["https://ipapi.co/json/", (d) => !d.error && [d.latitude, d.longitude]],
  ["https://ipwho.is/", (d) => d.success !== false && [d.latitude, d.longitude]],
  ["https://get.geojs.io/v1/ip/geo.json", (d) => [parseFloat(d.latitude), parseFloat(d.longitude)]],
];
async function ipLocation(signal) {
  for (const [url, pick] of IP_SERVICES) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const ll = pick(await res.json());
      if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) return { lat: ll[0], lon: ll[1] };
    } catch (e) {
      if (e.name === "AbortError") return null;
    }
  }
  return null;
}

/* Поиск города по названию (Open-Meteo, без ключа). До 6 вариантов:
   { city, region, lat, lon } — регион, чтобы различать одинаковые названия */
async function searchCities(q, signal) {
  const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=ru&format=json&name=" + encodeURIComponent(q), { signal });
  if (!res.ok) throw new Error("ответ сервера " + res.status);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    city: r.name, region: [r.admin1, r.country].filter(Boolean).join(", "),
    lat: round2(r.latitude), lon: round2(r.longitude),
  }))
    // Одинаковые «город + регион» (город и одноимённый район) показываем один раз
    .filter((c, i, all) => all.findIndex((x) => x.city === c.city && x.region === c.region) === i);
}

// Геолокация браузера в виде промиса. Если браузер её не умеет
// (старый браузер или сайт открыт не по HTTPS) — сразу «отказ»
function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("геолокация недоступна"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: GEO_TIMEOUT_MS,
      maximumAge: GEO_CACHE_MS,
    });
  });
}

// Название города по координатам, по-русски (BigDataCloud, без ключа).
// Берём city, а если его нет — locality. Не дождались или ошибка — null
// Запрос с ограничением по времени: не ответил за CITY_LOOKUP_MS — считаем, что не вышло
function withTimeout(promise) {
  const giveUp = new Promise((resolve) => setTimeout(() => resolve(null), CITY_LOOKUP_MS));
  return Promise.race([promise.catch(() => null), giveUp]);
}

// Крупные города — запасной вариант, если ни один сервис не назвал город.
// Работает даже без интернета: просто ищем ближайший по координатам
const KNOWN_CITIES = [
  ["Москва", 55.76, 37.62], ["Санкт-Петербург", 59.94, 30.31], ["Казань", 55.79, 49.11],
  ["Нижний Новгород", 56.33, 44.0], ["Екатеринбург", 56.84, 60.61], ["Новосибирск", 55.03, 82.92],
  ["Самара", 53.2, 50.15], ["Уфа", 54.74, 55.97], ["Челябинск", 55.16, 61.4],
  ["Пермь", 58.01, 56.25], ["Ростов-на-Дону", 47.24, 39.71], ["Краснодар", 45.04, 38.98],
  ["Воронеж", 51.66, 39.2], ["Волгоград", 48.71, 44.51], ["Омск", 54.99, 73.37],
  ["Красноярск", 56.01, 92.85], ["Набережные Челны", 55.74, 52.4], ["Ижевск", 56.85, 53.2],
  ["Ульяновск", 54.31, 48.4], ["Чебоксары", 56.14, 47.25], ["Йошкар-Ола", 56.63, 47.89],
];
function nearestKnownCity(lat, lon) {
  // Расстояние в км по формуле для небольших расстояний — точности хватает
  const km = ([, la, lo]) => {
    const dx = (lo - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    const dy = (la - lat) * 111;
    return Math.hypot(dx, dy);
  };
  const best = KNOWN_CITIES.reduce((a, b) => (km(b) < km(a) ? b : a));
  // Ближе 60 км — это тот самый город; дальше — честно пишем «рядом с»
  return km(best) < 60 ? best[0] : `Рядом с г. ${best[0]}`;
}

// Название города по координатам, по-русски. Пробуем по очереди:
// 1) BigDataCloud (city или locality), 2) OpenStreetMap (Nominatim),
// 3) ближайший крупный город из списка выше. Пустым не бывает никогда
async function cityByCoords(lat, lon, signal) {
  const bdc = await withTimeout(
    fetch("https://api.bigdatacloud.net/data/reverse-geocode-client" +
      `?latitude=${lat}&longitude=${lon}&localityLanguage=ru`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && (data.city || data.locality)) || null)
  );
  if (bdc) return bdc;

  const osm = await withTimeout(
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=ru" +
      `&lat=${lat}&lon=${lon}`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const a = data && data.address;
        return (a && (a.city || a.town || a.village || a.municipality)) || null;
      })
  );
  if (osm) return osm;

  return nearestKnownCity(lat, lon);
}

// Координаты округляем до сотых (≈1 км): для погоды точнее не нужно
const round2 = (n) => Math.round(n * 100) / 100;

/* Хук местоположения. Возвращает { city, lat, lon, source },
   source — "geo" (геолокация), "ip" (по IP) или "default" (Казань). */
function useLocation() {
  // Город, выбранный вручную, важнее автоматики
  const [manual, setManual] = useState(readManualCity);
  const [loc, setLoc] = useState(DEFAULT_LOCATION);

  useEffect(() => {
    if (manual) return; // выбран вручную — ничего не определяем
    let cancelled = false;   // экран закрыли — больше ничего не обновляем
    let geoWon = false;      // геолокация сработала — ответ по IP больше не нужен
    let graceOver = false;   // прошли ли 1,5 секунды ожидания геолокации
    let ipLoc = null;        // готовый ответ по IP, если уже пришёл
    const ctrl = new AbortController(); // чтобы оборвать запросы при закрытии

    // Ставим город по IP, только если: он уже пришёл, 1,5 секунды прошли
    // и геолокация не успела победить
    const applyIp = () => {
      if (!cancelled && !geoWon && graceOver && ipLoc) setLoc(ipLoc);
    };
    const graceTimer = setTimeout(() => { graceOver = true; applyIp(); }, IP_GRACE_MS);

    // Способ 1: по IP (несколько сервисов по очереди). Название города
    // переспрашиваем по координатам — так оно по-русски
    ipLocation(ctrl.signal)
      .then(async (ll) => {
        if (!ll) return;
        const lat = round2(ll.lat);
        const lon = round2(ll.lon);
        const city = await cityByCoords(lat, lon, ctrl.signal);
        ipLoc = { city, lat, lon, source: "ip" };
        applyIp();
      })
      .catch(() => { /* тихо: остаётся следующий по приоритету вариант */ });

    // Способ 2: геолокация браузера. Если пользователь отказал или
    // браузер не ответил за 6 секунд — тихо, остаётся IP или Казань
    getBrowserPosition()
      .then(async (pos) => {
        if (cancelled) return;
        geoWon = true; // с этого момента ответ по IP игнорируем
        const lat = round2(pos.coords.latitude);
        const lon = round2(pos.coords.longitude);
        const city = await cityByCoords(lat, lon, ctrl.signal);
        if (!cancelled) setLoc({ city, lat, lon, source: "geo" });
      })
      .catch(() => { /* отказ или нет геолокации — без ошибок и всплывашек */ });

    return () => {
      cancelled = true;
      clearTimeout(graceTimer);
      ctrl.abort();
    };
  }, [manual]);

  // Выбрать город вручную (null — снова определять автоматически)
  const pick = (c) => {
    try {
      if (c) localStorage.setItem(CITY_KEY, JSON.stringify({ city: c.city, lat: c.lat, lon: c.lon }));
      else localStorage.removeItem(CITY_KEY);
    } catch {}
    widgetsSetCity(c); // виджет погоды на рабочем столе (только в приложении)
    if (!c) setLoc(DEFAULT_LOCATION);
    setManual(c ? { city: c.city, lat: c.lat, lon: c.lon, source: "manual" } : null);
  };

  return { ...(manual || loc), pick };
}

/* Выбор города: поле поиска и список вариантов прямо в карточке погоды.
   Enter — первый вариант, Esc — отмена */
function CityPicker({ onPick, onAuto, onClose, isManual }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ loading: false, list: [], error: null });
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setState({ loading: false, list: [], error: null }); return; }
    const ctrl = new AbortController();
    setState((st) => ({ ...st, loading: true, error: null }));
    // Ищем через 300 мс после последней буквы, чтобы не слать запрос на каждую
    const t = setTimeout(() => {
      searchCities(text, ctrl.signal)
        .then((list) => setState({ loading: false, list, error: null }))
        .catch((e) => { if (e.name !== "AbortError") setState({ loading: false, list: [], error: "Не удалось найти — проверьте интернет" }); });
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const text = q.trim();
  return (
    <div className="nx-pop" style={{ gridArea: "city", marginTop: 10 }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); if (state.list[0]) onPick(state.list[0]); }} style={{ display: "flex", gap: 6 }}>
        <input autoFocus className="nx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Введите город"
          aria-label="Поиск города" style={{
            flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 16,
            border: "1px solid " + C.borderStrong, borderRadius: 4, padding: "8px 10px", outline: "none", boxSizing: "border-box",
          }} />
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Отмена" style={{
          ...btnReset, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {Icon.close({ c: C.muted, s: 16 })}
        </button>
      </form>
      <div style={{ marginTop: 6 }}>
        {state.loading && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.muted, padding: "6px 2px" }}><Spinner /> Ищем…</div>}
        {state.error && <div style={{ fontSize: 12.5, color: C.red, padding: "6px 2px" }}>{state.error}</div>}
        {!state.loading && !state.error && text.length >= 2 && state.list.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.mutedSoft, padding: "6px 2px" }}>Ничего не нашлось</div>
        )}
        {state.list.map((c) => (
          <button key={c.lat + "," + c.lon} type="button" className="nx-row-btn" onClick={() => onPick(c)} style={{
            ...btnReset, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "baseline", gap: 8,
            padding: "8px 4px", borderBottom: "1px solid " + C.border, fontSize: 13.5,
          }}>
            <span>{c.city}</span>
            <span style={{ fontSize: 11.5, color: C.mutedSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.region}</span>
          </button>
        ))}
        {isManual && (
          <button type="button" className="nx-link-btn" onClick={onAuto} style={{ ...btnReset, fontSize: 12.5, color: C.muted, padding: "8px 2px" }}>
            Определять автоматически
          </button>
        )}
      </div>
    </div>
  );
}

/* Хук погоды. Возвращает { loading, error, now, tomorrow, refetch }.
   now / tomorrow — null, пока ни разу не загрузилось (тогда экран берёт
   заглушки). Если очередное обновление упало, остаются последние
   удачные данные. Незаконченный запрос отменяется (AbortController),
   когда начинается новый или экран закрывается. */
function useWeather(lat, lon) {
  const [state, setState] = useState({ loading: true, error: null, now: null, tomorrow: null, days: null, updatedAt: null });
  const ctrlRef = useRef(null); // текущий запрос — чтобы отменить его при новом

  const load = () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    // Если сервис молчит дольше WEATHER_TIMEOUT_MS — прекращаем ждать
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, WEATHER_TIMEOUT_MS);
    setState((s) => ({ ...s, loading: true, error: null }));
      fetch(weatherUrl(lat, lon), { signal: ctrl.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`ответ сервера ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const w = parseWeather(data);
        // Заодно кладём в общие данные — их читает ассистент
        TODAY.weather = w;
        TODAY.weatherAt = Date.now();
        setState({ loading: false, error: null, updatedAt: Date.now(), ...w });
      })
      .catch((err) => {
        // Запрос отменили сами (новый запрос или ушли с экрана) — это не ошибка
        if (err.name === "AbortError" && !timedOut) return;
        // Подробности — в консоль браузера (F12 → Console), чтобы найти причину
        console.warn("[NEXA] Погода не загрузилась:", err);
        setState((s) => ({ ...s, loading: false, error: weatherErrorText(err, timedOut) }));
      })
      .finally(() => clearTimeout(timer));
  };

  // Загружаем при открытии экрана и потом раз в 15 минут.
  // loadRef всегда держит свежую load — с актуальными координатами
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    loadRef.current();
    const id = setInterval(() => loadRef.current(), WEATHER_REFRESH_MS);
    // Потянули экран вниз в приложении (событие "nexa-refresh") — тоже обновляем
    const onRefresh = () => loadRef.current();
    window.addEventListener("nexa-refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("nexa-refresh", onRefresh);
      ctrlRef.current?.abort();
    };
    // Перезагружаем погоду, когда меняется город (то есть координаты)
  }, [lat, lon]);

  return { ...state, refetch: load };
}

/* Прогноз на 2 недели. Только настоящие данные: пока их нет,
   показываем загрузку или ошибку, а не выдуманные дни.
   variant:
     "inline" — список раскрывается под кнопкой (узкий экран и телефон);
     "aside"  — панель справа от погоды на всю высоту колонки (широкий экран),
                с заголовком, кнопкой «закрыть» и своей прокруткой. */
function ForecastList({ id, days, loading, error, onRetry, variant = "inline", onClose }) {
  const aside = variant === "aside";

  // Что внутри: загрузка, ошибка или список дней
  let body;
  if (!days && loading) {
    body = (
      <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "26px 16px", fontSize: 13, color: C.muted }}>
        <Spinner /> Загружаем прогноз…
      </div>
    );
  } else if (!days) {
    body = (
      <EmptyState
        compact
        title="Прогноз пока недоступен"
        text={error ? `Не удалось загрузить: ${error}.` : "Данных о погоде ещё нет."}
        action={
          <button type="button" className="nx-ghost-btn" onClick={onRetry} style={{
            ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "8px 14px", fontSize: 13,
          }}>
            Повторить
          </button>
        }
      />
    );
  } else {
    body = (
      <>
        {days.map((day, i) => {
          const sky = weatherCodeToText(day.code);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13,
              borderTop: i ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ width: 86, flexShrink: 0, color: i < 2 ? C.text : C.muted }}>{forecastDayLabel(day.date, i)}</div>
              {/* Значок погоды: солнце, облака, дождь, снег, туман или гроза */}
              <WeatherGlyph code={day.code} />
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sky.text}</div>
              {/* Днём и ночью */}
              <div style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {signed(day.max)}°<span style={{ color: C.mutedSoft }}> / {signed(day.min)}°</span>
              </div>
            </div>
          );
        })}
        <div style={{ padding: "8px 14px 10px", fontSize: 11.5, color: C.mutedSoft, borderTop: `1px solid ${C.border}` }}>
          Днём / ночью. Дальше 16 дней точного прогноза нет ни у одного сервиса.
        </div>
      </>
    );
  }

  if (!aside) {
    return (
      <div id={id} className="nx-pop" style={{ marginTop: 10, border: `1px solid ${C.borderStrong}`, borderRadius: 8 }}>
        {body}
      </div>
    );
  }

  return (
    <div id={id} role="region" aria-label="Прогноз на 2 недели" className="nx-fc-slide" style={{
      height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column",
      background: C.bg, border: `1px solid ${C.borderStrong}`, borderRadius: 10, overflow: "hidden",
    }}>
      {/* Шапка панели: заголовок и «закрыть» */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 10px 12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, fontFamily: fontDisplay, fontSize: 17 }}>Прогноз на 2 недели</div>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть прогноз" style={{
          ...btnReset, width: 30, height: 30, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.muted, s: 16 })}
        </button>
      </div>
      {/* Список прокручивается внутри панели, сама панель высотой с колонку погоды */}
      <div className="nx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {body}
      </div>
    </div>
  );
}

// ЭКРАН "СЕГОДНЯ" — расписание (таймлайн) + погода на сегодня и завтра.
// На компьютере: расписание слева, погода справа, ещё правее складка.
// На телефоне сначала погода, под ней расписание (порядок меняет CSS).
// «Через 20 минут», «Через 1 ч 15 мин», «Сейчас»
function untilText(diff) {
  if (diff <= 0) return "Сейчас";
  if (diff < 60) return `Через ${diff} ${plural(diff, ["минуту", "минуты", "минут"])}`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `Через ${h} ч${m ? ` ${m} мин` : ""}`;
}
// Время по умолчанию для нового дела — следующий целый час
const nextHour = () => `${String((new Date().getHours() + 1) % 24).padStart(2, "0")}:00`;

/* Форма нового дела: дата, время, название и описание (необязательно).
   day — выбранный день (по умолчанию дело ставится на него). Enter — добавить, Esc — отмена */
function ScheduleForm({ existing, day, onSave, onCancel }) {
  const [date, setDate] = useState(day || dayKey());
  const [time, setTime] = useState(nextHour);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState(""); // описание (в данных поле по-прежнему place)
  const t = title.trim();
  const today = dayKey();
  const dup = existing.some((x) => x.date === date && x.time === time && x.title.toLowerCase() === t.toLowerCase());
  const error = !t ? null
    : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Укажите дату"
    : date < today ? "Эта дата уже прошла"
    : !/^\d{2}:\d{2}$/.test(time) ? "Укажите время"
    : dup ? "Такое дело уже есть" : null;
  const save = () => { if (t && !error) onSave({ date, time, title: t, place: place.trim() }); };
  // Поля скруглённые — как кнопки рядом
  const field = {
    background: `color-mix(in srgb, ${C.panel2} 50%, transparent)`, color: C.text, fontFamily: "inherit", fontSize: 14,
    border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "9px 16px", outline: "none", minWidth: 0, boxSizing: "border-box",
  };
  return (
    <form className="nx-pop nx-sched-form" onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      style={{ border: `1px solid color-mix(in srgb, ${C.mint} 45%, transparent)`, borderRadius: 14, padding: 14, marginBottom: 20, display: "grid", gap: 10 }}>
      <div className="nx-sched-form-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 124px", gap: 10 }}>
        <input type="date" required value={date} min={today} onChange={(e) => setDate(e.target.value)} className="nx-input" aria-label="Дата" style={field} />
        <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="nx-input" aria-label="Время" style={field} />
      </div>
      <input autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className="nx-input"
        placeholder="Что за дело?" aria-label="Название" aria-invalid={!!error} style={field} />
      <input value={place} maxLength={80} onChange={(e) => setPlace(e.target.value)} className="nx-input"
        placeholder="Описание (необязательно)" aria-label="Описание" style={field} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={error ? undefined : "nx-sched-hint"} style={{ flex: 1, fontSize: 12, color: error ? C.red : C.mutedSoft }}>{error || "Enter — добавить, Esc — отмена"}</span>
        <button type="button" className="nx-ghost-btn" onClick={onCancel} style={{ ...btnReset, fontSize: 13, padding: "7px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}` }}>
          Отмена
        </button>
        <button type="submit" className="nx-primary" disabled={!t || !!error} style={{
          ...btnReset, fontSize: 13, padding: "7px 14px", borderRadius: 999, border: "1px solid transparent",
          color: C.onFold, fontWeight: 500, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        }}>
          Добавить
        </button>
      </div>
    </form>
  );
}

/* Полоса дней над расписанием: сегодня, завтра и ещё 5 дней вперёд.
   Под днём — точка, если на него уже есть дела */
const DAYS_AHEAD = 7;
function DayStrip({ value, onChange, all }) {
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  return (
    <div role="tablist" aria-label="День" className="nx-day-strip nx-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 18 }}>
      {days.map((d, i) => {
        const key = dayKey(d), on = key === value, has = all.some((it) => it.date === key);
        const top = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : d.toLocaleDateString("ru-RU", { weekday: "short" });
        return (
          <button key={key} type="button" role="tab" aria-selected={on} onClick={() => onChange(key)} className="nx-day-chip" style={{
            ...btnReset, flexShrink: 0, minWidth: 64, padding: "8px 14px 7px", borderRadius: 14, textAlign: "center",
            border: `1px solid ${on ? "transparent" : C.borderStrong}`,
            background: on ? `linear-gradient(135deg, ${C.foldBlue}, ${C.foldCyan})` : "transparent",
            color: on ? C.onFold : C.text,
          }}>
            <span style={{ display: "block", fontSize: 11.5, opacity: on ? 0.9 : 0.7, whiteSpace: "nowrap" }}>{top}</span>
            <span style={{ display: "block", fontFamily: fontDisplay, fontSize: 18, lineHeight: 1.2, marginTop: 1 }}>{d.getDate()}</span>
            <span style={{ display: "block", width: 4, height: 4, margin: "3px auto 0", borderRadius: "50%", background: has ? (on ? C.onFold : C.mint) : "transparent" }} />
          </button>
        );
      })}
    </div>
  );
}

// schedule — все дела (по датам, общие с ассистентом), onAddItem / onRemoveItem — добавить и удалить
function ScreenToday({ schedule: all = TODAY.schedule, onAddItem, onRemoveItem }) {
  // Какой день смотрим (по умолчанию сегодня). Дела этого дня — schedule
  const [day, setDay] = useState(dayKey);
  const today = dayKey();
  const isToday = day === today;
  const schedule = itemsOn(all, day);
  // Живое расписание: «сейчас» обновляется сам (раз в 15 секунд) — только для сегодня
  const clock = useClock();
  const nowMin = isToday ? clock.getHours() * 60 + clock.getMinutes() : -1;
  const nextIdx = isToday ? schedule.findIndex((it) => toMinutes(it.time) >= nowMin) : -1; // -1 — всё прошло / не сегодня
  const next = nextIdx >= 0 ? schedule[nextIdx] : null;
  const cursorAt = !isToday ? -1 : nextIdx >= 0 ? nextIdx : schedule.length; // курсор «сейчас» — перед ближайшим делом
  const [adding, setAdding] = useState(false);

  // Курсор «сейчас»: ромб на линии таймлайна, мятная черта и время справа
  const nowMarker = (
    // Своя строка высотой 18px: ромб на линии таймлайна, черта и время —
    // всё на одной оси, с промежутками до соседних дел (ничего не наезжает)
    <div key="now" className="nx-sched-now" aria-label={`Сейчас ${hhmm(clock)}`} style={{ position: "relative", height: 18, margin: "-4px 0 10px" }}>
      <span style={{ position: "absolute", left: "var(--dot-x)", top: "50%", width: 9, height: 9, margin: "-4.5px 0 0 -4.5px", background: C.mint, transform: "rotate(45deg)" }} />
      <span style={{ position: "absolute", left: "calc(var(--dot-x) + 10px)", right: 52, top: "50%", height: 1, background: `linear-gradient(90deg, ${C.mint}, color-mix(in srgb, ${C.mint} 15%, transparent))` }} />
      <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 11, lineHeight: 1, color: C.mint, letterSpacing: "0.04em" }}>{hhmm(clock)}</span>
    </div>
  );
  // Сначала определяем город, потом по нему грузим погоду
  const location = useLocation();
  // Реальная погода; пока её нет (грузится или ошибка) — заглушки
  const weather = useWeather(location.lat, location.lon);
  const [pickingCity, setPickingCity] = useState(false); // открыт ли выбор города
  // Город и координаты — в общие данные (для сводки ассистента)
  useEffect(() => {
    TODAY.city = location.city;
    TODAY.lat = location.lat;
    TODAY.lon = location.lon;
  }, [location.city, location.lat, location.lon]);
  const [forecastOpen, setForecastOpen] = useState(false); // раскрыт ли прогноз на 2 недели
  const now = weather.now || WEATHER_FALLBACK.now;
  const tomorrow = weather.tomorrow || WEATHER_FALLBACK.tomorrow;
  const nowSky = weatherCodeToText(now.code);
  const tomorrowSky = weatherCodeToText(tomorrow.code);

  // Тихая строка под карточкой: идёт обновление или не вышло обновить
  const statusLine = { fontSize: 11.5, color: C.mutedSoft };

  // Настоящих данных ещё нет — вместо выдуманных цифр размываем значения
  // и пишем, что происходит: грузим или не вышло (тогда кнопка «Обновить»)
  const veil = weather.now ? null
    : weather.loading ? { kind: "loading" }
    : { kind: "error", text: weather.error, onRetry: weather.refetch };

  return (
    <MediaLayout hideArt={forecastOpen}>
      <MediaTitle title="Сегодня" subtitle="Ваши дела, расписание и погода — всё в одном месте." />

      <div className="nx-today-grid nx-stagger" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 356px)",
        // Справа три панели с одинаковыми отступами: погода, завтра, прогноз.
        // "Завтра" растягивается (строка 1fr), поэтому верх правой колонки
        // вровень с верхом расписания, а кнопка прогноза — с его низом
        gridTemplateAreas: `"sched now" "sched next" "sched month"`,
        gridTemplateRows: "auto 1fr auto",
        gap: "18px 44px", alignItems: "start",
      }}>
        {/* alignSelf: stretch — рамка расписания всегда по высоте правой колонки */}
        <section className="nx-sched" style={{ gridArea: "sched", alignSelf: "stretch", border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "26px 28px 30px" }}>
          <div className="nx-sched-head" style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: fontDisplay, fontSize: 20, marginBottom: 10 }}>
            {Icon.calendar({ c: C.text, s: 24 })} Расписание
            {/* Своё дело: открывает форму над таймлайном */}
            {!adding && (
              <button type="button" className="nx-ghost-btn" onClick={() => setAdding(true)} style={{
                ...btnReset, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: fontBody,
                fontSize: 13, padding: "6px 12px", borderRadius: 999, border: `1px solid ${C.borderStrong}`,
              }}>
                {Icon.plus({ c: C.mint, s: 14 })} Добавить
              </button>
            )}
          </div>
          {/* Дни: сегодня, завтра и дальше */}
          <DayStrip value={day} onChange={(k) => { setDay(k); setAdding(false); }} all={all} />
          {/* Живая строка: сколько осталось до ближайшего дела (пустая — не занимает места) */}
          {(next || schedule.length > 0) && (
            <div role="status" className="nx-sched-until" style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
              {next
                ? <>{untilText(toMinutes(next.time) - nowMin)} — <span style={{ color: C.text }}>{next.title.toLowerCase()}</span></>
                : isToday ? "На сегодня всё — дел больше нет"
                : `${dayFromKey(day).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })} · ${schedule.length} ${plural(schedule.length, ["дело", "дела", "дел"])}`}
            </div>
          )}

          {adding && (
            <ScheduleForm existing={all} day={day} onCancel={() => setAdding(false)}
              onSave={(it) => { onAddItem?.(it); setDay(it.date); setAdding(false); }} />
          )}

          {schedule.length === 0 && !adding && (
            <EmptyState compact title={isToday ? "Дел на сегодня нет" : "На этот день дел нет"} text="Добавьте дело — оно появится на таймлайне"
              action={<StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={() => setAdding(true)}>Добавить дело</StateButton>} />
          )}

          {/* Вертикальная линия таймлайна — один div. --dot-x — где центр
              кружков; на телефоне время стоит слева, и линия сдвигается.
              Прошедшие дела бледнее, ближайшее выделено мятным,
              между ними — курсор «сейчас» */}
          {schedule.length > 0 && (
          <div className="nx-sched-list nx-stagger" style={{ position: "relative", "--dot-x": "12px" }}>
            <div className="nx-sched-line" style={{ position: "absolute", left: "var(--dot-x)", top: 8, bottom: -10, width: 1, background: C.muted }} />
            {schedule.flatMap((it, i) => {
              const past = i < cursorAt;
              const isNext = i === nextIdx;
              const row = (
              <div key={`${it.time}-${it.title}`} className="nx-sched-item" style={{
                display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)",
                gridTemplateAreas: `"dot time" ". box"`, columnGap: 20, marginBottom: 14,
                opacity: past ? 0.45 : 1, transition: "opacity 400ms ease",
              }}>
                <span className="nx-sched-dot" style={{
                  gridArea: "dot", justifySelf: "center", alignSelf: "center", position: "relative",
                  width: 12, height: 12, boxSizing: "border-box", borderRadius: "50%",
                  border: `1.5px solid ${isNext ? C.mint : C.text}`,
                  background: isNext ? C.mint : past ? C.muted : C.bg,
                }} />
                <div className="nx-sched-time" style={{ gridArea: "time", fontSize: 14, fontWeight: 500, marginBottom: 6, color: isNext ? C.mint : C.text }}>{it.time}</div>
                <div className="nx-sched-box" style={{
                  gridArea: "box", borderRadius: 14, padding: "9px 10px 9px 16px",
                  border: `1px solid ${isNext ? `color-mix(in srgb, ${C.mint} 70%, transparent)` : C.borderStrong}`,
                  background: isNext ? `color-mix(in srgb, ${C.mint} 6%, transparent)` : "transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                  transition: "border-color 400ms ease, background-color 400ms ease",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="nx-sched-title" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                    {it.place && <div className="nx-sched-place" style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.4, overflowWrap: "anywhere" }}>{it.place}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {isNext && <span style={{ fontSize: 11, color: C.mint, letterSpacing: "0.04em" }}>скоро</span>}
                    <button type="button" className="nx-icon-btn nx-sched-del" onClick={() => onRemoveItem?.(it)} aria-label={`Удалить «${it.title}»`} title="Удалить" style={{
                      ...btnReset, width: 30, height: 30, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {Icon.trash({ c: C.muted, s: 15 })}
                    </button>
                  </div>
                </div>
              </div>
              );
              return i === cursorAt ? [nowMarker, row] : [row];
            }).concat(isToday && cursorAt === schedule.length ? [nowMarker] : [])}
          </div>
          )}
        </section>

        <div style={{ gridArea: "now" }}>
            <WeatherCard title="Погода" date={formatWeatherDate(now.date)} city={location.city} cityNote={LOCATION_SOURCE_TEXT[location.source]}
            onCity={() => setPickingCity(true)}
            cityPicker={pickingCity && (
              <CityPicker
                isManual={location.source === "manual"}
                onClose={() => setPickingCity(false)}
                onPick={(c) => { location.pick(c); setPickingCity(false); }}
                onAuto={() => { location.pick(null); setPickingCity(false); }}
              />
            )}
            temp={now.temp} cond={nowSky.text} feels={now.feels} tone={nowSky.tone} rain={nowSky.rain}
            details={[
              { label: "Ветер", value: `${now.wind} м/с` },
              { label: "Влажность", value: `${now.humidity} %` },
              { label: "Давление", value: `${now.pressure} мм` },
            ]}
            veil={veil}
            // Пока данных нет, о загрузке и ошибке говорит сама карточка (вуаль),
            // поэтому строку статуса показываем только когда погода уже есть
            footer={weather.now &&
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
            {/* Кнопка обновления доступна всегда — можно потянуть погоду заново */}
            <button
              type="button"
              className="nx-icon-btn"
              onClick={weather.refetch}
              disabled={weather.loading}
              aria-label="Обновить погоду"
              title="Обновить погоду"
              style={{
                ...btnReset, width: 26, height: 26, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {weather.loading
                ? <Spinner s={14} />
                : Icon.refresh({ c: C.muted, s: 14 })}
            </button>

            {/* Что происходит: обновляемся, ошибка или «обновлено в 14:32» */}
            <div role="status" style={statusLine}>
              {weather.loading
                ? "Обновление…"
                : weather.error
                  ? `Не удалось обновить: ${weather.error} · нажмите ↻`
                  : weather.updatedAt
                    ? `Обновлено в ${new Date(weather.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                    : null}
            </div>
          </div>
            } />
        </div>
        <div style={{ gridArea: "next", alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <WeatherCard title="Погода (завтра)" date={formatWeatherDate(tomorrow.date)}
            temp={tomorrow.temp} cond={tomorrowSky.text} note={`Ночью ${signed(tomorrow.min)}°`} tone={tomorrowSky.tone} rain={tomorrowSky.rain}
            veil={veil} grow />
        </div>
        <div style={{ gridArea: "month", alignSelf: "end" }}>
          <button type="button" className="nx-ghost-btn"
            onClick={() => setForecastOpen(!forecastOpen)}
            aria-expanded={forecastOpen} aria-controls="nx-forecast nx-forecast-side"
            style={{
              ...btnReset, width: "100%", boxSizing: "border-box",
              border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "6px 14px",
              display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", fontSize: 14,
            }}>
            <span />
            <span>Прогноз на 2 недели</span>
            {/* Стрелка: на широком экране при открытии смотрит влево («закрыть»),
                на узком — вниз (список под кнопкой). См. .nx-fc-chev в стилях */}
            <span className={`nx-fc-chev${forecastOpen ? " is-open" : ""}`} style={{ justifySelf: "end", display: "flex" }}>
              {Icon.chevron({ c: C.text })}
            </span>
          </button>
          {/* Узкий экран и телефон: список под кнопкой */}
          {forecastOpen && (
            <div className="nx-fc-inline">
              <ForecastList id="nx-forecast" days={weather.days} loading={weather.loading}
                error={weather.error} onRetry={weather.refetch} />
            </div>
          )}
        </div>

        {/* Широкий экран: панель справа от погоды, поверх края складки.
            Стоит в той же колонке, что и погода (все строки — вровень с расписанием), и сдвинута
            вправо за её край. Внутренняя обёртка absolute — поэтому панель
            берёт высоту колонки погоды, но сама её не растягивает */}
        {forecastOpen && (
          <div className="nx-fc-aside" style={{
            gridColumn: 2, gridRow: "1 / -1", alignSelf: "stretch", justifySelf: "start",
            width: 330, marginLeft: "calc(100% + 32px)", position: "relative", zIndex: 3,
          }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <ForecastList id="nx-forecast-side" variant="aside" days={weather.days} loading={weather.loading}
                error={weather.error} onRetry={weather.refetch} onClose={() => setForecastOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </MediaLayout>
  );
}

/* ---------- ДЕМО-ДАННЫЕ ДЛЯ "МЕДИА" И "ФАЙЛОВ" ----------
   Один общий набор: оба экрана берут файлы отсюда, поэтому
   цифры и списки на них всегда совпадают. Данные выдуманные. */

// Категории хранилища. gb — сколько места занято, devices — на каких
// устройствах лежат эти файлы (сумма должна совпадать с gb).
// Форма складки на диаграмме:
//   flex   — ширина сегмента,
//   clip   — сама фигура (точки многоугольника в % от сегмента),
//   top, h — сдвиг сверху и высота: складки стоят "лесенкой", а не в ряд,
//   labelX — где начинается подпись внутри фигуры,
//   facet  — угол тёмной грани, которая делает стекло "согнутым".
const MEDIA_CATS = [
  { id: "photo", label: "Фото", gb: 96, pct: 38, from: C.foldDeep, to: C.foldBlue, icon: Icon.image,
    flex: 2.2, clip: "polygon(0 100%, 30% 4%, 100% 0, 72% 96%)", top: "8%", h: "86%", labelX: "30%", facet: "118deg",
    devices: [["Смартфон", 61], ["Ноутбук", 27], ["Облако", 8]] },
  { id: "video", label: "Видео", gb: 68, pct: 27, from: C.foldDeep, to: C.foldBlue, icon: Icon.video,
    flex: 1.7, clip: "polygon(0 100%, 28% 12%, 54% 0, 100% 80%, 94% 100%)", top: "16%", h: "84%", labelX: "27%", facet: "150deg",
    devices: [["Смартфон", 40], ["Ноутбук", 22], ["ТВ", 6]] },
  { id: "doc", label: "Документы", gb: 49, pct: 20, from: C.foldBlue, to: C.foldCyan, icon: Icon.doc,
    flex: 1.5, clip: "polygon(0 78%, 40% 6%, 100% 0, 74% 100%, 28% 96%)", top: "0%", h: "94%", labelX: "28%", facet: "100deg",
    devices: [["Ноутбук", 38], ["Облако", 9], ["Смартфон", 2]] },
  { id: "music", label: "Музыка", gb: 24, pct: 10, from: C.foldCyan, to: C.foldMint, icon: Icon.music,
    flex: 1.2, clip: "polygon(6% 100%, 30% 6%, 100% 0, 82% 96%)", top: "6%", h: "90%", labelX: "30%", facet: "108deg",
    devices: [["Смартфон", 14], ["Ноутбук", 7], ["Часы", 3]] },
  { id: "other", label: "Другое", gb: 10, pct: 5, from: C.foldMint, to: C.foldGreen, icon: Icon.archive,
    flex: 1.1, clip: "polygon(0 96%, 14% 0, 100% 12%, 94% 88%)", top: "12%", h: "80%", labelX: "26%", facet: "128deg",
    devices: [["Ноутбук", 6], ["Облако", 4]] },
];

// Папки. parent — id родительской папки (null — лежит в корне).
const FOLDERS = [
  { id: "photo", name: "Фото", parent: null },
  { id: "camera", name: "Камера", parent: "photo" },
  { id: "screens", name: "Скриншоты", parent: "photo" },
  { id: "video", name: "Видео", parent: null },
  { id: "docs", name: "Документы", parent: null },
  { id: "study", name: "Учёба", parent: "docs" },
  { id: "music", name: "Музыка", parent: null },
  { id: "other", name: "Разное", parent: null },
];

// Файлы. days — сколько дней назад (0 — сегодня), time — время,
// mb — размер в мегабайтах. Даты считаются от сегодняшнего дня,
// поэтому демо не "устаревает".
const DEMO_FILES = [
  { id: 1, name: "IMG_4291.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 0, time: "08:43", mb: 5.5 },
  { id: 2, name: "IMG_4290.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 0, time: "08:42", mb: 4.3 },
  { id: 3, name: "IMG_4289.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 0, time: "08:42", mb: 5.6 },
  { id: 4, name: "IMG_4287.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 0, time: "08:41", mb: 4.6 },
  { id: 5, name: "IMG_4270.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 2, time: "18:05", mb: 6.1 },
  { id: 6, name: "IMG_4244.jpg", cat: "photo", folder: "camera", device: "Смартфон", days: 5, time: "12:30", mb: 3.9 },
  { id: 7, name: "Снимок экрана 14-22.png", cat: "photo", folder: "screens", device: "Ноутбук", days: 1, time: "14:22", mb: 1.2 },
  { id: 8, name: "Снимок экрана 09-05.png", cat: "photo", folder: "screens", device: "Смартфон", days: 3, time: "09:05", mb: 0.8 },
  { id: 9, name: "Отпуск_море.mp4", cat: "video", folder: "video", device: "Смартфон", days: 1, time: "20:14", mb: 1240 },
  { id: 10, name: "Запись_экрана.mov", cat: "video", folder: "video", device: "Ноутбук", days: 2, time: "11:40", mb: 312 },
  { id: 11, name: "День рождения.mp4", cat: "video", folder: "video", device: "Смартфон", days: 6, time: "19:02", mb: 864 },
  { id: 12, name: "Отчёт_за_сентябрь.pdf", cat: "doc", folder: "docs", device: "Ноутбук", days: 0, time: "10:15", mb: 2.4 },
  { id: 13, name: "Договор_аренды.pdf", cat: "doc", folder: "docs", device: "Ноутбук", days: 4, time: "16:48", mb: 0.9 },
  { id: 14, name: "Бюджет_2026.xlsx", cat: "doc", folder: "docs", device: "Ноутбук", days: 1, time: "09:30", mb: 0.4 },
  { id: 15, name: "Диплом_черновик.docx", cat: "doc", folder: "study", device: "Ноутбук", days: 0, time: "07:58", mb: 3.1 },
  { id: 16, name: "Презентация_защиты.pptx", cat: "doc", folder: "study", device: "Ноутбук", days: 2, time: "22:10", mb: 18.4 },
  { id: 17, name: "Список_литературы.docx", cat: "doc", folder: "study", device: "Ноутбук", days: 7, time: "15:00", mb: 0.1 },
  { id: 18, name: "Утренний плейлист.mp3", cat: "music", folder: "music", device: "Смартфон", days: 3, time: "07:20", mb: 8.2 },
  { id: 19, name: "Запись_голоса_012.m4a", cat: "music", folder: "music", device: "Часы", days: 0, time: "09:12", mb: 1.6 },
  { id: 20, name: "Лекция_аудио.mp3", cat: "music", folder: "music", device: "Ноутбук", days: 5, time: "13:00", mb: 46 },
  { id: 21, name: "Архив_проекта.zip", cat: "other", folder: "other", device: "Ноутбук", days: 1, time: "17:44", mb: 156 },
  { id: 22, name: "Резервная копия часов.bak", cat: "other", folder: "other", device: "Часы", days: 8, time: "03:00", mb: 22 },
];

/* ---------- ЗАГРУЖЕННЫЕ ФАЙЛЫ (localStorage) ----------
   Под FILES_KEY лежат только сведения, без содержимого файлов
   (оно не влезет в браузерное хранилище):
   added   — файлы, которые пользователь добавил сам
             { id, name, cat, folder, device, mb, addedAt };
   removed — id удалённых демо-файлов;
   renamed — новые имена { id: "имя" };
   folders — папки, созданные пользователем { id, name, parent }. */
const FILES_KEY = "nexa-files";

function loadFileStore(key = FILES_KEY) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
  return {
    added: raw?.added || [], removed: raw?.removed || [],
    renamed: raw?.renamed || {}, folders: raw?.folders || [],
  };
}

// Категория по типу файла: картинка → "Фото", видео, звук, документы, остальное
const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "csv", "md", "pages", "key", "numbers"];
function catFromFile(file) {
  const type = file.type || "";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "music";
  if (DOC_EXT.includes(ext) || type === "application/pdf" || type.startsWith("text/")) return "doc";
  return "other";
}

// Размер в МБ с разумной точностью: 0.004 (4 КБ), 5.5, 1240
const toMb = (bytes) => (bytes >= 1e6 ? Math.round(bytes / 1e5) / 10 : Math.max(0.001, Math.round(bytes / 1000) / 1000));

// У загруженного файла есть точное время (addedAt), а список
// работает с "days" и "time", как у демо-файлов — пересчитываем
function withWhen(f) {
  const d = new Date(f.addedAt);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return {
    ...f,
    days: Math.max(0, Math.round((start(new Date()) - start(d)) / 86400000)),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

// С какого устройства добавлен файл: сенсорный экран — смартфон, иначе ноутбук
const uploadDevice = () =>
  (window.matchMedia?.("(pointer: coarse)").matches ? "Смартфон" : "Ноутбук");

// Название папки для подписей; null — корень "Хранилище"
const folderName = (folders, id) => (id ? folders.find((f) => f.id === id)?.name || "Хранилище" : "Хранилище");

const SETTINGS_INDEX = [
  { title: "Пользователь", subtitle: "user@example.com", keywords: ["профиль", "аккаунт", "почта"] },
  { title: "Тема оформления", subtitle: "Светлая или тёмная", keywords: ["тема", "оформление", "светлая", "тёмная"] },
  { title: "Уведомления о событиях", subtitle: "Календарь, встречи, напоминания", keywords: ["уведомления", "события", "календарь"] },
  { title: "Сообщения и комментарии", subtitle: "Упоминания, ответы, новые сообщения", keywords: ["сообщения", "комментарии"] },
  { title: "Рекомендации и новости", subtitle: "Полезные советы и обновления", keywords: ["рекомендации", "новости"] },
  { title: "Выйти из аккаунта", subtitle: "Завершить сессию на всех устройствах", keywords: ["выход", "logout", "выйти"] },
  { title: "О системе", subtitle: `NEXA ${VERSION}`, keywords: ["версия", "о системе", "nexa"] },
];

/* ---------- Мелкие помощники для файлов ---------- */

// Склонение: plural(5, ["файл", "файла", "файлов"]) → "файлов"
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

// Размер файла в байтах: настоящий (size), у демо-файлов — из выдуманных мегабайт
const fileBytes = (f) => (typeof f.size === "number" ? f.size : Math.round((f.mb || 0) * 1e6));
// Размер по-русски: «812 Б», «400 КБ», «5,5 МБ», «1,2 ГБ» (см. formatBytes)
function formatSize(mb) {
  return formatBytes(Math.round(mb * 1e6));
}

// Дата: "Сегодня 08:42", "Вчера 20:14" или "3 окт."
function formatWhen(f) {
  if (f.days === 0) return `Сегодня ${f.time}`;
  if (f.days === 1) return `Вчера ${f.time}`;
  const d = new Date(Date.now() - f.days * 86400000);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Сортировка "сначала новые"
function sortByRecent(list) {
  const key = (f) => {
    const [h, m] = f.time.split(":").map(Number);
    return f.days * 1440 - (h * 60 + m);
  };
  return [...list].sort((a, b) => key(a) - key(b));
}

const catOf = (f) => MEDIA_CATS.find((c) => c.id === f.cat);
const fileMeta = (f) => `${catOf(f).label} · ${formatWhen(f)} · ${formatBytes(fileBytes(f))}`;

// Сброс стандартного вида кнопки: убираем рамку, фон и системный шрифт,
// чтобы кнопка выглядела как обычный блок, но нажималась и с клавиатуры
const btnReset = {
  background: "none", border: "none", padding: 0, margin: 0,
  font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer",
};

/* Заливка складки: основной градиент + тёмная грань с резким краем.
   Резкий край (две точки на одном проценте) и даёт ощущение сгиба стекла. */
const foldFill = (c) =>
  `linear-gradient(${c.facet}, transparent 56%, color-mix(in srgb, ${C.foldDeep} 45%, transparent) 56%), ` +
  `linear-gradient(135deg, ${c.from}, ${c.to})`;

/* Миниатюра файла: цветная плашка по категории + иконка.
   У фото угол градиента зависит от id, поэтому карточки не одинаковые. */
// Чьи файлы сейчас на экране: id аккаунта или "guest". Ставит NexaApp при каждой
// отрисовке — миниатюры по нему находят содержимое (облако или этот браузер)
let FILE_SCOPE = "guest";
// Оттенок градиента по id (id бывает числом у демо и строкой-uuid у настоящих файлов)
const idHue = (id) => [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

// У настоящей картинки (загруженной пользователем) — сама картинка из хранилища,
// и после перезагрузки, и на другом устройстве. У остальных — цветная плашка с иконкой
function FileThumb({ file, w = 52, h = 34, iconSize = 16, radius = 6, fit = "cover" }) {
  const cat = catOf(file);
  const plain = file.cat === "doc" || file.cat === "other";
  const url = useFileUrl(file, FILE_SCOPE, !!file.uploaded && file.cat === "photo");
  if (url) {
    return (
      <div style={{ width: w, height: h, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: C.chip }}>
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, flexShrink: 0, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: plain ? C.chip : `linear-gradient(${idHue(file.id)}deg, ${cat.from}, ${cat.to})`,
    }}>
      {/* Складка: тёмная треугольная грань поверх цвета */}
      {!plain && <div style={{
        position: "absolute", inset: 0,
        clipPath: "polygon(55% 0, 100% 0, 100% 100%)",
        background: `color-mix(in srgb, ${C.foldDeep} 30%, transparent)`,
      }} />}
      <div style={{ position: "relative", display: "flex" }}>
        {cat.icon({ c: plain ? C.muted : C.onFold, s: iconSize })}
      </div>
    </div>
  );
}

// Миниатюра папки
function FolderThumb() {
  return (
    <div style={{ width: 52, height: 34, borderRadius: 6, flexShrink: 0, background: C.chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {Icon.folder({ c: C.muted, s: 18 })}
    </div>
  );
}

/* Общая раскладка "Медиа" и "Файлов": слева контент, справа фирменная
   складка, как в макете. На узком экране складка прячется (см. .nx-media-art). */
// hideArt — плавно спрятать складку (например, когда справа открыт прогноз)
function MediaLayout({ children, hideArt }) {
  return (
    <div className="ng-screen" style={{ padding: "28px 40px 40px", textAlign: "left" }}>
      <div className="nx-media-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>{children}</div>
        <div className="nx-media-art" aria-hidden={hideArt || undefined} style={{
          position: "sticky", top: 120, display: "flex", justifyContent: "flex-end", paddingTop: 60, marginRight: -40,
          opacity: hideArt ? 0 : 1, transition: "opacity 240ms ease",
        }}>
          <FoldHero size={440} />
        </div>
      </div>
    </div>
  );
}

// Заголовок экрана: крупный и лёгкий, как в макете.
// На телефоне подзаголовок прячется, а заголовок встаёт в одну строку
// с иконками поиска и профиля (см. .nx-page-title в мобильных стилях)
function MediaTitle({ title, subtitle }) {
  return (
    <>
      <div className="ng-display nx-page-title" style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1 }}>{title}</div>
      <div className="nx-page-sub" style={{ fontSize: 15, color: C.muted, margin: "10px 0 30px" }}>{subtitle}</div>
    </>
  );
}

/* Хранилище по макету: одна лента из пяти стеклянных складок, которые
   наезжают друг на друга. Рисуем одной svg-картинкой (растягивается по
   ширине карточки), подписи — поверх, в тех же процентах. Картинка и подписи
   растягиваются вместе с карточкой, поэтому подпись не съезжает с формы.
   pts — углы складки в координатах 1000×150, label — где подпись (x%, y%),
   from / to — цвета градиента, edge — светлая грань у правого края */
const STORAGE_FOLDS = {
  photo: { pts: "0,140 118,20 362,4 244,128",          label: [13, 36],  from: C.foldDeep, to: C.foldBlue, edge: C.foldCyan },
  video: { pts: "188,148 425,26 558,132 420,144",       label: [37, 56], from: C.foldDeep, to: C.foldBlue, edge: C.foldBlue },
  doc:   { pts: "470,48 716,2 676,134 560,130",         label: [56, 34], from: C.foldBlue, to: C.foldCyan, edge: C.foldCyan },
  music: { pts: "600,150 742,30 880,12 800,142",        label: [72, 38], from: C.foldCyan, to: C.foldMint, edge: C.foldMint },
  other: { pts: "806,138 848,26 1000,44 990,138",       label: [88, 40], from: C.foldMint, to: C.foldGreen, edge: C.foldMint },
};

// Вся лента: складки-кнопки (нажатие — подробности категории) и подписи
function StorageFolds({ cats, selected, onSelect }) {
  return (
    <div className="ng-storage-folds" style={{ position: "relative", flex: 1, height: 132, minWidth: 0 }}>
      <svg viewBox="0 0 1000 150" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <defs>
          {cats.map((c) => {
            const f = STORAGE_FOLDS[c.id];
            return (
              // Градиент снизу-слева (глубокий) к верху-справа (светлый край) — как стекло
              <linearGradient key={c.id} id={`nx-sf-${c.id}`} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" style={{ stopColor: f.from, stopOpacity: 0.95 }} />
                <stop offset="0.62" style={{ stopColor: f.to, stopOpacity: 0.9 }} />
                <stop offset="1" style={{ stopColor: f.edge, stopOpacity: 1 }} />
              </linearGradient>
            );
          })}
        </defs>
        {cats.map((c) => {
          const f = STORAGE_FOLDS[c.id];
          const dimmed = selected !== null && selected !== c.id;
          return (
            <g key={c.id} className="nx-seg-btn nx-sf" role="button" tabIndex={0} aria-pressed={selected === c.id}
              aria-label={`${c.label}: ${formatBytes(c.bytes)}`}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }}
              style={{ cursor: "pointer", opacity: dimmed ? 0.35 : 1, transition: "opacity 200ms ease, filter 160ms ease" }}>
              <polygon points={f.pts} fill={`url(#nx-sf-${c.id})`} />
              {/* Тонкий светлый край — граница стекла */}
              <polygon points={f.pts} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke"
                style={{ stroke: `color-mix(in srgb, ${C.onFold} 22%, transparent)` }} />
            </g>
          );
        })}
      </svg>
      {/* Подписи поверх складок; нажатие проходит сквозь них на складку */}
      {cats.map((c) => {
        const f = STORAGE_FOLDS[c.id];
        const dimmed = selected !== null && selected !== c.id;
        return (
          <div key={c.id} className="nx-seg-label" aria-hidden="true" style={{
            position: "absolute", left: `${f.label[0]}%`, top: `${f.label[1]}%`, pointerEvents: "none",
            color: C.onFold, lineHeight: 1.2, whiteSpace: "nowrap",
            opacity: dimmed ? 0.45 : 1, transition: "opacity 200ms ease",
          }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 12.5 }}>{c.label}</span>
            <span style={{ display: "block", fontSize: 12 }}>{formatBytes(c.bytes)}</span>
            {/* Пустая категория — без «0%» */}
            {c.bytes > 0 && <span style={{ display: "block", fontSize: 11.5, opacity: 0.75 }}>{c.pct}%</span>}
          </div>
        );
      })}
    </div>
  );
}


// ЭКРАН "МЕДИА И ФАЙЛЫ" — диаграмма хранилища + категории + недавние файлы
// files — общий список файлов из App, onOpenFile открывает окно просмотра,
// onOpenCategory переводит на экран "Файлы" с фильтром по категории
// (null — без фильтра).
// onTransfer(файл, карточка, кнопка) — открыть меню «Передать на…»
// uid — вошедший (null — гость).
// Хранилище — только настоящие файлы: у аккаунта — сколько занято в облаке
// (считает база, nexa_storage_used) из лимита CLOUD_QUOTA_BYTES; у гостя —
// сколько реально лежит в этом браузере (IndexedDB), лимита у NEXA нет.
// Демо-файлы без содержимого в объём не входят
function ScreenMedia({ files, uid = null, onOpenFile, onOpenCategory, onTransfer }) {
  // Какой сегмент хранилища выбран (id категории или null)
  const [selected, setSelected] = useState(null);
  const real = files.filter((f) => f.uploaded);
  const sig = real.map((f) => `${f.id}:${f.size ?? f.mb}`).join(",");
  // Сколько занято: { used — байты | null, sizes — Map id → байты у гостя, ready }
  const [store, setStore] = useState({ used: null, sizes: null, ready: false });
  useEffect(() => {
    let off = false;
    (async () => {
      if (uid) {
        const used = await cloudBytes();
        // База не ответила (нет связи, не запущена миграция) — сумма размеров
        // загруженных файлов: это размеры самого содержимого, записанные при загрузке
        if (!off) setStore({ used: used ?? real.reduce((n, f) => n + fileBytes(f), 0), sizes: null, ready: true });
      } else {
        const sizes = await localBytes("guest", real.map((f) => f.id));
        if (!off) setStore({ used: sizes ? [...sizes.values()].reduce((n, b) => n + b, 0) : null, sizes, ready: true });
      }
    })();
    return () => { off = true; };
  }, [uid, sig]);
  // Размер файла для разбивки: у гостя — только то, что правда лежит в браузере
  const sizeOf = (f) => (uid ? fileBytes(f) : store.sizes?.get(String(f.id)) || 0);
  const bytesOf = (id) => real.filter((f) => !id || f.cat === id).reduce((n, f) => n + sizeOf(f), 0);
  const total = bytesOf(null);
  const cats = MEDIA_CATS.map((c) => {
    const bytes = bytesOf(c.id);
    const byDevice = {};
    real.filter((f) => f.cat === c.id).forEach((f) => { const n = f.device || "Это устройство"; byDevice[n] = (byDevice[n] || 0) + sizeOf(f); });
    return {
      ...c, bytes,
      pct: total > 0 ? Math.round((bytes / total) * 100) : 0,
      devices: Object.entries(byDevice).filter(([, b]) => b > 0),
    };
  });
  const sel = cats.find((c) => c.id === selected);
  const quota = uid ? CLOUD_QUOTA_BYTES : null;
  // «12,4 МБ из 2 ГБ» / «12,4 МБ в этом браузере» / «Нет данных»
  const usedLabel = !store.ready ? "Считаем…"
    : store.used == null ? "Нет данных"
    : quota ? `${formatBytes(store.used)} из ${formatBytes(quota)}` : `${formatBytes(store.used)} в этом браузере`;
  const usedPct = quota && store.used != null ? Math.min(100, (store.used / quota) * 100) : null;
  // Пояснение под объёмом
  const storeNote = uid
    ? "Облачное хранилище аккаунта"
    : store.ready && store.used == null
      ? "Браузер не дал доступ к хранилищу — объём неизвестен"
      : "Файлы гостя живут только в этом браузере, общий объём задаёт сам браузер";
  const usedBar = (wide) => usedPct != null && (
    <span className={wide ? "nx-sys-bar nx-sys-bar-wide" : "nx-sys-bar"} role="meter" aria-label="Занято в хранилище" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)}>
      <span style={{ width: `${Math.max(usedPct, store.used > 0 ? 1 : 0)}%`, background: usedPct > 90 ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
    </span>
  );
  const countOf = (id) => files.filter((f) => f.cat === id).length;
  const recent = sortByRecent(files).slice(0, 4);

  return (
    <MediaLayout>
      <MediaTitle title="Медиа и файлы" subtitle="Ваши фотографии, видео, документы и всё, что важно" />

      {/* Только на телефоне: заголовок хранилища над карточкой, как в макете */}
      <div className="nx-only-mobile nx-storage-head" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="ng-display" style={{ fontSize: 22, fontWeight: 400 }}>Хранилище</div>
        <div style={{ fontSize: 13, color: C.muted, textAlign: "right" }}>{usedLabel}</div>
      </div>
      {/* Телефон: полоска заполнения и пояснение — под заголовком */}
      <div className="nx-only-mobile" style={{ flexDirection: "column", margin: "-4px 0 14px" }}>
        {usedBar(true)}
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 6, lineHeight: 1.4 }}>{storeNote}</div>
      </div>

      <div className="nx-storage-box" style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "18px 20px", marginBottom: 34 }}>
        <div className="ng-storage-card" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div className="nx-storage-label" style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-start", width: 150 }}>
            {Icon.drive({ c: C.text, s: 24 })}
            {/* Колонка узкая: полоска и пояснение — в её ширину, на складки не заходят */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>Хранилище</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{usedLabel}</div>
              {usedBar(true)}
              <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 6, lineHeight: 1.4 }}>{storeNote}</div>
            </div>
          </div>
          {/* Собираем диаграмму из массива MEDIA_CATS — чтобы поменять пропорции
              или форму складки, меняй объект в этом массиве */}
          {/* Повторное нажатие на складку снимает выделение */}
          <StorageFolds cats={cats} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />
        </div>

        {/* Подробности по выбранной складке. key={sel.id} нужен,
            чтобы при смене категории блок появлялся заново с анимацией */}
        {sel ? (
          <div key={sel.id} className="nx-pop nx-storage-detail" style={{
            borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16,
            display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start",
          }}>
            <div style={{ minWidth: 140 }}>
              <div className="ng-display" style={{ fontSize: 26, fontWeight: 400 }}>{formatBytes(sel.bytes)}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sel.label}{sel.bytes > 0 ? ` · ${sel.pct}% занятого места` : " · пока пусто"}</div>
              <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>
                {countOf(sel.id)} {plural(countOf(sel.id), ["файл", "файла", "файлов"])} в списке
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Где хранится</div>
              {/* Ничего не занято — не рисуем пустые полоски */}
              {sel.devices.length === 0 && (
                <div style={{ fontSize: 12.5, color: C.mutedSoft, lineHeight: 1.5 }}>Здесь пока ничего нет. Добавьте файлы в «Файлах» — покажем, на каком устройстве они лежат.</div>
              )}
              {sel.devices.map(([name, bytes]) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 12.5 }}>
                  <div style={{ width: 76, flexShrink: 0 }}>{name}</div>
                  <div style={{ flex: 1, height: 6, background: C.chip, overflow: "hidden" }}>
                    {/* Полоска "вырастает" слева направо — показывает долю устройства */}
                    <div className="nx-bar" style={{
                      width: `${(bytes / sel.bytes) * 100}%`, height: "100%",
                      background: `linear-gradient(90deg, ${sel.from}, ${sel.to})`,
                    }} />
                  </div>
                  <div style={{ minWidth: 56, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{formatBytes(bytes)}</div>
                </div>
              ))}
            </div>
            <button type="button" className="nx-ghost-btn" onClick={() => onOpenCategory(sel.id)} style={{
              ...btnReset, fontSize: 12.5, border: `1px solid ${C.borderStrong}`, borderRadius: 6,
              padding: "8px 14px", alignSelf: "flex-end", whiteSpace: "nowrap",
            }}>
              Открыть в файлах →
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>
            Нажмите на складку, чтобы увидеть, где лежат файлы
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div className="ng-display" style={{ fontSize: 24, fontWeight: 400 }}>Категории</div>
        <button type="button" className="nx-link-btn" onClick={() => onOpenCategory(null)} style={{
          ...btnReset, fontSize: 12, color: C.mutedSoft, borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 2,
        }}>
          Все файлы →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 34 }} className="ng-cat-grid nx-stagger">
        {MEDIA_CATS.slice(0, 4).map((cat) => {
          const n = countOf(cat.id);
          return (
            <button type="button" key={cat.id} className="nx-cat-card" onClick={() => onOpenCategory(cat.id)} style={{
              ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 10,
              background: `linear-gradient(160deg, ${C.panel2}, ${C.bg})`,
              padding: "12px 14px", height: 122, boxSizing: "border-box",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              transition: "border-color 160ms ease",
            }}>
              {/* Маленькая складка той же формы и цвета, что и на диаграмме */}
              <div className="nx-cat-fold" style={{
                width: "62%", height: 52,
                clipPath: cat.clip, background: foldFill(cat),
              }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
                <div>
                  <div style={{ fontSize: 13.5 }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>{n} {plural(n, ["файл", "файла", "файлов"])}</div>
                </div>
                {Icon.chevron({ s: 14 })}
              </div>
            </button>
          );
        })}
      </div>

      <div className="ng-display" style={{ fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Недавние файлы</div>
      {/* Файлов ещё нет (новый аккаунт) — подсказка вместо пустой ленты */}
      {recent.length === 0 && (
        <div style={{ border: `1px dashed ${C.borderStrong}`, borderRadius: 10, padding: "18px 20px", fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
          Пока пусто. Добавьте файлы в разделе{" "}
          <button type="button" className="nx-link-btn" onClick={() => onOpenCategory(null)} style={{ ...btnReset, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 }}>
            «Файлы»
          </button>{" "}— они появятся здесь.
        </div>
      )}
      {/* Лента: вертикальная линия слева и кружок у каждого файла */}
      <div className="nx-stagger" style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 6, top: 24, bottom: 24, width: 1, background: C.borderStrong }} />
        {recent.map((f) => (
          <div key={f.id} style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: -26, top: "50%", marginTop: -7, width: 14, height: 14, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${C.text}`, background: C.bg }} />
            {/* Карточка файла: нажатие открывает файл, справа — «Передать на…» */}
            <div data-transfer-card style={{
              display: "flex", alignItems: "center", gap: 8, paddingRight: 10,
              border: `1px solid ${C.borderStrong}`, borderRadius: 8,
            }}>
              <button type="button" className="nx-row-btn" onClick={() => onOpenFile(f)} style={{
                ...btnReset, flex: 1, minWidth: 0, boxSizing: "border-box", borderRadius: 8, padding: "7px 8px",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <FileThumb file={f} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileMeta(f)}</div>
                </div>
              </button>
              {onTransfer && <TransferBtn onClick={(e) => onTransfer(f, e.currentTarget.closest("[data-transfer-card]"), e.currentTarget)} />}
            </div>
          </div>
        ))}
      </div>
    </MediaLayout>
  );
}

// Один чипс в строке пути (хлебных крошек) — скошенная цветная плашка.
// active — текущая папка: она ярче остальных и не нажимается.
function Crumb({ children, active, onClick }) {
  return (
    <button type="button" disabled={active} onClick={onClick} className={active ? undefined : "nx-crumb"} style={{
      ...btnReset,
      cursor: active ? "default" : "pointer",
      height: 30, padding: "0 20px 0 18px", fontSize: 12.5, whiteSpace: "nowrap", flexShrink: 0,
      // Скос задаём в пикселях, чтобы угол был одинаковым у коротких и длинных чипсов
      clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
      background: active
        ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`
        : `linear-gradient(90deg, ${C.foldDeep}, color-mix(in srgb, ${C.foldBlue} 70%, ${C.foldDeep}))`,
      color: C.onFold,
      display: "flex", alignItems: "center", gap: 7,
    }}>
      {children}
    </button>
  );
}

// ЭКРАН "ФАЙЛЫ" — путь навигации (хлебные крошки), поиск, папки и файлы.
// filter — id категории, если пришли сюда из "Медиа" (тогда показываем
// плоский список файлов этой категории из всех папок).
// device — устройство, если пришли из окна устройства (тогда показываем
// плоский список файлов с этого устройства).
// folders — все папки (демо + созданные), uploads — идущие загрузки,
// onAddFiles(список, папка) — добавить файлы, onCreateFolder(имя, родитель) — новая папка
// onTransfer(файл, карточка, кнопка) — открыть меню «Передать на…»
// onUploadAction(id, "cancel" | "retry" | "dismiss") — управление строкой загрузки
function ScreenFiles({ files, filter, device, onClearFilter, onOpenFile, initialFolder, folders = FOLDERS, uploads = [], onAddFiles, onCreateFolder, onTransfer, onUploadAction }) {
  // Текущая папка (null — корень хранилища)
  const [folder, setFolder] = useState(initialFolder || null);
  const fileInput = useRef(null);
  // Новая папка: newFolder — введённое имя (null — поле закрыто)
  const [newFolder, setNewFolder] = useState(null);
  // Тащат ли сейчас файлы над окном (для подсветки зоны)
  const [dragging, setDragging] = useState(false);
  // Строка поиска: ищет только в текущей папке (или категории)
  const [query, setQuery] = useState("");
  // Положение прокрутки строки пути: для полоски под чипсами и затухания справа
  const [scroll, setScroll] = useState({ left: 0, ratio: 1, more: false });
  const crumbsRef = useRef(null);

  const cat = MEDIA_CATS.find((c) => c.id === filter);
  const folderById = (id) => folders.find((f) => f.id === id);

  const measure = () => {
    const el = crumbsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScroll({
      left: max > 0 ? el.scrollLeft / el.scrollWidth : 0,
      ratio: el.clientWidth / el.scrollWidth,
      more: el.scrollLeft < max - 2,
    });
  };

  // При смене папки: прокручиваем путь к текущей папке и чистим поиск
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    measure();
    setQuery("");
  }, [folder, filter, device]);

  // Ширина окна поменялась — пересчитываем полоску прокрутки
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Путь от корня до текущей папки: идём от папки вверх по parent
  const path = [];
  for (let id = folder; id; id = folderById(id).parent) path.unshift(folderById(id));

  const q = query.trim().toLowerCase();
  const match = (name) => !q || name.toLowerCase().includes(q);
  // flat — включён отбор (по категории или устройству): показываем
  // все подходящие файлы из всех папок одним списком
  const flat = Boolean(cat || device);
  const onDevice = (f) => f.device === device.name || f.device === device.alias;
  const subfolders = flat ? [] : folders.filter((f) => f.parent === folder && match(f.name));
  const list = sortByRecent((flat
    ? files.filter((f) => (!cat || f.cat === cat.id) && (!device || onDevice(f)))
    : files.filter((f) => f.folder === folder)).filter((f) => match(f.name)));
  // Сколько всего лежит внутри папки (подпапки + файлы)
  const countIn = (id) => folders.filter((f) => f.parent === id).length + files.filter((f) => f.folder === id).length;

  // Куда попадут новые файлы: в открытую папку. Если включён отбор
  // по категории или устройству — в корень "Хранилище"
  const target = flat ? null : folder;
  const targetName = folderName(folders, target);
  const upload = (list) => { if (list && list.length) onAddFiles?.(list, target); };

  // Проверка имени новой папки: не пустое и не повторяет соседнюю папку
  const nfName = (newFolder || "").trim();
  const nfError = !nfName ? null
    : folders.some((f) => f.parent === folder && f.name.toLowerCase() === nfName.toLowerCase()) ? "Такая папка уже есть" : null;
  const saveFolder = () => {
    if (!nfName || nfError) return;
    onCreateFolder?.(nfName, folder);
    setNewFolder(null);
  };
  // Сменили папку — поле новой папки закрываем
  useEffect(() => { setNewFolder(null); }, [folder, filter, device]);

  /* Перетаскивание файлов прямо в окно (на компьютере).
     Слушаем всё окно: пока над ним держат файлы — показываем рамку,
     отпустили — загружаем. depth нужен, потому что dragenter/dragleave
     приходят от каждого вложенного элемента */
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); }; // без этого браузер откроет файл сам
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      uploadRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const heading = device ? `${device.name} · все папки` : cat ? `${cat.label} · все папки` : folder ? folderById(folder).name : "Хранилище";

  const rowStyle = {
    ...btnReset, width: "100%", boxSizing: "border-box",
    borderBottom: `1px solid color-mix(in srgb, ${C.borderStrong} 55%, transparent)`, padding: "12px 4px",
    display: "flex", alignItems: "center", gap: 14,
  };

  return (
    <MediaLayout>
      <MediaTitle title="Файлы" subtitle="Ваши файлы, документы и медиа — всегда под рукой" />

      <div className="nx-files-top" style={{ display: "flex", alignItems: "flex-start", gap: 28, marginBottom: 26 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Путь навигации. Если включён фильтр — вместо пути
              показываем фильтр и кнопку, чтобы его сбросить.
              Справа путь плавно затухает, если дальше есть ещё чипсы */}
          <div
            ref={crumbsRef} onScroll={measure} className="ng-crumbs nx-no-scrollbar"
            style={{
              display: "flex", gap: 6, overflowX: "auto",
              maskImage: scroll.more ? "linear-gradient(90deg, black 82%, transparent)" : "none",
              WebkitMaskImage: scroll.more ? "linear-gradient(90deg, black 82%, transparent)" : "none",
            }}
          >
            {flat ? (
              <>
                <Crumb onClick={onClearFilter}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Все папки</Crumb>
                <Crumb active>
                  {(device || cat).icon({ c: C.onFold, s: 15 })} {device ? device.name : cat.label} · {list.length} {plural(list.length, ["файл", "файла", "файлов"])}
                </Crumb>
              </>
            ) : (
              <>
                {folder && (
                  <Crumb onClick={() => setFolder(folderById(folder).parent)}>
                    {Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад
                  </Crumb>
                )}
                <Crumb active={!folder} onClick={() => setFolder(null)}>{Icon.drive({ c: C.onFold, s: 15 })} Хранилище</Crumb>
                {path.map((p, i) => (
                  <Crumb key={p.id} active={i === path.length - 1} onClick={() => setFolder(p.id)}>
                    {Icon.folder({ c: C.onFold, s: 15 })} {p.name}
                  </Crumb>
                ))}
              </>
            )}
          </div>
          {/* Полоска под путём: показывает, какая часть пути сейчас видна */}
          <div style={{ position: "relative", height: 2, background: C.border, marginTop: 14 }}>
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${scroll.left * 100}%`, width: `${scroll.ratio * 100}%`,
              background: C.muted,
            }} />
          </div>
        </div>

        <label className="nx-files-search" style={{
          width: 200, flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 6, marginTop: 4,
        }}>
          {Icon.search({ c: C.muted, s: 16 })}
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={device ? "Поиск по устройству…" : cat ? "Поиск в категории…" : "Поиск в этой папке…"}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12.5, padding: 0 }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" style={{ ...btnReset, display: "flex" }}>
              {Icon.close({ c: C.muted, s: 14 })}
            </button>
          )}
        </label>
      </div>

      {/* Заголовок папки, справа — "Новая папка" и "Добавить файл".
          На телефоне кнопки встают под заголовок на всю ширину */}
      <div className="nx-files-head" style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
        paddingBottom: 10, borderBottom: `1px solid ${C.borderStrong}`,
      }}>
        <div style={{
          fontFamily: fontDisplay, fontSize: 18, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.04em",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {heading}
        </div>
        <div className="nx-files-actions" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {!flat && (
            <button type="button" className="nx-ghost-btn" onClick={() => setNewFolder("")} disabled={newFolder !== null} style={{
              ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
              border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 16px", fontSize: 13,
            }}>
              {Icon.folder({ c: C.text, s: 15 })} Новая папка
            </button>
          )}
          <button type="button" className="nx-primary" onClick={() => fileInput.current?.click()} style={{
            ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
            border: "1px solid transparent", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 500,
            color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
          }}>
            {Icon.plus({ c: C.onFold, s: 15 })} Добавить файл
          </button>
          {/* Обычный выбор файлов системы. value сбрасываем,
              чтобы тот же файл можно было выбрать ещё раз */}
          <input
            ref={fileInput} type="file" multiple hidden
            onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
          />
        </div>
      </div>

      {/* Загрузки: имя, настоящий процент, отмена; ошибка — «Повторить» и «Убрать» */}
      {uploads.map((u) => {
        const failed = u.status === "error";
        const small = { ...btnReset, fontSize: 12.5, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap" };
        return (
          <div key={u.id} role={failed ? "alert" : "status"} className="nx-pop" style={{ padding: "12px 4px 10px", borderBottom: `1px solid color-mix(in srgb, ${C.borderStrong} 55%, transparent)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              {failed ? Icon.alert({ c: C.red, s: 16 }) : <Spinner />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {failed ? `Не загрузилось: «${u.name}»` : `Загружаем «${u.name}»`}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {!failed && <span style={{ fontSize: 12, color: C.mutedSoft, fontFamily: fontDisplay }}>{Math.round(u.progress * 100)}%</span>}
                {failed && <button type="button" className="nx-ghost-btn" onClick={() => onUploadAction?.(u.id, "retry")} style={small}>Повторить</button>}
                <button type="button" className="nx-icon-btn" onClick={() => onUploadAction?.(u.id, failed ? "dismiss" : "cancel")}
                  aria-label={failed ? "Убрать" : "Отменить загрузку"} title={failed ? "Убрать" : "Отменить"} style={{
                    ...btnReset, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {Icon.close({ c: C.muted, s: 13 })}
                </button>
              </span>
            </div>
            {failed
              ? <div style={{ fontSize: 12, color: C.red, marginTop: 6, paddingLeft: 26 }}>{u.error}</div>
              : (
                <div style={{ height: 2, background: C.border, marginTop: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${Math.max(2, u.progress * 100)}%`, transition: "width 200ms linear",
                    background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
                  }} />
                </div>
              )}
          </div>
        );
      })}

      {/* Рамка "отпустите файлы": видна, пока над окном держат файлы */}
      {dragging && (
        <div className="nx-drop-zone" aria-hidden="true" style={{
          position: "fixed", inset: 12, zIndex: 250, pointerEvents: "none",
          border: `1px dashed ${C.mint}`, borderRadius: 4,
          background: `color-mix(in srgb, ${C.bg} 82%, transparent)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <div style={{
            width: 56, height: 56, border: `1px solid ${C.mint}`, borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.up({ c: C.mint, s: 26 })}
          </div>
          <div className="ng-display" style={{ fontSize: 22 }}>Отпустите, чтобы добавить</div>
          <div style={{ fontSize: 13, color: C.muted }}>Файлы попадут в папку «{targetName}»</div>
        </div>
      )}

      {/* Список прокручивается внутри себя, как в макете.
          key меняется при смене папки — список появляется заново с анимацией */}
      <div key={device ? `dev-${device.id}` : cat ? `cat-${cat.id}` : `f-${folder}`} className="nx-stagger nx-scroll nx-files-list" style={{
        maxHeight: "calc(100vh - 400px)", minHeight: 260, overflowY: "auto", paddingRight: 14,
      }}>
        {/* Новая папка: строка с полем имени. Enter — создать, Esc — отменить */}
        {newFolder !== null && (
          <form className="nx-pop" onSubmit={(e) => { e.preventDefault(); saveFolder(); }} style={{ ...rowStyle, cursor: "default" }}>
            <FolderThumb />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                autoFocus
                className="nx-input"
                value={newFolder}
                maxLength={40}
                placeholder="Название папки"
                aria-label="Название новой папки"
                aria-invalid={!!nfError}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setNewFolder(null); }}
                style={{
                  width: "100%", boxSizing: "border-box", background: "transparent", color: C.text,
                  fontFamily: "inherit", fontSize: 16, padding: "6px 10px", borderRadius: 4, outline: "none",
                  border: `1px solid ${nfError ? C.red : C.borderStrong}`,
                }}
              />
              {nfError && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{nfError}</div>}
            </div>
            <button type="submit" className="nx-icon-btn" aria-label="Создать папку" disabled={!nfName || !!nfError} style={{
              ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {Icon.check({ c: C.green, s: 18 })}
            </button>
            <button type="button" className="nx-icon-btn" aria-label="Отменить" onClick={() => setNewFolder(null)} style={{
              ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {Icon.close({ c: C.muted, s: 16 })}
            </button>
          </form>
        )}
        {subfolders.map((sf) => {
          const n = countIn(sf.id);
          return (
            <button type="button" key={sf.id} className="nx-row-btn" onClick={() => setFolder(sf.id)} style={rowStyle}>
              <FolderThumb />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{sf.name}</div>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>
                  Папка · {n} {plural(n, ["объект", "объекта", "объектов"])}
                </div>
              </div>
              {Icon.chevron({ s: 18 })}
            </button>
          );
        })}
        {/* Строка файла: сама строка открывает файл, справа — «Передать на…».
            data-transfer-card — отсюда полетит карточка при передаче */}
        {list.map((f) => (
          <div key={f.id} data-transfer-card style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: rowStyle.borderBottom }}>
            <button type="button" className="nx-row-btn" onClick={() => onOpenFile(f)} style={{ ...rowStyle, borderBottom: "none", flex: 1, minWidth: 0 }}>
              <FileThumb file={f} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fileMeta(f)}{flat ? ` · ${folderName(folders, f.folder)}` : ""}
                </div>
              </div>
            </button>
            {onTransfer && <TransferBtn onClick={(e) => onTransfer(f, e.currentTarget.closest("[data-transfer-card]"), e.currentTarget)} />}
          </div>
        ))}
        {subfolders.length === 0 && list.length === 0 && (
          q ? (
            <EmptyState
              title="Ничего не нашлось"
              text={`По запросу «${query.trim()}» здесь ничего нет. Попробуйте другое слово.`}
              action={
                <button type="button" className="nx-ghost-btn" onClick={() => setQuery("")} style={{
                  ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "8px 14px", fontSize: 13,
                }}>
                  Очистить поиск
                </button>
              }
            />
          ) : (
            <EmptyState
              title={device ? `На устройстве «${device.name}» пока нет файлов` : "Здесь пока пусто"}
              text={device ? "Файлы появятся, когда устройство что-нибудь сохранит." : "Нажмите «Добавить файл» или перетащите файлы в окно."}
            />
          )
        )}
      </div>
    </MediaLayout>
  );
}

/* ═══ СОСТОЯНИЯ: загрузка, успех, ошибка, пусто ═══════════════
   Общие детали, чтобы эти состояния везде выглядели одинаково.
   hover / pressed / focus / disabled задаются классами в блоке <style>
   (см. «ЕДИНАЯ СИСТЕМА СОСТОЯНИЙ»). */

// Индикатор загрузки: контур квадрата, по которому бежит мятная грань
function Spinner({ s = 14, c = C.mint }) {
  return (
    <svg className="nx-spin" viewBox="0 0 16 16" width={s} height={s} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" />
      <path d="M2 8V3a1 1 0 0 1 1-1h5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Кнопка с состоянием.
   state: "idle" (обычная) | "loading" (идёт действие) | "success" | "error".
   variant: "primary" — главная, с градиентом; "ghost" — с рамкой.
   Подписи для каждого состояния передаются отдельно; если не переданы,
   остаётся основная подпись (children). */
function StateButton({ state = "idle", variant = "ghost", icon, children, labels = {}, onClick, disabled, style }) {
  const primary = variant === "primary" && (state === "idle" || state === "loading");
  const base = {
    ...btnReset, borderRadius: 6, padding: "10px 14px", fontSize: 13,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    border: `1px solid ${C.borderStrong}`,
  };
  // Цвет рамки и текста по состоянию
  const look =
    state === "success" ? { borderColor: C.green, color: C.green } :
    state === "error"   ? { borderColor: C.red, color: C.red } :
    primary ? {
      border: "1px solid transparent", color: C.onFold, fontWeight: 500,
      background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
    } : {};
  const mark =
    state === "loading" ? <Spinner c={primary ? C.onFold : C.mint} /> :
    state === "success" ? Icon.check({ c: C.green, s: 16 }) :
    state === "error"   ? Icon.alert({ c: C.red, s: 16 }) :
    icon;
  return (
    <button
      type="button"
      // nx-shake: при переходе в ошибку кнопка один раз вздрагивает
      className={`${primary ? "nx-primary" : "nx-ghost-btn"}${state === "error" ? " nx-shake" : ""}`}
      onClick={onClick}
      disabled={disabled || state === "loading"}
      aria-busy={state === "loading"}
      style={{ ...base, ...look, ...style }}
    >
      {mark}
      <span>{labels[state] || children}</span>
    </button>
  );
}

// Короткое сообщение о результате внутри панели: ошибка или успех
function StateNote({ kind = "error", children }) {
  const color = kind === "error" ? C.red : C.green;
  return (
    <div role={kind === "error" ? "alert" : "status"} className="nx-pop" style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
      border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, borderRadius: 4,
      background: `color-mix(in srgb, ${color} 8%, transparent)`, fontSize: 12.5, lineHeight: 1.45,
    }}>
      <span style={{ display: "flex", marginTop: 1 }}>
        {(kind === "error" ? Icon.alert : Icon.check)({ c: color, s: 16 })}
      </span>
      <div>{children}</div>
    </div>
  );
}

// Пустое состояние: контурная складка, заголовок, подсказка и, если нужно, кнопка
// Заготовка списка устройств, пока они грузятся: серые плашки без анимации
function DevicesSkeleton() {
  const bar = (w, h = 10) => <div style={{ width: w, height: h, borderRadius: 4, background: C.panel2 }} />;
  return (
    <div role="status" aria-label="Загружаем устройства" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.panel2, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {bar(i ? "46%" : "60%", 11)}
            {bar(i ? "28%" : "34%", 9)}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12.5, color: C.mutedSoft, textAlign: "center" }}>Загружаем ваши устройства…</div>
    </div>
  );
}

function EmptyState({ title, text, action, compact }) {
  return (
    <div className="nx-pop" style={{
      padding: compact ? "26px 18px" : "48px 16px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    }}>
      {/* Пустая складка: только контур и линия сгиба */}
      <svg viewBox="0 0 64 44" width={compact ? 52 : 64} height={compact ? 36 : 44} fill="none" aria-hidden="true" style={{ marginBottom: 6 }}>
        <path d="M10 4 62 1 54 41 2 43Z" stroke={C.borderStrong} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M62 1 34 22 54 41" stroke={C.borderStrong} strokeWidth="1.4" strokeDasharray="3 3" strokeLinejoin="round" />
      </svg>
      <div style={{ fontSize: 14.5 }}>{title}</div>
      {text && <div style={{ fontSize: 12.5, color: C.mutedSoft, maxWidth: 320, lineHeight: 1.5 }}>{text}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* ОКНО ПРОСМОТРА ФАЙЛА — открывается поверх любого экрана.
   Всё работает в демо-режиме: "отправка" и "ссылка" только показывают
   сообщение, а удаление убирает файл из списка до перезагрузки страницы.
   Закрывается крестиком, клавишей Esc или кликом по затемнению. */
// devices — устройства с текущим статусом: отправить можно только на те, что в сети
// folders — все папки (вместе с созданными), onRename(name) — новое имя,
// onSent(устройство) — файл отправлен
function FileViewer({ file, folders = FOLDERS, devices = DEVICES, onClose, onDelete, onRename, onSent, onToast }) {
  // Переименование: editing — открыто ли поле, draft — что сейчас введено
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const draftName = draft.trim();
  const draftError = !draftName ? "Введите имя" : /[\\/]/.test(draftName) ? "Без символов / и \\" : null;
  const startRename = () => { setDraft(file.name); setEditing(true); };
  const saveRename = () => {
    if (draftError) return;
    if (draftName !== file.name) {
      onRename(draftName);
      onToast?.({ title: "Файл переименован", text: draftName });
    }
    setEditing(false);
  };
  const [sendOpen, setSendOpen] = useState(false);   // открыт ли выбор устройства
  // Состояние отправки: на какое устройство и как идёт ("loading" / "success" / "error")
  const [send, setSend] = useState(null);
  const sendTimer = useRef(null);
  useEffect(() => () => clearTimeout(sendTimer.current), []);
  const deviceByName = (n) => devices.find((d) => d.name === n || d.alias === n);
  const sendTo = (target) => {
    setSend({ to: target, state: "loading" });
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      const dev = deviceByName(target);
      if (dev && !dev.online) {
        setSend({ to: target, state: "error" });
        return;
      }
      setSend({ to: target, state: "success" });
      // onSent — общее «дошло»: уведомление и отметка у устройства на Главной
      if (onSent && dev) onSent(dev);
      else onToast?.({ title: "Файл отправлен", text: `${file.name} → ${target}` });
    }, 900);
  };
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const cat = catOf(file);

  // Esc закрывает окно; пока окно открыто, страница под ним не скроллится
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

   const share = () => {
    const link = `nexa://file/${file.id}`;
    try { navigator.clipboard?.writeText(link); } catch {}
    onToast?.({ title: "Ссылка скопирована", text: link });
    setSendOpen(false);
  };

  const info = [
    ["Тип", cat.label],
    ["Размер", formatBytes(fileBytes(file))],
    ["Изменён", formatWhen(file)],
    ["Устройство", file.device],
    ["Папка", folderName(folders, file.folder)],
  ];

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 999,
    padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
  };

  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {/* stopPropagation — клик внутри окна не должен его закрывать */}
      <div
        role="dialog" aria-modal="true" aria-label={file.name}
        className="nx-viewer-panel nx-pop nx-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 10,
          boxSizing: "border-box", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              // Поле с именем: Enter — сохранить, Esc — отменить (окно при этом не закрывается)
              <form onSubmit={(e) => { e.preventDefault(); saveRename(); }} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  autoFocus
                  className="nx-input"
                  value={draft}
                  maxLength={80}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }}
                  onFocus={(e) => {
                    // Выделяем имя без расширения — чтобы его было удобно заменить
                    const dot = e.target.value.lastIndexOf(".");
                    e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                  }}
                  aria-label="Имя файла"
                  aria-invalid={!!draftError}
                  style={{
                    flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: "inherit",
                    fontSize: 16, padding: "6px 10px", borderRadius: 4, outline: "none",
                    border: `1px solid ${draftError ? C.red : C.borderStrong}`,
                  }}
                />
                <button type="submit" className="nx-icon-btn" aria-label="Сохранить имя" disabled={!!draftError} style={{
                  ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.check({ c: C.green, s: 18 })}
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <button type="button" className="nx-icon-btn" onClick={startRename} aria-label="Переименовать" title="Переименовать" style={{
                  ...btnReset, width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.edit({ c: C.muted, s: 15 })}
                </button>
              </div>
            )}
            <div style={{ fontSize: 12, color: draftError && editing ? C.red : C.mutedSoft, marginTop: 2 }}>
              {editing ? draftError || "Enter — сохранить, Esc — отменить" : fileMeta(file)}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Превью: та же миниатюра, только крупно */}
        <div style={{ padding: "0 18px" }}>
          <div className="nx-viewer-preview" style={{ display: "flex" }}>
            <FileThumb file={file} w="100%" h={220} iconSize={44} radius={8} fit="contain" />
          </div>
          {/* Содержимое: открыть и скачать (только у загруженных; у демо-файлов его нет) */}
          {file.uploaded
            ? <FileContentActions file={file} onToast={onToast} />
            : <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Демо-файл: содержимого нет, только пример в списке</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", padding: "18px 18px 4px", fontSize: 13 }}>
          {info.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ color: C.mutedSoft }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          {confirmDel ? (
            // Подтверждение удаления заменяет ряд кнопок
            <div className="nx-pop" style={{ border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, borderRadius: 4, padding: 14 }}>
              <div style={{ fontSize: 13.5, marginBottom: 4 }}>Удалить файл?</div>
              <div style={{ fontSize: 12, color: C.mutedSoft, marginBottom: 12 }}>
                «{file.name}» пропадёт из всех папок и списков.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => { onDelete(file); onToast?.({ title: "Файл удалён", text: file.name }); }} style={{ ...ghostBtn, color: C.red, borderColor: C.red }}>
                  {Icon.trash({ c: C.red, s: 16 })} Удалить
                </button>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghostBtn}>Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <div className="nx-viewer-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="nx-primary" onClick={() => { setSendOpen(!sendOpen); setSend(null); }} aria-expanded={sendOpen} style={{
                  ...ghostBtn, border: "1px solid transparent", color: C.onFold, fontWeight: 500,
                  background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
                }}>
                  {Icon.send({ c: C.onFold, s: 16 })} Отправить на устройство
                </button>
                <button type="button" className="nx-ghost-btn" onClick={share} style={ghostBtn}>
                  {Icon.share({ c: C.text, s: 16 })} Поделиться
                </button>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(true)} style={{ ...ghostBtn, color: C.red }}>
                  {Icon.trash({ c: C.red, s: 16 })} Удалить
                </button>
              </div>

              {/* Выбор устройства: само устройство, где лежит файл, не предлагаем */}
              {sendOpen && (
                <div className="nx-pop" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Куда отправить?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {devices.filter((x) => x.name !== file.device && x.alias !== file.device).map((x) => x.name).map((d) => {
                      const dev = deviceByName(d);
                      return (
                        <StateButton
                          key={d}
                          state={send && send.to === d ? send.state : "idle"}
                          labels={{ loading: "Отправка…", success: "Отправлено", error: "Не в сети" }}
                          // Отключённые устройства видно сразу: серая точка рядом с именем
                          icon={<Dot color={dev && !dev.online ? C.mutedSoft : C.green} />}
                          disabled={send?.state === "loading"}
                          onClick={() => sendTo(d)}
                          style={{ padding: "8px 14px" }}
                        >
                          {d}
                        </StateButton>
                      );
                    })}
                  </div>
                  {send?.state === "error" && (
                    <div style={{ marginTop: 10 }}>
                      <StateNote kind="error">
                        {send.to} сейчас не в сети, файл не отправлен. Подключите устройство
                        на главном экране и попробуйте ещё раз.
                      </StateNote>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* «Открыть» и «Скачать» содержимое файла. Ссылка — из этого браузера (IndexedDB)
   или временная подписанная ссылка облака. В приложении — всегда ссылка облака:
   её откроет системный браузер */
function FileContentActions({ file, onToast }) {
  const [state, setState] = useState(null); // null | "open" | "download" — что сейчас готовим
  const cloudOnly = isNative && FILE_SCOPE !== "guest";
  const go = async (download) => {
    setState(download ? "download" : "open");
    try {
      const url = cloudOnly || download && FILE_SCOPE !== "guest" && file.path
        ? await fileUrl({ ...file, id: cloudOnly ? `cloud-${file.id}` : file.id }, FILE_SCOPE, { download })
        : await fileUrl(file, FILE_SCOPE);
      if (!url) {
        onToast?.({
          title: "Содержимое недоступно",
          text: navigator.onLine === false ? "Нет связи — файл ещё не скачан на это устройство" : "Файл добавили до появления хранилища — содержимое не сохранилось",
        });
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      if (download) a.download = safeFileName(file.name); else a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
    } finally { setState(null); }
  };
  const btn = { ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      <button type="button" className="nx-ghost-btn" onClick={() => go(false)} disabled={!!state} style={btn}>
        {state === "open" ? <Spinner s={13} /> : Icon.shareUp({ c: C.text, s: 15 })} Открыть
      </button>
      <button type="button" className="nx-ghost-btn" onClick={() => go(true)} disabled={!!state} style={btn}>
        {state === "download" ? <Spinner s={13} /> : Icon.download({ c: C.text, s: 15 })} Скачать
      </button>
      <span style={{ alignSelf: "center", fontSize: 12, color: C.mutedSoft }}>
        {FILE_SCOPE === "guest" ? "Хранится только в этом браузере" : "Хранится в облаке аккаунта"}
      </span>
    </div>
  );
}

/* ═══ ПЕРЕДАЧА ФАЙЛА НА УСТРОЙСТВО ═══════════════════════════
   1) У файла кнопка «Передать на…» → 2) меню с устройствами →
   3) карточка файла сгибается по диагонали (как складка) и улетает
   к иконке выбранного устройства → 4) уведомление и отметка
   «Получен файл» у устройства на Главной. */
const FLIGHT_MS = 600;          // длительность полёта карточки
const RECEIVED_MS = 20000;      // сколько держится отметка «Получен файл»

// Отметка «Получен файл» у устройства: мятная рамка, появляется мягко
function ReceivedTag({ name, compact }) {
  return (
    <span className="nx-pop" title={name ? `Получен файл: ${name}` : undefined} style={{
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
      fontSize: compact ? 10.5 : 11, color: C.mint, lineHeight: 1.2,
      border: `1px solid color-mix(in srgb, ${C.mint} 55%, transparent)`, borderRadius: 4,
      padding: compact ? "1px 5px" : "2px 6px",
    }}>
      {Icon.check({ c: C.mint, s: 11 })} Получен файл
    </span>
  );
}

// Кнопка «Передать на…» в строке файла. На телефоне — только значок
function TransferBtn({ onClick }) {
  return (
    <button type="button" className="nx-ghost-btn nx-transfer-btn" onClick={onClick} aria-label="Передать на…" title="Передать на…" style={{
      ...btnReset, display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
      border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "6px 12px", fontSize: 12,
    }}>
      {Icon.send({ c: C.text, s: 14 })}
      <span className="nx-transfer-label">Передать на…</span>
    </button>
  );
}

/* Меню выбора устройства. anchor — где кнопка (координаты на экране),
   sendingId — на какое устройство сейчас летит файл (меню ждёт конца полёта).
   onPick(устройство, элемент-иконка) — куда лететь карточке */
function TransferMenu({ anchor, file, devices, sendingId, onPick, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busy = sendingId != null;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  // Закрываем по клику мимо, Esc, прокрутке и смене размера окна
  // (пока карточка летит — не закрываем, чтобы не потерять цель)
  useEffect(() => {
    const close = () => { if (!busyRef.current) closeRef.current(); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const key = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", down);
    window.addEventListener("touchstart", down);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    // Фокус в меню — дальше Tab ведёт по устройствам (рамку не рисуем, пока не нажмут Tab)
    ref.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  // Своё устройство (где файл уже лежит) не предлагаем
  const list = devices.filter((d) => d.name !== file.device && d.alias !== file.device);
  // Позиция: под кнопкой, по правому краю; не помещается снизу — над кнопкой
  const W = 256;
  const H = 58 + list.length * 50;
  const left = Math.min(Math.max(12, anchor.right - W), window.innerWidth - W - 12);
  const below = anchor.bottom + 6;
  const top = below + H > window.innerHeight - 12 ? Math.max(12, anchor.top - 6 - H) : below;

  return (
    <div ref={ref} role="menu" aria-label="Передать на устройство" tabIndex={-1} className="nx-pop" style={{
      position: "fixed", left, top, width: W, zIndex: 320, boxSizing: "border-box", textAlign: "left", outline: "none",
      background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: 6,
    }}>
      <div style={{ padding: "6px 8px 8px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: C.muted }}>Передать на…</div>
        <div style={{ fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.mutedSoft, padding: "10px 8px" }}>Других устройств пока нет</div>
      )}
      {list.map((d) => {
        const sending = sendingId === d.id;
        return (
          <button key={d.id} type="button" role="menuitem" className="nx-row-btn"
            disabled={!d.online || (busy && !sending)}
            onClick={(e) => !busy && onPick(d, e.currentTarget.querySelector("[data-target]"))}
            style={{ ...btnReset, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 4, boxSizing: "border-box" }}>
            {/* Сюда прилетит карточка файла */}
            <span data-target style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: 4, boxSizing: "border-box",
              border: `1px solid ${sending ? C.mint : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "border-color 200ms ease",
            }}>
              {d.icon({ c: C.text, s: 17 })}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ display: "block", fontSize: 11, color: sending ? C.mint : C.mutedSoft, marginTop: 1 }}>
                {sending ? "Отправка…" : d.online ? "В сети" : "Не в сети"}
              </span>
            </span>
            {sending ? <Spinner /> : <Dot color={d.online ? C.green : C.red} />}
          </button>
        );
      })}
    </div>
  );
}

/* Полёт карточки: копия карточки файла поверх всего.
   0–35% — карточка сгибается по диагонали: нижний левый угол (flap,
   цветная обратная сторона) перелистывается к правому верхнему,
   и остаётся треугольник-складка. 35–100% — складка уменьшается
   и летит к иконке устройства. Двигаем только transform/opacity/clip-path */
const RECT4 = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
const TRI4 = "polygon(0 0, 100% 0, 100% 100%, 0 0)";
function FoldFlight({ file, from: row, to, onDone }) {
  const box = useRef(null), base = useRef(null), flap = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Летит компактная карточка (миниатюра + имя) с левого края строки:
  // у широкой строки сгиб по диагонали выглядел бы тонкой полосой
  const from = { left: row.left, top: row.top, height: row.height, width: Math.min(row.width, 260) };
  useLayoutEffect(() => {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    // Во сколько раз уменьшить: до размера иконки устройства
    const k = Math.max(0.06, Math.min(0.5, to.width / from.width));
    const opts = { duration: FLIGHT_MS, easing: "cubic-bezier(0.55, 0, 0.25, 1)", fill: "forwards" };
    const flight = box.current.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: "translate(0, 0) scale(0.92)", opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-10deg)`, opacity: 0.35 },
    ], opts);
    base.current.animate([{ clipPath: RECT4 }, { clipPath: TRI4, offset: 0.35 }, { clipPath: TRI4 }], opts);
    flap.current.animate([
      { clipPath: "polygon(0 0, 0 100%, 100% 100%)", opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%)", opacity: 1, offset: 0.35 },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%)", opacity: 1 },
    ], opts);
    flight.onfinish = () => doneRef.current();
    return () => flight.cancel();
  }, []);
  return (
    <div ref={box} aria-hidden="true" style={{
      position: "fixed", left: from.left, top: from.top, width: from.width, height: from.height,
      zIndex: 400, pointerEvents: "none", willChange: "transform, opacity",
    }}>
      {/* Лицевая сторона: та же карточка файла */}
      <div ref={base} style={{
        position: "absolute", inset: 0, boxSizing: "border-box", background: C.panel,
        border: `1px solid ${C.borderStrong}`, borderRadius: 4,
        display: "flex", alignItems: "center", gap: 14, padding: "0 12px", overflow: "hidden",
      }}>
        <FileThumb file={file} />
        <span style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</span>
      </div>
      {/* Загнутый угол: обратная сторона в цветах бренда и тёмная грань сгиба */}
      <div ref={flap} style={{
        position: "absolute", inset: 0, opacity: 0,
        background: `linear-gradient(225deg, color-mix(in srgb, ${C.foldDeep} 55%, transparent), transparent 60%), linear-gradient(135deg, ${C.foldBlue}, ${C.foldCyan})`,
      }} />
    </div>
  );
}

/* ═══ ПРЕВЬЮ ИНТЕРФЕЙСА NEXA НА УСТРОЙСТВЕ ═══════════════════
   Корпус рисуем схематично: тонкая линия, без бликов. Экран внутри —
   уменьшенный интерфейс NEXA, собранный обычной разметкой.
   Каждое превью нарисовано в своём "родном" размере (PREVIEW_SIZE),
   а на сцене масштабируется, чтобы влезть и на телефоне. */
const PREVIEW_SIZE = {
  phone:  { w: 190, h: 370 },
  laptop: { w: 470, h: 290 },
  tablet: { w: 420, h: 290 },
  watch:  { w: 210, h: 340 },
  tv:     { w: 490, h: 310 },
  buds:   { w: 520, h: 250 },
};
// Какой тип у устройства: у добавленных он записан, у исходных — это id
const typeOf = (d) => d.type || d.id;

// Текущее время для превью — обновляем раз в 15 секунд (это не анимация)
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}
const hhmm = (d) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
// Ближайшее дело из расписания (или null, если на сегодня всё)
function nextEvent(now) {
  const m = now.getHours() * 60 + now.getMinutes();
  return TODAY.schedule.find((it) => {
    const [h, mm] = it.time.split(":").map(Number);
    return h * 60 + mm >= m;
  }) || null;
}

// Мини-строка устройства для уменьшенной главной
function MiniDeviceRow({ d, size = 8 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ display: "flex", width: 14, height: 14, border: `1px solid ${C.border}`, borderRadius: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {d.icon({ c: C.text, s: 9 })}
      </span>
      <span style={{ fontSize: size, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: d.online ? C.green : C.red, flexShrink: 0 }} />
    </div>
  );
}

// Маленькая складка-акцент (та же форма, что у героя на главной)
function MiniFold({ w = 70, h = 54 }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", width: w, height: h }}>
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(18% 8%, 100% 0, 78% 100%, 0 82%)", background: `linear-gradient(135deg, ${C.foldDeep}, ${C.foldBlue})` }} />
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(100% 0, 78% 100%, 46% 46%)", background: `linear-gradient(135deg, ${C.foldCyan}, ${C.foldMint})`, opacity: 0.9 }} />
    </div>
  );
}

// Уменьшенная главная NEXA — для смартфона и ноутбука
function MiniHome({ devices, wide, now }) {
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: wide ? "14px 16px" : "10px 10px", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
      {/* Строка состояния: время и логотип-буквы */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: C.muted }}>
        <span style={{ letterSpacing: "0.3em" }}>NEXA</span><span>{hhmm(now)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 6, letterSpacing: "0.18em", color: C.muted }}>ВАША ЭКОСИСТЕМА</div>
          <div style={{ fontFamily: fontDisplay, fontSize: wide ? 14 : 12, fontWeight: 600, lineHeight: 1.15, marginTop: 4 }}>
            Все устройства в одной системе
          </div>
        </div>
        {!wide && <MiniFold w={44} h={34} />}
      </div>
      <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, padding: "5px 7px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
            <span>Устройства</span>
            <span style={{ color: C.muted }}>{devices.filter((d) => d.online).length} в сети</span>
          </div>
          {devices.slice(0, wide ? 5 : 7).map((d) => <MiniDeviceRow key={d.id} d={d} size={wide ? 8 : 7.5} />)}
        </div>
        {wide && (
          <div style={{ width: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
            <MiniFold w={96} h={76} />
            <div style={{
              width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 3, padding: "6px 7px", fontSize: 7.5,
              background: `linear-gradient(90deg, color-mix(in srgb, ${C.blueDark} 30%, transparent), color-mix(in srgb, ${C.mintDark} 30%, transparent))`,
            }}>
              AI-ассистент
              <div style={{ color: C.muted, fontSize: 6.5, marginTop: 2 }}>Чем могу помочь?</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Уменьшенный менеджер файлов — для планшета
function MiniFiles({ files, folders }) {
  const roots = folders.filter((f) => f.parent === null).slice(0, 3);
  const recent = sortByRecent(files).slice(0, 4);
  const chip = (active) => ({
    fontSize: 7.5, padding: "3px 10px 3px 9px", color: C.onFold,
    clipPath: "polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)",
    background: active ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` : C.foldDeep,
  });
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: "12px 14px", textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: fontDisplay, fontSize: 15 }}>Файлы</div>
      <div style={{ display: "flex", gap: 4 }}>
        <span style={chip(false)}>Хранилище</span>
        <span style={chip(true)}>Недавние</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.borderStrong}` }}>
        {roots.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 24, height: 16, borderRadius: 2, background: C.chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.folder({ c: C.muted, s: 10 })}
            </span>
            <span style={{ fontSize: 8.5 }}>{f.name}</span>
          </div>
        ))}
        {recent.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", borderBottom: `1px solid ${C.border}` }}>
            <FileThumb file={f} w={24} h={16} iconSize={9} radius={2} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ fontSize: 6.5, color: C.mutedSoft }}>{fileMeta(f)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Часы: круглый циферблат — время, ближайшее дело, статус связи.
// По краю — кольцо заряда (синий → мятный)
function WatchFace({ online, now, battery }) {
  const ev = nextEvent(now);
  const pct = battery ?? 100;
  const R = 46, LEN = 2 * Math.PI * R; // кольцо в координатах 0..100
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center" }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="nx-watch-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: C.blue }} />
            <stop offset="1" style={{ stopColor: C.mint }} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="1.6" style={{ stroke: C.border }} />
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="1.6" strokeLinecap="round"
          stroke="url(#nx-watch-ring)" strokeDasharray={`${(LEN * pct) / 100} ${LEN}`} transform="rotate(-90 50 50)" />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: online ? C.green : C.red }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: online ? C.green : C.red }} />
        {online ? "На связи" : "Нет связи"}
      </div>
      <div style={{ fontFamily: fontDisplay, fontSize: 42, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em" }}>{hhmm(now)}</div>
      <div style={{ fontSize: 8.5, color: C.muted }}>{now.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</div>
      {/* Тонкая черта-грань, как сгиб складки */}
      <div style={{ width: 74, height: 1, background: `linear-gradient(90deg, transparent, ${C.mint}, transparent)`, margin: "3px 0" }} />
      <div style={{ fontSize: 8.5, maxWidth: 118, lineHeight: 1.3 }}>
        {ev ? <><span style={{ color: C.mint }}>{ev.time}</span> · {ev.title}</> : "На сегодня дел нет"}
      </div>
    </div>
  );
}

// ТВ: «Продолжить просмотр» и полка медиа
function TvScreen({ files }) {
  const videos = files.filter((f) => f.cat === "video");
  const main = videos[0];
  const shelf = files.filter((f) => f.cat === "video" || f.cat === "photo").filter((f) => f.id !== main?.id).slice(0, 4);
  // Видео ещё нет — на экране ТВ просто подсказка
  if (!main) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16, boxSizing: "border-box" }}>
      {Icon.video({ c: C.muted, s: 22 })}
      <div style={{ fontSize: 11 }}>Здесь появятся ваши видео</div>
      <div style={{ fontSize: 8.5, color: C.muted }}>Загрузите их в «Файлы»</div>
    </div>
  );
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: "16px 18px", textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 8, letterSpacing: "0.18em", color: C.muted }}>ПРОДОЛЖИТЬ ПРОСМОТР</div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ position: "relative", width: 230, flexShrink: 0 }}>
          <FileThumb file={main} w={230} h={124} iconSize={22} radius={4} />
          {/* Прогресс просмотра — тонкая полоска внизу кадра */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: `color-mix(in srgb, ${C.onFold} 25%, transparent)` }}>
            <div style={{ width: "42%", height: "100%", background: C.mint }} />
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main.name.replace(/\.[^.]+$/, "")}</div>
          <div style={{ fontSize: 8.5, color: C.muted, marginTop: 3 }}>Осталось 12 мин</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "5px 12px", borderRadius: 999,
            fontSize: 8.5, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
          }}>
            {Icon.play({ c: C.onFold, s: 10 })} Продолжить
          </div>
        </div>
      </div>
      <div style={{ fontSize: 8, letterSpacing: "0.18em", color: C.muted, marginTop: 2 }}>МЕДИА</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {shelf.map((f) => <FileThumb key={f.id} file={f} w="100%" h={50} iconSize={13} radius={3} />)}
      </div>
    </div>
  );
}

// Наушники: схема наушников + мини-плеер, заряд и режим (переключается)
const BUDS_MODES = [["anc", "Шумоподавление"], ["clear", "Прозрачность"], ["off", "Выкл."]];
function BudsPanel({ files, battery, online }) {
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("anc");
  const tracks = files.filter((f) => f.cat === "music");
  const [ti, setTi] = useState(0);
  const track = tracks.length ? tracks[ti % tracks.length] : null;
  const b = battery ?? 80;
  const charge = [["Л", b], ["П", Math.max(5, b - 4)], ["Кейс", 54]];
  const iconBtn = { ...btnReset, width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 28, textAlign: "left" }}>
      {/* Схема: два наушника тонкой линией */}
      <svg viewBox="0 0 160 200" width={160} height={200} fill="none" stroke={C.muted} strokeWidth="1.2" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="48" cy="62" r="26" />
        <circle cx="48" cy="62" r="11" stroke={online ? C.mint : C.muted} />
        <path d="M60 85 64 160a8 8 0 0 1-16 1l-2-72" />
        <circle cx="112" cy="102" r="26" />
        <circle cx="112" cy="102" r="11" stroke={online ? C.mint : C.muted} />
        <path d="M100 125 96 186a8 8 0 0 0 16 1l2-62" />
      </svg>
      <div style={{ width: 300, border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "14px 16px", background: C.panel, boxSizing: "border-box" }}>
        {/* Мини-плеер */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {track ? <FileThumb file={track} w={38} h={38} iconSize={15} radius={4} /> : <div style={{ width: 38, height: 38, background: C.chip, borderRadius: 4 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track ? track.name.replace(/\.[^.]+$/, "") : "Нет треков"}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{playing ? "Играет" : "На паузе"} · Музыка</div>
          </div>
          <button type="button" className="nx-icon-btn" aria-label="Предыдущий трек" onClick={() => setTi((i) => i + tracks.length - 1)} style={iconBtn}>
            {Icon.next({ c: C.text, s: 14, flip: true })}
          </button>
          <button type="button" className="nx-icon-btn" aria-label={playing ? "Пауза" : "Играть"} onClick={() => setPlaying(!playing)} style={{ ...iconBtn, border: `1px solid ${C.borderStrong}` }}>
            {(playing ? Icon.pause : Icon.play)({ c: C.text, s: 14 })}
          </button>
          <button type="button" className="nx-icon-btn" aria-label="Следующий трек" onClick={() => setTi((i) => i + 1)} style={iconBtn}>
            {Icon.next({ c: C.text, s: 14 })}
          </button>
        </div>
        <div style={{ height: 2, background: C.border, marginTop: 10 }}>
          <div style={{ width: playing ? "38%" : "37%", height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
        </div>

        {/* Заряд: левый, правый, кейс */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
          {charge.map(([label, v]) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: C.muted }}><span>{label}</span><span>{v}%</span></div>
              <div style={{ height: 3, background: C.border, marginTop: 4 }}>
                <div style={{ width: `${v}%`, height: "100%", background: v < 20 ? C.red : C.green }} />
              </div>
            </div>
          ))}
        </div>

        {/* Режим: три кнопки-сегмента */}
        <div role="radiogroup" aria-label="Режим наушников" style={{ display: "flex", marginTop: 14, border: `1px solid ${C.borderStrong}`, borderRadius: 4, overflow: "hidden" }}>
          {BUDS_MODES.map(([id, label], i) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} style={{
              ...btnReset, flex: 1, textAlign: "center", fontSize: 9.5, padding: "6px 4px",
              borderLeft: i ? `1px solid ${C.borderStrong}` : "none",
              background: mode === id ? C.blue : "transparent", color: mode === id ? C.onFold : C.text,
              transition: "background-color 160ms ease, color 160ms ease",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Корпус + экран для нужного типа. online=false — экран тускнеет, сверху «Нет связи»
function DevicePreview({ device, devices, files, folders }) {
  const now = useClock();
  const type = typeOf(device);
  // Контур корпуса: заметнее приглушённого цвета, но тоньше текста
  const lineColor = `color-mix(in srgb, ${C.text} 48%, transparent)`;
  const line = `1px solid ${lineColor}`;
  const screen = { background: C.bg, border: `1px solid ${C.border}`, overflow: "hidden", position: "relative" };
  // Экран выключенного устройства: тусклый, с подписью поверх
  const content = (node) => (
    <>
      <div style={{ height: "100%", opacity: device.online ? 1 : 0.3, filter: device.online ? "none" : "grayscale(1)", transition: "opacity 300ms ease" }}>{node}</div>
      {!device.online && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, padding: "4px 10px", border: `1px solid ${C.red}`, color: C.red, borderRadius: 4, background: C.bg }}>Нет связи</span>
        </div>
      )}
    </>
  );

  if (type === "phone") return (
    <div style={{ width: 190, height: 370, border: line, borderRadius: 26, padding: 7, boxSizing: "border-box", background: C.panel }}>
      <div style={{ ...screen, height: "100%", borderRadius: 20 }}>{content(<MiniHome devices={devices} now={now} />)}</div>
    </div>
  );
  if (type === "laptop") return (
    <div style={{ width: 470, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 400, height: 262, border: line, borderRadius: "8px 8px 2px 2px", padding: 8, boxSizing: "border-box", background: C.panel }}>
        <div style={{ ...screen, height: "100%", borderRadius: 3 }}>{content(<MiniHome devices={devices} now={now} wide />)}</div>
      </div>
      {/* Основание: тонкая планка с выемкой под открытие */}
      <div style={{ width: 470, height: 12, border: line, borderRadius: "2px 2px 10px 10px", boxSizing: "border-box", background: C.panel, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 60, height: 4, borderBottom: line, borderLeft: line, borderRight: line, borderRadius: "0 0 4px 4px" }} />
      </div>
    </div>
  );
  if (type === "tablet") return (
    <div style={{ width: 420, height: 290, border: line, borderRadius: 18, padding: 11, boxSizing: "border-box", background: C.panel }}>
      <div style={{ ...screen, height: "100%", borderRadius: 8 }}>{content(<MiniFiles files={files} folders={folders} />)}</div>
    </div>
  );
  if (type === "watch") return (
    <div style={{ width: 210, height: 340, position: "relative" }}>
      {/* Ремешки: сужаются к концу, по краю строчка, на нижнем — дырочки.
          Заливка цветом корпуса — складка остаётся позади часов */}
      <svg viewBox="0 0 210 340" width={210} height={340} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <g strokeWidth="1" style={{ fill: C.panel, stroke: lineColor }}>
          <path d="M60 6 Q60 2 64 2 L146 2 Q150 2 150 6 L158 88 L52 88 Z" />
          <path d="M52 252 L158 252 L150 334 Q150 338 146 338 L64 338 Q60 338 60 334 Z" />
        </g>
        <g fill="none" strokeWidth="0.8" strokeDasharray="2 3" style={{ stroke: `color-mix(in srgb, ${C.text} 22%, transparent)` }}>
          <path d="M59 80 L66 8 L144 8 L151 80" />
          <path d="M59 260 L66 332 L144 332 L151 260" />
        </g>
        {[284, 300, 316].map((y) => (
          <rect key={y} x="101" y={y} width="8" height="4" rx="2" strokeWidth="0.8" style={{ fill: C.bg, stroke: lineColor }} />
        ))}
      </svg>
      {/* Корпус: круг, на ободе метки минут (каждая пятая длиннее и ярче) */}
      <div style={{ position: "absolute", left: 5, top: 70, width: 200, height: 200, borderRadius: "50%", border: line, padding: 9, boxSizing: "border-box", background: C.panel }}>
        <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: "absolute", left: -1, top: -1, width: 200, height: 200 }}>
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1="100" y1={i % 5 ? 3.5 : 2.5} x2="100" y2={i % 5 ? 6.5 : 8.5} transform={`rotate(${i * 6} 100 100)`}
              strokeWidth={i % 5 ? 0.6 : 1.1}
              style={{ stroke: `color-mix(in srgb, ${C.text} ${i % 5 ? 25 : 60}%, transparent)` }} />
          ))}
        </svg>
        <div style={{ ...screen, height: "100%", borderRadius: "50%" }}>{content(<WatchFace online={device.online} now={now} battery={device.battery} />)}</div>
        {/* Заводная головка с насечками и кнопка под ней */}
        <div style={{
          position: "absolute", right: -9, top: 80, width: 9, height: 30, border: line, borderLeft: "none", borderRadius: "0 3px 3px 0", boxSizing: "border-box",
          background: `repeating-linear-gradient(0deg, ${lineColor} 0 1px, ${C.panel} 1px 4px)`,
        }} />
        <div style={{ position: "absolute", right: -5, top: 124, width: 5, height: 16, border: line, borderLeft: "none", borderRadius: "0 2px 2px 0", boxSizing: "border-box", background: C.panel }} />
      </div>
    </div>
  );
  if (type === "tv") return (
    <div style={{ width: 490, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 490, height: 280, border: line, borderRadius: 4, padding: 6, boxSizing: "border-box", background: C.panel }}>
        <div style={{ ...screen, height: "100%", borderRadius: 2 }}>{content(<TvScreen files={files} />)}</div>
      </div>
      {/* Подставка: ножка и основание */}
      <div style={{ width: 1, height: 16, background: C.muted }} />
      <div style={{ width: 150, height: 1, background: C.muted }} />
    </div>
  );
  // Наушники: экрана нет — показываем панель управления рядом со схемой
  return (
    <div style={{ width: 520, height: 250, position: "relative" }}>
      {content(<BudsPanel files={files} battery={device.battery} online={device.online} />)}
    </div>
  );
}

/* ЭКРАН УСТРОЙСТВА — открывается по нажатию на устройство на «Главной»
   или из поиска. Сверху «Назад», в центре превью интерфейса NEXA на этом
   устройстве (на складке-конверте), ниже статус, заряд и действия.
   Всё в демо-режиме: состояние (в сети ли, переключатели) живёт в App
   и запоминается в браузере. */
const DEVICE_SETTINGS = [
  { key: "sync",  icon: Icon.refresh, title: "Синхронизация",    sub: "Файлы и уведомления на всех устройствах" },
  { key: "dnd",   icon: Icon.dnd,     title: "Не беспокоить",    sub: "Без звуков и всплывающих уведомлений" },
  { key: "saver", icon: Icon.battery, title: "Энергосбережение", sub: "Реже синхронизируется, дольше работает", battery: true },
];
const FIND_MS = 3600; // сколько "звонит" устройство при поиске

/* Складка-«конверт» в окне устройства (как в макете): скошенный
   четырёхугольник, разрезанный на 4 треугольника от центра.
   Точки — в % от размера складки. Чтобы поменять форму, меняй точки тут. */
const FOLD_TL = "17% 5%", FOLD_TR = "100% 0", FOLD_BR = "84% 93%", FOLD_BL = "0 100%", FOLD_C = "52% 49%";
const DEVICE_FOLD_SHAPE = `polygon(${FOLD_TL}, ${FOLD_TR}, ${FOLD_BR}, ${FOLD_BL})`;
// on — цвет грани, когда устройство в сети; off — серый, когда отключено.
// delay — задержка: грани меняются по очереди, получается «волна».
// tear — куда грань отлетает при отключении («разрыв» связи, как в макете):
//   x, y — сдвиг в пикселях от центра, r — небольшой поворот в градусах
const DEVICE_FOLD_FACETS = [
  { id: "top",    clip: `polygon(${FOLD_TL}, ${FOLD_TR}, ${FOLD_C})`, delay: 0,
    on: `color-mix(in srgb, ${C.foldDeep} 55%, ${C.foldBlue})`, off: `color-mix(in srgb, ${C.muted} 35%, ${C.chip})`,
    tear: { x: -2, y: -12, r: -4 } },
  { id: "right",  clip: `polygon(${FOLD_TR}, ${FOLD_BR}, ${FOLD_C})`, delay: 70,
    on: `color-mix(in srgb, ${C.foldBlue} 80%, ${C.foldDeep})`, off: `color-mix(in srgb, ${C.muted} 70%, ${C.chip})`,
    tear: { x: 14, y: -6, r: 5 } },
  { id: "bottom", clip: `polygon(${FOLD_BR}, ${FOLD_BL}, ${FOLD_C})`, delay: 140,
    on: `color-mix(in srgb, ${C.foldBlue} 45%, ${C.foldCyan})`, off: `color-mix(in srgb, ${C.muted} 85%, ${C.chip})`,
    tear: { x: 2, y: 12, r: -3 } },
  { id: "left",   clip: `polygon(${FOLD_BL}, ${FOLD_TL}, ${FOLD_C})`, delay: 210,
    on: C.foldBlue, off: `color-mix(in srgb, ${C.muted} 50%, ${C.chip})`,
    tear: { x: -14, y: 4, r: 4 } },
];
// Пружинистая кривая: грани чуть «перелетают» и встают на место —
// разрыв выглядит как щелчок, а не плавное расползание
const TEAR_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const CONNECT_MS = 1400;    // сколько длится подключение (столько же идёт полоса по складке)
const DISCONNECT_MS = 600;  // отключение быстрее
const RESULT_MS = 1600;     // сколько кнопка показывает «Подключено» / «Отключено»

// onBack — вернуться назад, onRemove — удалить устройство из списка,
// devices / files / folders — данные для превью, received — только что получен файл
// Реальное устройство (d.real): «в сети» — по Presence, «Найти» зовёт его
// по-настоящему (onFind, findState), можно переименовать (onRename)
// Карточка реального устройства на его экране: переименовать, тип, статус
// actions — быстрые действия (RealDeviceActions), рисуются внизу карточки
function RealDeviceInfo({ d, onRename, actions }) {
  const [name, setName] = useState(d.name);
  useEffect(() => setName(d.name), [d.name]);
  const clean = name.trim().slice(0, 40);
  const changed = clean && clean !== d.name;
  return (
    <div style={{ margin: "20px 0 0", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px" }}>
      <form onSubmit={(e) => { e.preventDefault(); if (changed) onRename?.(clean); }}>
        <label htmlFor="nx-real-name" style={{ fontSize: 12.5, color: C.mutedSoft }}>Название</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input id="nx-real-name" className="nx-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} style={{
            flex: 1, minWidth: 0, background: "transparent", color: C.text, fontSize: 15, fontFamily: "inherit",
            border: `1px solid ${C.borderStrong}`, borderRadius: 4, padding: "9px 12px", outline: "none",
          }} />
          <button type="submit" className="nx-ghost-btn" disabled={!changed} style={{
            ...btnReset, flexShrink: 0, padding: "8px 16px", fontSize: 13, borderRadius: 999,
            border: `1px solid ${C.borderStrong}`, color: changed ? C.text : C.mutedSoft,
          }}>
            Сохранить
          </button>
        </div>
      </form>
      <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 12, lineHeight: 1.5 }}>
        {peerLabel(d)} · подключено по коду{d.isSelf ? " · это устройство" : ""}
        <br /><span style={{ color: d.online ? C.green : C.mutedSoft }}>{d.online ? "Онлайн" : lastSeenText(d.seenAt)}</span>
      </div>
      {actions}
    </div>
  );
}

function DeviceScreen({ device: d, fileCount, devices, files, folders, received, demo = true, onBack, onSetOnline, onSetting, onOpenFiles, onRemove, onToast, onFind, findState, onRename, link, realActions }) {
  const [ringing, setRinging] = useState(false); // идёт ли сейчас поиск
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const delRef = useRef(null);
  // Вопрос "Удалить?" внизу окна — прокручиваем к нему, чтобы он был виден
  useEffect(() => {
    if (!confirmDel || !delRef.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    delRef.current.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [confirmDel]);
  // Кнопка питания: "idle" → "loading" (подключаем/отключаем) → "success" → "idle"
  const [power, setPower] = useState("idle");
  const turningOn = useRef(false); // что сейчас делаем: подключаем или отключаем
  // Номер последнего переключения: меняется — анимация складки запускается заново
  const [flip, setFlip] = useState(null);
  const foldRef = useRef(null);

  // Подключилось — складка «раскрывается» (лёгкий поворот и масштаб).
  // Запускаем анимацию прямо на элементе, не пересоздавая его, чтобы
  // не сбить плавное схождение граней. Без движения — если так в системе
  useEffect(() => {
    const el = foldRef.current;
    if (!flip || !flip.on || !el || !el.animate) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "scale(0.9) rotate(-4deg)" },
        { transform: "scale(1.04) rotate(1deg)", offset: 0.6 },
        { transform: "none" },
      ],
      { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }, [flip]);
  const used = deviceUsed(d, files, demo);

  // Таймеры подключения: при закрытии окна их нужно отменить
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Экран открылся — начинаем сверху страницы
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Esc — назад (если не открыто никакое окно поверх и не печатаем в поле)
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Нажатие на любое пустое место страницы — назад: фон, свободная часть
     сцены, поля слева и справа от экрана, низ с логотипом.
     Не уводят: кнопки, поля, переключатели, всё с data-keep (превью, полоски,
     настройки), боковое меню и нижняя панель, уведомления, тосты и окна.
     Если в этот момент выделяли текст — тоже не уводим.
     Слушаем весь документ; подключаемся чуть позже, чтобы тот же клик,
     который открыл экран, не закрыл его сразу */
  useEffect(() => {
    const KEEP = 'button, a, input, textarea, select, label, [role="switch"], [role="radio"], [data-keep], ' +
      '[role="dialog"], [role="menu"], .ng-sidebar, .ng-mobile-tabbar, .nx-notes, .nx-toast-host, .nx-viewer';
    const onDocClick = (e) => {
      if (!(e.target instanceof Element) || e.target.closest(KEEP)) return;
      if (window.getSelection?.().toString()) return;
      backRef.current();
    };
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", onDocClick); };
  }, []);

  // Превью масштабируем под ширину сцены: меряем сцену при изменении размера
  // (ResizeObserver срабатывает только когда размер правда поменялся)
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = PREVIEW_SIZE[typeOf(d)] || PREVIEW_SIZE.buds;
  // На большом экране превью можно увеличить (до 1.5), на телефоне — уменьшаем
  const scale = stageSize.w ? Math.min(1.5, (stageSize.w - 40) / size.w, (stageSize.h - 48) / size.h) : 1;

  // Сигнал звучит FIND_MS, потом кнопка "Найти" снова доступна
  useEffect(() => {
    if (!ringing) return;
    const t = setTimeout(() => setRinging(false), FIND_MS);
    return () => clearTimeout(t);
  }, [ringing]);

  const find = () => {
    setRinging(true);
    onToast?.({ title: `${d.name} подаёт сигнал`, text: "Звук слышно, даже если включён беззвучный режим" });
  };

  // Подключить / отключить: сначала «загрузка» (по складке идёт полоса),
  // потом статус меняется, складка анимированно меняет цвет, кнопка
  // на секунду показывает результат и возвращается в обычный вид
  const toggleOnline = () => {
    if (power === "loading") return;
    const on = !d.online;
    turningOn.current = on;
    setRinging(false);
    setPower("loading");
    later(() => {
      onSetOnline(on);
      setFlip({ on, n: Date.now() });
      setPower("success");
      onToast?.(on
        ? { title: `${d.name}: подключено`, text: "Устройство снова в системе NEXA" }
        : { title: `${d.name}: отключено`, text: "Синхронизация на паузе до следующего подключения" });
      later(() => setPower("idle"), RESULT_MS);
    }, on ? CONNECT_MS : DISCONNECT_MS);
  };
  const connecting = power === "loading" && turningOn.current;
  const powerLabels = turningOn.current
    ? { loading: "Подключение…", success: "Подключено" }
    : { loading: "Отключение…", success: "Отключено" };

  // Полоски заряда и памяти. Мало заряда — полоска красная.
  // У отключённого устройства полоски серые: данные на момент отключения.
  // Реальное устройство — только то, что оно само сообщило (d.sys), иначе «Нет данных»
  const sys = d.sys;
  const bars = d.real ? [
    { label: "Заряд", value: batteryText(sys), pct: sys?.battery ?? (sys?.ac ? 100 : 0), low: sys?.battery != null && sys.battery < 20 },
    {
      label: "Память",
      value: sys?.diskTotal ? `${formatBytes(sys.diskTotal - sys.diskFree)} из ${formatBytes(sys.diskTotal)}` : NO_DATA,
      pct: sys?.diskTotal ? ((sys.diskTotal - sys.diskFree) / sys.diskTotal) * 100 : 0,
    },
    { label: "Сеть", value: netText(sys), noBar: true },
  ] : [
    {
      label: "Заряд",
      value: d.battery == null ? "от сети" : `${d.battery}%`,
      pct: d.battery == null ? 100 : d.battery,
      low: d.battery != null && d.battery < 20,
    },
    { label: "Память", value: `${used} из ${d.memory} ГБ`, pct: Math.min(100, (used / d.memory) * 100) },
  ];
  // Кнопки окна устройства — «таблетки», как в макете
  const pillBtn = { borderRadius: 999, minHeight: 46, padding: "10px 16px", justifyContent: "center", whiteSpace: "nowrap" };

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 6,
    padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
  };

  return (
    <div className="ng-screen nx-device-screen" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 1080 }}>
      {/* «Назад» — такой же скошенный чипс, как путь в «Файлах» */}
      <div style={{ display: "flex" }}>
        <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      </div>

      {/* Шапка: крупное название и статус */}
      <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: "8px 16px", margin: "22px 0 22px" }}>
        <div className="ng-display nx-device-title" style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1 }}>{d.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted, paddingBottom: 6 }}>
          <Dot color={d.online ? C.green : C.red} />
          {d.real || d.online ? deviceStatus(d) : `Не в сети · был в сети ${d.lastSeen}`}
          {received && <ReceivedTag name={received.name} />}
        </div>
      </div>

      {/* Сцена: превью интерфейса на фоне складки-«конверта». Складка
          цветная, пока устройство в сети, и «разорвана», когда отключено.
          Во время поиска от устройства расходятся волны сигнала */}
      <div>
          <div ref={stageRef} className="nx-device-stage" style={{
            position: "relative", height: 440, borderRadius: 10, overflow: "hidden",
            border: `1px solid ${C.borderStrong}`,
            background: `color-mix(in srgb, ${C.text} 4%, ${C.bg})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Складка-«конверт»: четыре треугольника сходятся к центру.
                ВАЖНО: складка не пересоздаётся при переключении (нет key),
                иначе грани появились бы сразу в новом положении без перехода.
                Разрыв при отключении делают сами грани (см. tear),
                «раскрытие» при подключении запускается эффектом через foldRef */}
            <div
              ref={foldRef}
              // Складка — акцент: стоит правее центра и выглядывает из-за устройства
              // Пропорции постоянные (236×166) — складка всегда лежит горизонтально,
              // на любой ширине; стоит правее центра и выглядывает из-за устройства
              className="nx-device-fold"
              style={{ position: "absolute", width: "min(460px, 54%)", aspectRatio: "236 / 166", left: "46%", top: "50%", marginTop: "calc(min(460px, 54%) * -0.35)" }}
            >
              {DEVICE_FOLD_FACETS.map((f) => (
                <div key={f.id} className="nx-facet" style={{
                  position: "absolute", inset: 0, clipPath: f.clip,
                  background: d.online ? f.on : f.off,
                  // В сети грани сомкнуты; без сети — разлетаются от центра («разрыв»).
                  // При подключении съезжаются обратно в целую складку
                  transform: d.online ? "none" : `translate(${f.tear.x}px, ${f.tear.y}px) rotate(${f.tear.r}deg)`,
                  transformOrigin: FOLD_C, // грани отлетают от центра складки
                  // Цвет и положение меняются по очереди — получается «волна»
                  transition: `background 420ms ease ${f.delay}ms, transform 560ms ${TEAR_EASE} ${f.delay}ms`,
                }} />
              ))}
              {/* Пока идёт подключение, по складке один раз проходит мятная полоса */}
              {connecting && (
                <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: DEVICE_FOLD_SHAPE }}>
                  <div className="nx-scan" style={{
                    position: "absolute", top: -10, bottom: -10, left: "50%", width: 46, marginLeft: -23,
                    background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${C.mint} 55%, transparent), transparent)`,
                  }} />
                </div>
              )}
            </div>
            {ringing && [0, 1, 2].map((i) => (
              <span key={i} className="nx-ping" style={{ animationDelay: `${i * 400}ms` }} />
            ))}
            {/* Превью в «родном» размере, уменьшенное под сцену.
                При подключении один раз проявляется (nx-icon-on) */}
            <div
              data-keep
              key={flip && flip.on ? `pv-${flip.n}` : "pv"}
              className={flip && flip.on ? "nx-icon-on" : undefined}
              style={{ position: "relative", display: "flex", width: size.w, height: size.h, alignItems: "center", justifyContent: "center", flexShrink: 0, transform: `scale(${scale})` }}
            >
              <DevicePreview device={d} devices={devices} files={files} folders={folders} />
            </div>
          </div>
      </div>

      {/* Под превью: слева статус, заряд и главные кнопки, справа настройки.
          На телефоне — одной колонкой */}
      <div className="nx-device-info nx-stagger" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "0 40px", alignItems: "start", marginTop: 8 }}>
      <div data-keep>
        {/* Заряд и память */}
        <div style={{ padding: "20px 0 4px", display: "flex", flexDirection: "column", gap: 16 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
              <div style={{ width: 62, flexShrink: 0, color: C.mutedSoft }}>{b.label}</div>
              {/* Полоска-«таблетка»: толстая, со скруглёнными краями. У «Сети» полоски нет */}
              {b.noBar ? <div style={{ flex: 1 }} /> : (
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: `color-mix(in srgb, ${C.text} 10%, transparent)`, overflow: "hidden" }}>
                  <div className="nx-bar" style={{
                    width: `${b.pct}%`, height: "100%", borderRadius: 999,
                    background: !d.online ? C.muted : b.low ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
                  }} />
                </div>
              )}
              <div style={{ minWidth: 96, flexShrink: 0, textAlign: "right", color: b.value === NO_DATA ? C.mutedSoft : C.muted, whiteSpace: "nowrap" }}>{b.value}</div>
            </div>
          ))}
          {/* Когда сведения получены: у отключённого — последние достоверные */}
          {d.real && (
            <div style={{ fontSize: 12, color: C.mutedSoft, lineHeight: 1.45 }}>
              {sys?.at
                ? `${d.online ? "Обновлено" : "Последние данные"} ${sysTime(sys.at)}`
                : d.online ? "Устройство пока не прислало сведения" : "Сведений от устройства пока не было"}
            </div>
          )}
        </div>

        {/* Действия: три кнопки-«таблетки» равной ширины.
            На узком экране третья переносится на новую строку */}
        <div className="nx-device-actions" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))",
          gap: 10, padding: "20px 0 4px",
        }}>
          {/* Главная кнопка экрана — подключить / отключить, на всю ширину.
              У реального устройства «в сети» решает само устройство — кнопки нет */}
          {!d.real && <StateButton
            state={power}
            labels={powerLabels}
            icon={Icon.power({ c: d.online ? C.red : C.green, s: 16 })}
            onClick={toggleOnline}
            style={{ ...pillBtn, gridColumn: "1 / -1" }}
          >
            {d.online ? "Отключить устройство" : "Подключить устройство"}
          </StateButton>}
          {/* Пока устройство звонит, кнопка в состоянии «загрузка» */}
          <StateButton
            variant="primary"
            state={d.real
              ? ({ ringing: "loading", found: "success", timeout: "error" }[findState] || "idle")
              : ringing ? "loading" : "idle"}
            labels={d.real ? { loading: "Ищем…", success: "Нашлось", error: "Не ответило" } : { loading: "Звонит…" }}
            icon={Icon.search({ c: C.onFold, s: 16 })}
            disabled={!d.online || power === "loading" || d.isSelf}
            onClick={d.real ? () => onFind?.(d) : find}
            style={pillBtn}
          >
            Найти
          </StateButton>
          <button type="button" className="nx-ghost-btn" onClick={onOpenFiles} style={{ ...ghostBtn, ...pillBtn }}>
            {Icon.folder({ c: C.text, s: 16 })} Файлы · {fileCount}
          </button>
        </div>
        {!d.online && power === "idle" && (
          <div style={{ padding: "10px 0 0", fontSize: 12, color: C.mutedSoft }}>
            Найти можно только устройство в сети
          </div>
        )}
        {d.isSelf && (
          <div style={{ padding: "10px 0 0", fontSize: 12, color: C.mutedSoft }}>
            Это устройство — вы держите его в руках
          </div>
        )}
      </div>

      <div data-keep>
        {/* Реальное устройство: имя и что это за устройство. Выдуманных переключателей нет */}
        {d.real && <RealDeviceInfo d={d} onRename={onRename} actions={realActions} />}
        {/* Переключатели. Энергосбережение — только у устройств с батареей */}
        {!d.real && <div style={{ margin: "20px 0 0", border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {DEVICE_SETTINGS.filter((s) => !s.battery || d.battery != null).map((s, i) => (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              borderTop: i ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ display: "flex", flexShrink: 0 }}>{s.icon({ c: C.muted, s: 18 })}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>{s.sub}</div>
              </div>
              <Toggle on={d[s.key]} onClick={() => onSetting(s.key)} />
            </div>
          ))}
        </div>}

        {/* Удаление устройства. Сначала спрашиваем прямо здесь: "Удалить?" */}
        <div ref={delRef} style={{ padding: "14px 0 0" }}>
          {confirmDel ? (
            <div role="alert" className="nx-pop" style={{
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
              padding: "12px 14px", borderRadius: 12,
              border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`,
              background: `color-mix(in srgb, ${C.red} 8%, transparent)`,
            }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>Удалить «{d.name}»?</div>
                <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>Его можно будет подключить заново</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghostBtn}>
                  Отмена
                </button>
                <button type="button" className="nx-primary" onClick={onRemove} style={{
                  ...ghostBtn, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500,
                }}>
                  {Icon.trash({ c: C.onFold, s: 15 })} Удалить
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(true)} style={{
              ...ghostBtn, width: "100%", justifyContent: "center", borderRadius: 999, minHeight: 46,
              border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, color: C.red,
            }}>
              {Icon.trash({ c: C.red, s: 16 })} Удалить устройство
            </button>
          )}
        </div>
      </div>
      </div>
      {/* Реальное устройство: передать текст / ссылку и что от него пришло */}
      {d.real && link && <DeviceMessages d={d} link={link} />}
    </div>
  );
}

/* ОКНО "ДОБАВИТЬ УСТРОЙСТВО" — три шага и финал:
   1) тип устройства → 2) поиск (≈2 с) и найденное → 3) название → "Готово".
   Всё понарошку: поиск и подключение только изображаются таймерами.
   Закрывается крестиком, Esc или кликом по затемнению.
   names — названия, которые уже есть (чтобы не было двух одинаковых),
   onAdd(type, name) — добавить устройство в список */
const SEARCH_MS = 1800; // сколько идёт "поиск устройства"
const PAIR_MS = 900;    // сколько идёт "подключение" после ввода названия
const ADD_STEPS = ["Тип", "Поиск", "Название"];
const NAME_MAX = 24;    // самое длинное название, чтобы влезало в карточку

function AddDeviceModal({ names, onAdd, onClose }) {
  // step: "type" | "search" | "found" | "name" | "done"
  const [step, setStep] = useState("type");
  const [type, setType] = useState(null);
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState(false); // идёт ли подключение
  const inputRef = useRef(null);
  const t = type && deviceType(type);

  // Таймеры поиска и подключения: отменяем при "Назад" и при закрытии окна
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => stopTimers, []);

  // Esc закрывает окно; страница под окном не скроллится (как в окне устройства)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  // На шаге названия сразу ставим курсор в поле
  useEffect(() => { if (step === "name") inputRef.current?.focus(); }, [step]);

  const pickType = (tp) => {
    setType(tp);
    setStep("search");
    later(() => setStep("found"), SEARCH_MS);
  };
  const toName = () => { setName(uniqueDeviceName(t.name, names)); setStep("name"); };
  const back = () => {
    stopTimers();
    setPairing(false);
    setStep(step === "name" ? "found" : "type");
  };
  const again = () => { setType(null); setName(""); setStep("type"); };

  // Проверка названия: не пустое и не повторяет уже существующее
  const trimmed = name.trim();
  const nameError = !trimmed ? "Введите название" : names.includes(trimmed) ? "Такое название уже есть" : null;
  const connect = () => {
    if (nameError || pairing) return;
    setPairing(true);
    later(() => { onAdd(type, trimmed); setPairing(false); setStep("done"); }, PAIR_MS);
  };

  // Номер шага для полоски сверху: поиск и "найдено" — это один шаг
  const stepIndex = { type: 0, search: 1, found: 1, name: 2, done: 3 }[step];
  const titles = {
    type: "Что подключаем?",
    search: "Поиск устройства…",
    found: "Устройство найдено",
    name: "Как назвать?",
    done: "Готово",
  };

  // Сцена с устройством — для поиска, найденного и финала
  const stage = (
    <div style={{
      position: "relative", height: 170, borderRadius: 4, overflow: "hidden",
      // Подключено — сцена окрашивается в цвета бренда: это и есть "связь есть"
      background: step === "done"
        ? `linear-gradient(135deg, ${C.foldBlue}, ${C.foldCyan})`
        : `color-mix(in srgb, ${C.text} 6%, ${C.panel})`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Пока ищем — от устройства расходятся квадратные волны */}
      {step === "search" && [0, 1, 2].map((i) => (
        <span key={i} className="nx-ping" style={{ animationDelay: `${i * 300}ms` }} />
      ))}
      <div
        key={step}
        className={step === "search" ? undefined : "nx-icon-on"}
        style={{ position: "relative", display: "flex" }}
      >
        {t && t.icon({ c: step === "done" ? C.onFold : step === "search" ? C.muted : C.text, s: 56 })}
      </div>
    </div>
  );

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 6,
    padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
  const footer = { display: "flex", gap: 10, marginTop: 20 };

  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      // Фон под окном слегка размыт — внимание на устройстве
      background: `color-mix(in srgb, ${C.bg} 55%, transparent)`,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {/* stopPropagation — клик внутри окна не должен его закрывать */}
      <div
        role="dialog" aria-modal="true" aria-labelledby="nx-add-title"
        className="nx-viewer-panel nx-pop nx-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14,
          boxSizing: "border-box", textAlign: "left", padding: "20px 22px 22px",
        }}
      >
        {/* Шапка: номер шага, заголовок и крестик */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.mutedSoft, letterSpacing: "0.04em" }}>
              {step === "done" ? "Новое устройство" : `Шаг ${stepIndex + 1} из 3`}
            </div>
            <div id="nx-add-title" style={{ fontFamily: fontDisplay, fontSize: 24, lineHeight: 1.15, marginTop: 4 }}>
              {titles[step]}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Полоска шагов: пройденные и текущий — синие, впереди — серые */}
        <div style={{ display: "flex", gap: 6, margin: "16px 0 20px" }} aria-hidden="true">
          {ADD_STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{
                height: 2, background: i <= stepIndex ? C.blue : C.border,
                transition: "background-color 240ms ease",
              }} />
              <div style={{ fontSize: 11, marginTop: 6, color: i === stepIndex ? C.text : C.mutedSoft }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Содержимое шага. key — чтобы каждый шаг мягко появлялся заново */}
        <div key={step === "found" ? "search" : step} className="nx-pop">
          {step === "type" && (
            <div className="nx-add-types" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {DEVICE_TYPES.map((dt) => (
                <button key={dt.type} type="button" className="nx-cat-card" onClick={() => pickType(dt.type)} style={{
                  ...btnReset, border: `1px solid ${C.border}`, borderRadius: 4,
                  padding: "18px 8px 14px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 10, textAlign: "center",
                }}>
                  {dt.icon({ c: C.text, s: 28 })}
                  <span style={{ fontSize: 13 }}>{dt.name}</span>
                </button>
              ))}
            </div>
          )}

          {(step === "search" || step === "found") && (
            <>
              {stage}
              <div role="status" style={{ marginTop: 14, minHeight: 42 }}>
                {step === "search" ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <Spinner /> Ищем {t.name.toLowerCase()} рядом с вами
                    </div>
                    <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 4 }}>
                      Устройство должно быть включено и лежать рядом
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <Dot color={C.green} /> {t.name} · рядом с вами
                    </div>
                    <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 4 }}>
                      Сигнал хороший, можно подключать
                    </div>
                  </>
                )}
              </div>
              <div style={footer}>
                <button type="button" className="nx-ghost-btn" onClick={back} style={ghostBtn}>
                  {Icon.arrowLeft({ c: C.text, s: 16 })} Назад
                </button>
                <StateButton variant="primary" disabled={step !== "found"} onClick={toName} style={{ flex: 1, padding: "10px 16px" }}>
                  Дальше
                </StateButton>
              </div>
            </>
          )}

          {step === "name" && (
            // form — чтобы "Подключить" срабатывало и по Enter
            <form onSubmit={(e) => { e.preventDefault(); connect(); }}>
              <label htmlFor="nx-add-name" style={{ fontSize: 13, color: C.muted }}>Название</label>
              <input
                id="nx-add-name"
                ref={inputRef}
                className="nx-input"
                value={name}
                maxLength={NAME_MAX}
                disabled={pairing}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby="nx-add-hint"
                style={{
                  display: "block", width: "100%", boxSizing: "border-box", marginTop: 8,
                  background: "transparent", color: C.text, fontSize: 16, fontFamily: "inherit",
                  border: `1px solid ${nameError ? C.red : C.borderStrong}`, borderRadius: 4,
                  padding: "12px 14px", outline: "none",
                }}
              />
              <div id="nx-add-hint" style={{ fontSize: 12.5, marginTop: 8, color: nameError ? C.red : C.mutedSoft }}>
                {nameError || "Под этим названием устройство появится в списке"}
              </div>
              <div style={footer}>
                <button type="button" className="nx-ghost-btn" onClick={back} disabled={pairing} style={ghostBtn}>
                  {Icon.arrowLeft({ c: C.text, s: 16 })} Назад
                </button>
                <StateButton
                  variant="primary"
                  state={pairing ? "loading" : "idle"}
                  labels={{ loading: "Подключение…" }}
                  disabled={!!nameError}
                  onClick={connect}
                  style={{ flex: 1, padding: "10px 16px" }}
                >
                  Подключить
                </StateButton>
              </div>
            </form>
          )}

          {step === "done" && (
            <>
              {stage}
              <div role="status" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <Dot color={C.green} /> {trimmed} · Онлайн
                </div>
                <div style={{ fontSize: 12.5, color: C.mutedSoft, marginTop: 4 }}>
                  Устройство подключено и уже есть в списке
                </div>
              </div>
              <div style={footer}>
                <button type="button" className="nx-ghost-btn" onClick={again} style={ghostBtn}>
                  {Icon.plus({ c: C.text, s: 15 })} Ещё одно
                </button>
                <StateButton variant="primary" onClick={onClose} style={{ flex: 1, padding: "10px 16px" }}>
                  Готово
                </StateButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── СИСТЕМНЫЕ УВЕДОМЛЕНИЯ (ТОСТЫ) ────────────────────────
   Короткая обратная связь поверх приложения: файл отправлен,
   ссылка скопирована, диалог удалён и т.п. Показываются стеком
   справа сверху, автоматически исчезают через несколько секунд.
   Вызов: onToast({ title, text }), где onToast = showToast из NexaApp. */
function ToastHost({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="nx-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }) {
  return (
    <div className="nx-toast" role="status">
      <div className="nx-toast-icon">
        {Icon.sparkle({ c: C.mint, s: 16 })}
      </div>
      <div className="nx-toast-body">
        <div className="nx-toast-title">{toast.title}</div>
        {toast.text && <div className="nx-toast-text">{toast.text}</div>}
        {toast.action && (
          <button type="button" className="nx-ghost-btn" onClick={() => { toast.action.onClick(); onClose(); }} style={{
            ...btnReset, marginTop: 8, padding: "5px 12px", fontSize: 12.5, borderRadius: 999,
            border: `1px solid ${C.borderStrong}`, color: C.text,
          }}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="nx-toast-close" onClick={onClose} aria-label="Закрыть">
        {Icon.close({ c: C.muted, s: 14 })}
      </button>
    </div>
  );
}

/* ─── ГЛОБАЛЬНЫЙ ПОИСК ──────────────────────────────────────
   Оверлей поверх любого экрана. Ищет по разделам, устройствам,
   файлам, папкам, диалогам ассистента и строкам настроек.
   Открывается по иконке поиска в верхней строке (или кнопке
   в настройках), закрывается по Esc или клику по затемнению. */
function GlobalSearch({ files, chats = [], folders: allFolders = FOLDERS, devices: allDevices = DEVICES, onOpenDevice, onClose, onOpenFile, onOpenFolder, onOpenChat, onNavigate }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Фокус в поле сразу при открытии, закрытие по Esc
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const match = (text) => hasQuery && typeof text === "string" && text.toLowerCase().includes(q);
  const hitKeys = (arr) => (arr || []).some((k) => match(k));

  // Результаты. Пока запрос пуст, ничего не ищем.
  const tabs = hasQuery ? NAV.filter((t) => match(t.label)) : [];
  const devices = hasQuery ? allDevices.filter((d) => match(d.name)) : [];
  const folders = hasQuery ? allFolders.filter((f) => match(f.name)) : [];
  const fileHits = hasQuery ? sortByRecent(files.filter((f) => match(f.name))) : [];
  const chatHits = (() => {
    if (!hasQuery) return [];
    return chats.filter((c) => match(c.title));
  })();
  const settingHits = hasQuery
    ? SETTINGS_INDEX.filter((s) => match(s.title) || match(s.subtitle) || hitKeys(s.keywords))
    : [];

  const total = tabs.length + devices.length + folders.length + fileHits.length + chatHits.length + settingHits.length;

  // Обработчик клика: делаем действие и закрываем поиск
  const go = (fn) => () => { fn(); onClose(); };

  return (
    <div
      className="nx-search-overlay"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "10vh 20px 20px", boxSizing: "border-box",
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Поиск"
        className="nx-search-panel nx-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)", maxHeight: "calc(100vh - 10vh - 20px)",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box",
        }}
      >
        {/* Строка ввода */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
        }}>
          {Icon.search({ c: C.muted, s: 18 })}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти файл, папку, диалог, настройку…"
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none",
              outline: "none", color: C.text, fontSize: 15,
            }}
          />
          <kbd style={{
            fontSize: 10, letterSpacing: "0.06em", color: C.mutedSoft,
            border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px", fontFamily: "inherit",
          }}>Esc</kbd>
        </div>

        {/* Область результатов */}
        <div className="nx-scroll" style={{ overflowY: "auto", padding: "8px 0" }}>
          {!hasQuery && (
            <div style={{ padding: "22px 18px", fontSize: 13, color: C.mutedSoft, lineHeight: 1.6 }}>
              Начните вводить — найдём по всему приложению.
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Например: «Диплом», «Фото», «Отпуск», «Тема».
              </div>
            </div>
          )}

          {hasQuery && total === 0 && (
            <EmptyState compact title="Ничего не нашлось" text={`По запросу «${query.trim()}» нет ни разделов, ни файлов. Попробуйте другое слово.`} />
          )}

          {tabs.length > 0 && (
            <SearchGroup title="Разделы">
              {tabs.map((t) => (
                <SearchRow
                  key={t.id}
                  icon={t.icon({ c: C.muted, s: 16 })}
                  title={t.label}
                  subtitle="Перейти в раздел"
                  onClick={go(() => onNavigate(t.id))}
                />
              ))}
            </SearchGroup>
          )}

          {devices.length > 0 && (
            <SearchGroup title="Устройства">
              {devices.map((d) => (
                <SearchRow
                  key={d.id}
                  icon={d.icon({ c: C.muted, s: 16 })}
                  title={d.name}
                  subtitle={deviceStatus(d)}
                  onClick={go(() => onOpenDevice ? onOpenDevice(d.id) : onNavigate("home"))}
                />
              ))}
            </SearchGroup>
          )}

          {fileHits.length > 0 && (
            <SearchGroup title={`Файлы · ${fileHits.length}`}>
              {fileHits.slice(0, 8).map((f) => (
                <SearchRow
                  key={f.id}
                  thumb={<FileThumb file={f} w={34} h={22} iconSize={12} radius={4} />}
                  title={f.name}
                  subtitle={fileMeta(f)}
                  onClick={go(() => onOpenFile(f))}
                />
              ))}
              {fileHits.length > 8 && (
                <div style={{ padding: "6px 18px", fontSize: 11.5, color: C.mutedSoft }}>
                  и ещё {fileHits.length - 8}…
                </div>
              )}
            </SearchGroup>
          )}

          {folders.length > 0 && (
            <SearchGroup title="Папки">
              {folders.map((f) => (
                <SearchRow
                  key={f.id}
                  icon={Icon.folder({ c: C.muted, s: 16 })}
                  title={f.name}
                  subtitle="Открыть в файлах"
                  onClick={go(() => onOpenFolder(f.id))}
                />
              ))}
            </SearchGroup>
          )}

          {chatHits.length > 0 && (
            <SearchGroup title="Диалоги">
              {chatHits.map((c) => (
                <SearchRow
                  key={c.id}
                  icon={Icon.chat({ c: C.muted, s: 16 })}
                  title={c.title}
                  subtitle="Открыть в ассистенте"
                  onClick={go(() => onOpenChat(c.id))}
                />
              ))}
            </SearchGroup>
          )}

          {settingHits.length > 0 && (
            <SearchGroup title="Настройки">
              {settingHits.map((s) => (
                <SearchRow
                  key={s.title}
                  icon={Icon.gear({ c: C.muted, s: 16 })}
                  title={s.title}
                  subtitle={s.subtitle}
                  onClick={go(() => onNavigate("settings"))}
                />
              ))}
            </SearchGroup>
          )}
        </div>
      </div>
    </div>
  );
}

// Заголовок группы результатов
function SearchGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase",
        color: C.mutedSoft, padding: "8px 18px 4px",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// Одна строка результата. Либо иконка, либо миниатюра файла слева.
function SearchRow({ icon, thumb, title, subtitle, onClick }) {
  const visual = thumb || icon;
  return (
    <button
      type="button"
      className="nx-search-row"
      onClick={onClick}
      style={{
        width: "100%", boxSizing: "border-box",
        background: "transparent", border: "none", padding: "9px 18px",
        font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      {visual && (
        <div style={{
          width: 34, height: 26, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {visual}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 11.5, color: C.mutedSoft, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{subtitle}</div>
        )}
      </div>
      <div style={{ color: C.mutedSoft, flexShrink: 0 }}>
        {Icon.chevron({ c: C.mutedSoft, s: 14 })}
      </div>
    </button>
  );
}
// ЭКРАН "АССИСТЕНТ" — поле ввода по центру + правая панель (новый диалог/поиск/...)
/* ═══ КОМАНДЫ АССИСТЕНТА ══════════════════════════════════════
   Ассистент — часть NEXA: если сообщение похоже на команду, выполняем
   её сразу (без сервера) и отвечаем от имени ассистента. Иначе вопрос
   уходит в /api/chat как обычно.

   Как распознаём: текст в нижний регистр, ё → е, без знаков препинания.
   Дальше ищем по началам слов (основам), а не по точной фразе:
   «включи светлую тему», «сделай светлую», «светлый режим» — одно и то же.

   Чтобы обычный вопрос («расскажи про светлую тему в дизайне») не стал
   командой, у большинства команд правило when: "verb" — сработает, только
   если есть глагол действия (включи, открой, покажи…) или фраза короткая
   (до 3 слов). when: "free" — достаточно самих слов (сводка, справка).
   Новую команду добавить просто: ещё одна строка в ASSISTANT_COMMANDS
   и её обработка в runCommand внутри ScreenAssistant. */
const normalizeCommand = (text) => text
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

// Глаголы действия (начала слов)
const ACTION_VERBS = [
  "включ", "сдела", "постав", "переключ", "смен", "помен", "откр", "покаж", "показ",
  "перейд", "перейти", "переход", "зайд", "верн", "давай", "добав", "загруз", "закач",
  "подключи", "вывед", "отобраз", "иди", "запуст", "выбер", "хочу", "нужн",
];
// С таких слов начинаются вопросы «про что-то» — это не команды
const EXPLAIN_START = /^(расскаж|объясн|почему|зачем|что такое|что значит|в чем разница|чем отлича|напиши|придумай|переведи|сравни)/;
// Если в «сводке на сегодня» речь про это — это вопрос в чат, а не сводка
const NOT_SUMMARY = ["новост", "мир", "праздн", "курс", "матч", "футбол", "фильм", "кино", "гороскоп"];
const DEVICE_WORDS = ["устройств", "девайс", "гаджет"];

// Список команд. Порядок важен: сверху — более узкие
// (например, «загрузи файл» раньше, чем «открой файлы»)
const ASSISTANT_COMMANDS = [
  { action: "help", when: "free",
    test: ({ n, has, words }) => has("умеешь") || (has("команд") && words.length <= 4)
      || /^(что|чем|как) ты (можешь|умеешь|поможешь)/.test(n) || /^(помощь|помоги|справка|help)$/.test(n) },
  { action: "summary", when: "free",
    test: ({ has }) => !has(...NOT_SUMMARY) && (has("сводк")
      || (has("сегодня", "сегодняшн") && has("что", "план", "дел", "повестк", "как", "какие", "какой"))) },
  { action: "summary", when: "verb",
    test: ({ has }) => has("погод") && !has("завтра", "недел", ...NOT_SUMMARY) },
  { action: "upload", when: "verb",
    test: ({ has }) => has("загруз", "закач", "залей", "добав") && has("файл", "фото", "документ", "картин", "изображ") },
  { action: "addDevice", when: "verb",
    test: ({ words, has }) => words.some((w) => /^(добав|подключи$|подключить$|привяж|присоедин)/.test(w))
      && has(...DEVICE_WORDS, "смартфон", "телефон", "ноутбук", "планшет", "часы", "наушник", "телевизор") },
  { action: "devices", when: "free",
    test: ({ has, hasVerb, short }) => has(...DEVICE_WORDS)
      && !has("купить", "куп", "лучше", "выбра", "посовет") // «какие устройства лучше купить» — вопрос в чат
      && (hasVerb || short || has("онлайн", "сети", "подключ", "сколько", "мои", "меня", "список", "статус", "все")) },
  { action: "theme", params: { mode: "light" }, when: "verb", test: ({ has }) => has("светл", "дневн") },
  { action: "theme", params: { mode: "dark" }, when: "verb", test: ({ has }) => has("темн", "ночн") },
  { action: "theme", params: { mode: "toggle" }, when: "verb",
    test: ({ has }) => has("тем", "оформлен", "режим") && has("переключ", "смен", "помен", "друг", "обрат") },
  { action: "navigate", params: { tab: "files" }, when: "verb", test: ({ has }) => has("файл") },
  { action: "navigate", params: { tab: "media" }, when: "verb", test: ({ has }) => has("медиа", "галере", "фото", "видео", "музык") },
  // «сегодня» ведёт на экран только с глаголом («покажи сегодня»): «какой сегодня праздник» — вопрос
  { action: "navigate", params: { tab: "today" }, when: "verb",
    test: ({ has, hasVerb }) => has("расписан", "календар") || (has("сегодня") && hasVerb) },
  { action: "navigate", params: { tab: "settings" }, when: "verb", test: ({ has }) => has("настройк", "параметр") },
  { action: "navigate", params: { tab: "home" }, when: "verb", test: ({ has }) => has("главн", "домой") },
];

// Текст → { action, params } или null (тогда это обычный вопрос)
function parseCommand(text) {
  const n = normalizeCommand(text || "");
  if (!n) return null;
  const words = n.split(" ");
  if (words.length > 12) return null; // длинное сообщение — точно разговор, не команда
  const has = (...stems) => words.some((w) => stems.some((st) => w.startsWith(st)));
  const ctx = {
    n, words, has,
    hasVerb: words.some((w) => ACTION_VERBS.some((v) => w.startsWith(v))),
    short: words.length <= 3,
  };
  const explain = EXPLAIN_START.test(n);
  for (const c of ASSISTANT_COMMANDS) {
    if (!c.test(ctx)) continue;
    if (c.when === "free") return { action: c.action, params: c.params || {} };
    if (!explain && (ctx.hasVerb || ctx.short)) return { action: c.action, params: c.params || {} };
  }
  return null;
}

// Подписи разделов для ответов и плашек
const TAB_TITLES = { home: "Главная", today: "Сегодня", media: "Медиа", files: "Файлы", settings: "Настройки" };
const TAB_REPLIES = {
  home: "Перехожу на главную", today: "Открываю «Сегодня» с расписанием", media: "Открываю медиа",
  files: "Открываю файлы", settings: "Открываю настройки",
};
const NAV_DELAY = 700; // переход — через 0,7 с, чтобы успеть прочитать ответ

const ASSISTANT_HELP = [
  "Я не только отвечаю на вопросы, но и управляю NEXA. Например:",
  "• **Тема** — «включи светлую тему», «тёмный режим», «переключи тему»",
  "• **Переходы** — «открой файлы», «покажи медиа», «открой расписание», «настройки», «на главную»",
  "• **Сводка** — «что у меня сегодня?», «какая погода?»",
  "• **Устройства** — «какие устройства онлайн?», «добавь устройство»",
  "• **Файлы** — «загрузи файл»",
  "Всё остальное — просто спросите.",
].join("\n");

// Сводка «что у меня сегодня»: дата, погода, ближайшее дело и сколько дел
async function buildTodaySummary() {
  const w = await getTodayWeather();
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const items = TODAY.schedule;
  const left = items.filter((it) => {
    const [h, m] = it.time.split(":").map(Number);
    return h * 60 + m >= minutes;
  });
  const date = now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const lines = [`**${date.charAt(0).toUpperCase() + date.slice(1)}.**`];
  lines.push(w
    ? `${TODAY.city !== "—" ? `${TODAY.city}: ` : "Сейчас "}${signed(w.now.temp)}°, ${weatherCodeToText(w.now.code).text.toLowerCase()}, ощущается как ${signed(w.now.feels)}°.`
    : "Погоду сейчас загрузить не получилось.");
  const total = `${items.length} ${plural(items.length, ["дело", "дела", "дел"])}`;
  lines.push(!items.length
    ? "В расписании пока пусто — дела можно добавить на экране «Сегодня»."
    : left.length
    ? `В расписании ${total}, впереди ${left.length}. Ближайшее — **${left[0].time} · ${left[0].title}**${left[0].place ? ` (${left[0].place})` : ""}.`
    : `Все ${total} на сегодня позади — можно отдыхать.`);
  return lines.join("\n");
}

// Сводка по устройствам: сколько подключено и кто в сети (с зарядом)
function buildDevicesSummary(devices) {
  if (!devices.length) return "Устройств пока нет. Скажите «добавь устройство», и я открою окно подключения.";
  const on = devices.filter((d) => d.online);
  const off = devices.filter((d) => !d.online);
  const lines = [`Подключено ${devices.length} ${plural(devices.length, ["устройство", "устройства", "устройств"])}, в сети — ${on.length}.`];
  if (on.length) lines.push(`**В сети:** ${on.map((d) => (d.battery != null ? `${d.name} (${d.battery}%)` : d.name)).join(", ")}.`);
  if (off.length) lines.push(`**Не в сети:** ${off.map((d) => d.name).join(", ")}.`);
  return lines.join("\n");
}

/* «Аура» нового диалога — крупная полупрозрачная складка за приветствием
   и полем ввода (наш ответ «цветному полю» у других ассистентов, но из граней,
   без свечения и размытия: края растворяются маской).
   Движение только по событию:
   • при открытии грани по очереди разворачиваются из центра складки;
   • грани на разной «глубине» чуть следуют за курсором / наклоном телефона;
   • active (поле в фокусе или в нём есть текст) — складка приближается и ярче.
   Точки граней — в % от размера ауры; центр складки — 47% 56% */
const AURA_C = "47% 56%";
const AURA_FACETS = [
  { clip: `polygon(6% 32%, 44% 6%, ${AURA_C})`,  from: C.foldBlue, to: C.foldDeep, depth: 1.2, delay: 0 },
  { clip: `polygon(44% 6%, 95% 30%, ${AURA_C})`, from: C.foldDeep, to: C.foldBlue, depth: 0.7, delay: 90 },
  { clip: `polygon(95% 30%, 76% 92%, ${AURA_C})`, from: C.foldCyan, to: C.foldBlue, depth: 1.0, delay: 180 },
  { clip: `polygon(76% 92%, 28% 96%, ${AURA_C})`, from: C.foldMint, to: C.foldCyan, depth: 1.4, delay: 270 },
  { clip: `polygon(28% 96%, 6% 32%, ${AURA_C})`,  from: C.foldDeep, to: C.foldMint, depth: 0.9, delay: 360 },
];

/* Спектральный фон экрана ассистента (src/lib/spectrum.js): мягкое цветное
   поле на холсте под всем экраном. Состояние читает сам, каждый кадр:
   думает — пока нет текста ответа, отвечает — пока текст растёт.
   React ради этого не перерисовывается */
function AssistantSpectrum({ busyRef }) {
  const ref = useRef(null);
  useEffect(() => runSpectrum(ref.current, () => ({
    busy: live.chatId !== null || !!busyRef.current,
    len: live.text.length,
  })), []);
  return <canvas ref={ref} className="nx-spectrum" aria-hidden="true" />;
}

function AssistantAura({ active }) {
  const ref = useRef(null);
  useBackdropMotion(ref); // --px / --py от курсора (на телефоне — от наклона)
  return (
    <div ref={ref} aria-hidden="true" className={`nx-aura${active ? " is-active" : ""}`}>
      {/* Грани размыты одним слоем — получается мягкое цветное поле */}
      <div className="nx-aura-blur" style={{ position: "absolute", inset: 0 }}>
      {AURA_FACETS.map((f, i) => (
        // Внешний слой — сдвиг за курсором (у каждой грани своя глубина),
        // внутренний — разворачивание при появлении
        <div key={i} style={{
          position: "absolute", inset: 0, transition: BACKDROP_EASE,
          transform: `translate(calc(var(--px, 0) * ${f.depth * 16}px), calc(var(--py, 0) * ${f.depth * 11}px))`,
        }}>
          <div className="nx-aura-facet" style={{
            position: "absolute", inset: 0, clipPath: f.clip, transformOrigin: AURA_C,
            background: `linear-gradient(135deg, color-mix(in srgb, ${f.from} 70%, transparent), color-mix(in srgb, ${f.to} 22%, transparent))`,
            animationDelay: `${f.delay}ms`,
          }} />
        </div>
      ))}
      </div>
    </div>
  );
}

/* Аура за ответом: пока ассистент думает и печатает, за новым ответом
   (слева внизу списка) проявляется маленькое размытое поле из тех же граней.
   Через пару секунд после ответа оно «испаряется»: разрастается, сильнее
   размывается и тает. fading — идёт исчезновение.
   posRef — внешний слой: ScreenAssistant ставит его в точку за последним
   ответом (left/top), сама аура центрируется вокруг этой точки */
function ReplyAura({ fading, posRef }) {
  return (
    <div ref={posRef} aria-hidden="true" className="nx-reply-aura-pos">
    <div className={`nx-reply-aura${fading ? " is-fading" : ""}`}>
      <div className="nx-reply-aura-in" style={{ position: "absolute", inset: 0 }}>
        {AURA_FACETS.map((f, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, clipPath: f.clip,
            background: `linear-gradient(135deg, color-mix(in srgb, ${f.from} 75%, transparent), color-mix(in srgb, ${f.to} 25%, transparent))`,
          }} />
        ))}
      </div>
    </div>
    </div>
  );
}
const REPLY_AURA_HOLD = 1800; // сколько аура держится после ответа
const REPLY_AURA_FADE = 1000; // сколько «испаряется»

// Подсказки на пустом экране: нажатие отправляет текст как сообщение
const assistantSuggestions = () => [
  { text: readTheme() === "light" ? "Включи тёмную тему" : "Включи светлую тему", icon: Icon.sparkle },
  { text: "Что у меня сегодня?", icon: Icon.calendar },
  { text: "Какие устройства онлайн?", icon: Icon.phone },
  { text: "Открой файлы", icon: Icon.folder },
];

// tab / setTab — текущий раздел и переход (из NexaApp), devices — устройства,
// onAddDevice — открыть окно добавления устройства, onUploadFiles — выбор файлов
// bell — колокольчик уведомлений (у ассистента своя верхняя строка)
// chats / setChats — диалоги из App: там они сохраняются в браузере и в облаке аккаунта
/* ---------- История диалогов ассистента ----------
   Компьютер — постоянная колонка слева. Телефон — шторка слева на 85% ширины
   с затемнением: закрывается нажатием мимо, крестиком, свайпом влево, Esc и «Назад». */

// Когда в диалоге последний раз писали (мс). У сообщений есть время at;
// у старых диалогов (до появления at) — время последнего изменения
function chatLastAt(c) {
  const msgs = c.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]?.at) return msgs[i].at;
  return c.updatedAt || c.createdAt || 0;
}
// Закрепление и переименование меняют updatedAt. Чтобы старый диалог без
// времени у сообщений не переехал от этого в «Сегодня», запоминаем прежнее
// время в последнем сообщении
function keepLastAt(c) {
  const msgs = c.messages || [];
  if (!msgs.length || msgs.some((m) => m?.at)) return c;
  const at = chatLastAt(c);
  return { ...c, messages: msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, at } : m)) };
}
const HISTORY_GROUPS = [
  ["pinned", "Закреплено"], ["today", "Сегодня"], ["yesterday", "Вчера"],
  ["week", "За 7 дней"], ["month", "За 30 дней"], ["older", "Раньше"],
];
// Раздел по календарным дням (полночь по времени телефона), а не по «24 часам назад»
function historyGroup(c, now) {
  if (c.pinned) return "pinned";
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(chatLastAt(c))) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "older";
}
// Подходит ли экран под условие (например, телефонная ширина) — и следим за поворотом
function useMediaQuery(query) {
  const [match, setMatch] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function ChatHistory({ chats, setChats, currentChatId, onOpen, onNew, onDelete, mobile, open, onClose, account, sync, onSettings }) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(null);         // меню диалога: { id, top | bottom, right, confirm }
  const [renaming, setRenaming] = useState(null); // { id, text } — строка превратилась в поле
  const listRef = useRef(null);
  // Свайп влево: насколько панель ушла за пальцем (px, ≤ 0)
  const [dx, setDx] = useState(0);
  const drag = useRef(null);

  // Шторка закрылась — закрываем и меню, и переименование
  useEffect(() => { if (mobile && !open) { setMenu(null); setRenaming(null); } }, [mobile, open]);

  // Esc (и «Назад» на Android): переименование → меню → шторка
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (renaming) return setRenaming(null);
      if (menu) return setMenu(null);
      if (mobile && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renaming, menu, mobile, open]);

  // Меню закрывается нажатием мимо него, прокруткой списка и сменой размера
  useEffect(() => {
    if (!menu) return;
    const off = (e) => { if (!e.target.closest?.(".nx-hist-menu, .nx-hist-more")) setMenu(null); };
    const close = () => setMenu(null);
    const list = listRef.current;
    document.addEventListener("pointerdown", off, true);
    list?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", off, true);
      list?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [menu?.id]);

  // Поиск по названию и по тексту сообщений
  const q = query.trim().toLowerCase();
  const found = !q ? chats : chats.filter((c) =>
    (c.title || "").toLowerCase().includes(q) ||
    (c.messages || []).some((m) => typeof m.text === "string" && m.text.toLowerCase().includes(q)));
  const now = new Date();
  const groups = HISTORY_GROUPS
    .map(([id, label]) => ({
      id, label,
      items: found.filter((c) => historyGroup(c, now) === id).sort((a, b) => chatLastAt(b) - chatLastAt(a)),
    }))
    .filter((g) => g.items.length);

  // Меню рисуется поверх всего (в body), рядом с кнопкой «⋯»; у низа экрана — над ней
  const openMenu = (id, btn) => {
    if (menu?.id === id) return setMenu(null);
    const r = btn.getBoundingClientRect();
    const h = window.visualViewport?.height || window.innerHeight;
    const up = r.bottom + 170 > h;
    setMenu({ id, right: Math.max(8, window.innerWidth - r.right), confirm: false,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };
  const menuChat = menu && chats.find((c) => c.id === menu.id);
  const togglePin = (id) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...keepLastAt(c), pinned: !c.pinned } : c)));
    setMenu(null);
  };
  const startRename = (c) => { setMenu(null); setRenaming({ id: c.id, text: c.title || "" }); };
  const saveRename = () => {
    if (!renaming) return;
    const t = renaming.text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (t) setChats((prev) => prev.map((c) => (c.id === renaming.id && c.title !== t ? { ...keepLastAt(c), title: t } : c)));
    setRenaming(null);
  };

  // Свайп влево по шторке — закрыть. Вертикальное движение — обычная прокрутка списка
  const touch = mobile ? {
    onTouchStart: (e) => { const t = e.touches[0]; drag.current = { x: t.clientX, y: t.clientY, on: null, dx: 0 }; },
    onTouchMove: (e) => {
      const d = drag.current;
      if (!d) return;
      const t = e.touches[0], mx = t.clientX - d.x, my = t.clientY - d.y;
      if (d.on === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        d.on = Math.abs(mx) > Math.abs(my) && mx < 0;
      }
      if (d.on) { d.dx = Math.min(0, mx); setDx(d.dx); }
    },
    onTouchEnd: () => {
      const d = drag.current;
      drag.current = null;
      if (d?.on && d.dx < -60) onClose();
      setDx(0);
    },
  } : {};

  const row = (chat) => {
    const active = chat.id === currentChatId;
    if (renaming?.id === chat.id) {
      return (
        <div key={chat.id} className="nx-hist-row is-active">
          <input
            autoFocus
            className="nx-hist-rename"
            aria-label="Новое название диалога"
            value={renaming.text}
            maxLength={120}
            onChange={(e) => setRenaming({ ...renaming, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveRename(); } }}
            onBlur={saveRename}
            onFocus={(e) => e.target.select()}
          />
        </div>
      );
    }
    return (
      <div key={chat.id} className={`nx-hist-row${active ? " is-active" : ""}`}>
        <button type="button" className="nx-hist-open" aria-current={active ? "true" : undefined}
          onClick={() => onOpen(chat.id)} title={chat.title}>
          {chat.title || "Без названия"}
        </button>
        <button type="button" className="nx-hist-more" aria-label={`Действия с диалогом «${chat.title}»`}
          aria-haspopup="menu" aria-expanded={menu?.id === chat.id}
          onClick={(e) => openMenu(chat.id, e.currentTarget)}>
          {Icon.dots({ c: "currentColor", s: 16 })}
        </button>
      </div>
    );
  };

  const panel = (
    <aside
      className={`nx-hist${mobile ? " nx-hist-drawer" : ""}${open ? " is-open" : ""}${dx ? " is-dragging" : ""}`}
      // На телефоне открытая шторка — окно: «Назад» закроет её через Esc
      role={mobile && open ? "dialog" : undefined}
      aria-modal={mobile && open ? "true" : undefined}
      aria-label="История диалогов"
      aria-hidden={mobile && !open ? "true" : undefined}
      style={mobile && open && dx ? { transform: `translateX(${dx}px)` } : undefined}
      {...touch}
    >
      <div className="nx-hist-head">
        <span className="nx-hist-label">История</span>
        {mobile && (
          <button type="button" className="nx-hist-close" aria-label="Закрыть историю" onClick={onClose}>
            {Icon.close({ c: C.text, s: 16 })}
          </button>
        )}
      </div>
      <button type="button" className="nx-ghost-btn nx-hist-new" onClick={onNew}>
        {Icon.plus({ c: C.mint, s: 15 })} Новый диалог
      </button>
      <label className="nx-hist-search">
        {Icon.search({ c: C.mutedSoft, s: 14 })}
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по диалогам" aria-label="Поиск по диалогам" enterKeyHint="search" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" style={{ ...btnReset, display: "flex", padding: 2 }}>
            {Icon.close({ c: C.mutedSoft, s: 12 })}
          </button>
        )}
      </label>

      <div ref={listRef} className="nx-scroll nx-hist-list">
        {chats.length === 0 ? (
          <div className="nx-hist-empty">Здесь появятся ваши диалоги</div>
        ) : groups.length === 0 ? (
          <div className="nx-hist-empty">Ничего не нашлось</div>
        ) : groups.map((g) => (
          <section key={g.id} aria-label={g.label} className="nx-hist-section">
            <div className="nx-hist-group">
              {g.id === "pinned" && Icon.pin({ c: C.mint, s: 11 })}
              {g.label}
            </div>
            {g.items.map(row)}
          </section>
        ))}
      </div>

      {/* Синхронизация аккаунта — строкой над аккаунтом, список не перекрывает */}
      {(sync?.loading || sync?.text) && (
        <div className="nx-hist-sync" role="status">
          {sync.loading ? <Spinner s={11} /> : <Dot color={C.red} />}
          <span>{sync.loading ? "Загружаем данные аккаунта…" : sync.text}</span>
          {!sync.loading && sync.onRetry && (
            <button type="button" onClick={sync.onRetry} style={{ ...btnReset, color: C.mint, fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Аккаунт: почта или «Гость» и переход в настройки */}
      <button type="button" className="nx-hist-account" onClick={onSettings} aria-label="Открыть настройки">
        <span className="nx-hist-avatar">{Icon.user({ c: account ? C.mint : C.muted, s: 15 })}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span className="nx-hist-email">{account ? account.email || "Аккаунт" : "Гость"}</span>
          <span className="nx-hist-sub">{account ? "Диалоги в облаке" : "Диалоги только в этом браузере"}</span>
        </span>
        {Icon.gear({ c: C.muted, s: 16 })}
      </button>
    </aside>
  );

  const menuEl = menu && menuChat && createPortal(
    <div className="nx-hist-menu nx-pop" role="menu" aria-label={`Диалог «${menuChat.title}»`}
      style={{ position: "fixed", top: menu.top, bottom: menu.bottom, right: menu.right }}>
      {menu.confirm ? (
        <div style={{ padding: "6px 6px 4px", maxWidth: 220 }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 10 }}>
            Удалить диалог «{menuChat.title}»? Его не получится вернуть.
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" role="menuitem" className="nx-ghost-btn" autoFocus onClick={() => setMenu(null)}
              style={{ ...btnReset, padding: "6px 12px", fontSize: 12.5, border: `1px solid ${C.borderStrong}`, color: C.text }}>
              Отмена
            </button>
            <button type="button" role="menuitem" className="nx-ghost-btn" onClick={() => { setMenu(null); onDelete(menuChat.id); }}
              style={{ ...btnReset, padding: "6px 12px", fontSize: 12.5, border: `1px solid color-mix(in srgb, ${C.red} 60%, transparent)`, color: C.red }}>
              Удалить
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" role="menuitem" autoFocus onClick={() => togglePin(menuChat.id)}>
            {Icon.pin({ c: C.mint, s: 14 })} {menuChat.pinned ? "Открепить" : "Закрепить"}
          </button>
          <button type="button" role="menuitem" onClick={() => startRename(menuChat)}>
            {Icon.edit({ c: C.text, s: 14 })} Переименовать
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => setMenu({ ...menu, confirm: true })}>
            {Icon.trash({ c: C.red, s: 14 })} Удалить
          </button>
        </>
      )}
    </div>,
    document.body,
  );

  // Телефон: шторка и затемнение — в body, поверх нижней панели.
  // Высота — видимая область (над клавиатурой, когда ищем)
  if (mobile) {
    return (
      <>
        {createPortal(
          <>
            <div className={`nx-hist-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
            {panel}
          </>,
          document.body,
        )}
        {menuEl}
      </>
    );
  }
  return <>{panel}{menuEl}</>;
}

/* ---------- Ответ, который сейчас печатается ----------
   Один на всё приложение и живёт отдельно от истории чатов. Каждый кусок
   потока меняет только этот маленький объект и перерисовывает только пузырь
   ответа (LiveAnswer) — не всё приложение. В историю (localStorage, другие
   вкладки, облако) ответ попадает один раз, целиком, когда поток закончился.
   Хранилище вне компонента: если уйти с экрана ассистента и вернуться,
   ответ продолжит печататься. */
const STREAM_FLUSH_MS = 40;  // показываем новый текст пачками — примерно 25 раз в секунду
const live = { chatId: null, text: "" };
const liveSubs = new Set();
const liveSet = (patch) => { Object.assign(live, patch); liveSubs.forEach((f) => f()); };
const liveSubscribe = (f) => { liveSubs.add(f); return () => liveSubs.delete(f); };
const useLiveChatId = () => useSyncExternalStore(liveSubscribe, () => live.chatId);
const useLiveText = () => useSyncExternalStore(liveSubscribe, () => live.text);
// Сохранённый на всякий случай кусок ответа (см. checkpoint в streamAnswer):
// пока ответ печатается, в списке его не показываем — вместо него LiveAnswer
const isPartial = (m) => m?.role === "ai" && m.partial;

// Пузырь печатающегося ответа: пока текста нет — «Печатает», потом сам ответ.
// onGrow — текст подрос (прокрутить вниз, передвинуть ауру)
function LiveAnswer({ onGrow }) {
  const text = useLiveText();
  useLayoutEffect(() => { onGrow?.(); }, [text]);
  if (!text) return <AssistantSkeleton />;
  return <MessageBubble role="ai" text={text} isLastAi disabled onRegenerate={() => {}} onEdit={() => {}} />;
}

function ScreenAssistant({ initialChatId, chats, setChats, onToast, tab, setTab, devices = [], onAddDevice, onUploadFiles, bell, account, sync }) {
  const greetings = [
  "Что сегодня в повестке дня?",
  "Чем могу помочь сегодня?",
  "С чего начнём?",
  "Задайте любой вопрос — я готов помочь",
  "Что нового хотите узнать?",
  "О чём поговорим?",
  "Как дела? Расскажите, что нужно",
  "Готов помочь — с чего начнём?",
  "Есть вопросы? Я слушаю",
  "Что вас интересует сегодня?",
];
const [greeting, setGreeting] = useState('');
useEffect(() => {
  setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
}, []);
  const [currentChatId, setCurrentChatId] = useState(initialChatId || null);
  const [input, setInput] = useState('');
  // Ассистент занят: печатает ответ (общее хранилище live) или выполняет команду
  const liveChatId = useLiveChatId();
  const [cmdBusy, setCmdBusy] = useState(false);
  const cmdBusyRef = useRef(false); cmdBusyRef.current = cmdBusy; // для спектрального фона
  const isLoading = cmdBusy || liveChatId !== null;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Свайп вправо на экране ассистента открывает историю (см. useTabSwipe в NexaApp)
  useEffect(() => {
    const open = () => setIsHistoryOpen(true);
    window.addEventListener("nexa-open-history", open);
    return () => window.removeEventListener("nexa-open-history", open);
  }, []);
  const bottomRef = useRef(null);
  // Окно со списком сообщений: прокручиваем вниз только его, а не всю страницу
  const listRef = useRef(null);
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  // Телефонная ширина: история — шторка; шире — постоянная колонка слева
  const mobile = useMediaQuery("(max-width: 768px)");

  // Аура за ответом: появляется, когда ассистент начинает думать,
  // и исчезает через REPLY_AURA_HOLD после ответа
  const [replyAura, setReplyAura] = useState(null); // { id, fading } или null
  useEffect(() => {
    if (isLoading) { setReplyAura({ id: Date.now(), fading: false }); return; }
    const t1 = setTimeout(() => setReplyAura((a) => a && { ...a, fading: true }), REPLY_AURA_HOLD);
    const t2 = setTimeout(() => setReplyAura(null), REPLY_AURA_HOLD + REPLY_AURA_FADE);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isLoading]);

  // Переход по команде ждёт NAV_DELAY: пока ждёт, его можно отменить
  const [pendingNavId, setPendingNavId] = useState(null);
  const navTimer = useRef(null);
  useEffect(() => () => clearTimeout(navTimer.current), []);

  // Поле ввода: в новом диалоге — по центру, после первого сообщения
  // плавно уезжает вниз (и обратно при «Новом диалоге»).
  // Запоминаем, где поле было, и после перерисовки анимируем разницу
  const inputDockRef = useRef(null);
  const [inputFocused, setInputFocused] = useState(false); // поле в фокусе — аура «оживает»
  // На телефоне аура стоит по центру приветствия (а не всей колонки, где внизу поле ввода):
  // меряем, где приветствие, и кладём высоту в CSS-переменную --aura-y
  const emptyColRef = useRef(null);
  useLayoutEffect(() => {
    const col = emptyColRef.current;
    if (!col || !window.ResizeObserver) return;
    const place = () => {
      const g = col.querySelector(".nx-empty-greet");
      if (!g) return;
      const c = col.getBoundingClientRect(), r = g.getBoundingClientRect();
      col.style.setProperty("--aura-y", `${r.top - c.top + r.height / 2}px`);
    };
    place();
    // Приветствие меняет высоту (сменилась фраза, догрузился шрифт) — переставляем
    const ro = new ResizeObserver(place);
    ro.observe(col);
    const g = col.querySelector(".nx-empty-greet");
    if (g) ro.observe(g);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  });
  const flipFrom = useRef(null);
  const taRef = useRef(null);
  const rememberInputPos = () => {
    const el = inputDockRef.current;
    if (el) flipFrom.current = { top: el.getBoundingClientRect().top, focused: document.activeElement === taRef.current };
  };

  const currentChat = chats.find(c => c.id === currentChatId);
  // Пока ответ в этом диалоге печатается, сохранённый на всякий случай кусок
  // не показываем — его место занимает LiveAnswer
  const streamingHere = liveChatId !== null && liveChatId === currentChatId;
  const messages = (currentChat?.messages || []).filter((m, i, all) => !(streamingHere && i === all.length - 1 && isPartial(m)));
  // Новый диалог — приветствие по центру, даже если в другом диалоге ещё печатается ответ
  const isEmpty = messages.length === 0 && !cmdBusy && !streamingHere;

  // Где аура: за последним сообщением в чате (это «печатает…» или ответ).
  // Двигаем внешний слой напрямую, без перерисовки, не чаще раза за кадр
  const replyAuraPos = useRef(null);
  const placeFrame = useRef(0);
  const placeReplyAura = () => {
    cancelAnimationFrame(placeFrame.current);
    placeFrame.current = requestAnimationFrame(() => {
      const el = replyAuraPos.current, list = listRef.current;
      if (!el || !list) return;
      const msgs = list.querySelectorAll(".nx-msg");
      const last = msgs[msgs.length - 1];
      if (!last) return;
      const box = el.parentElement.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      el.style.left = `${r.left - box.left + Math.min(r.width / 2, 240)}px`;
      el.style.top = `${r.top - box.top + r.height / 2}px`;
    });
  };
  useLayoutEffect(() => { if (replyAura) placeReplyAura(); }, [replyAura?.id, messages.length, messages[messages.length - 1]?.text, isLoading]);
  useEffect(() => {
    const list = listRef.current;
    if (!replyAura || !list) return;
    list.addEventListener("scroll", placeReplyAura, { passive: true });
    window.addEventListener("resize", placeReplyAura);
    return () => {
      list.removeEventListener("scroll", placeReplyAura);
      window.removeEventListener("resize", placeReplyAura);
      cancelAnimationFrame(placeFrame.current);
    };
  }, [replyAura?.id]);
  // Поле ввода переехало (центр ↔ низ): плавно ведём его из старого места.
  // Без движения — если так настроено в системе
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    const el = inputDockRef.current;
    if (!from || !el) return;
    if (from.focused) taRef.current?.focus({ preventScroll: true });
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const dy = from.top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [isEmpty]);

  // Поле ввода растёт по высоте вместе с текстом, дальше — прокрутка внутри поля.
  // Потолок — до ~6 строк, но не больше 30% видимой высоты экрана: на маленьком
  // экране с открытой клавиатурой поле не выдавливает переписку
  const fitInput = () => {
    const t = taRef.current;
    if (!t) return;
    const visible = window.visualViewport?.height || window.innerHeight;
    const cap = Math.max(60, Math.min(168, Math.round(visible * 0.3)));
    t.style.maxHeight = `${cap}px`;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, cap)}px`;
    t.style.overflowY = t.scrollHeight > cap ? "auto" : "hidden";
    // Одна строка — кнопка по центру поля, несколько — прижата к низу
    const oneLine = parseFloat(getComputedStyle(t).lineHeight) + 12 + 4;
    t.parentElement.style.alignItems = t.scrollHeight > oneLine ? "flex-end" : "center";
  };
  useLayoutEffect(fitInput, [input, isEmpty]);
  // Открылась / закрылась клавиатура — потолок пересчитываем
  useEffect(() => {
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fitInput);
    return () => vv?.removeEventListener("resize", fitInput);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, messages[messages.length - 1]?.text, isLoading]);

  // Клавиатура как в мессенджерах. Экран ассистента всегда ровно по видимой
  // области над клавиатурой (--vvh и --vvt ставит useKeyboardViewport в NexaApp):
  // шапка стоит на месте, поле ввода сидит прямо на клавиатуре, сжимается
  // только список сообщений. Если человек был в самом низу переписки —
  // при сжатии списка (клавиатура, поле выросло на строку) остаётся внизу.
  // Если листал историю выше — не дёргаем его вниз.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let atBottom = true;
    const onScroll = () => { atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48; };
    const ro = new ResizeObserver(() => { if (atBottom) list.scrollTop = list.scrollHeight; });
    list.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(list);
    return () => { list.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [isEmpty, currentChatId]);
  // Браузер любит сдвигать страницу к полю ввода — возвращаем её на место
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const back = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    vv.addEventListener('resize', back);
    vv.addEventListener('scroll', back);
    return () => { vv.removeEventListener('resize', back); vv.removeEventListener('scroll', back); };
  }, []);

  const newChat = () => { if (currentChatId) rememberInputPos(); setCurrentChatId(null); setInput(''); };
  const openChat = (id) => { setCurrentChatId(id); setInput(''); };
  // Удаление (уже после подтверждения в меню диалога)
  const deleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === currentChatId) setCurrentChatId(null);
    onToast?.({ title: "Диалог удалён" });
  };

    // Главная функция: отправляет вопрос на сервер и по мере прихода
  // текста вписывает ответ в чат. Используется и при обычной отправке,
  // и при повторе ответа, и при редактировании сообщения.
  // previousMessages это сообщения чата ДО вопроса, text это сам вопрос.
  const streamAnswer = async (chatId, previousMessages, text) => {
    if (live.chatId) return; // уже печатается другой ответ — второй не начинаем
    liveSet({ chatId, text: "" });
    let fullText = '';
    let timer = 0;

    // Ответ в историю чата: последний сохранённый «на всякий случай» кусок
    // заменяем, иначе добавляем новое сообщение. Так ответ не задваивается
    const putAnswer = (answer) => setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const msgs = [...c.messages];
      if (isPartial(msgs[msgs.length - 1])) msgs[msgs.length - 1] = { ...answer, at: msgs[msgs.length - 1].at || answer.at };
      else msgs.push(answer);
      return { ...c, messages: msgs };
    }));
    // Конец: ответ — в историю один раз, целиком. flushSync — чтобы пузырь
    // LiveAnswer и сохранённый ответ сменили друг друга в одном кадре, без мигания
    const finish = (answerText, isError = false) => {
      clearTimeout(timer);
      removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', checkpoint);
      flushSync(() => putAnswer({ role: 'ai', text: answerText, at: Date.now(), ...(isError ? { error: true } : {}) }));
      liveSet({ chatId: null, text: "" });
    };
    // Страницу закрывают или сворачивают посреди ответа — сохраняем то, что
    // успело прийти, с пометкой. Допишется — заменим целым ответом
    const checkpoint = () => {
      if (document.visibilityState !== 'hidden' || !fullText) return;
      // flushSync: в историю (и в localStorage) — сразу, страница может закрыться в любой момент
      flushSync(() => putAnswer({ role: 'ai', text: fullText + '\n\n(ответ прервался, нажмите "повторить")', at: Date.now(), error: true, partial: true }));
    };
    addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', checkpoint);

    try {
      // История для модели: сообщения с ошибками в неё не берём
      const history = previousMessages
        .filter(m => !m.error && !m.action) // команды и ошибки модели не нужны
        .map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }],
        }));

      // На сайте — /api/chat, в приложении — полный адрес (см. src/native.js)
      const res = await fetch(API_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) {
        // Сервер присылает понятный текст ошибки, достаём его
        let serverMsg = '';
        try { serverMsg = (await res.json()).error; } catch {}
        const err = new Error('server');
        err.userMessage = serverMsg || `Ошибка сервера (${res.status})`;
        throw err;
      }

      // Читаем ответ кусками. Показываем пачками раз в STREAM_FLUSH_MS:
      // первый кусок — сразу, следующие собираются и выводятся вместе
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const show = () => { timer = 0; liveSet({ text: fullText }); };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        if (!fullText) continue;
        if (!live.text) show();
        else if (!timer) timer = setTimeout(show, STREAM_FLUSH_MS);
      }
      fullText += decoder.decode();

      if (!fullText.trim()) finish('Пустой ответ. Нажмите "повторить".', true);
      else finish(fullText);
    } catch (error) {
      if (fullText) {
        // Ответ оборвался посередине: оставляем то, что успело прийти
        finish(fullText + '\n\n(ответ оборвался, нажмите "повторить")', true);
      } else {
        finish(error.userMessage || 'Ошибка соединения с сервером.', true);
      }
    }
  };

  // Добавить сообщение в конец чата / поменять сообщение по id
  const pushMsg = (chatId, msg) => setChats(prev => prev.map(c =>
    c.id === chatId ? { ...c, messages: [...c.messages, { at: Date.now(), ...msg }] } : c));
  const patchMsg = (chatId, id, patch) => setChats(prev => prev.map(c =>
    c.id === chatId ? { ...c, messages: c.messages.map(m => (m.id === id ? { ...m, ...patch } : m)) } : c));

  /* Выполнить команду и ответить от имени ассистента.
     Ответ — обычное сообщение ИИ с пометкой action: true (такие не уходят
     на сервер), actionLabel — подпись на плашке, undo — как отменить.
     ВАЖНО: всё до первого await выполняется сразу по нажатию — поэтому
     окно выбора файлов браузер откроет без вопросов */
  const runCommand = async (chatId, { action, params }) => {
    const id = `a${Date.now()}`;
    const say = (text, extra) => pushMsg(chatId, { role: 'ai', text, action: true, id, ...extra });
    if (action === "theme") {
      const prev = readTheme();
      const next = params.mode === "toggle" ? (prev === "dark" ? "light" : "dark") : params.mode;
      const label = next === "dark" ? "Тёмная тема" : "Светлая тема";
      if (next === prev) return say(`Тема уже ${next === "dark" ? "тёмная" : "светлая"} — оставляю как есть`, { actionLabel: label });
      switchTheme(next);
      return say(`Готово, включил ${next === "dark" ? "тёмную" : "светлую"} тему`, { actionLabel: label, undo: { kind: "theme", prev } });
    }
    if (action === "navigate") {
      say(TAB_REPLIES[params.tab], { actionLabel: `Переход: ${TAB_TITLES[params.tab]}`, undo: { kind: "nav" } });
      setPendingNavId(id);
      clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => { navTimer.current = null; setPendingNavId(null); setTab?.(params.tab); }, NAV_DELAY);
      return;
    }
    if (action === "summary") {
      setCmdBusy(true); // пока собираем погоду — «печатает»
      const text = await buildTodaySummary();
      setCmdBusy(false);
      return say(text, { actionLabel: "Сводка на сегодня" });
    }
    if (action === "devices") return say(buildDevicesSummary(devices), { actionLabel: "Устройства" });
    if (action === "addDevice") {
      onAddDevice?.();
      return say("Открываю добавление устройства — выберите тип, и я найду его рядом", { actionLabel: "Добавление устройства" });
    }
    if (action === "upload") {
      onUploadFiles?.();
      return say("Выберите файлы — они попадут в «Хранилище», и я открою раздел «Файлы»", { actionLabel: "Загрузка файлов" });
    }
    if (action === "help") return say(ASSISTANT_HELP, { actionLabel: "Команды NEXA" });
  };

  // «Отменить» на плашке: тема — вернуть прежнюю, переход — не переходить
  const undoAction = (chatId, msg) => {
    if (msg.undo?.kind === "theme") switchTheme(msg.undo.prev);
    if (msg.undo?.kind === "nav") { clearTimeout(navTimer.current); navTimer.current = null; setPendingNavId(null); }
    patchMsg(chatId, msg.id, { undone: true });
  };

  // Отправка сообщения: из поля ввода или по нажатию на подсказку
  const sendMessage = async (preset) => {
    const text = (typeof preset === "string" ? preset : input).trim();
    if (!text || isLoading) return;

    // Сначала проверяем, не команда ли это
    const cmd = parseCommand(text);
    if (isEmpty) rememberInputPos();
    // at — когда написано (мс): по нему история делится на «Сегодня», «Вчера»…
    const userMsg = { role: 'user', text, at: Date.now(), ...(cmd ? { action: true } : {}) };
    const before = currentChat?.messages || [];
    let chatId = currentChatId;

    if (!chatId) {
      chatId = newId(); // uuid — такой же id будет у диалога в облаке
      setChats(prev => [{
        id: chatId,
        title: text.length > 40 ? text.slice(0, 40) + '…' : text,
        messages: [userMsg],
        createdAt: Date.now(),
      }, ...prev]);
      setCurrentChatId(chatId);
    } else {
      setChats(prev => prev.map(c =>
        c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c
      ));
    }

    setInput('');
    if (cmd) await runCommand(chatId, cmd);
    else await streamAnswer(chatId, before, text);
  };

  // ПОВТОРИТЬ: удаляет последний ответ и запрашивает новый на тот же вопрос
  const regenerate = () => {
    if (isLoading || !currentChatId) return;

    // Ищем последний вопрос пользователя
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const questionText = messages[lastUserIdx].text;
    const previous = messages.slice(0, lastUserIdx);

    // Оставляем чат до вопроса включительно, старый ответ убираем
    setChats(prev => prev.map(c =>
      c.id === currentChatId ? { ...c, messages: messages.slice(0, lastUserIdx + 1) } : c
    ));
    streamAnswer(currentChatId, previous, questionText);
  };

  // РЕДАКТИРОВАНИЕ: заменяет сообщение пользователя, всё, что было после него, удаляется,
  // и ответ генерируется заново
  const editMessage = (index, newText) => {
    if (isLoading || !currentChatId) return;

    const previous = messages.slice(0, index);
    const cmd = parseCommand(newText);
    setChats(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      return {
        ...c,
        // Если правим самое первое сообщение, обновляем и название чата в истории
        title: index === 0
          ? (newText.length > 40 ? newText.slice(0, 40) + '…' : newText)
          : c.title,
        messages: [...previous, { role: 'user', text: newText, at: Date.now(), ...(cmd ? { action: true } : {}) }],
      };
    }));
    if (cmd) runCommand(currentChatId, cmd);
    else streamAnswer(currentChatId, previous, newText);
  };
  
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };


 const titleOnly = (
  <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", position: "relative", zIndex: 2 }}>
    {/* Гамбургер — виден только на мобильном */}
    <button
      className="ng-hamburger"
      onClick={() => setIsHistoryOpen(true)}
      style={{
        background: "transparent", border: "none",
        cursor: "pointer", padding: 4, display: "none",
        alignItems: "center", justifyContent: "center",
      }}
      aria-label="История диалогов"
      aria-expanded={isHistoryOpen}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={C.text} strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      </svg>
    </button>
    <div style={{ textAlign: "left", minWidth: 0 }}>
      {/* На телефоне — одна строка без переноса: название и маленькая версия рядом */}
      <div className="ng-display nx-assistant-title" style={{ fontSize: 40, fontWeight: 600, textAlign: "left" }}>
        ИИ — Ассистент<span className="nx-assistant-ver"> v{VERSION}</span>
      </div>
      {/* Описание — только на компьютере */}
       <div className="nx-assistant-subtitle" style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: "left" }}>
        Интеллектуальный центр системы NEXA · v{VERSION}
      </div>
    </div>
  </div>
);

const menuBlock = (
  // Справа сверху (только компьютер): время, уведомления, профиль.
  // «Новый диалог» и поиск — в колонке истории слева
  <div className="ng-menu-block" style={{
    position: "fixed",
    top: 24,
    right: 40,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    alignItems: "flex-end",
  }}>
    {/* Верхняя строка: время/дата + иконка профиля */}
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      marginBottom: 8,
    }}>
      <TimeDate />
      {bell}
      <IconBtn icon={Icon.user} />
    </div>
  </div>
);

    const inputRow = (
  <div className="nx-input-ring" style={{
    width: "100%", maxWidth: 820,
    padding: 1,
    // 25 = половина высоты однострочного поля: одна строка — «таблетка»,
    // несколько строк — прямоугольник со скруглёнными углами
    borderRadius: 25,
    // Градиент симметричный (синий, мятный, синий), чтобы при движении не было шва
    background: `linear-gradient(90deg, ${C.blue}, ${C.mint}, ${C.blue})`,
    backgroundSize: "200% 100%",
    // Пока ассистент отвечает, граница плавно перетекает
    animation: isLoading ? "nx-border-flow 2.4s linear infinite" : "none",
    boxShadow: "var(--input-glow)",
  }}>
            <div
        onClick={() => document.querySelector('.ng-input-field')?.focus()}
        style={{
          // flex-end: кнопка отправки остаётся внизу, когда текст в несколько строк
          width: "100%", display: "flex", alignItems: "flex-end", gap: 10,
          padding: "8px 8px 8px 18px", borderRadius: 24,
          background: C.bg, boxSizing: "border-box",
          cursor: "text",
        }}
      >
        {/* Многострочное поле: длинный текст переносится, Enter — отправить,
            Shift+Enter — новая строка */}
        <textarea
          ref={taRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Написать сообщение..."
          className="ng-input-field"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          name="nexa-message-nofill"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.text,
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: "inherit",
            resize: "none",
            // border-box: высота поля = высота текста вместе с отступами (как scrollHeight)
            boxSizing: "border-box",
            padding: "6px 0",
            margin: 0,
            minWidth: 0,
            maxHeight: 168,
            overflowY: "hidden",
            overflowWrap: "anywhere",
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          className="ng-input-send"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: (isLoading || !input.trim()) ? C.chip : C.mint,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: (isLoading || !input.trim()) ? "default" : "pointer",
            transition: "background 140ms ease",
            flexShrink: 0,
          }}
        >
          {Icon.up({ c: (isLoading || !input.trim()) ? C.muted : C.onAccent, s: 15 })}
        </button>
      </div>
    </div>
  );
    const disclaimer = (
  <div className="ng-disclaimer" style={{ fontSize: 11, color: C.mutedSoft, textAlign: "center", whiteSpace: "nowrap" }}>
    ИИ может допускать ошибки.
  </div>
);

  // ─── ПАНЕЛЬ ИСТОРИИ (см. ChatHistory) ─────────────────────
  const historyPanel = (
    <ChatHistory
      chats={chats}
      setChats={setChats}
      currentChatId={currentChatId}
      mobile={mobile}
      open={isHistoryOpen}
      onClose={() => setIsHistoryOpen(false)}
      onOpen={(id) => { openChat(id); setIsHistoryOpen(false); }}
      onNew={() => { newChat(); setIsHistoryOpen(false); }}
      onDelete={deleteChat}
      account={account}
      sync={sync}
      onSettings={() => { setIsHistoryOpen(false); setTab?.("settings"); }}
    />
  );

  const wrapperStyle = {
    // Высота и сдвиг — по видимой области экрана (см. эффект с visualViewport),
    // чтобы при открытой клавиатуре экран не уезжал вверх
    position: "fixed",
    top: "var(--vvt, 0px)", left: 79, right: 0, height: "var(--vvh, 100%)",
    background: C.bg, zIndex: 5, overflow: "hidden",
    display: "flex", flexDirection: "column",
  };

  const innerStyle = {
  position: "relative", zIndex: 1, // над спектральным фоном
  flex: 1, display: "flex", flexDirection: "row",
  width: "100%", maxWidth: 1440, margin: "0 auto",
  padding: "66px 40px 20px 40px",
  overflow: "hidden",
  boxSizing: "border-box", minHeight: 0,
};
  return (
  <div className="ng-assistant-wrapper ng-assistant-anim" style={wrapperStyle}>
    {/* Спектральный фон — под всем содержимым, нажатия и прокрутку не перехватывает */}
    <AssistantSpectrum busyRef={cmdBusyRef} />
    {menuBlock}

    <div className="ng-assistant-inner" style={innerStyle}>
      {/* История — слева: на компьютере колонкой, на телефоне шторкой поверх */}
      {historyPanel}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0,
      }}>
        {titleOnly}

         {isEmpty ? (
          // Новый диалог: приветствие, поле ввода и подсказки — по центру
          // На телефоне (см. .nx-empty-col в стилях): поле ввода внизу,
          // над ним компактные подсказки, приветствие — по центру свободного места
          <div ref={emptyColRef} className="nx-empty-col" style={{
            flex: 1, minHeight: 0, padding: "0 16px", position: "relative",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
          }}>
            {/* Аура: складка из граней позади; при наборе текста приближается */}
            <AssistantAura active={inputFocused || !!input.trim()} />
            <div
              className="ng-greeting nx-greeting-anim nx-empty-greet"
              style={{ position: "relative", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {greeting}
            </div>
            <div ref={inputDockRef} className="nx-dock" style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
              {inputRow}
            </div>
            {/* Подсказки-команды: нажатие отправляет текст как сообщение.
                На телефоне листаются вбок */}
            <div className="nx-chips nx-no-scrollbar nx-stagger" style={{
              position: "relative", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 820,
            }}>
              {assistantSuggestions().map((sg) => (
                <button key={sg.text} type="button" className="nx-ghost-btn" onClick={() => sendMessage(sg.text)} style={{
                  ...btnReset, display: "flex", alignItems: "center", gap: 7, flexShrink: 0, whiteSpace: "nowrap",
                  border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, color: C.text,
                  background: `color-mix(in srgb, ${C.bg} 70%, transparent)`,
                }}>
                  {sg.icon({ c: C.mint, s: 14 })} {sg.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Сообщения сверху. Обёртка нужна для ауры за ответом:
                аура лежит под списком и не прокручивается вместе с ним */}
            <div className="nx-chat-area" style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginTop: 24, marginBottom: 16 }}>
            {replyAura && <ReplyAura key={replyAura.id} fading={replyAura.fading} posRef={replyAuraPos} />}
            <div
              ref={listRef}
              className="nx-scroll nx-msg-list"
              style={{
                flex: 1,
                overflowY: "auto",
                overscrollBehavior: "contain", // прокрутка списка не тянет за собой страницу
                minHeight: 0,
                paddingLeft: 8,
                paddingRight: 8,
                position: "relative", zIndex: 1,
              }}
            >
              <div className="nx-msg-col" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 10 }}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    role={m.role}
                    text={m.text}
                    error={m.error}
                    actionLabel={m.action && m.role === 'ai' ? m.actionLabel : null}
                    undone={m.undone}
                    // «Отменить»: тему можно вернуть всегда, переход — пока он ещё не случился
                    undoable={!!m.undo && !m.undone && (m.undo.kind === "theme" || pendingNavId === m.id)}
                    onUndo={() => undoAction(currentChatId, m)}
                    isLastAi={m.role === 'ai' && i === messages.length - 1 && !m.action}
                    disabled={isLoading}
                    onRegenerate={regenerate}
                    onEdit={(newText) => editMessage(i, newText)}
                  />
                ))}
                {cmdBusy && messages[messages.length - 1]?.role !== 'ai' && <AssistantSkeleton />}
                {/* Ответ, который сейчас печатается (только в своём диалоге) */}
                {streamingHere && <LiveAnswer onGrow={() => { scrollToBottom(); if (replyAura) placeReplyAura(); }} />}
                <div ref={bottomRef} />
              </div>
            </div>
            </div>

            {/* Поле ввода + дисклеймер (дисклеймер только в чате).
                На телефоне — закреплённая область с переходом в переписку (.nx-chat-dock) */}
            <div ref={inputDockRef} className="nx-chat-dock" style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              paddingBottom: 8,
            }}>
              {inputRow}
              {disclaimer}
            </div>
           </>
        )}
      </div>
    </div>
  </div>
  );
}

// Мини-парсер выделений: **жирный**, *курсив*, `код`.
function renderRich(text) {
  if (typeof text !== 'string') return text;
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Обычный текст до совпадения
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: C.textStrong }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} style={{
          fontFamily: "'Space Grotesk', monospace",
          background: "color-mix(in srgb, var(--mint) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--mint) 25%, transparent)",
          borderRadius: 6,
          padding: "1px 6px",
          fontSize: "0.92em",
          color: C.mint,
        }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++} style={{ fontStyle: "italic", color: C.textSoft }}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Обёртка — просто вызывает парсер и вставляет результат.
function RichText({ children }) {
  return <>{renderRich(children)}</>;
}

// Маленькая кнопка под сообщением (копировать, повторить, править)
function ActionBtn({ title, onClick, disabled, children }) {
  return (
    <button
      className="nx-action"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 4,
        border: "1px solid transparent", background: "transparent",
        color: C.muted, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
        transition: "color 140ms ease, background 140ms ease, border-color 140ms ease",
      }}
    >
      {children}
    </button>
  );
}

// ─── ПУЗЫРЬ СООБЩЕНИЯ ─────────────────────────────────────
// isLastAi: это последний ответ ИИ (под ним есть кнопка "повторить")
// disabled: пока идёт генерация, кнопки редактирования и повтора неактивны
// error — ответ не получен (нет сети, ошибка сервера): пузырь в цветах ошибки
// actionLabel — ответ на команду: под пузырём плашка с галочкой и названием действия;
// undoable / undone / onUndo — кнопка «Отменить» на плашке и её состояние
function MessageBubble({ role, text, error, actionLabel, undoable, undone, onUndo, isLastAi, disabled, onRegenerate, onEdit }) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);       // показываем галочку после копирования
  const [isEditing, setIsEditing] = useState(false); // включён ли режим редактирования
  const [draft, setDraft] = useState(text);          // текст в поле редактирования

  // Копируем текст без звёздочек выделения
    const handleCopy = async () => {
    const clean = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(clean);
      } else {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const startEdit = () => { setDraft(text); setIsEditing(true); };
  const cancelEdit = () => setIsEditing(false);
  const saveEdit = () => {
    const clean = draft.trim();
    setIsEditing(false);
    if (clean && clean !== text) onEdit(clean);
  };

  const copyButton = (
    <ActionBtn title={copied ? "Скопировано" : "Копировать"} onClick={handleCopy}>
      {copied ? Icon.check({ c: C.mint, s: 15 }) : Icon.copy({ c: "currentColor", s: 15 })}
    </ActionBtn>
  );

  // ─── СООБЩЕНИЯ ПОЛЬЗОВАТЕЛЯ ────────────────────────────
  if (isUser) {
    return (
      <div className="nx-msg" style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: "100%",
      }}>
        {isEditing ? (
          <div style={{
            width: "72%", display: "flex", flexDirection: "column", gap: 8,
            padding: 12, borderRadius: 16, borderTopRightRadius: 4,
            border: `1px solid ${C.blue}`, background: C.panel, boxSizing: "border-box",
          }}>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === 'Escape') cancelEdit();
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              style={{
                width: "100%", resize: "none", boxSizing: "border-box",
                background: "transparent", border: "none", outline: "none",
                color: C.text, fontSize: 16, lineHeight: 1.55, fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={cancelEdit} style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
              }}>Отмена</button>
              <button onClick={saveEdit} disabled={!draft.trim()} style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: C.mint, border: "none", color: C.onAccent, fontWeight: 500,
                opacity: draft.trim() ? 1 : 0.4,
              }}>Отправить</button>
            </div>
          </div>
        ) : (
          <div className="nx-bubble-text nx-user-bubble" style={{
            maxWidth: "72%", padding: "12px 18px", borderRadius: 16, borderTopRightRadius: 4,
            background: C.blue, color: "#FFFFFF", fontSize: 16, lineHeight: 1.55,
            whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          }}>
            <RichText>{text}</RichText>
          </div>
        )}

        {!isEditing && (
          <div className="nx-actions" style={{ display: "flex", gap: 4 }}>
            {copyButton}
            <ActionBtn title="Редактировать" onClick={startEdit} disabled={disabled}>
              {Icon.edit({ c: "currentColor", s: 15 })}
            </ActionBtn>
          </div>
        )}
      </div>
    );
  }

  // ─── ОТВЕТЫ AI ─────────────────────────────────────────
  return (
    <div
      className={`nx-msg${isLastAi ? ' nx-last' : ''}`}
      style={{ display: "flex", justifyContent: "flex-start", width: "100%", gap: 12 }}
    >
      {/* Аватарка с иконкой-искрой */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.blueDark}, ${C.mintDark})`,
        border: `1px solid color-mix(in srgb, ${C.mint} 27%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 4,
      }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
      </div>

            <div className="nx-ai-col" style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "72%" }}>
        <div style={{
          fontSize: 12, letterSpacing: "0.12em", color: C.mint, opacity: 0.85,
          paddingLeft: 4, textTransform: "uppercase", fontWeight: 500,
          textAlign: "left", alignSelf: "flex-start",
          ...(error ? { color: C.red, display: "flex", alignItems: "center", gap: 6 } : {}),
        }}>
          {error ? <>{Icon.alert({ c: C.red, s: 14 })} Ответ не получен</> : "NEXA Assistant"}
        </div>

        <div className="nx-bubble-text" style={{
          padding: "14px 18px", borderRadius: 16, borderTopLeftRadius: 4,
          background: error
            ? `color-mix(in srgb, ${C.red} 7%, ${C.panel})`
            : `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`,
          border: `1px solid ${error ? `color-mix(in srgb, ${C.red} 40%, transparent)` : C.border}`,
          color: C.textSoft, fontSize: 16, lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          position: "relative", overflow: "hidden",
        }}>
          {/* Тонкая цветная полоска слева внутри пузыря (у ошибки — красная) */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: error ? C.red : `linear-gradient(180deg, ${C.blue}, ${C.mint})`, opacity: 0.85,
          }} />
          <div style={{ paddingLeft: 8 }}>
            <RichText>{text}</RichText>
          </div>
        </div>

        {/* Плашка-подтверждение команды: тонкая обводка, галочка, действие */}
        {actionLabel && (
          <div className="nx-pop" style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8,
            border: `1px solid ${undone ? C.border : `color-mix(in srgb, ${C.mint} 45%, transparent)`}`,
            borderRadius: 4, padding: "5px 10px", fontSize: 12, color: undone ? C.mutedSoft : C.text,
          }}>
            {undone ? Icon.refresh({ c: C.mutedSoft, s: 13 }) : Icon.check({ c: C.mint, s: 13 })}
            <span style={{ textDecoration: undone ? "line-through" : "none" }}>{actionLabel}</span>
            {undone && <span>· отменено</span>}
            {undoable && (
              <button type="button" className="nx-link-btn" onClick={onUndo} style={{
                ...btnReset, fontSize: 12, color: C.muted, marginLeft: 4,
                borderLeft: `1px solid ${C.border}`, paddingLeft: 8,
              }}>
                Отменить
              </button>
            )}
          </div>
        )}

        {/* Кнопки под ответом: копировать, а у последнего ответа ещё и повторить */}
        <div className="nx-actions" style={{ display: "flex", gap: 4, paddingLeft: 2 }}>
          {copyButton}
          {isLastAi && (
            <ActionBtn title="Повторить ответ" onClick={onRegenerate} disabled={disabled}>
              {Icon.refresh({ c: "currentColor", s: 15 })}
            </ActionBtn>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── СКЕЛЕТОН ОТВЕТА АССИСТЕНТА ─────────────────────────────
// Показывается, пока не пришёл первый символ ответа.
// Повторяет структуру настоящего ответа (аватарка, подпись, пузырь),
// поэтому при появлении текста ничего не «прыгает» на экране.
function AssistantSkeleton() {
  return (
    <div className="nx-msg" style={{ display: "flex", justifyContent: "flex-start", width: "100%", gap: 12 }}>
      {/* Аватарка — та же, что у настоящего ответа, чтобы переход был незаметным */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.blueDark}, ${C.mintDark})`,
        border: `1px solid color-mix(in srgb, ${C.mint} 27%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 4,
      }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
      </div>

      <div className="nx-ai-col" style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "72%" }}>
        <div style={{
          fontSize: 12, letterSpacing: "0.12em", color: C.mint, opacity: 0.85,
          paddingLeft: 4, textTransform: "uppercase", fontWeight: 500,
          textAlign: "left", alignSelf: "flex-start",
        }}>
          NEXA Assistant
        </div>

        {/* Пузырь по форме как настоящий, только вместо текста — серые полоски */}
        <div className="nx-bubble-text" style={{
          padding: "14px 18px", borderRadius: 16, borderTopLeftRadius: 4,
          background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`,
          border: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
          minWidth: 220, boxSizing: "border-box",
        }}>
          {/* Тонкая цветная полоска слева — как в настоящем пузыре */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: `linear-gradient(180deg, ${C.blue}, ${C.mint})`, opacity: 0.85,
          }} />
          <div style={{ paddingLeft: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            <SkeletonLine width="100%" />
            <SkeletonLine width="88%" />
            <SkeletonLine width="58%" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Одна серая полоска внутри скелетона.
// Пульсирует только прозрачностью — минимум движения.
function SkeletonLine({ width }) {
  return (
    <div style={{
      height: 12,
      width,
      borderRadius: 4,
      background: C.chip,
      animation: "nx-skeleton-pulse 1.4s ease-in-out infinite",
    }} />
  );
}
// Переключатель вкл/выкл.
// on — включён сейчас или нет (true/false)
// onClick — функция, которая сработает при клике
function Toggle({ on, onClick }) {
  return (
    <div
      onClick={onClick}          // при клике вызываем переданную функцию
      role="switch" aria-checked={on}
      style={{
        width: 42, height: 24, borderRadius: 999, padding: 3, boxSizing: "border-box",
        // включён: градиент, выключен: нейтральный фон
        background: on ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : C.chip,
        cursor: "pointer", flexShrink: 0,
        transition: "background 200ms ease",
      }}
    >
      {/* Кружок сдвигается на 18px вправо, когда переключатель включён */}
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: C.onFold,
        transform: on ? "translateX(18px)" : "translateX(0)",
        // Пружинистая кривая: кружок чуть проскакивает и встаёт на место
        transition: "transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }} />
    </div>
  );
}
function SectionTitle({ children }) {
  return (
    <div
      className="ng-display nx-section-title"
      style={{
        fontSize: 22,
        fontWeight: 600,
        color: C.text,
        marginBottom: 14,
        marginTop: 0,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}
// Одна строка настроек. Все строки экрана собраны из неё, поэтому у них
// одинаковые отступы, размер иконки и шрифты.
// icon: иконка слева (в квадрате 40x40), title и subtitle: текст,
// right: что стоит справа (переключатель, стрелка), wrap: на телефоне
// правая часть переносится под текст на всю ширину.
/* ═══ УСТАНОВКА ПРИЛОЖЕНИЯ ═══════════════════════════════════
   Телефон с Android — кнопка «Скачать приложение» (файл /nexa.apk),
   iPhone/iPad — как добавить сайт на экран «Домой»,
   компьютер — QR-код, чтобы открыть сайт на телефоне.
   Внутри приложения и в уже установленной версии ничего не показываем */

// QR-код: свой рисунок из клеток. Светлая подложка нужна всегда —
// камеры телефонов плохо читают «перевёрнутый» светлый код на тёмном
function QrCode({ text, size = 120, radius = 10, label = "QR-код: адрес сайта NEXA" }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, d = qr.modules.data, pad = 2;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x + pad} ${y + pad}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + pad * 2} ${n + pad * 2}`} width={size} height={size} role="img" aria-label={label} data-no-swipe
      shapeRendering="crispEdges" style={{ display: "block", borderRadius: radius }}>
      <rect width="100%" height="100%" style={{ fill: C.onFold }} />
      <path d={path} style={{ fill: C.foldDeep }} />
    </svg>
  );
}

// Три коротких шага с номерами в квадратиках
function InstallSteps({ steps }) {
  return (
    <ol style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
      {steps.map((st, i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, lineHeight: 1.35 }}>
          <span style={{
            width: 18, height: 18, flexShrink: 0, borderRadius: 4, border: `1px solid ${C.borderStrong}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.text,
          }}>{i + 1}</span>
          <span>{st}</span>
        </li>
      ))}
    </ol>
  );
}

/* Обновление для тех, кто скачал APK с сайта.
   Сайт не видит, установлено ли приложение, поэтому запоминаем в браузере,
   какую версию человек скачал. Если на сайте (version.json) версия новее —
   на Главной показываем баннер «Обновить», даже если баннер установки закрыли */
const INSTALL_DISMISS_KEY = "nexa-install-dismissed"; // баннер установки закрыли крестиком
const APK_DOWNLOADED_KEY = "nexa-apk-downloaded"; // версия последнего скачанного APK
const rememberApkDownload = (version) => { try { localStorage.setItem(APK_DOWNLOADED_KEY, version); } catch {} };
// "0.5.6" → 506, как versionCode в Android-сборке
const versionCode = (v) => { const [a = 0, b = 0, c = 0] = String(v).split(".").map((x) => parseInt(x, 10) || 0); return a * 10000 + b * 100 + c; };

// Есть ли на сайте APK новее скачанного. Возвращает { version } или null
function useSiteApkUpdate(enabled) {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let had = null;
    try { had = localStorage.getItem(APK_DOWNLOADED_KEY); } catch {}
    if (!had) return; // APK с этого браузера не качали — предлагать нечего
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (v && Number(v.versionCode) > versionCode(had)) setUpdate({ version: v.version }); })
      .catch(() => {});
  }, [enabled]);
  return update;
}

// Кнопка скачивания — обычная ссылка с атрибутом download
// version — какую версию качаем (по умолчанию — версия сайта);
// onDownload — что сделать после нажатия (например, спрятать баннер)
function ApkButton({ label = "Скачать приложение", small, version = VERSION, onDownload }) {
  return (
    <a href={APK_URL} download="NEXA.apk" className="nx-primary"
      onClick={() => { rememberApkDownload(version); onDownload?.(); }}
      style={{
      display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap",
      padding: small ? "7px 14px" : "9px 18px", fontSize: small ? 12.5 : 13.5, fontWeight: 500, borderRadius: 999,
      color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
    }}>
      {Icon.download({ c: C.onFold, s: small ? 14 : 16 })} {label}
    </a>
  );
}

// Шаги для iPhone/iPad — вторая строка с нашей иконкой «Поделиться»
const IOS_STEPS = [
  "Откройте этот сайт в Safari",
  <>Нажмите «Поделиться» <span style={{ display: "inline-flex", verticalAlign: "-3px", marginLeft: 2 }}>{Icon.shareUp({ c: C.mint, s: 16 })}</span></>,
  "Выберите «На экран Домой»",
];
const ANDROID_STEPS = ["Скачайте файл NEXA.apk", "Откройте его из уведомления или папки «Загрузки»", "Разрешите установку из этого источника"];

// Группа «Приложение» в Настройках
function InstallSettings() {
  const platform = installPlatform();
  if (platform === "installed") return null;
  return (
    <>
      <SectionTitle>Приложение</SectionTitle>
      <div id="nx-install">
      <SettingsGroup>
        {platform === "android" && (
          <>
            <SettingsRow wrap icon={Icon.phone({ c: C.mint, s: 18 })} title="NEXA на телефоне"
              subtitle="Около 7 МБ, без магазина приложений" right={<ApkButton />} />
            <SettingsRow last icon={Icon.list({ c: C.muted, s: 18 })} title="Как установить" subtitle={<InstallSteps steps={ANDROID_STEPS} />} />
          </>
        )}
        {platform === "ios" && (
          <>
            <SettingsRow icon={Icon.phone({ c: C.mint, s: 18 })} title="NEXA на экране «Домой»"
              subtitle="Откроется как приложение — на весь экран, без адресной строки" />
            <SettingsRow last icon={Icon.list({ c: C.muted, s: 18 })} title="Как добавить" subtitle={<InstallSteps steps={IOS_STEPS} />} />
          </>
        )}
        {platform === "desktop" && (
          <SettingsRow last wrap icon={Icon.phone({ c: C.mint, s: 18 })} title="Приложение для телефона"
            subtitle="Откройте сайт на телефоне, чтобы установить приложение. Наведите камеру на код"
            right={<QrCode text={window.location.origin + "/"} size={112} />} />
        )}
      </SettingsGroup>
      </div>
    </>
  );
}

/* Тонкий баннер на Главной: значок, заголовок с подписью, действие и крестик.
   Закрыли — плашка «складывается» и место под ней схлопывается
   (см. .nx-banner-wrap в стилях), после чего вызывается onClosed.
   Без onClose и onClosed крестика нет — баннер закрыть нельзя.
   label — подпись для экранного диктора */
function SlimBanner({ label, icon, title, sub, action, onClose, onClosed }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    onClose?.();
    // Без движения (так в системе) — убираем сразу
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) onClosed?.();
    else setClosing(true);
  };
  return (
    // Обёртка схлопывается по высоте — содержимое ниже плавно подтягивается вверх
    <div className={closing ? "nx-banner-wrap is-closing" : "nx-banner-wrap"}
      onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClosed?.(); }}>
    <div className="nx-pop nx-banner" role="region" aria-label={label} style={{
      display: "flex", alignItems: "center", gap: 10, padding: onClose || onClosed ? "10px 8px 10px 12px" : "10px 12px",
      border: `1px solid ${C.borderStrong}`, borderRadius: 14, background: C.bg,
    }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.25 }}>{sub}</div>
      </div>
      {action}
      {(onClose || onClosed) && (
        <button type="button" className="nx-icon-btn" onClick={close} aria-label="Скрыть" style={{
          ...btnReset, width: 30, height: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.muted, s: 15 })}
        </button>
      )}
    </div>
    </div>
  );
}

/* Баннер наверху Главной (только на телефоне, только в браузере).
   - Уже качали APK, а на сайте версия новее — «Вышла NEXA … · Обновить».
   - Ещё не качали — «Приложение NEXA · Быстрее и удобнее, чем в браузере».
     Нажали «Скачать» — баннер уходит; закрыли крестиком — больше не показываем.
   - Качали последнюю версию — ничего.
   onHowTo — для iPhone: перейти к инструкции в Настройках */
function InstallBanner({ onHowTo }) {
  const platform = installPlatform();
  const siteUpdate = useSiteApkUpdate(platform === "android");
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === "1" || (platform === "android" && !!localStorage.getItem(APK_DOWNLOADED_KEY)); } catch { return false; }
  });
  if (siteUpdate) return <SiteUpdateBanner update={siteUpdate} />;
  if (hidden || (platform !== "android" && platform !== "ios")) return null;
  return (
    <SlimBanner
      label="Установка приложения"
      icon={Icon.phone({ c: C.mint, s: 18 })}
      title="Приложение NEXA"
      sub={platform === "ios" ? "Удобнее с экрана «Домой»" : "Быстрее и удобнее, чем в браузере"}
      action={platform === "android" ? <ApkButton label="Скачать" small onDownload={() => setTimeout(() => setHidden(true), 1200)} /> : (
        <button type="button" className="nx-ghost-btn" onClick={onHowTo} style={{
          ...btnReset, flexShrink: 0, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "7px 14px", fontSize: 12.5,
        }}>
          Как?
        </button>
      )}
      onClose={() => { try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch {} }}
      onClosed={() => setHidden(true)}
    />
  );
}

/* Баннер «Вышла новая версия» на сайте — для тех, кто раньше скачал APK.
   «Обновить» скачивает новый файл; закрыли — не показываем до следующей версии */
function SiteUpdateBanner({ update }) {
  const [hiddenFor, setHiddenFor] = useState(() => {
    try { return localStorage.getItem(UPDATE_DISMISS_KEY); } catch { return null; }
  });
  const [started, setStarted] = useState(false);
  if (hiddenFor === update.version) return null;
  return (
    <SlimBanner
      key={update.version}
      label="Обновление приложения"
      icon={Icon.refresh({ c: C.mint, s: 18 })}
      title={`Вышла NEXA ${update.version}`}
      sub={started ? "Откройте скачанный файл — обновится поверх" : "Скачайте и установите поверх, данные сохранятся"}
      action={<ApkButton label="Обновить" small version={update.version} onDownload={() => setStarted(true)} />}
      onClose={() => { try { localStorage.setItem(UPDATE_DISMISS_KEY, update.version); } catch {} }}
      onClosed={() => setHiddenFor(update.version)}
    />
  );
}

/* Баннер «Доступна новая версия» — только в Android-приложении.
   update = { version, url, required } (см. checkForUpdate в src/native.js) или null.
   Приложение работает, но баннер закрыть нельзя — мягко подталкиваем обновиться.
   Если версия совсем старая (required), вместо него — ForceUpdateScreen */
const UPDATE_DISMISS_KEY = "nexa-update-dismissed"; // сайт: какую версию уже скрыли
function UpdateBanner({ update }) {
  const [started, setStarted] = useState(false); // нажали «Обновить» — файл скачивается
  if (!update) return null;
  return (
    <SlimBanner
      key={update.version}
      label="Обновление приложения"
      icon={Icon.refresh({ c: C.mint, s: 18 })}
      title={`Доступна NEXA ${update.version}`}
      sub={started ? "Скачивается — откройте файл, чтобы обновить" : "Эта версия скоро перестанет работать. Данные сохранятся"}
      action={
        <button type="button" className="nx-primary" onClick={() => { setStarted(true); openUpdate(update.url); }} style={{
          ...btnReset, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          padding: "7px 14px", fontSize: 12.5, fontWeight: 500, borderRadius: 999, border: "1px solid transparent",
          color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        }}>
          {Icon.download({ c: C.onFold, s: 14 })} Обновить
        </button>
      }
    />
  );
}

/* Экран «Обновите приложение» — только в Android-приложении.
   Показывается поверх всего, если версия приложения старше минимальной
   из version.json (update.required): интерфейс виден, но размыт и не нажимается.
   Закрыть нельзя — только скачать новую.
   Без интернета проверка не проходит, и старая версия открывается как обычно */
function ForceUpdateScreen({ update }) {
  const [started, setStarted] = useState(false); // нажали «Скачать» — файл скачивается
  return (
    <div className="nx-force-update" role="alertdialog" aria-modal="true" aria-label="Обновите приложение" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: `color-mix(in srgb, ${C.bg} 55%, transparent)`,
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "calc(var(--sat) + 24px) 28px calc(var(--sab) + 24px)",
    }}>
      <img src={foldSvg} alt="" style={{ width: 120, height: "auto", marginBottom: 28 }} />
      <div className="ng-display" style={{ fontSize: 26, lineHeight: 1.2, marginBottom: 10 }}>Обновите приложение</div>
      <div style={{ fontSize: 14.5, color: C.muted, maxWidth: 300, lineHeight: 1.5, marginBottom: 28 }}>
        {started
          ? "Скачивается — откройте файл, чтобы установить. Данные сохранятся."
          : `Эта версия NEXA больше не работает. Установите ${update.version} поверх — данные сохранятся.`}
      </div>
      <button type="button" className="nx-primary" onClick={() => { setStarted(true); openUpdate(update.url); }} style={{
        ...btnReset, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
        padding: "12px 22px", fontSize: 15, fontWeight: 500, borderRadius: 999, border: "1px solid transparent",
        color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
      }}>
        {Icon.download({ c: C.onFold, s: 16 })} {started ? "Скачать ещё раз" : "Обновить"}
      </button>
    </div>
  );
}

function SettingsRow({ icon, title, subtitle, right, last, wrap, onClick }) {
  return (
    <div
      className={wrap ? "nx-set-row nx-set-row-wrap" : "nx-set-row"}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="nx-set-main" style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        <div className="nx-set-icon" style={{
          width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div className="nx-set-title" style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.25 }}>{title}</div>
          {subtitle && (
            <div className="nx-set-sub" style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.3 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {right && <div className="nx-set-right" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{right}</div>}
    </div>
  );
}

// Рамка вокруг группы строк
function SettingsGroup({ children }) {
  return (
    // Фон страницы — карточка лежит на сетке-чертеже как плашка, линии не идут сквозь текст
    <div className="nx-set-group" style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 28, background: C.bg }}>
      {children}
    </div>
  );
}

/* ═══ АККАУНТЫ (Supabase) ═══════════════════════════════════
   Вход по коду из письма, без паролей. Клиент — src/lib/supabase.js,
   разрешённые почты — src/lib/allowedEmailDomains.js.
   Пока аккаунт ни к чему не привязан: устройства и чаты живут в браузере, как раньше. */
const GUEST_KEY = "nexa-guest";   // "1" — выбрали «Продолжить без аккаунта»
const CHATS_KEY = "nexa-chats";   // диалоги ассистента (у аккаунта — nexa-chats@id)
const MIGRATED_KEY = "nexa-chats-migrated"; // кому уже перенесли гостевые диалоги в облако (список id)
const loadChats = (key = CHATS_KEY) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; }
};
/* Перенос гостевых диалогов в облако при первом входе: в облаке пусто,
   а в браузере есть диалоги «без аккаунта» — копируем их (с новыми id) один раз.
   Гостевые при этом не удаляются */
function chatMigration(uid) {
  const done = () => { try { return JSON.parse(localStorage.getItem(MIGRATED_KEY) || "[]"); } catch { return []; } };
  return {
    // null — переносить нечего
    prepare: (local, cloudRows) => {
      if (!uid || cloudRows.length || done().includes(uid)) return null;
      const guest = loadChats(CHATS_KEY);
      if (!guest.length) return null;
      return [...local, ...guest.map((c) => ({ ...c, id: newId(), updatedAt: c.updatedAt || c.createdAt || Date.now() }))];
    },
    migrated: () => { try { localStorage.setItem(MIGRATED_KEY, JSON.stringify([...new Set([...done(), uid])])); } catch {} },
  };
}
const RESEND_SECONDS = 60;        // пауза перед повторной отправкой кода
const OTP_LIFETIME_MS = 60 * 60 * 1000; // сколько живёт код (как в настройках Supabase по умолчанию)
const CODE_MIN = 6, CODE_MAX = 8; // длина кода из письма

const readGuest = () => { try { return localStorage.getItem(GUEST_KEY) === "1"; } catch { return false; } };
const saveGuest = (on) => { try { on ? localStorage.setItem(GUEST_KEY, "1") : localStorage.removeItem(GUEST_KEY); } catch {} };

/* Кто вошёл. Supabase сам хранит сессию и сам сообщает о входе и выходе
   (onAuthStateChange; первое событие приходит сразу — сессия из прошлого раза).
   ready — Supabase уже ответил, можно решать, показывать ли экран входа */
// Сохранённый вход из прошлого раза — только чтобы при запуске сразу знать,
// чьи данные показывать (иначе на миг мелькнут демо-устройства). Только читаем:
// сессию хранит и обновляет сам Supabase, через миг он подтвердит её или сбросит
function storedSession() {
  if (!supabase) return null;
  try {
    const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token"));
    const s = k && JSON.parse(localStorage.getItem(k));
    return s?.user?.id ? s : null;
  } catch { return null; }
}

function useAuth() {
  const [session, setSession] = useState(storedSession);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user || null, ready };
}

// Выйти: только на этом устройстве. Сессия стирается даже без интернета
const signOut = () => supabase?.auth.signOut({ scope: "local" });

/* После выхода стираем из браузера копии данных аккаунта: устройства, файлы,
   чаты, входящие и служебные отметки синхронизации (ключи nexa-…@<id>).
   В облаке всё остаётся — при следующем входе вернётся. Иначе на общем
   компьютере следующий человек мог бы достать чужие чаты из памяти браузера.
   Правки, которые не успели уйти в облако без интернета, при этом пропадут */
function clearLocalAccountData(uid) {
  if (!uid) return;
  try {
    const mine = Object.keys(localStorage).filter((k) => k.startsWith("nexa-") && k.endsWith(`@${uid}`));
    mine.forEach((k) => localStorage.removeItem(k));
  } catch {}
  cacheClearScope(uid); // копии содержимого файлов (IndexedDB)
}

/* Понятный текст ошибки Supabase.
   step — где ошиблись: "send" (отправка кода) или "verify" (проверка кода).
   Неверный и просроченный код Supabase сообщает одинаково — различаем по времени:
   если с отправки прошло больше часа, код истёк */
function authErrorText(error, step, sentAt) {
  const code = error?.code || "";
  const msg = String(error?.message || "").toLowerCase();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // Серверная проверка почты (supabase/restrict-email-domains.sql) не пустила адрес:
  // Supabase отвечает ошибкой базы «Database error saving new user»
  if (step === "send" && (msg.includes("database error") || msg.includes("not allowed"))) {
    return DOMAIN_NOT_ALLOWED_MESSAGE;
  }
  // Запрос не дошёл до сервера вообще (у такой ошибки нет кода ответа, status 0).
  // Ошибки самого сервера Supabase приходят тем же типом, но с кодом 5xx — это не «нет интернета»
  const noAnswer = error?.name === "AuthRetryableFetchError" && !error?.status;
  if (offline || noAnswer || msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Нет интернета. Проверьте подключение и попробуйте ещё раз.";
  }
  if (error?.status === 429 || code.startsWith("over_") || msg.includes("rate limit") || msg.includes("security purposes")) {
    return "Слишком много попыток. Подождите пару минут и попробуйте снова.";
  }
  if (step === "verify" && (code === "otp_expired" || msg.includes("expired") || msg.includes("invalid"))) {
    return sentAt && Date.now() - sentAt > OTP_LIFETIME_MS
      ? "Код истёк. Запросите новый."
      : "Неверный код. Проверьте цифры в письме.";
  }
  if (code === "signup_disabled" || code === "otp_disabled" || code === "email_provider_disabled") {
    return "Вход по почте сейчас выключен. Попробуйте позже.";
  }
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

/* ═══ ПОТЯНИТЕ, ЧТОБЫ ОБНОВИТЬ (только в приложении) ════════════
   В браузере телефона это уже есть, а в приложении — нет. Тянем страницу
   вниз, когда она прокручена до самого верха: появляется значок, отпустили
   после порога — onRefresh (облако, погода, проверка обновления).
   Внутри окон, полей ввода и прокручиваемых блоков жест не срабатывает */
const PULL_THRESHOLD = 64; // столько пикселей нужно протянуть
function usePullToRefresh(enabled, onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const busyRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let startY = null, dist = 0;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    // Не мешаем: окна, поля ввода, ассистент — и внутренние блоки, которые сейчас
    // прокручены вниз по вертикали (тянуть надо их). Полоса дней листается вбок — не мешает
    const blocked = (t) => {
      if (t?.closest?.('[role="dialog"], .ng-assistant-wrapper, textarea, input, select, .nx-auth-gate')) return true;
      const sc = t?.closest?.(".nx-scroll");
      return !!sc && sc.scrollHeight > sc.clientHeight + 2 && sc.scrollTop > 0;
    };
    const onStart = (e) => {
      startY = null; dist = 0;
      if (busyRef.current || e.touches.length !== 1 || !atTop() || blocked(e.target)) return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || !atTop()) { if (dist) { dist = 0; setPull(0); } if (dy < 0) startY = null; return; }
      dist = Math.min(110, dy * 0.5); // тянется «туго» — вдвое медленнее пальца
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // страница не дёргается вместе с жестом
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      const go = dist >= PULL_THRESHOLD;
      dist = 0;
      if (!go) { setPull(0); return; }
      busyRef.current = true; setBusy(true); setPull(PULL_THRESHOLD);
      // Крутим значок хотя бы 0,9 с — чтобы было видно, что обновили
      try { await Promise.all([refresh.current?.(), new Promise((r) => setTimeout(r, 900))]); } catch {}
      busyRef.current = false; setBusy(false); setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);
  return { pull, busy };
}

// Значок над страницей: выезжает за пальцем, поворачивается, после порога — крутится
function PullIndicator({ pull, busy }) {
  if (!pull && !busy) return null;
  const ready = pull >= PULL_THRESHOLD;
  return (
    <div role="status" aria-live="polite" className="nx-pull" style={{
      position: "fixed", left: "50%", top: `calc(var(--sat) + ${pull - 28}px)`, zIndex: 400,
      transform: "translateX(-50%)", opacity: Math.min(1, pull / PULL_THRESHOLD),
      transition: busy || !pull ? "top 200ms ease, opacity 200ms ease" : "none",
      width: 40, height: 40, borderRadius: "50%", boxSizing: "border-box",
      border: `1px solid ${ready ? C.mint : C.borderStrong}`, background: C.panel,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span className="visually-hidden" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {busy ? "Обновляем" : ready ? "Отпустите, чтобы обновить" : "Потяните, чтобы обновить"}
      </span>
      {busy ? <Spinner s={16} />
        : <span className="nx-pull-icon" style={{ display: "flex", transform: `rotate(${pull * 3}deg)` }}>{Icon.refresh({ c: ready ? C.mint : C.muted, s: 17 })}</span>}
    </div>
  );
}

/* ═══ ВХОД ПО QR (как в Телеграме) ═══════════════════════════
   Новое устройство показывает QR и код (QrLoginView), вошедшее подтверждает
   (ApproveLoginModal). Сервер — api/qr-login.js, таблица — supabase/qr-login.sql */
const QR_LOGIN_URL = `${API_BASE}/api/qr-login`;
const QR_LOGIN_TTL_MS = 2 * 60 * 1000;
const QR_POLL_MS = 2000;                  // как часто новое устройство спрашивает «разрешили?»
const APPROVE_LOCK_KEY = "nexa-approve-lock"; // 5 неверных кодов — пауза на минуту
// Адрес для QR входа: открывает NEXA с ?login=КОД
const loginUrl = (code) => `${isNative ? "https://nexa-link.ru" : location.origin}/?login=${code}`;

// Запрос к серверу входа по QR. token — ключ входа (для подтверждения)
async function qrApi(action, body = {}, token) {
  const res = await fetch(QR_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...body }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

// Код по клеткам — как на экране «Подключить устройство»
function CodeCells({ code = "", dim }) {
  return (
    <div aria-label="Код" style={{ display: "flex", gap: 5, userSelect: "all" }}>
      {code.split("").map((ch, i) => (
        <span key={i} style={{
          width: 34, height: 46, flexShrink: 0, boxSizing: "border-box",
          border: `1px solid ${dim ? C.border : C.borderStrong}`, borderRadius: 4,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: fontDisplay, fontSize: 22, color: dim ? C.mutedSoft : C.text,
          background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`,
        }}>{ch}</span>
      ))}
    </div>
  );
}

/* Новое устройство: QR и код, ждём подтверждения с вошедшего.
   onBack — вернуться ко входу по почте */
function QrLoginView({ onBack }) {
  const [st, setSt] = useState({ phase: "loading" }); // loading | show | expired | signing | error
  const [now, setNow] = useState(Date.now());
  const sess = useRef(null); // { id, secret, code, expiresAt } — секрет только в памяти
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const start = async () => {
    setSt({ phase: "loading" });
    try {
      const { ok, data } = await qrApi("start", { label: deviceIdentity().name });
      if (!alive.current) return;
      if (!ok || !data.code) { setSt({ phase: "error", text: data.error || "Вход по QR сейчас недоступен. Войдите по почте." }); return; }
      sess.current = { id: data.id, secret: data.secret, code: data.code, expiresAt: Date.now() + QR_LOGIN_TTL_MS };
      setSt({ phase: "show" });
    } catch {
      if (alive.current) setSt({ phase: "error", text: "Нет связи с сервером. Проверьте интернет или войдите по почте." });
    }
  };
  useEffect(() => { start(); }, []);

  // Тикаем таймер и раз в 2 секунды спрашиваем «разрешили?»
  useEffect(() => {
    if (st.phase !== "show") return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    let busy = false;
    const poll = setInterval(async () => {
      const ss = sess.current;
      if (busy || !ss) return;
      if (Date.now() > ss.expiresAt) { setSt({ phase: "expired" }); return; }
      busy = true;
      try {
        const { data } = await qrApi("poll", { id: ss.id, secret: ss.secret });
        if (!alive.current) return;
        if (data.status === "approved" && data.token_hash) {
          setSt({ phase: "signing" });
          // Входим одноразовым пропуском — Supabase сам сохранит сессию, экран входа закроется
          const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
          if (error && alive.current) setSt({ phase: "error", text: "Не получилось войти. Попробуйте ещё раз." });
        } else if (data.status === "expired") setSt({ phase: "expired" });
        else if (data.status === "used" || data.status === "not_found") setSt({ phase: "expired" });
      } catch {} finally { busy = false; }
    }, QR_POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [st.phase]);

  const ss = sess.current;
  const left = ss ? ss.expiresAt - now : 0;
  const dim = st.phase !== "show";
  return (
    <div className="nx-auth-step" data-step="qr">
      {st.phase === "error" ? (
        <StateNote kind="error">{st.text}</StateNote>
      ) : (
        <div className="nx-qrlogin" style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0, opacity: dim ? 0.25 : 1, transition: "opacity 200ms ease" }}>
            {ss ? <QrCode text={loginUrl(ss.code)} size={150} radius={0} label="QR-код для входа" />
              : <div style={{ width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}` }}><Spinner s={18} /></div>}
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Отсканируйте в приложении NEXA</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>
              Настройки → «Войти на другом устройстве». Или введите там код:
            </div>
            <div style={{ marginTop: 10 }}>{ss && <CodeCells code={ss.code} dim={dim} />}</div>
            <div aria-hidden="true" style={{ height: 3, marginTop: 12, background: `color-mix(in srgb, ${C.text} 8%, transparent)` }}>
              <div style={{ height: "100%", width: `${dim ? 0 : Math.max(0, Math.min(100, (left / QR_LOGIN_TTL_MS) * 100))}%`, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, transition: "width 500ms linear" }} />
            </div>
            <div role="status" style={{ fontSize: 12.5, marginTop: 8, color: st.phase === "expired" ? C.red : C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              {st.phase === "signing" ? <><Spinner s={11} /> Входим…</>
                : st.phase === "expired" ? "Код истёк"
                : st.phase === "loading" ? "Готовим код…"
                : <>Действует ещё <span style={{ fontFamily: fontDisplay, color: C.text }}>{mmss(left)}</span></>}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
        {(st.phase === "expired" || st.phase === "error") && (
          <button type="button" className="nx-primary" onClick={start} style={{
            ...btnReset, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 999,
            border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {Icon.refresh({ c: C.onFold, s: 14 })} Новый код
          </button>
        )}
        <button type="button" onClick={onBack} style={authLink}>Войти по почте</button>
      </div>
    </div>
  );
}

/* Вошедшее устройство разрешает вход на другом: сканирует QR (в приложении)
   или вводит код, видит, что за устройство просит, и нажимает «Разрешить».
   initialCode — код из QR (если уже есть), onScan — открыть сканер */
function ApproveLoginModal({ initialCode, onClose, onScan }) {
  const [code, setCode] = useState(initialCode || "");
  const [st, setSt] = useState({ phase: "enter" }); // enter | checking | confirm | approving | done
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  // Шаг 1: что за устройство просит вход (неверных кодов — не больше 5 в минуту)
  const check = async (c = clean) => {
    setError(null);
    const lock = (() => { try { return JSON.parse(localStorage.getItem(APPROVE_LOCK_KEY)) || { wrong: 0, until: 0 }; } catch { return { wrong: 0, until: 0 }; } })();
    if (lock.until > Date.now()) { setError(`Слишком много неверных кодов. Попробуйте через ${mmss(lock.until - Date.now())}.`); return; }
    if (!PAIR_CODE_RE.test(c)) { setError("Код — это 6 букв и цифр с экрана другого устройства"); return; }
    setSt({ phase: "checking" });
    try {
      const { ok, status, data } = await qrApi("peek", { code: c }, await token());
      if (ok) { try { localStorage.setItem(APPROVE_LOCK_KEY, JSON.stringify({ wrong: 0, until: 0 })); } catch {} setSt({ phase: "confirm", code: c, label: data.device_label }); return; }
      if (status === 404) {
        const wrong = lock.wrong + 1;
        try { localStorage.setItem(APPROVE_LOCK_KEY, JSON.stringify(wrong >= 5 ? { wrong: 0, until: Date.now() + 60000 } : { wrong, until: 0 })); } catch {}
      }
      setError(data.error || "Не получилось проверить код"); setSt({ phase: "enter" });
    } catch {
      setError("Нет связи с сервером. Проверьте интернет."); setSt({ phase: "enter" });
    }
  };
  // Пришли с готовым кодом (из QR) — сразу проверяем
  useEffect(() => { if (initialCode) check(initialCode.toUpperCase()); }, []);

  // Шаг 2: разрешить
  const approve = async () => {
    setError(null); setSt((x) => ({ ...x, phase: "approving" }));
    try {
      const { ok, data } = await qrApi("approve", { code: st.code }, await token());
      if (ok) setSt({ phase: "done" });
      else { setError(data.error || "Не получилось разрешить вход"); setSt({ phase: "enter" }); }
    } catch { setError("Нет связи с сервером. Проверьте интернет."); setSt({ phase: "enter" }); }
  };

  const primary = { ...btnReset, padding: "11px 18px", fontSize: 14, fontWeight: 500, borderRadius: 999, border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
  const ghost = { ...btnReset, padding: "11px 18px", fontSize: 14, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 330, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-approve-title" className="nx-viewer-panel nx-pop" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "20px 22px 22px", boxSizing: "border-box", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-approve-title" style={{ fontFamily: fontDisplay, fontSize: 22, lineHeight: 1.2 }}>
              {st.phase === "done" ? "Вход разрешён" : st.phase === "confirm" || st.phase === "approving" ? "Разрешить вход?" : "Войти на другом устройстве"}
            </div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>
              {st.phase === "done" ? "Через пару секунд там откроется ваш аккаунт"
                : st.phase === "confirm" || st.phase === "approving" ? "Разрешайте, только если этот код сейчас на вашем экране"
                : "На новом устройстве: «Войти» → «Войти по QR». Отсканируйте QR или введите код"}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {(st.phase === "enter" || st.phase === "checking") && (
          <form onSubmit={(e) => { e.preventDefault(); check(); }} style={{ marginTop: 18 }}>
            {onScan && (
              <button type="button" onClick={() => { onClose(); onScan(); }} style={{ ...primary, width: "100%", marginBottom: 14 }}>
                {Icon.search({ c: C.onFold, s: 15 })} Сканировать QR
              </button>
            )}
            <label htmlFor="nx-approve-code" style={{ fontSize: 12.5, color: C.mutedSoft }}>{onScan ? "Или введите код" : "Код с экрана нового устройства"}</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input id="nx-approve-code" className="nx-input" value={clean} onChange={(e) => { setCode(e.target.value); setError(null); }}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="······" autoFocus={!onScan}
                style={{
                  flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: fontDisplay, fontSize: 19,
                  letterSpacing: "0.32em", textAlign: "center", textTransform: "uppercase",
                  border: `1px solid ${error ? C.red : C.borderStrong}`, borderRadius: 4, padding: "8px 10px", outline: "none",
                }} />
              <button type="submit" disabled={clean.length !== 6 || st.phase === "checking"} style={clean.length === 6 ? primary : { ...ghost, color: C.mutedSoft }}>
                {st.phase === "checking" ? <Spinner s={13} c={C.onFold} /> : "Дальше"}
              </button>
            </div>
          </form>
        )}

        {(st.phase === "confirm" || st.phase === "approving") && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {(/телефон/i.test(st.label || "") ? Icon.phone : Icon.laptop)({ c: C.text, s: 17 })}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{st.label || "Новое устройство"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Код {st.code}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} disabled={st.phase === "approving"} style={{ ...ghost, flex: 1 }}>Отмена</button>
              <button type="button" onClick={approve} disabled={st.phase === "approving"} style={{ ...primary, flex: 1 }}>
                {st.phase === "approving" ? <Spinner s={13} c={C.onFold} /> : Icon.check({ c: C.onFold, s: 15 })} Разрешить
              </button>
            </div>
          </div>
        )}

        {st.phase === "done" && (
          <button type="button" onClick={onClose} style={{ ...ghost, marginTop: 18, width: "100%" }}>Готово</button>
        )}
        {error && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginTop: 12, lineHeight: 1.45 }}>{error}</div>}
      </div>
    </div>
  );
}

// Поле ввода входа: угол 4px, обводка 1px, красная при ошибке
const authField = (invalid) => ({
  display: "block", width: "100%", boxSizing: "border-box", marginTop: 8,
  background: "transparent", color: C.text, fontSize: 16, fontFamily: "inherit",
  border: `1px solid ${invalid ? C.red : C.borderStrong}`, borderRadius: 4,
  padding: "12px 14px", outline: "none",
});
// Кнопка-ссылка: «Отправить ещё раз», «Изменить почту»
const authLink = { ...btnReset, padding: 0, fontSize: 13, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 };

/* Панель входа: шаг 1 — почта и «Получить код», шаг 2 — код и «Войти».
   onEscape — что делать по Esc на шаге почты (на шаге кода Esc возвращает к почте).
   Сама панель ничего не закрывает: после входа Supabase сообщит о сессии,
   и экран входа уберёт тот, кто его показал */
function AuthPanel({ onEscape }) {
  const [step, setStep] = useState("email"); // "email" | "code" | "qr" (вход по QR с другого устройства)
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(0);   // когда отправили последний код
  const [now, setNow] = useState(Date.now()); // тикает раз в секунду для паузы «ещё раз»
  const codeRef = useRef(null);

  // Обратный отсчёт до повторной отправки
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (step !== "code" || wait === 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [step, wait, now]);

  // На шаге кода сразу ставим курсор в поле
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  // Esc: с кода — назад к почте, с почты — решает тот, кто показал панель
  const escRef = useRef();
  escRef.current = () => {
    if (step === "code" || step === "qr") { setStep("email"); setCode(""); setError(null); }
    else onEscape?.();
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") escRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cleanEmail = email.trim().toLowerCase();

  // Шаг 1: проверяем почту у себя и просим Supabase прислать код
  const sendCode = async () => {
    if (busy) return;
    if (!looksLikeEmail(cleanEmail)) { setError("Похоже, в адресе опечатка. Проверьте почту."); return; }
    if (!isAllowedEmail(cleanEmail)) { setError(DOMAIN_NOT_ALLOWED_MESSAGE); return; }
    if (navigator.onLine === false) { setError(authErrorText(null)); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true } });
      if (err) { setError(authErrorText(err, "send")); return; }
      setSentAt(Date.now()); setNow(Date.now());
      setCode(""); setStep("code");
    } catch (err) {
      setError(authErrorText(err, "send"));
    } finally {
      setBusy(false);
    }
  };

  // Шаг 2: проверяем код. Успех — Supabase сам сообщит о входе (onAuthStateChange)
  const verify = async () => {
    if (busy || code.length < CODE_MIN) return;
    if (navigator.onLine === false) { setError(authErrorText(null)); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code, type: "email" });
      if (err) setError(authErrorText(err, "verify", sentAt));
    } catch (err) {
      setError(authErrorText(err, "verify", sentAt));
    } finally {
      setBusy(false);
    }
  };

  if (!supabase) {
    return (
      <StateNote kind="error">Аккаунты сейчас недоступны. Пользуйтесь NEXA без входа — всё работает как обычно.</StateNote>
    );
  }

  if (step === "qr") return <QrLoginView onBack={() => setStep("email")} />;

  return step === "email" ? (
    // form — чтобы кнопка срабатывала и по Enter
    <form className="nx-auth-step" data-step="email" onSubmit={(e) => { e.preventDefault(); sendCode(); }} noValidate>
      <label htmlFor="nx-auth-email" style={{ fontSize: 13, color: C.muted }}>Почта</label>
      <input
        id="nx-auth-email" type="email" inputMode="email" autoComplete="email" autoFocus
        className="nx-input" value={email} disabled={busy}
        placeholder="name@yandex.ru"
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        aria-invalid={!!error} aria-describedby="nx-auth-hint"
        style={authField(!!error)}
      />
      <div id="nx-auth-hint" role={error ? "alert" : undefined} style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.45, color: error ? C.red : C.mutedSoft }}>
        {error || "Пришлём код — пароль не нужен"}
      </div>
      <StateButton variant="primary" state={busy ? "loading" : "idle"} labels={{ loading: "Отправляем…" }}
        disabled={!cleanEmail} onClick={sendCode}
        style={{ width: "100%", marginTop: 18, padding: "12px 16px", fontSize: 14 }}>
        Получить код
      </StateButton>
      {/* Уже вошли на телефоне — можно без письма: QR или код */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0", fontSize: 12, color: C.mutedSoft }}>
        <span style={{ flex: 1, height: 1, background: C.border }} />или<span style={{ flex: 1, height: 1, background: C.border }} />
      </div>
      <button type="button" className="nx-ghost-btn" onClick={() => { setError(null); setStep("qr"); }} style={{
        ...btnReset, width: "100%", padding: "11px 16px", fontSize: 14, borderRadius: 999,
        border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {Icon.phone({ c: C.text, s: 15 })} Войти по QR с телефона
      </button>
      <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 12, lineHeight: 1.45 }}>
        Проект учебный. Данные хранятся для демонстрации и удаляются по запросу.
      </div>
    </form>
  ) : (
    <form className="nx-auth-step" data-step="code" onSubmit={(e) => { e.preventDefault(); verify(); }} noValidate>
      <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
        Код отправили на <span style={{ color: C.text }}>{cleanEmail}</span>.{" "}
        <button type="button" onClick={() => { setStep("email"); setError(null); }} style={authLink}>Изменить почту</button>
      </div>
      <label htmlFor="nx-auth-code" style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 16 }}>Код из письма</label>
      <input
        id="nx-auth-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code"
        className="nx-input nx-auth-code" value={code} disabled={busy} maxLength={CODE_MAX}
        placeholder="••••••"
        // Только цифры: лишнее (пробелы, дефисы при вставке) отбрасываем
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_MAX)); setError(null); }}
        aria-invalid={!!error} aria-describedby="nx-auth-code-hint"
        style={{ ...authField(!!error), fontFamily: fontDisplay, fontSize: 22, letterSpacing: "0.3em" }}
      />
      <div id="nx-auth-code-hint" role={error ? "alert" : undefined} style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.45, color: error ? C.red : C.mutedSoft }}>
        {error || "Письмо может прийти через минуту. Загляните и в «Спам»"}
      </div>
      <StateButton variant="primary" state={busy ? "loading" : "idle"} labels={{ loading: "Проверяем…" }}
        disabled={code.length < CODE_MIN} onClick={verify}
        style={{ width: "100%", marginTop: 18, padding: "12px 16px", fontSize: 14 }}>
        Войти
      </StateButton>
      <div style={{ marginTop: 14, fontSize: 13, color: C.mutedSoft, textAlign: "center" }}>
        {wait > 0
          ? <>Отправить ещё раз через <span style={{ fontFamily: fontDisplay }}>{wait}</span> с</>
          : <button type="button" onClick={sendCode} disabled={busy} style={authLink}>Отправить ещё раз</button>}
      </div>
    </form>
  );
}

/* Экран входа при первом запуске: «Войти» (панель с почтой) или
   «Продолжить без аккаунта» — гостевой режим, запоминаем в nexa-guest.
   Показывается, только если аккаунты доступны (есть настройки Supabase) */
function AuthGate({ onGuest }) {
  const [open, setOpen] = useState(false); // нажали «Войти» — видна панель с почтой
  return (
    <div className="nx-auth-gate nx-scroll" role="dialog" aria-modal="true" aria-labelledby="nx-auth-title" style={{
      position: "fixed", inset: 0, zIndex: 900, background: C.bg, overflowY: "auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "calc(var(--sat) + 32px) 20px calc(var(--sab) + 32px)", boxSizing: "border-box",
    }}>
      <div style={{ margin: "auto 0", width: "min(400px, 100%)", textAlign: "left" }}>
        <img src={foldSvg} alt="" style={{ width: 96, height: "auto", display: "block", marginBottom: 28 }} />
        <div id="nx-auth-title" className="ng-display" style={{ fontSize: 30, lineHeight: 1.15 }}>Добро пожаловать в NEXA</div>
        <div style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.5, marginTop: 10, marginBottom: 26 }}>
          Войдите по почте — без пароля, по коду из письма. Или загляните без аккаунта.
        </div>
        {open ? (
          <div className="nx-pop" style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 20px", background: C.panel }}>
            {/* Esc / «Назад» на шаге почты: на телефоне сворачиваем, на сайте — назад к выбору */}
            <AuthPanel onEscape={() => (isNative ? CapApp.minimizeApp() : setOpen(false))} />
          </div>
        ) : (
          <button type="button" className="nx-primary" onClick={() => setOpen(true)} style={{
            ...btnReset, width: "100%", padding: "13px 16px", fontSize: 14.5, fontWeight: 500,
            border: "1px solid transparent", color: C.onFold,
            background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {Icon.mail({ c: C.onFold, s: 17 })} Войти
          </button>
        )}
        <button type="button" className="nx-ghost-btn" onClick={onGuest} style={{
          ...btnReset, width: "100%", marginTop: 12, padding: "12px 16px", fontSize: 14,
          border: `1px solid ${C.borderStrong}`, color: C.text, textAlign: "center",
        }}>
          Продолжить без аккаунта
        </button>
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 14, lineHeight: 1.5 }}>
          Войти можно и потом — в Настройках.
        </div>
      </div>
    </div>
  );
}

/* Окно входа из Настроек: та же панель, крестик и Esc закрывают.
   Фон под окном просто затемнён, без размытия */
function AuthModal({ onClose, hint }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-auth-modal-title"
        className="nx-viewer-panel nx-pop nx-scroll" onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14,
          boxSizing: "border-box", textAlign: "left", padding: "20px 22px 22px",
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-auth-modal-title" style={{ fontFamily: fontDisplay, fontSize: 24, lineHeight: 1.15 }}>Вход в NEXA</div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>{hint || "По коду из письма, без пароля"}</div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>
        <AuthPanel onEscape={onClose} />
      </div>
    </div>
  );
}

/* Группа «Аккаунт» в Настройках: вошли — почта и «Выйти», нет — «Войти» */
function AccountSettings({ user, onLogin, onDeleteData, onApproveLogin }) {
  const [leaving, setLeaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false); // окно «Удалить мои данные?»
  const logout = async () => {
    const uid = user?.id;
    setLeaving(true);
    try { await signOut(); } finally { setLeaving(false); }
    // Чуть ждём: интерфейс уже переключился на гостевые данные и больше не пишет в ключи аккаунта
    setTimeout(() => clearLocalAccountData(uid), 400);
  };
  const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "8px 16px", fontSize: 13, whiteSpace: "nowrap" };
  return (
    <>
      <SectionTitle>Аккаунт</SectionTitle>
      <SettingsGroup>
        {user ? (
          <SettingsRow
            last
            icon={Icon.user({ c: C.muted, s: 20 })}
            title={<span style={{ overflowWrap: "anywhere" }}>{user.email}</span>}
            subtitle={
              <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 6 }}>
                <Dot color={C.green} /> Вы вошли
              </span>
            }
            right={
              <button type="button" className="nx-ghost-btn" onClick={logout} disabled={leaving}
                style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                {Icon.logout({ c: C.text, s: 15 })} {leaving ? "Выходим…" : "Выйти"}
              </button>
            }
          />
        ) : (
          <SettingsRow
            last
            icon={Icon.user({ c: C.muted, s: 20 })}
            title="Вы не вошли"
            subtitle={authAvailable ? "Вход по почте, без пароля" : "Аккаунты сейчас недоступны"}
            right={
              <button type="button" className="nx-primary" onClick={onLogin} style={{
                ...pill, border: "1px solid transparent", color: C.onFold, fontWeight: 500,
                background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
              }}>
                Войти
              </button>
            }
          />
        )}
        {user && onApproveLogin && (
          <SettingsRow
            icon={Icon.phone({ c: C.muted, s: 18 })}
            title="Войти на другом устройстве"
            subtitle="Без письма: отсканируйте QR или введите код"
            right={
              <button type="button" className="nx-ghost-btn" onClick={onApproveLogin}
                style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text }}>
                Подтвердить
              </button>
            }
          />
        )}
        {user && (
          <SettingsRow
            last
            icon={Icon.trash({ c: C.red, s: 18 })}
            title="Удалить мои данные"
            subtitle="Устройства и чаты — из облака и с этого устройства"
            right={
              <button type="button" className="nx-ghost-btn" onClick={() => setConfirmOpen(true)}
                style={{ ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red }}>
                Удалить
              </button>
            }
          />
        )}
      </SettingsGroup>
      {confirmOpen && <DeleteDataDialog onConfirm={onDeleteData} onClose={() => setConfirmOpen(false)} />}
    </>
  );
}

/* Подтверждение «Удалить мои данные». onConfirm — асинхронное удаление;
   вернуло текст ошибки — показываем его, окно не закрываем */
function DeleteDataDialog({ onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);
  const run = async () => {
    setBusy(true); setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  return (
    <div className="nx-viewer" onClick={() => !busy && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 300, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-del-title" className="nx-viewer-panel nx-pop"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(400px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "20px 22px 22px", boxSizing: "border-box", textAlign: "left" }}>
        <div id="nx-del-title" style={{ fontFamily: fontDisplay, fontSize: 22, lineHeight: 1.2 }}>Удалить мои данные?</div>
        <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5, marginTop: 10 }}>
          Устройства и чаты аккаунта удалятся из облака и с этого устройства. Вернуть их не получится. Аккаунт останется — войти можно будет снова.
        </div>
        {error && <div style={{ marginTop: 14 }}><StateNote kind="error">{error}</StateNote></div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button type="button" className="nx-ghost-btn" onClick={onClose} disabled={busy} style={{
            ...btnReset, flex: 1, padding: "11px 16px", fontSize: 13.5, border: `1px solid ${C.borderStrong}`, color: C.text, textAlign: "center",
          }}>
            Отмена
          </button>
          <StateButton state={busy ? "loading" : "idle"} labels={{ loading: "Удаляем…" }} onClick={run}
            style={{ flex: 1, padding: "11px 16px", fontSize: 13.5, borderRadius: 999, borderColor: C.red, color: C.red }}>
            Удалить
          </StateButton>
        </div>
      </div>
    </div>
  );
}

/* Тихая строка о синхронизации: «Загружаем…» или «Нет связи, работаем локально».
   Без свечения: плашка с обводкой 1px внизу экрана */
function SyncStatus({ loading, text, onRetry }) {
  if (!loading && !text) return null;
  return (
    <div className="nx-sync-status nx-pop" role="status" style={{
      position: "fixed", zIndex: 60, display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", border: `1px solid ${C.borderStrong}`, borderRadius: 4, background: C.panel,
      fontSize: 12.5, color: C.muted, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
    }}>
      {loading ? <Spinner s={12} /> : <Dot color={C.red} />}
      <span>{loading ? "Загружаем данные аккаунта…" : text}</span>
      {!loading && onRetry && (
        <button type="button" onClick={onRetry} style={{ ...btnReset, color: C.mint, fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 3 }}>
          Повторить
        </button>
      )}
    </div>
  );
}

// ЭКРАН "НАСТРОЙКИ": аккаунт, тема, уведомления, приложение
/* «Это устройство» в Настройках: только настоящие сведения (src/lib/deviceInfo.js).
   Чего платформа не отдаёт — «Нет данных» и коротко почему */
function ThisDeviceSettings({ sys }) {
  const kind = thisDeviceKind();
  const kindIcon = { phone: Icon.phone, tablet: Icon.tablet, computer: Icon.laptop }[kind];
  const why = isNative
    ? { battery: "система не сообщила заряд", net: "система не сообщила тип сети", disk: "система не сообщила объём" }
    : { battery: "этот браузер не сообщает заряд", net: "браузер не сообщает тип подключения", disk: "браузер не показывает память устройства" };
  const line = (value, reason) => (value === NO_DATA ? `${NO_DATA} — ${reason}` : value);
  const used = sys?.diskTotal ? (sys.diskTotal - sys.diskFree) / sys.diskTotal : null;
  return (
    <>
      <SectionTitle>Это устройство</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={kindIcon({ c: C.mint, s: 18 })} title={KIND_LABEL[kind]}
          subtitle={sys ? `Обновлено ${sysTime(sys.at)} · сведения раз в 30 секунд` : "Читаем сведения…"} />
        <SettingsRow icon={Icon.battery({ c: C.text, s: 18 })} title="Заряд" subtitle={sys ? line(batteryText(sys), why.battery) : "…"} />
        <SettingsRow icon={Icon.signal({ c: C.text, s: 18 })} title="Сеть" subtitle={sys ? line(netText(sys), why.net) : "…"} />
        <SettingsRow last icon={Icon.drive({ c: C.text, s: 18 })} title="Место на устройстве"
          subtitle={sys ? (
            used == null ? line(NO_DATA, why.disk) : (
              <>
                {diskText(sys)}
                <span className="nx-sys-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(used * 100)}%`, background: used > 0.9 ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
                </span>
              </>
            )
          ) : "…"} />
      </SettingsGroup>
    </>
  );
}

function ScreenSettings({ onOpenSearch, user, onLogin, onDeleteData, onApproveLogin, sys }) {
  // Список уведомлений хранится в состоянии (useState),
  // потому что он меняется при кликах
  const [notifs, setNotifs] = useState([
    { icon: Icon.bell, label: "Уведомления о событиях", sub: "Календарь, встречи, напоминания", on: true },
    { icon: Icon.chat, label: "Сообщения и комментарии", sub: "Упоминания, ответы, новые сообщения", on: true },
    { icon: Icon.megaphone, label: "Рекомендации и новости", sub: "Полезные советы и обновления", on: false },
  ]);

  // Переключаем у строки с номером index значение on на противоположное
  const toggleNotif = (index) => {
    setNotifs(notifs.map((n, i) => (i === index ? { ...n, on: !n.on } : n)));
  };

  // theme: какая тема выбрана сейчас, "light" или "dark".
  // setTheme меняет её плавно (см. switchTheme наверху файла).
  const [theme, setThemeState] = useState(readTheme);
  // Тему переключили в другой вкладке (или ассистент) — обновляем кнопки
  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    window.addEventListener("nexa-theme-change", sync);
    return () => window.removeEventListener("nexa-theme-change", sync);
  }, []);
  const setTheme = (t) => {
    if (t === theme) return;
    switchTheme(t, () => setThemeState(t));
  };

  // Фон от наклона телефона: строку показываем только на сенсорных экранах
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const [tilt, setTiltState] = useState(readTilt);
  const toggleTilt = async () => setTiltState(await saveTilt(!tilt));

  // Кнопка сегментированного переключателя темы
  const segBtn = (value, label) => (
    <button onClick={() => setTheme(value)} style={{
      flex: 1, padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap",
      fontFamily: "inherit",
      background: theme === value ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
      color: theme === value ? C.onAccent : C.muted,
      fontWeight: theme === value ? 500 : 400,
    }}>{label}</button>
  );

  return (
    <div className="ng-screen nx-stagger" style={{ padding: "28px 40px 40px" }}>
      {/* Справа отступ под значки колокольчика, поиска и профиля, которые лежат
          поверх экрана у правого края окна. На широком экране контент уже
          (не больше 1440px) и значки стоят правее него — тогда отступ не нужен,
          и строка поиска встаёт ровно по краю карточек.
          78px — ширина левой панели, 160px — место под значки с зазором,
          (100vw − 78px − 1440px) / 2 — пустое поле справа от контента */}
      <div className="nx-settings-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingRight: "max(0px, calc(160px - max(0px, (100vw - 78px - 1440px) / 2)))" }}>
        <div className="ng-display nx-page-title" style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1 }}>Настройки</div>
        {/* Поиск по настройкам. Открывает общий поиск по всему приложению.
            На телефоне скрыт: там есть иконка поиска в верхней строке */}
        <button
          type="button"
          className="nx-settings-search nx-ghost-btn"
          onClick={onOpenSearch}
          style={{
            ...btnReset,
            display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`,
            borderRadius: 999, padding: "8px 16px", width: 220,
          }}
        >
          {Icon.search({ c: C.mutedSoft, s: 15 })}
          <span style={{ fontSize: 13, color: C.mutedSoft }}>Поиск</span>
        </button>
        </div>

      <AccountSettings user={user} onLogin={onLogin} onDeleteData={onDeleteData} onApproveLogin={onApproveLogin} />

      <SectionTitle>Внешний вид</SectionTitle>
      <SettingsGroup>
        <SettingsRow
          last={!touch} wrap
          icon={
            // Мини-складка: меняет цвет вместе с темой
            <svg viewBox="0 0 24 24" width="18" height="18">
              <polygon points="4,14 12,4 12,20 7,22" fill={theme === "dark" ? C.blue : C.mint} />
            </svg>
          }
          title="Тема оформления"
          subtitle={theme === "dark" ? "Тёмная" : "Светлая"}
          right={
            <div className="nx-seg" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
              {segBtn("light", "Светлая")}
              {segBtn("dark", "Тёмная")}
            </div>
          }
        />
        {touch && (
          <SettingsRow
            last
            icon={<span style={{ display: "flex", transform: "rotate(-14deg)" }}>{Icon.phone({ c: C.muted, s: 18 })}</span>}
            title="Фон от наклона телефона"
            subtitle={tiltNeedsPermission() && !tilt ? "Нужно разрешить доступ к движению" : "Фон чуть сдвигается, когда наклоняете телефон"}
            right={<Toggle on={tilt} onClick={toggleTilt} />}
          />
        )}
      </SettingsGroup>

      <SectionTitle>Уведомления</SectionTitle>
      <SettingsGroup>
        {notifs.map((n, i) => (
          <SettingsRow
            key={n.label}
            last={i === notifs.length - 1}
            icon={n.icon({ c: C.muted, s: 18 })}
            title={n.label}
            subtitle={n.sub}
            right={<Toggle on={n.on} onClick={() => toggleNotif(i)} />}
          />
        ))}
      </SettingsGroup>

      <ThisDeviceSettings sys={sys} />

      <InstallSettings />

      <SectionTitle>Система</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.info({ c: C.text, s: 18 })} title="О системе" subtitle={`NEXA ${VERSION}`} right={Icon.chevron({})} />
      </SettingsGroup>
    </div>
  );
}

/* Экранная клавиатура — для всего приложения сразу.
   Размер видимой области кладём в CSS-переменные --vvh (высота) и --vvt
   (сдвиг сверху), а пока клавиатура открыта, у body есть класс kb-open:
   по нему прячется нижняя панель и убирается отступ под неё.
   Всё ставится в тот же момент, когда меняется размер экрана, — без задержки.
   Раньше признак ставился через 150 мс: экран уже сжался, а панель ещё
   стояла на клавиатуре и поджимала поле ввода, потом всё прыгало вниз.
   Клавиатура открыта = в фокусе поле ввода И экран заметно ниже обычного.
   «Обычная» высота — самая большая для текущей ширины экрана
   (после поворота телефона считается заново). */
function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const NOT_TEXT = ["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"];
    const isField = (a) => !!a && (a.tagName === "TEXTAREA" || a.isContentEditable ||
      (a.tagName === "INPUT" && !NOT_TEXT.includes(a.type)));
    let baseW = 0, baseH = 0;
    const sync = () => {
      const h = vv ? vv.height : window.innerHeight;
      const field = isField(document.activeElement);
      if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = 0; }
      // Без поля в фокусе клавиатуры нет — эта высота и есть обычная
      baseH = field ? Math.max(baseH, h) : h;
      root.style.setProperty("--vvh", `${h}px`);
      root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
      document.body.classList.toggle("kb-open", field && baseH - h > 120);
    };
    // Фокус уходит — activeElement меняется чуть позже, проверяем в следующем кадре
    const syncSoon = () => requestAnimationFrame(sync);
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", syncSoon);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", syncSoon);
      document.body.classList.remove("kb-open");
    };
  }, []);
}

/* ---------- Свайпы между разделами (только телефон) ----------
   Порядок как в нижней панели: Сегодня → Ассистент → Главная → Медиа → Файлы,
   без зацикливания. Жест только наблюдаем (passive) — вертикальная прокрутка
   и системные жесты не блокируются. На компьютере касаний нет — мышь и
   колёсико не затронуты.
   Свайп засчитываем, если по горизонтали палец прошёл явно больше, чем по
   вертикали (в 1,5 раза), и либо не меньше 60 px, либо это быстрый флик
   (от 30 px со скоростью от 0,5 px/мс за до 300 мс).
   Не реагируем, если жест начался: в поле ввода, на ползунке, в QR-коде,
   в горизонтально прокручиваемом блоке, в открытом окне / меню / шторке,
   в 24 px от края экрана (там системный «Назад»), при открытой клавиатуре.
   getCtx() → { tab, sub } (sub — открыт экран устройства или «Активность»);
   onSwipe(dir) — dir: "next" (палец влево) | "prev" (палец вправо) */
const SWIPE_ORDER = ["today", "assistant", "home", "media", "files"];
const SWIPE_MIN = 60, SWIPE_FLICK_MIN = 30, SWIPE_FLICK_SPEED = 0.5, SWIPE_FLICK_MS = 300, SWIPE_EDGE = 24, SWIPE_RATIO = 1.5;
const SWIPE_SKIP = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], [role="dialog"], [role="menu"], .nx-notes, .nx-viewer, .nx-hist-drawer';
// Внутри горизонтально прокручиваемого блока свайп — это прокрутка блока
function inHorizontalScroll(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}
function useTabSwipe(getCtx, onSwipe) {
  const ctx = useRef(getCtx); ctx.current = getCtx;
  const act = useRef(onSwipe); act.current = onSwipe;
  useEffect(() => {
    const mobile = window.matchMedia?.("(max-width: 768px)");
    let start = null;
    const down = (e) => {
      start = null;
      if (!mobile?.matches || e.touches.length !== 1) return;
      const t = e.touches[0], el = e.target instanceof Element ? e.target : null;
      if (!el || t.clientX < SWIPE_EDGE || t.clientX > window.innerWidth - SWIPE_EDGE) return;
      if (document.body.classList.contains("kb-open")) return;
      // Открыто окно, меню или шторка — жесты у них свои (шторку истории — см. ниже)
      const layer = document.querySelector('[role="dialog"]:not(.nx-hist-drawer), [role="menu"], .nx-notes, .nx-viewer');
      if (layer || el.closest(SWIPE_SKIP) || inHorizontalScroll(el)) return;
      const c = ctx.current();
      if (c.sub || !SWIPE_ORDER.includes(c.tab)) return; // экран устройства, «Активность», Настройки
      start = { x: t.clientX, y: t.clientY, at: performance.now() };
    };
    const up = (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y, dt = performance.now() - start.at;
      start = null;
      if (Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return; // больше вертикально — это прокрутка
      const far = Math.abs(dx) >= SWIPE_MIN;
      const flick = Math.abs(dx) >= SWIPE_FLICK_MIN && dt <= SWIPE_FLICK_MS && Math.abs(dx) / dt >= SWIPE_FLICK_SPEED;
      if (!far && !flick) return;
      if (window.getSelection?.().toString()) return; // выделяли текст
      act.current(dx < 0 ? "next" : "prev");
    };
    const cancel = () => { start = null; };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", cancel);
    };
  }, []);
}

/* ---------- 6. APP — корневой компонент ----------
   tab хранит id текущего открытого раздела (по умолчанию "home").
   setTab меняется при клике по иконке в Sidebar — от этого зависит,
   какой из шести экранов показывается ниже. */
export default function NexaApp() {
  // Каждый новый запуск NEXA начинается с Главной. Раздел помним только
  // внутри текущего запуска (sessionStorage живёт, пока открыты вкладка
  // браузера или приложение): перезагрузка страницы вернёт туда же,
  // а полный перезапуск — на Главную.
  const [tab, setTab] = useState(() => {
    try {
      localStorage.removeItem("nexa-tab"); // раньше раздел помнился навсегда — старый ключ не нужен
      return sessionStorage.getItem("nexa-tab") || "home";
    } catch { return "home"; }
  });

  // Каждый раз, когда экран меняется — запоминаем его id до конца запуска
  useEffect(() => {
    if (tab !== "assistant") {
      try { sessionStorage.setItem("nexa-tab", tab); } catch {}
    }
  }, [tab]);

  // Экранная клавиатура: размер видимой области и признак kb-open
  useKeyboardViewport();

  // Аккаунт: кто вошёл (Supabase), выбран ли гостевой режим, открыто ли окно входа
  const auth = useAuth();
  /* Демо-данные (выдуманные устройства, файлы, цифры хранилища) — только без входа.
     У аккаунта своё хранилище в браузере: ключи с id пользователя (nexa-devices@…),
     сначала пустое. Гостевое демо при этом не трогаем — после выхода оно на месте */
  const demo = !auth.user;
  const scope = auth.user ? `@${auth.user.id}` : "";

  // Общие данные для "Медиа" и "Файлов": список файлов, фильтр по категории
  // и файл, открытый в окне просмотра.
  // Добавленные файлы, удаления, новые имена и папки запоминаем в браузере
  // useSharedState: сохраняется в браузере и делится с другими вкладками
  const [fileStore, setFileStore] = useSharedState(FILES_KEY + scope, loadFileStore);

  /* Диалоги ассистента. У гостя — «nexa-chats», как раньше; у аккаунта —
     свои (nexa-chats@id) и в облаке. setChats ставит updatedAt изменённым
     диалогам — по нему решается, какая версия новее */
  const [chats, setChatsStore] = useSharedState(CHATS_KEY + scope, loadChats);
  const setChats = (upd) => setChatsStore((prev) => {
    const next = typeof upd === "function" ? upd(prev) : upd;
    const old = new Map(prev.map((c) => [c.id, c]));
    return next.map((c) => (old.get(c.id) === c ? c : { ...c, updatedAt: Date.now() }));
  });
  // Чьи файлы на экране — для миниатюр и окна файла (см. FILE_SCOPE)
  FILE_SCOPE = auth.user?.id || "guest";
  // Загрузки: [{ id, fileId, name, folder, progress 0…1, status "uploading" | "error", error, file }]
  const [uploads, setUploads] = useState([]);
  // В аккаунте — только основные папки (Фото, Видео, Документы…), без выдуманных вложенных
  const folders = [...(demo ? FOLDERS : FOLDERS.filter((f) => !f.parent)), ...fileStore.folders];
  const files = [
    ...(demo ? DEMO_FILES.filter((f) => !fileStore.removed.includes(f.id)) : []),
    ...fileStore.added.map((f) => ({ ...withWhen(f), uploaded: true })),
  ].map((f) => ({ ...f, name: fileStore.renamed[f.id] ?? f.name }));
  const [filesFilter, setFilesFilter] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFolder, setSearchFolder] = useState(null);
  const [searchChatId, setSearchChatId] = useState(null);
    // Системные уведомления (тосты). Живут в корне — любой экран
  // может показать сообщение через onToast = showToast.
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Центр уведомлений: последние 20 событий (общие для всех вкладок)
  const [notes, setNotes] = useSharedState(NOTES_KEY, loadNotes);
  const addNote = (n) => setNotes((s) => ({
    ...s,
    items: [{ id: `n${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), title: n.title, text: n.text || "", kind: n.kind }, ...s.items].slice(0, NOTES_MAX),
  }));
  // Записи из любого места приложения (logEvent → событие "nexa-log")
  useEffect(() => {
    const onLog = (e) => addNote(e.detail || {});
    window.addEventListener("nexa-log", onLog);
    return () => window.removeEventListener("nexa-log", onLog);
  }, []);

  /* Связь устройств: свой закрытый канал аккаунта (src/lib/realtime.js).
     Пришёл текст — короткое уведомление (только как текст); остальные события
     (подключение, сцены, поиск) разбирает handleLinkEvent ниже */
  const uid = auth.user?.id || null;
  const link = useDeviceLink(uid, {
    onText: (item) => {
      showToast({
        title: `Пришло с устройства «${item.from_name}»`,
        text: item.text.length > 80 ? item.text.slice(0, 80) + "…" : item.text,
        kind: "device",
      });
      // В ленту — без содержимого сообщения
      onTextActivity.current?.(item);
    },
    onEvent: (event, payload) => handleLinkEvent(event, payload),
  });
  const peerIds = new Set(link.peers.map((d) => d.device_id));
  const peerById = new Map(link.peers.map((p) => [p.device_id, p]));
  // Последние сведения от каждого устройства (обновляются с каждым Presence):
  // когда устройство пропадёт, сохраним именно их, а не снимок на момент подключения
  const lastPeerSys = useRef({});
  link.peers.forEach((p) => { if (p.sys) lastPeerSys.current[p.device_id] = p.sys; });
  /* Настоящие сведения об этом устройстве (заряд, сеть, место) — для Настроек
     и карточки «это устройство»; вошедший делится ими через Presence
     (не чаще раза в 30 секунд и только когда изменились — см. useDeviceLink) */
  const thisSys = useThisDeviceSys();
  const thisSysRef = useRef(thisSys); thisSysRef.current = thisSys;
  useEffect(() => { if (uid && thisSys) link.shareSys(thisSys); }, [thisSys, uid]);
  const onTextActivity = useRef(null); // ставится ниже, когда готова лента

  // Тост — и сразу запись в центр уведомлений, чтобы не исчезал бесследно
  const showToast = (t) => {
    addNote(t);
    const id = ++toastIdRef.current;
    setToasts((list) => [...list, { id, ...t }]);
    setTimeout(
      () => setToasts((list) => list.filter((x) => x.id !== id)),
      t.duration || 3800
    );
  };
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  // Устройства: в сети ли и положение переключателей. Запоминаем в браузере,
  // чтобы после перезагрузки всё осталось как было
  // Здесь же — добавленные и удалённые устройства (см. loadDeviceStore)
  const [deviceStore, setDeviceStore] = useSharedState(DEVICES_KEY + scope, loadDeviceStore);
  // Итоговый список: исходные (кроме удалённых) + добавленные,
  // поверх — настройки по умолчанию и сохранённое состояние
  const devices = [
    ...(demo ? DEVICES.filter((d) => !deviceStore.removed.includes(d.id)) : []),
    ...deviceStore.added.map((d) => ({ ...d, icon: deviceType(d.type).icon })),
  ].map((d) => ({ ...d, ...DEVICE_DEFAULTS, ...deviceStore.state[d.id] }))
    // Реальные устройства (подключены по коду): «в сети» — по Presence
    // Сведения: своё — прямо с устройства; онлайн — из Presence; не в сети — последние сохранённые
    .map((d) => {
      if (!d.real) return d;
      const isSelf = d.device_id === link.self?.device_id, online = peerIds.has(d.device_id);
      const saved = cleanSys(d.sys);
      return { ...d, online, isSelf, sys: (isSelf && thisSys) || (online && peerById.get(d.device_id)?.sys) || saved };
    });
  // Названия реальных устройств по device_id — для блока «Связь устройств»
  const realNames = Object.fromEntries(devices.filter((d) => d.real).map((d) => [d.device_id, d.name]));
  const patchDevice = (id, patch) => setDeviceStore((s) => ({
    ...s, state: { ...s.state, [id]: { ...s.state[id], ...patch } },
    updated: { ...s.updated, [id]: Date.now() },
  }));
  // Новое устройство: сразу в сети
  const addDevice = (type, name) => {
    const t = deviceType(type);
    const d = {
      id: newId(), type, name, createdAt: Date.now(),
      battery: t.battery, memory: t.memory, online: true, lastSeen: "только что",
    };
    setDeviceStore((s) => ({ ...s, added: [...s.added, d], updated: { ...s.updated, [d.id]: d.createdAt } }));
    logEvent({ title: "Устройство подключено", text: name, kind: "device" });
  };

  /* Расписание на сегодня: можно добавлять свои дела и удалять.
     Хранится в браузере (общее для вкладок), по умолчанию — пример.
     TODAY.schedule — то же самое для ассистента и превью часов */
  const [schedule, setSchedule] = useSharedState(SCHEDULE_KEY, loadSchedule);
  // Ассистент, превью часов и сводка «что у меня сегодня» видят только сегодняшние дела
  TODAY.schedule = itemsOn(schedule, dayKey());
  /* Виджеты рабочего стола (только приложение): то же расписание — при запуске
     и при каждом изменении; при уходе в фон — ещё раз и перерисовать виджеты.
     Город для виджета погоды — выбранный в NEXA (не выбран — Казань) */
  useEffect(() => { widgetsSetSchedule(schedule); }, [schedule]);
  useEffect(() => {
    widgetsSetCity(readManualCity());
    const away = () => { if (document.visibilityState === "hidden") widgetsFlush(); };
    document.addEventListener("visibilitychange", away);
    return () => document.removeEventListener("visibilitychange", away);
  }, []);
  const dayLabel = (k) => (k === dayKey() ? "" : `${dayFromKey(k).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, `);
  const addScheduleItem = (it) => {
    setSchedule((list) => sortSchedule([...list, { id: `s${Date.now()}`, ...it }]));
    showToast({ title: "Дело добавлено", text: `${dayLabel(it.date)}${it.time} · ${it.title}`, kind: "schedule" });
  };
  const removeScheduleItem = (it) => {
    setSchedule((list) => list.filter((x) => !(x.date === it.date && x.time === it.time && x.title === it.title)));
    showToast({ title: "Дело удалено", text: `${dayLabel(it.date)}${it.time} · ${it.title}`, kind: "schedule" });
  };
  // Удаление нескольких устройств сразу. Исходные запоминаем в removed,
  // добавленные просто убираем; их настройки тоже стираем
  const removeDevices = (ids) => {
    setDeviceStore((s) => {
      const state = { ...s.state };
      ids.forEach((id) => delete state[id]);
      return {
        ...s, state,
        added: s.added.filter((d) => !ids.includes(d.id)),
        removed: [...new Set([...s.removed, ...ids.filter((id) => DEVICES.some((d) => d.id === id))])],
      };
    });
    if (ids.includes(openDeviceId)) setOpenDeviceId(null);
    if (ids.includes(filesDevice)) setFilesDevice(null);
    showToast({
      title: ids.length === 1 ? "Устройство удалено" : `Удалено ${ids.length} ${plural(ids.length, ["устройство", "устройства", "устройств"])}`,
      text: `${ids.length === 1 ? "Его" : "Их"} можно подключить заново через «Добавить устройство»`,
    });
  };
  // Вернуть исходные устройства, если их удалили
  const restoreDevices = () => setDeviceStore((s) => ({ ...s, removed: [] }));

  /* Облако аккаунта: устройства и чаты (src/lib/sync.js). Гостю — ничего не меняется.
     syncState — что сейчас с синхронизацией у каждой таблицы */
  const [syncState, setSyncState] = useState({});
  useEffect(() => { setSyncState({}); }, [uid]);
  const devicesSync = useCloudList({
    uid, table: "devices", value: deviceStore, setValue: setDeviceStore,
    toList: devicesToList, fromList: devicesFromList, rows: DEVICE_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, devices: st })),
    // Правки ушли в облако — остальные устройства аккаунта перечитают их сразу
    onPushed: () => link.emit("sync.changed", { table: "devices" }),
  });
  const chatsSync = useCloudList({
    uid, table: "chats", value: chats, setValue: setChatsStore,
    toList: (list) => list.map((c) => ({ ...c, updatedAt: c.updatedAt || c.createdAt || 0 })),
    // Облако не прислало pinned (миграция chats-pinned.sql ещё не запущена) —
    // оставляем закрепление, которое было в браузере. Миграцию только что
    // запустили (в облаке pinned = false), а закрепили здесь до неё —
    // возвращаем закрепление и отправляем в облако (новое время → уйдёт само)
    fromList: (list, prev) => {
      const was = new Map((prev || []).map((c) => [c.id, c]));
      return list.map((c) => {
        if (!was.get(c.id)?.pinned || c.pinned) return c;
        if (c.pinned === undefined) return { ...c, pinned: true };
        return isLocalPin(c.id) ? { ...c, pinned: true, updatedAt: Date.now() } : c;
      });
    },
    rows: CHAT_ROWS,
    // Первый вход: в облаке пусто, а в браузере есть гостевые диалоги — переносим один раз
    migrate: {
      ...chatMigration(uid),
    },
    onStatus: (st) => setSyncState((s) => ({ ...s, chats: st })),
    onPushed: () => link.emit("sync.changed", { table: "chats" }),
  });
  /* Сведения о файлах и папки аккаунта — в облако (таблицы files и file_folders).
     Сами байты лежат в Storage, сюда не попадают */
  const filesSync = useCloudList({
    uid, table: "files", value: fileStore, setValue: setFileStore,
    toList: (st) => st.added.map((f) => ({
      id: f.id, name: f.name, cat: f.cat, folder: f.folder ?? null, device: f.device, mime: f.mime || "",
      size: f.size ?? Math.round((f.mb || 0) * 1e6), path: f.path || null,
      createdAt: f.addedAt || 0, updatedAt: f.updatedAt || f.addedAt || 0,
    })),
    fromList: (list, prev) => ({
      ...prev,
      added: list.map((i) => ({
        id: i.id, name: i.name, cat: i.cat, folder: i.folder, device: i.device, mime: i.mime, size: i.size,
        mb: toMb(i.size || 0), path: i.path, addedAt: i.createdAt, updatedAt: i.updatedAt,
      })),
    }),
    rows: FILE_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, files: st })),
    onPushed: () => link.emit("sync.changed", { table: "files" }),
  });
  const foldersSync = useCloudList({
    uid, table: "file_folders", value: fileStore, setValue: setFileStore,
    toList: (st) => st.folders.map((f) => ({ ...f, createdAt: f.createdAt || 0, updatedAt: f.updatedAt || f.createdAt || 0 })),
    fromList: (list, prev) => ({ ...prev, folders: list }),
    rows: FOLDER_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, folders: st })),
    onPushed: () => link.emit("sync.changed", { table: "file_folders" }),
  });
  // Удаления из хранилища, которые не прошли без сети, — повторяем при входе и когда связь вернулась
  useEffect(() => {
    if (!uid) return;
    flushTrash(uid);
    const again = () => flushTrash(uid);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [uid]);

  const syncLoading = !!uid && Object.values(syncState).some((st) => st?.loading);
  const syncError = uid ? Object.values(syncState).find((st) => st?.text)?.text : null;
  const retrySync = () => { devicesSync.retry(); chatsSync.retry(); filesSync.retry(); foldersSync.retry(); };

  /* Потянули экран вниз в приложении: облако аккаунта, погода, проверка обновления */
  const pullRefresh = async () => {
    retrySync();
    window.dispatchEvent(new Event("nexa-refresh"));
    try { setAppUpdate(await checkForUpdate()); } catch {}
  };
  const pull = usePullToRefresh(isNative, pullRefresh);

  /* ── События канала (кроме текста) ── */
  const handleLinkEvent = (event, p) => {
    if (event === "pair.claim") return answerClaim(p);
    if (event === "pair.ok" || event === "pair.fail") return onPairAnswer(event, p);
    if (event === "devices.changed") return refreshDevicesSoon();
    // На другом устройстве что-то поменяли и уже отправили в облако — перечитываем эту таблицу
    if (event === "sync.changed") return refreshTableSoon(p.table);
    if (event === "find.ring") {
      if (p.target_device_id === link.self?.device_id) setFinding({ from: p.from_name || "Устройство" });
      return;
    }
    if (event === "find.stop") return onFindStop(p);
    const me = link.self?.device_id;
    const from = realNames[p.from_device] || p.from_name || "Устройство";
    if (event === "lock.on") {
      if (p.target_device_id === me) { setLocked({ from }); logActivity("lock", `«${from}» заблокировало экран NEXA`, "Демонстрация"); }
      return;
    }
    if (event === "lock.off") {
      setLockState((st) => {
        if (!st[p.target_device_id]) return st;
        showToast({ title: `«${from}» разблокировали`, kind: "device" });
        const n = { ...st }; delete n[p.target_device_id]; return n;
      });
      return;
    }
    if (event === "file.send") {
      if (p.to_device !== me || !uid) return;
      refreshTableSoon("files"); // запись о файле — в общий список «Файлов»
      logActivity("file", `Получен файл «${safeFileName(p.name)}»`, `От «${from}» · ${formatSize(p.size / 1e6)}`);
      showToast({ title: `Файл от «${from}»`, text: safeFileName(p.name), kind: "device", duration: 10000,
        action: { label: "Открыть", onClick: () => openReceivedFile(p) } });
      return;
    }
    if (event === "link.open") {
      const safe = p.to_device === me && safeUrl(p.url);
      if (!safe) return;
      const host = new URL(safe).hostname;
      logActivity("link", `Ссылка от «${from}»`, host);
      showToast({ title: `Ссылка от «${from}»`, text: host, kind: "device", duration: 12000,
        action: { label: "Открыть", onClick: () => openUrl(safe) } });
    }
  };
  // Список устройств поменялся на другом устройстве — перечитываем из облака
  const refreshDevicesSoon = () => setTimeout(() => devicesSync.retry(), 300);
  // Несколько сигналов подряд (например, ответ ассистента) — перечитываем один раз
  const refreshTimers = useRef({});
  const refreshTableSoon = (table) => {
    clearTimeout(refreshTimers.current[table]);
    const hook = { chats: chatsSync, files: filesSync, file_folders: foldersSync }[table] || devicesSync;
    refreshTimers.current[table] = setTimeout(() => hook.retry(), 400);
  };

  /* ── Подключение: это устройство выдаёт код ── */
  const pairRef = useRef(null);                  // { code, expiresAt, used, wrong, lockedUntil } — только в памяти
  const [pairView, setPairView] = useState(null); // копия для окна
  const [pairOpen, setPairOpen] = useState(false);
  const newPairCode = () => {
    const sess = { code: makePairCode(), expiresAt: Date.now() + PAIR_TTL_MS, used: false, wrong: 0, lockedUntil: 0 };
    pairRef.current = sess; setPairView({ ...sess });
  };
  const openPair = () => { newPairCode(); setPairOpen(true); };
  const closePair = () => { pairRef.current = null; setPairView(null); setPairOpen(false); };
  // «Добавить устройство»: вошли — подключение по коду, гость — демо-мастер
  const onAddDevice = () => (auth.user ? openPair() : setAddOpen(true));

  // Реальное устройство в списке (повторное подключение — обновляем, не дублируем)
  const addRealDevice = (p) => setDeviceStore((s) => {
    const now = Date.now();
    const old = s.added.find((d) => s.state[d.id]?.device_id === p.device_id);
    const info = { real: true, device_id: p.device_id, kind: p.kind, platform: p.platform };
    if (old) return { ...s, state: { ...s.state, [old.id]: { ...s.state[old.id], ...info } }, updated: { ...s.updated, [old.id]: now } };
    const type = p.platform === "mobile" ? "phone" : "laptop";
    const d = {
      id: newId(), type, name: uniqueDeviceName(p.name || "Устройство", s.added.map((x) => x.name)),
      createdAt: now, battery: null, memory: deviceType(type).memory, online: false, lastSeen: "только что",
    };
    return { ...s, added: [...s.added, d], state: { ...s.state, [d.id]: info }, updated: { ...s.updated, [d.id]: now } };
  });

  // Пришёл код: сверяем здесь, на выдавшем устройстве. Код нигде не логируем
  const answerClaim = (p) => {
    const sess = pairRef.current;
    if (!sess) return; // окна с кодом нет — отвечает не это устройство
    const fail = (reason, left) => link.emit("pair.fail", { device_id: p.device_id, reason, ...(left != null ? { left } : {}) });
    const now = Date.now();
    if (sess.lockedUntil > now) return fail("locked");
    if (sess.used) return fail("used");
    if (now > sess.expiresAt) return fail("expired");
    if (p.code !== sess.code) {
      sess.wrong += 1;
      if (sess.wrong >= PAIR_MAX_TRIES) { sess.wrong = 0; sess.lockedUntil = now + PAIR_LOCK_MS; setPairView({ ...sess }); return fail("locked"); }
      setPairView({ ...sess });
      return fail("wrong", PAIR_MAX_TRIES - sess.wrong);
    }
    sess.used = true; // код сразу недействителен
    addRealDevice(p);
    link.emit("pair.ok", { device_id: p.device_id, name: p.name || "Устройство" });
    showToast({ title: "Устройство подключено", text: p.name || "Устройство", kind: "device" });
    closePair();
    // Когда новое устройство уйдёт в облако — пусть остальные перечитают список
    setTimeout(() => link.emit("devices.changed", {}), 2500);
  };

  /* ── Подключение: это устройство вводит код ── */
  const [claim, setClaim] = useState(null); // { phase: "waiting" | "ok" | "error", text }
  const claimTimer = useRef(null);
  const claimPair = async (raw) => {
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!PAIR_CODE_RE.test(code)) return setClaim({ phase: "error", text: "Код — это 6 букв и цифр с экрана другого устройства. Проверьте, нет ли опечатки." });
    const lock = readPairLock();
    if (lock.until > Date.now()) return setClaim({ phase: "error", text: `Слишком много неверных попыток. Попробуйте через ${mmss(lock.until - Date.now())}.` });
    if (link.status !== "online") return setClaim({ phase: "error", text: "Нет связи — подключиться не получится. Проверьте интернет и попробуйте снова." });
    setClaim({ phase: "waiting" });
    const me = link.self;
    const sent = await link.emit("pair.claim", { code, device_id: me.device_id, name: me.name, kind: me.kind, platform: me.platform });
    if (!sent) return setClaim({ phase: "error", text: "Не отправилось — попробуйте ещё раз." });
    clearTimeout(claimTimer.current);
    claimTimer.current = setTimeout(() => setClaim((c) => (c?.phase === "waiting"
      ? { phase: "error", text: "Ответа нет. Проверьте, что окно с кодом открыто на другом устройстве и там вход с той же почтой." }
      : c)), PAIR_ANSWER_MS);
  };
  const onPairAnswer = (event, p) => {
    if (p.device_id !== link.self?.device_id) {
      // Подключили другое устройство — обновим список
      if (event === "pair.ok") refreshDevicesSoon();
      return;
    }
    if (event === "pair.ok") {
      clearTimeout(claimTimer.current);
      savePairLock({ wrong: 0, until: 0 });
      setClaim({ phase: "ok" });
      setTimeout(() => devicesSync.retry(), 2800); // к этому времени устройство уже в облаке
      return;
    }
    setClaim((c) => {
      if (c?.phase === "ok") return c; // другое окно уже ответило «подключено»
      clearTimeout(claimTimer.current);
      if (p.reason === "wrong") {
        const lock = readPairLock(); const wrong = lock.wrong + 1;
        if (wrong >= PAIR_MAX_TRIES) { savePairLock({ wrong: 0, until: Date.now() + PAIR_LOCK_MS }); return { phase: "error", text: "Неверный код. Попыток больше нет — подождите минуту." }; }
        savePairLock({ wrong, until: 0 });
        return { phase: "error", text: `Неверный код. Осталось попыток: ${Math.min(PAIR_MAX_TRIES - wrong, p.left ?? 5)}.` };
      }
      return { phase: "error", text: {
        expired: "Код истёк. Нажмите «Новый код» на другом устройстве.",
        used: "Этот код уже использован. Нужен новый.",
        locked: "Слишком много неверных попыток. Подождите минуту.",
      }[p.reason] };
    });
  };

  // Открыли сайт по QR (?pair=КОД): запоминаем код и сразу убираем его из адреса
  const [pendingPair, setPendingPair] = useState(() => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("pair")) return null;
      const c = (u.searchParams.get("pair") || "").toUpperCase();
      u.searchParams.delete("pair");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      return PAIR_CODE_RE.test(c) ? c : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!pendingPair || !auth.ready) return;
    if (!auth.user) { if (!showGate) setAuthOpen(true); return; } // сначала вход
    if (link.status === "online") { claimPair(pendingPair); setPendingPair(null); return; }
    if (link.status === "offline" || link.status === "denied") {
      setClaim({ phase: "error", text: "Нет связи — подключиться не получится. Откройте ссылку ещё раз, когда появится интернет." });
      setPendingPair(null);
    }
  }, [pendingPair, auth.ready, auth.user?.id, link.status]);

  /* ── Вход по QR: это устройство разрешает вход на другом ── */
  const [approve, setApprove] = useState(null); // { code } — открыто окно «Войти на другом устройстве»
  const openApprove = (code) => setApprove({ code: code || null, n: Date.now() });
  // Открыли сайт по QR входа (?login=КОД) камерой телефона: запоминаем и убираем из адреса
  const [pendingLogin, setPendingLogin] = useState(() => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("login")) return null;
      const c = (u.searchParams.get("login") || "").toUpperCase();
      u.searchParams.delete("login");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      return PAIR_CODE_RE.test(c) ? c : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!pendingLogin || !auth.ready) return;
    if (!auth.user) { if (!showGate) setAuthOpen(true); return; } // подтвердить может только вошедший
    openApprove(pendingLogin); setPendingLogin(null);
  }, [pendingLogin, auth.ready, auth.user?.id]);

  /* ── Сканер QR в приложении: QR подключения (?pair=КОД) или входа (?login=КОД) ── */
  const scanAndHandle = async () => {
    const res = await scanQr();
    if (!res) return; // закрыли сканер
    if (res.error) { showToast({ title: "Сканер недоступен", text: res.error }); return; }
    const found = parseNexaQr(res);
    if (found?.pair) return claimPair(found.pair);
    if (found?.login) return openApprove(found.login);
    showToast({ title: "Это не код NEXA", text: "Наведите камеру на QR в окне NEXA" });
  };

  /* ── Лента «Активность»: только этот браузер, последние 50 ── */
  const [activity, setActivity] = useSharedState(`nexa-activity${scope}`, loadActivity);
  const logActivity = (kind, title, text = "") => setActivity((list) =>
    [{ id: `a${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind, title, text }, ...list].slice(0, ACTIVITY_MAX));
  const [activityOpen, setActivityOpen] = useState(false);
  onTextActivity.current = (item) => logActivity("text", `Получен текст от «${realNames[item.from_device] || item.from_name || "Устройство"}»`, safeUrl(item.text) ? "Ссылка" : "Сообщение");

  /* ── «Был в сети»: Presence говорит, кто онлайн сейчас; время последней
     активности пишем в state.seenAt реального устройства (уходит в облако).
     - своё устройство отмечает себя при действиях человека — не чаще раза в минуту;
     - когда устройство пропало из Presence, его время ставят те, кто это увидел ── */
  const seenAt = useRef({}); // id строки → когда последний раз писали lastSeen
  const markSeen = (row, at = Date.now()) => {
    if (!row || at - (seenAt.current[row.id] || 0) < 60000) return;
    seenAt.current[row.id] = at;
    patchDevice(row.id, { seenAt: at });
  };
  // Последние достоверные сведения (заряд, сеть, место) — в state.sys строки устройства,
  // чтобы их было видно, когда оно не в сети. Пишем, только если они отличаются от сохранённых
  const keepSys = (row, sys) => {
    if (!row || !sys) return;
    if (sameSys(cleanSys(deviceStore.state[row.id]?.sys), sys) && deviceStore.state[row.id]?.sys?.at) return;
    patchDevice(row.id, { sys });
  };
  const selfRow = devices.find((d) => d.real && d.isSelf);
  const selfRowRef = useRef(selfRow); selfRowRef.current = selfRow;
  useEffect(() => {
    if (!uid) return;
    const active = () => { if (document.visibilityState !== "hidden") markSeen(selfRowRef.current); };
    const away = () => {
      if (document.visibilityState !== "hidden") return;
      seenAt.current = {};
      markSeen(selfRowRef.current);
      keepSys(selfRowRef.current, thisSysRef.current); // ушли в фон — сохраняем свои сведения
    };
    active();
    window.addEventListener("pointerdown", active, { passive: true });
    window.addEventListener("keydown", active);
    document.addEventListener("visibilitychange", away);
    return () => {
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      document.removeEventListener("visibilitychange", away);
    };
  }, [uid, !!selfRow]);
  // Кто подключился / отключился: сравниваем Presence с прошлым разом.
  // Первые 3 секунды после подключения к каналу не считаем — это просто «кто уже был»
  const presenceReady = useRef(false);
  const prevPeers = useRef(new Map());
  const peerKey = link.peers.map((x) => x.device_id).sort().join(",");
  useEffect(() => {
    if (link.status !== "online") { presenceReady.current = false; return; }
    const now = new Map(link.peers.map((x) => [x.device_id, x]));
    if (!presenceReady.current) {
      const t = setTimeout(() => { presenceReady.current = true; }, 3000);
      prevPeers.current = now;
      return () => clearTimeout(t);
    }
    const self = link.self?.device_id;
    for (const [id, peer] of now) {
      if (id !== self && !prevPeers.current.has(id)) logActivity("connect", `«${realNames[id] || peer.name}» подключилось`, peerLabel(peer));
    }
    for (const [id, peer] of prevPeers.current) {
      if (id === self || now.has(id)) continue;
      logActivity("disconnect", `«${realNames[id] || peer.name}» отключилось`);
      const row = devices.find((d) => d.real && d.device_id === id);
      markSeen(row);
      keepSys(row, lastPeerSys.current[id] || peer.sys); // последние сведения, которые устройство успело прислать
    }
    prevPeers.current = now;
  }, [peerKey, link.status]);

  /* ── Демонстрационная блокировка экрана NEXA ── */
  const [locked, setLocked] = useState(null);    // меня заблокировали: { from }
  const [lockState, setLockState] = useState({}); // я заблокировал: { device_id: "locked" }
  const lockDevice = async (d) => {
    const ok = await link.emit("lock.on", { target_device_id: d.device_id, id: newId() });
    if (!ok) { showToast({ title: "Не получилось заблокировать", text: "Нет связи — попробуйте ещё раз", kind: "error" }); return; }
    setLockState((st) => ({ ...st, [d.device_id]: "locked" }));
    logActivity("lock", `Экран NEXA на «${d.name}» заблокирован`, "Демонстрация, не системная блокировка");
  };
  const unlockSelf = () => {
    const from = locked?.from;
    setLocked(null);
    link.emit("lock.off", { target_device_id: link.self.device_id });
    logActivity("lock", "Экран NEXA разблокирован", from ? `Блокировали с «${from}»` : "");
  };

  /* ── Отправить файл на устройство: настоящий файл через облачное хранилище.
     Загружаем в корзину аккаунта (как в «Файлах»), запись уходит в таблицу files,
     получателю — событие file.send с id; он открывает файл по своей подписанной ссылке ── */
  const [sendState, setSendState] = useState({}); // device_id → { state, progress, name, error }
  const sendCtl = useRef({});
  const sendFileTo = (d, file) => {
    const key = d.device_id;
    const set = (v) => setSendState((st) => ({ ...st, [key]: v && { ...st[key], ...v } }));
    const problem = fileProblem(file);
    const name = safeFileName(file.name);
    if (problem) { setSendState((st) => ({ ...st, [key]: { state: "error", name, error: `«${name}»: ${problem.toLowerCase()}` } })); return; }
    if (!uid) { setSendState((st) => ({ ...st, [key]: { state: "error", name, error: "Отправлять файлы можно только с аккаунтом" } })); return; }
    const id = newId();
    setSendState((st) => ({ ...st, [key]: { state: "uploading", progress: 0, name } }));
    const ctl = uploadToCloud({ uid, id, file, onProgress: (pr) => set({ progress: pr }) });
    sendCtl.current[key] = ctl;
    ctl.promise.then(async ({ path }) => {
      rememberLocal(uid, id, file);
      const now = Date.now();
      setFileStore((s0) => ({ ...s0, added: [...s0.added, {
        id, name, cat: catFromFile(file), folder: null, device: link.self?.name || uploadDevice(),
        mb: toMb(file.size), size: file.size, mime: file.type || "", path, addedAt: now, updatedAt: now,
      }] }));
      const ok = await link.emit("file.send", { id, to_device: key, name, size: file.size, mime: file.type || "" });
      if (!ok) { set({ state: "error", error: "Файл в «Файлах», но устройство не получило уведомление — нет связи" }); return; }
      set({ state: "done" });
      logActivity("sent", `Файл «${name}» отправлен на «${d.name}»`);
      setTimeout(() => setSendState((st) => (st[key]?.state === "done" ? { ...st, [key]: null } : st)), 5000);
    }).catch((err) => {
      if (err?.kind === "abort") { setSendState((st) => ({ ...st, [key]: null })); return; }
      set({ state: "error", error: err?.text || "Не отправилось — попробуйте ещё раз" });
    }).finally(() => { delete sendCtl.current[key]; });
  };
  const cancelSend = (d) => sendCtl.current[d.device_id]?.abort();

  /* ── Открыть ссылку на устройстве ── */
  const openLinkOn = async (d, url) => {
    const safe = safeUrl(url);
    if (!safe) return false;
    const ok = await link.emit("link.open", { id: newId(), to_device: d.device_id, url: safe });
    if (ok) {
      showToast({ title: `Ссылка отправлена на «${d.name}»`, text: new URL(safe).hostname, kind: "device" });
      logActivity("sent", `Ссылка отправлена на «${d.name}»`, new URL(safe).hostname);
    }
    return ok;
  };
  // Открыть пришедшую ссылку / файл (только по нажатию человека)
  const openUrl = (url) => {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const openReceivedFile = async (p) => {
    const url = await fileUrl({ id: p.id, path: `${uid}/${p.id}`, name: p.name }, uid);
    if (url) openUrl(url);
    else showToast({ title: "Файл недоступен", text: "Нет связи или файл уже удалили", kind: "error" });
  };

  /* ── Найти устройство ── */
  const [finding, setFinding] = useState(null);     // меня ищут: { from }
  const [findState, setFindState] = useState({});   // ищем мы: { device_id: "ringing" | "found" | "timeout" }
  const findTimers = useRef({});
  const clearFindLater = (id) => setTimeout(() => setFindState((st) => { const n = { ...st }; delete n[id]; return n; }), 5000);
  const findDevice = async (d) => {
    if (!d.real || !d.online || d.isSelf) return;
    setFindState((st) => ({ ...st, [d.device_id]: "ringing" }));
    const ok = await link.emit("find.ring", { target_device_id: d.device_id, id: newId() });
    if (!ok) {
      setFindState((st) => ({ ...st, [d.device_id]: "timeout" })); clearFindLater(d.device_id);
      showToast({ title: "Не получилось позвать устройство", text: "Нет связи — попробуйте ещё раз" });
      return;
    }
    clearTimeout(findTimers.current[d.device_id]);
    // Не ответило за минуту с запасом — «Не ответило»
    findTimers.current[d.device_id] = setTimeout(() => {
      setFindState((st) => (st[d.device_id] === "ringing" ? { ...st, [d.device_id]: "timeout" } : st));
      clearFindLater(d.device_id);
    }, FIND_RING_MS + 5000);
  };
  const onFindStop = (p) => {
    setFindState((st) => (st[p.target_device_id] ? { ...st, [p.target_device_id]: p.found ? "found" : "timeout" } : st));
    clearTimeout(findTimers.current[p.target_device_id]);
    clearFindLater(p.target_device_id);
    if (p.found) {
      showToast({ title: "Нашлось", text: p.from_name || "Устройство", kind: "device" });
      logActivity("found", `«${realNames[p.target_device_id] || p.from_name || "Устройство"}» нашлось`);
    }
  };
  // Меня нашли (или минута прошла): выключаем сигнал и сообщаем
  const stopFinding = (found) => {
    setFinding(null);
    link.emit("find.stop", { target_device_id: link.self.device_id, found });
  };
  // Переименовать реальное устройство
  const renameDevice = (id, name) => {
    setDeviceStore((s) => ({ ...s, added: s.added.map((d) => (d.id === id ? { ...d, name } : d)), updated: { ...s.updated, [id]: Date.now() } }));
    showToast({ title: "Название сохранено", text: name, kind: "device" });
    setTimeout(() => link.emit("devices.changed", {}), 2000);
  };

  // «Удалить мои данные»: облако → потом всё локальное этого аккаунта.
  // Возвращает текст ошибки или null
  const deleteMyData = async () => {
    if (!uid) return null;
    try {
      await deleteAllMine(uid);
    } catch (e) {
      return navigator.onLine === false || /fetch|network/i.test(String(e?.message))
        ? "Нет связи — удалить не получилось. Попробуйте, когда появится интернет."
        : "Не получилось удалить. Попробуйте ещё раз чуть позже.";
    }
    setDeviceStore({ v: 2, state: {}, added: [], removed: [], updated: {} });
    setChatsStore([]);
    setFileStore({ added: [], removed: [], renamed: {}, folders: [] });
    cacheClearScope(uid);
    setOpenDeviceId(null);
    showToast({ title: "Данные удалены", text: "Устройства и чаты аккаунта стёрты" });
    return null;
  };
  const [addOpen, setAddOpen] = useState(false);            // открыто ли окно добавления
  const uploadInputRef = useRef(null);                      // выбор файлов по команде ассистента
  const [openDeviceId, setOpenDeviceId] = useState(null);   // чей экран устройства открыт

  /* Передача файла на устройство.
     transfer — открытое меню { file, card, anchor, sendingId }:
       card — где карточка файла (откуда полетит), anchor — где кнопка;
     flight — идущий полёт карточки { file, from, to, device };
     received — у каких устройств отметка «Получен файл» { id: { name } } */
  const [transfer, setTransfer] = useState(null);
  const [flight, setFlight] = useState(null);
  const [received, setReceived] = useState({});
  const receivedTimers = useRef({});
  useEffect(() => () => Object.values(receivedTimers.current).forEach(clearTimeout), []);
  const openTransfer = (file, cardEl, btnEl) => {
    setTransfer({ file, card: cardEl.getBoundingClientRect(), anchor: btnEl.getBoundingClientRect(), sendingId: null });
  };
  // Файл «дошёл»: уведомление и отметка у устройства, которая сама пропадает
  const finishTransfer = (file, device) => {
    showToast({ title: `Отправлено на ${device.name}`, text: file.name });
    setReceived((r) => ({ ...r, [device.id]: { name: file.name } }));
    clearTimeout(receivedTimers.current[device.id]);
    receivedTimers.current[device.id] = setTimeout(() => {
      setReceived(({ [device.id]: _, ...rest }) => rest);
    }, RECEIVED_MS);
  };
  const pickTransfer = (device, targetEl) => {
    const t = transfer;
    if (!t) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Без анимации (так настроено в системе) — сразу уведомление
    if (reduce || !targetEl) {
      setTransfer(null);
      finishTransfer(t.file, device);
      return;
    }
    setTransfer({ ...t, sendingId: device.id });
    setFlight({ file: t.file, from: t.card, to: targetEl.getBoundingClientRect(), device });
  };
  const endFlight = () => {
    if (flight) finishTransfer(flight.file, flight.device);
    setFlight(null);
    setTransfer(null);
  };
  const openDevice = devices.find((d) => d.id === openDeviceId);
  const [filesDevice, setFilesDevice] = useState(null);     // отбор файлов по устройству
  const onDeviceFile = (d) => (f) => f.device === d.name || f.device === d.alias;

  // Переход по меню всегда открывает "Файлы" без фильтра

  // Плавная прокрутка колёсиком — на всех экранах, кроме ассистента
  useSmoothScroll(tab !== "assistant");

  // Переход по меню закрывает и экран устройства
  const goTab = (t) => { setFilesFilter(null); setFilesDevice(null); setOpenDeviceId(null); setActivityOpen(false); setTab(t); };
  // Нажали на виджет рабочего стола: «Расписание» → «Сегодня», «Погода» → Главная
  const goTabRef = useRef(goTab); goTabRef.current = goTab;
  /* Свайп между разделами. Ассистент: вправо — открыть историю диалогов
     (а не «Сегодня»), влево — Главная. Открытую шторку истории закрывает
     свайп влево (по самой шторке — её собственный жест, по затемнению — здесь) */
  const [swipeDir, setSwipeDir] = useState(null); // откуда въезжает новый экран: "next" | "prev"
  useTabSwipe(
    () => ({ tab, sub: !!openDeviceId || activityOpen }),
    (dir) => {
      if (tab === "assistant") {
        if (document.querySelector(".nx-hist-drawer.is-open")) {
          if (dir === "next") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          return; // при открытой истории разделы не переключаем
        }
        if (dir === "prev") { window.dispatchEvent(new Event("nexa-open-history")); return; }
      }
      const i = SWIPE_ORDER.indexOf(tab) + (dir === "next" ? 1 : -1);
      if (i < 0 || i >= SWIPE_ORDER.length) return; // крайняя вкладка — дальше некуда
      setSwipeDir(dir);
      goTab(SWIPE_ORDER[i]);
    },
  );
  // Направление — пометка у body (до отрисовки нового экрана): по ней CSS
  // выбирает въезд сбоку вместо обычного появления
  useLayoutEffect(() => {
    if (swipeDir) document.body.dataset.swipe = swipeDir;
    else delete document.body.dataset.swipe;
  }, [swipeDir]);
  // Направление нужно только для въезда нового экрана — потом сбрасываем
  useEffect(() => {
    if (!swipeDir) return;
    const t = setTimeout(() => setSwipeDir(null), 260);
    return () => clearTimeout(t);
  }, [swipeDir, tab]);
  useEffect(() => onWidgetTab((t) => goTabRef.current(t)), []);

  // Аккаунт: кто вошёл (Supabase) — см. начало NexaApp. Гостевой режим и окно входа
  const [guest, setGuest] = useState(readGuest);
  const [authOpen, setAuthOpen] = useState(false);
  // Экран входа при первом запуске: аккаунты доступны, Supabase ответил,
  // никто не вошёл и «без аккаунта» ещё не выбирали
  const showGate = authAvailable && auth.ready && !auth.user && !guest;
  // Вошли — гостевой режим больше не нужен, окно входа закрываем.
  // Вышли — остаёмся гостем, экран первого запуска не возвращаем
  const prevUser = useRef(null);
  const authSettled = useRef(false); // первый ответ Supabase уже был (вход из прошлого раза — не новость)
  useEffect(() => {
    if (!auth.ready) return;
    const was = prevUser.current, now = auth.user;
    if (now && !was) {
      saveGuest(false); setGuest(false); setAuthOpen(false);
      if (authSettled.current) showToast({ title: "Вы вошли", text: now.email, kind: "success" });
    } else if (!now && was) {
      saveGuest(true); setGuest(true);
      showToast({ title: "Вы вышли из аккаунта", text: "NEXA работает без входа", kind: "info" });
    }
    prevUser.current = now;
    authSettled.current = true;
  }, [auth.ready, auth.user?.id]);

  // В приложении: убрать заставку и проявить интерфейс (см. startIntro)
  useEffect(() => { startIntro(); }, []);

  // Новая версия приложения: проверяем при запуске и когда приложение
  // снова открыли из фона (на сайте checkForUpdate сразу возвращает null)
  const [appUpdate, setAppUpdate] = useState(null);
  useEffect(() => {
    if (!isNative) return;
    const check = () => checkForUpdate().then(setAppUpdate);
    check();
    const sub = CapApp.addListener("resume", check);
    return () => { sub.then((h) => h.remove()); };
  }, []);

  // История разделов — для кнопки «Назад» на Android
  const tabHistory = useRef([]);
  const prevTab = useRef(tab);
  const goingBack = useRef(false);
  useEffect(() => {
    if (prevTab.current !== tab && !goingBack.current) {
      tabHistory.current = [...tabHistory.current, prevTab.current].slice(-20);
    }
    goingBack.current = false;
    prevTab.current = tab;
  }, [tab]);

  // Свежие значения для обработчика «Назад» (он подключается один раз)
  const backState = useRef({});
  backState.current = { openDeviceId, tab, blocked: !!appUpdate?.required, activityOpen, locked: !!locked };
  useEffect(() => {
    if (!isNative) return;
    const sub = CapApp.addListener("backButton", () => {
      // 0) Версия устарела — экран обновления не закрывается, просто сворачиваем
      if (backState.current.blocked) { CapApp.minimizeApp(); return; }
      // Экран входа при первом запуске, панель почты ещё не открыта — сворачиваем
      // (открыта — Esc ниже вернёт с кода к почте, с почты свернёт приложение)
      const gate = document.querySelector(".nx-auth-gate");
      if (gate && !gate.querySelector(".nx-auth-step")) { CapApp.minimizeApp(); return; }
      // 1) Открыто окно, меню, уведомления или история чатов — закрываем его.
      //    У всех них закрытие уже работает по Esc — нажимаем его за пользователя
      const layer = document.querySelector('[role="dialog"], [role="menu"], .nx-notes');
      if (layer) {
        const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }
      const { openDeviceId: dev, tab: cur, activityOpen: act, locked: lk } = backState.current;
      // Экран NEXA заблокирован (демонстрация) — «Назад» только сворачивает
      if (lk) { CapApp.minimizeApp(); return; }
      // Открыта «Активность» — назад к Главной
      if (act) { setActivityOpen(false); return; }
      // 2) Открыт экран устройства — назад к списку
      if (dev) { setOpenDeviceId(null); return; }
      // 3) Был другой раздел — возвращаемся в него
      const prev = tabHistory.current.pop();
      if (prev && prev !== cur) { goingBack.current = true; setFilesFilter(null); setFilesDevice(null); setTab(prev); return; }
      if (cur !== "home") { goingBack.current = true; setTab("home"); return; }
      // 4) На Главной — сворачиваем приложение (как обычно на Android)
      CapApp.minimizeApp();
    });
    return () => { sub.then((h) => h.remove()); };
  }, []);
  // Открыть экран устройства. С «Ассистента» (там своя раскладка) — через Главную
  const showDevice = (id) => {
    if (tab === "assistant") setTab("home");
    setOpenDeviceId(id);
  };
  // Из "Медиа" в "Файлы" с фильтром по категории (null — без фильтра)
  const openCategory = (cat) => { setFilesFilter(cat); setFilesDevice(null); setTab("files"); };
  // Из окна устройства в "Файлы" с отбором по этому устройству
  const openDeviceFiles = (id) => {
    setFilesFilter(null);
    setFilesDevice(id);
    setOpenDeviceId(null);
    setTab("files");
  };
  const openFolderFromSearch = (folderId) => {
    setFilesFilter(null);
    setFilesDevice(null);
    setSearchFolder(folderId);
    setTab("files");
  };
  // Открыть конкретный диалог ассистента из глобального поиска
  const openChatFromSearch = (chatId) => {
    setSearchChatId(chatId);
    setTab("assistant");
  };
  /* Удаление: демо-файл запоминаем в removed, настоящий убираем из списка
     и вместе с содержимым — из облака (без сети — удалим, когда связь вернётся)
     и из этого браузера */
  const deleteFile = (f) => {
    setFileStore((s) => {
      const renamed = { ...s.renamed };
      delete renamed[f.id];
      return {
        ...s, renamed,
        added: s.added.filter((x) => x.id !== f.id),
        removed: f.uploaded ? s.removed : [...s.removed, f.id],
      };
    });
    if (f.uploaded) {
      forgetUrl(FILE_SCOPE, f.id);
      cacheDel(cacheKey(FILE_SCOPE, f.id));
      if (uid && f.path) removeFromCloud(uid, [f.path]);
    }
    setOpenFile(null);
  };
  // Переименование меняет только сведения: в хранилище файл лежит под своим id
  const renameFile = (id, name) => {
    const clean = safeFileName(name);
    setFileStore((s) => (s.added.some((f) => f.id === id)
      ? { ...s, added: s.added.map((f) => (f.id === id ? { ...f, name: clean, updatedAt: Date.now() } : f)) }
      : { ...s, renamed: { ...s.renamed, [id]: clean } }));
  };
  // Новая папка внутри parent (null — в корне). Возвращает её id
  const createFolder = (name, parent) => {
    const now = Date.now();
    const id = uid ? newId() : `u-${now}`;
    setFileStore((s) => ({ ...s, folders: [...s.folders, { id, name: safeFileName(name), parent, createdAt: now, updatedAt: now }] }));
    return id;
  };
  /* Загрузка файлов в папку folder.
     Вошедший: байты — в облако (Supabase Storage, с настоящим процентом и отменой),
     сведения — в список (он сам уйдёт в таблицу files). Гость: байты — в этот браузер.
     Файл появляется в списке только после того, как содержимое сохранено */
  const uploadCtl = useRef({}); // id загрузки → { abort }
  const guestSeq = useRef(0);
  const addFiles = (fileList, folder) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    const rejected = [];
    picked.forEach((file) => {
      const problem = fileProblem(file);
      if (problem) rejected.push(`«${safeFileName(file.name)}» — ${problem.toLowerCase()}`);
      else startUpload(file, folder);
    });
    if (rejected.length) {
      showToast({ title: rejected.length === 1 ? "Файл не добавлен" : `Не добавлено: ${rejected.length}`, text: rejected.slice(0, 2).join("; "), kind: "error" });
    }
  };
  const startUpload = (file, folder, fileId) => {
    const upId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // У гостя id — число (как у демо-файлов), у аккаунта — uuid (как в облаке)
    const id = fileId ?? (uid ? newId() : Date.now() * 100 + (guestSeq.current++ % 100));
    const name = safeFileName(file.name);
    const meta = {
      id, name, cat: catFromFile(file), folder, device: uploadDevice(),
      mb: toMb(file.size), size: file.size, mime: file.type || "", addedAt: Date.now(),
    };
    const patch = (fields) => setUploads((list) => list.map((u) => (u.id === upId ? { ...u, ...fields } : u)));
    const fail = (text) => patch({ status: "error", error: text });
    const done = (extra) => {
      setUploads((list) => list.filter((u) => u.id !== upId));
      delete uploadCtl.current[upId];
      setFileStore((s) => ({ ...s, added: [...s.added, { ...meta, ...extra, updatedAt: meta.addedAt }] }));
      showToast({ title: "Файл добавлен", text: `${name} → ${folderName(folders, folder)}` });
    };
    setUploads((list) => [...list, { id: upId, fileId: id, name, folder, progress: 0, status: "uploading", file }]);

    if (!uid) {
      // Гость: содержимое — только в этот браузер
      rememberLocal("guest", id, file);
      patch({ progress: 1 });
      setTimeout(() => done({}), 250);
      return;
    }
    if (navigator.onLine === false) { fail("Нет связи — файл не загрузился"); return; }
    const ctl = uploadToCloud({ uid, id, file, onProgress: (pr) => patch({ progress: pr }) });
    uploadCtl.current[upId] = ctl;
    ctl.promise
      .then(({ path }) => { rememberLocal(uid, id, file); done({ path }); })
      .catch((err) => {
        delete uploadCtl.current[upId];
        if (err?.kind === "abort") setUploads((list) => list.filter((u) => u.id !== upId));
        else fail(err?.text || "Не загрузилось — попробуйте ещё раз");
      });
  };
  // Отменить идущую загрузку, повторить неудачную или убрать строку с ошибкой
  const uploadAction = (upId, action) => {
    const u = uploads.find((x) => x.id === upId);
    if (!u) return;
    if (action === "cancel") { uploadCtl.current[upId]?.abort(); return; }
    setUploads((list) => list.filter((x) => x.id !== upId));
    if (action === "retry") startUpload(u.file, u.folder, u.fileId);
  };
  const closeViewer = () => setOpenFile(null);

  // Отдельный эффект для скрытия скролла на ассистенте
  useEffect(() => {
    document.body.style.overflow = tab === "assistant" ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [tab]);

  // Сбрасываем «заказы» при уходе с соответствующего экрана,
  // чтобы при следующем заходе они не сработали повторно
  useEffect(() => {
    if (tab !== "files") setSearchFolder(null);
    if (tab !== "assistant") setSearchChatId(null);
  }, [tab]);
  return (
    <div style={{
      display: "flex",
      // ВАЖНО про размер на весь экран: "100vh" — это ровно высота окна
      // браузера. Если у тебя всё равно остаются пустые поля по краям,
      // скорее всего дело не в этом файле, а в стандартных стилях Vite
      // (файл src/index.css), которые по умолчанию центрируют и обрезают
      // содержимое страницы — см. пояснение в чате, как это убрать.
      minHeight: "100vh", width: "100%",
      background: C.bg, color: C.text,
      fontFamily: fontBody,
    }}>
            <style>{`
        /* Отступы под вырез камеры и системную полосу (safe area).
           В Android-приложении Capacitor передаёт их в --safe-area-inset-*,
           в браузере — через env(). Используйте var(--sat) и var(--sab) */
        :root {
          --sat: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
          --sab: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
        }
        /* В приложении: экран ассистента и панель истории закреплены сверху —
           сдвигаем их под статус-бар, а низ ассистента — над нижней полосой */
        /* Экран начинается с самого верха, а под статус-бар — отступ: так сплошной фон
           закрывает и полосу статус-бара, и линии фона страницы там не торчат обрывками */
        .nx-native .ng-assistant-wrapper { top: var(--vvt, 0px) !important; height: var(--vvh, 100%) !important; padding-top: var(--sat); box-sizing: border-box; }
        @media (max-width: 768px) {
        }
        /* Шрифты лежат в public/fonts — так они одинаковые на любом устройстве,
           даже если у человека они не установлены (раньше Raleway брался
           только из системы, и на чужих телефонах подменялся системным) */
        @font-face {
          font-family: 'Raleway';
          src: url('/fonts/Raleway-Variable.ttf') format('truetype');
          font-weight: 100 900;
          font-display: swap;
        }
        @font-face {
          font-family: 'Space Grotesk';
          src: url('/fonts/SpaceGrotesk-Variable.ttf') format('truetype');
          font-weight: 300 700;
          font-display: swap;
        }
        
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Regular.ttf') format('truetype');
        font-weight: 400;
        font-display: swap;
        unicode-range: U+0030-0039;
}
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Medium.ttf') format('truetype');
        font-weight: 500;
        font-display: swap;
        unicode-range: U+0030-0039;
}
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Bold.ttf') format('truetype');
        font-weight: 600 700;
        font-display: swap;
        unicode-range: U+0030-0039;
}

        body, button, input, textarea, select {
          font-family: 'NexaNumbers', 'Raleway', sans-serif;
        }
        * {
       -webkit-tap-highlight-color: transparent;
      }
        button, a, [role="button"] {
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
        touch-action: manipulation;
}
        .ng-display { font-family: 'Space Grotesk', sans-serif; }
        .ng-greeting {
        font-size: 28px !important;
        line-height: 1.3 !important;
        font-weight: 600 !important;
}
        input::placeholder { color: ${C.mutedSoft}; }

        /* ─── Переменные тем ────────────────────────────────────
           Тёмная тема по умолчанию. Светлая включается атрибутом
           data-theme="light" на <html>. Меняешь цвет здесь, и он
           меняется во всём приложении. */
        :root, :root[data-theme="dark"] {
          --bg: #01090F;  --panel: #0E1016;  --panel-2: #12141B;
          --border: #1C1E26;  --border-soft: #22242C;
          --text: #FFFFFF;  --text-strong: #FFFFFF;  --text-soft: #EAF2F7;
          --muted: #92A2AF;  --muted-soft: #6B6B72;
          --blue: #4A6FFF;  --blue-dark: #1A2454;  --blue-light: #7C97FF;
          --mint: #00FFDF;  --mint-dark: #0F3D38;  --mint-light: #7EF0E0;
          --green: #47DE8E;  --red: #DE4747;
          --on-accent: #07080C;  --chip: #2A2C34;
          --glass: rgba(20, 22, 28, 0.92);
          --glass-border: rgba(255, 255, 255, 0.08);
          --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          --hover: rgba(255, 255, 255, 0.05);  --pressed: rgba(255, 255, 255, 0.10);
          --input-glow: 0 0 60px color-mix(in srgb, #4A6FFF 50%, transparent);
          --border-strong: rgba(255, 255, 255, 0.28);
          --scrim: rgba(0, 0, 0, 0.6);
          --on-fold: #FFFFFF;
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
          /* Грани складки Главной (те же цвета, что в fold.svg) */
          --fold-hf-a1: #0C336D; --fold-hf-a2: #139CB4; --fold-hf-b1: #00FFDF; --fold-hf-b2: #2DD4BF; --fold-hf-c1: #9DB1FD; --fold-hf-c2: #042AA5;
          color-scheme: dark;
        }
        :root[data-theme="light"] {
          /* Фон мягкий серо-голубой, а не чисто белый: меньше режет глаза.
             Панели чуть светлее фона, поэтому карточки читаются без теней. */
          --bg: #EDF1F5;  --panel: #F8FAFC;  --panel-2: #F1F4F8;
          --border: #D6DDE6;  --border-soft: #E2E7EE;
          /* Текст и подписи темнее, чем были: на светлом фоне серый «тает» */
          --text: #111933;  --text-strong: #0A1024;  --text-soft: #1B2340;
          --muted: #444E63;  --muted-soft: #667085;
          --blue: #4A6FFF;  --blue-dark: #DCE4FF;  --blue-light: #7C97FF;
          --mint: #10BFA8;  --mint-dark: #D3F2EC;  --mint-light: #7EE6D8;
          --green: #1C9E5E;  --red: #D23C3C;
          --on-accent: #07080C;  --chip: #CBD3DE;
          --glass: rgba(248, 250, 252, 0.9);
          --glass-border: rgba(24, 32, 58, 0.10);
          --glass-shadow: 0 6px 20px rgba(24, 32, 58, 0.10);
          --hover: rgba(24, 32, 58, 0.06);  --pressed: rgba(24, 32, 58, 0.12);
          --input-glow: none;
          --border-strong: rgba(24, 32, 58, 0.24);
          --scrim: rgba(10, 16, 36, 0.38);
          --on-fold: #FFFFFF;
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
          /* Грани складки Главной (те же цвета, что в fold.svg) */
          --fold-hf-a1: #0C336D; --fold-hf-a2: #139CB4; --fold-hf-b1: #00FFDF; --fold-hf-b2: #2DD4BF; --fold-hf-c1: #9DB1FD; --fold-hf-c2: #042AA5;
          color-scheme: light;
        }
        body { transition: background-color 200ms ease, color 200ms ease; }

        html, body, #root {
        margin: 0; padding: 0; width: 100%; min-height: 100vh;
        background: var(--bg);
        color: var(--text);
}
        body { display: block !important; place-items: unset !important; }
        /* Главная на компьютере: высота почти на всё окно (минус футер
           и отступы), содержимое по центру по вертикали */
        .ng-home-desktop {
          display: flex; flex-direction: column; justify-content: center;
          min-height: calc(100vh - 170px);
        }
        .ng-home-mobile { display: none; }

        /* ─── Десктопные показы ─────────────────────────────── */
        .ng-mobile-tabbar { display: none; }
        .ng-hamburger { display: none; }
        .nx-assistant-ver { display: none; }
        .ng-devices-list { display: block; }
        .ng-devices-mobile { display: none; }

        /* Спектральный фон ассистента (AssistantSpectrum): маленький холст,
           растянутый на весь экран. Мягкое свечение и размытие разрешены только
           здесь (см. CLAUDE.md). Без масок и фильтров: середину приглушает сам
           холст, браузеру остаётся только растянуть готовую картинку */
        .nx-spectrum {
          position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0;
          pointer-events: none; display: block;
        }
        /* Складка Главной (HomeFold): грани вращаются вокруг общего сгиба */
        .nx-homefold path { transform-box: view-box; transform-origin: 372px 663px; }
        .nx-homefold.is-intro .f-c { animation: nx-hf-c 860ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .nx-homefold.is-intro .f-b { animation: nx-hf-b 860ms cubic-bezier(0.16, 1, 0.3, 1) 170ms both; }
        .nx-homefold.is-intro .f-a { animation: nx-hf-a 860ms cubic-bezier(0.16, 1, 0.3, 1) 340ms both; }
        @keyframes nx-hf-c { from { opacity: 0; transform: rotate(-38deg) scale(0.3); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        @keyframes nx-hf-b { from { opacity: 0; transform: rotate(32deg) scale(0.3); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        @keyframes nx-hf-a { from { opacity: 0; transform: rotate(-26deg) scale(0.35); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        /* Новое устройство: грани коротко расходятся от сгиба и возвращаются */
        .nx-homefold.is-pulse .f-c { animation: nx-hp-c 640ms cubic-bezier(0.4, 0, 0.2, 1); }
        .nx-homefold.is-pulse .f-b { animation: nx-hp-b 640ms cubic-bezier(0.4, 0, 0.2, 1) 60ms; }
        .nx-homefold.is-pulse .f-a { animation: nx-hp-a 640ms cubic-bezier(0.4, 0, 0.2, 1) 120ms; }
        @keyframes nx-hp-c { 45% { transform: translate(-22px, -18px) rotate(-3deg); } }
        @keyframes nx-hp-b { 45% { transform: translate(22px, -16px) rotate(3deg); } }
        @keyframes nx-hp-a { 45% { transform: translate(18px, 20px) rotate(-2deg); } }
        /* Грани уступают место картинке с тенями */
        .nx-homefold.is-settle { opacity: 0; transition: opacity 300ms ease; }
        @media (prefers-reduced-motion: reduce) { .nx-homefold path { animation: none !important; } }

        /* Полоска заполнения (место на устройстве, хранилище) — тонкая, 4px */
        .nx-sys-bar {
          display: block; width: 200px; max-width: 100%; height: 4px; margin-top: 8px; overflow: hidden;
          border-radius: 4px; background: color-mix(in srgb, var(--text) 10%, transparent);
        }
        .nx-sys-bar > span { display: block; height: 100%; }
        .nx-sys-bar-wide { width: 100%; }
        .nx-storage-head + .nx-only-mobile .nx-sys-bar-wide { margin-top: 0; }

        /* ─── История диалогов (ChatHistory) ───────────────────
           Компьютер: постоянная колонка слева от чата */
        .nx-hist {
          width: 264px; flex-shrink: 0; min-height: 0; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 10px;
          padding-right: 20px; margin-right: 28px; border-right: 1px solid var(--border);
        }
        @media (max-width: 1100px) { .nx-hist { width: 228px; padding-right: 14px; margin-right: 20px; } }
        .nx-hist-head { display: flex; align-items: center; justify-content: space-between; min-height: 18px; }
        .nx-hist-label { font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted-soft); padding-left: 4px; }
        .nx-hist-new {
          display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0;
          padding: 10px 14px; border: 1px solid var(--border-strong); background: var(--panel);
          color: var(--text); font: inherit; font-size: 14px; cursor: pointer;
        }
        .nx-hist-search {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 8px 10px;
          border: 1px solid var(--border); border-radius: 4px; background: var(--panel); cursor: text;
        }
        .nx-hist-search:focus-within { border-color: var(--border-strong); }
        .nx-hist-search input {
          flex: 1; min-width: 0; background: transparent; border: none; outline: none;
          color: var(--text); font: inherit; font-size: 13px; padding: 0;
        }
        .nx-hist-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin: 0 -4px; padding: 0 4px 4px; }
        .nx-hist-section + .nx-hist-section { margin-top: 10px; }
        .nx-hist-group {
          display: flex; align-items: center; gap: 6px; padding: 6px 10px 3px;
          font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-soft);
        }
        .nx-hist-row {
          position: relative; display: flex; align-items: center;
          border: 1px solid transparent; border-radius: 4px;
        }
        .nx-hist-row:hover { background: var(--hover); }
        .nx-hist-row.is-active { background: var(--panel); border-color: var(--border); }
        /* Открытый диалог — тонкая мятная грань слева */
        .nx-hist-row.is-active::before {
          content: ""; position: absolute; left: -1px; top: 8px; bottom: 8px; width: 2px; background: var(--mint);
        }
        .nx-hist-open {
          flex: 1; min-width: 0; padding: 7px 4px 7px 10px; text-align: left;
          background: transparent; border: none; color: var(--text); font: inherit; font-size: 13.5px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
        }
        .nx-hist-more {
          flex-shrink: 0; width: 28px; height: 28px; margin-right: 2px; padding: 0;
          display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; opacity: 0;
        }
        /* «⋯» видно при наведении, у открытого диалога и на сенсорных экранах */
        .nx-hist-row:hover .nx-hist-more, .nx-hist-row.is-active .nx-hist-more,
        .nx-hist-more:focus-visible, .nx-hist-more[aria-expanded="true"] { opacity: 1; }
        @media (hover: none) { .nx-hist-more { opacity: 1; } }
        .nx-hist-more:hover, .nx-hist-more[aria-expanded="true"] { background: var(--hover); color: var(--text); }
        .nx-hist-rename {
          flex: 1; min-width: 0; margin: 2px; padding: 5px 8px; outline: none;
          border: 1px solid var(--mint); border-radius: 4px; background: var(--bg); color: var(--text);
          font: inherit; font-size: 13.5px;
        }
        .nx-hist-empty { padding: 6px 10px; font-size: 13px; line-height: 1.5; color: var(--muted-soft); }
        .nx-hist-sync {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; flex-shrink: 0;
          padding: 8px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; color: var(--muted);
        }
        .nx-hist-account {
          display: flex; align-items: center; gap: 10px; width: 100%; flex-shrink: 0; box-sizing: border-box;
          padding: 9px 10px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel);
          color: var(--text); font: inherit; text-align: left; cursor: pointer;
        }
        .nx-hist-account:hover { border-color: var(--border-strong); }
        .nx-hist-avatar {
          width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-strong); border-radius: 10px;
        }
        .nx-hist-email { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nx-hist-sub { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Крестик шторки — круглая кнопка-значок */
        .nx-hist-close {
          width: 36px; height: 36px; padding: 0; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-strong); border-radius: 50%; background: transparent; cursor: pointer;
        }
        .nx-hist-close:active { background: var(--pressed); }
        .nx-hist-scrim { display: none; }
        /* Меню диалога: «Закрепить», «Переименовать», «Удалить» */
        .nx-hist-menu {
          z-index: 400; min-width: 184px; padding: 4px; box-sizing: border-box;
          background: var(--panel); border: 1px solid var(--border-strong); border-radius: 4px;
        }
        .nx-hist-menu > button {
          display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px;
          background: transparent; border: none; border-radius: 4px; color: var(--text);
          font: inherit; font-size: 13.5px; text-align: left; cursor: pointer;
        }
        .nx-hist-menu > button:hover, .nx-hist-menu > button:focus-visible { background: var(--hover); outline: none; }
        .nx-hist-menu > button.is-danger { color: var(--red); }
        @media (prefers-reduced-motion: reduce) {
          .nx-hist-drawer, .nx-hist-drawer.is-open, .nx-hist-scrim { transition: none !important; }
        }
        
        
        @keyframes ng-screen-in {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.ng-screen-anim {
  animation: ng-screen-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
  min-height: 100%;
}
  .ng-assistant-anim {
  animation: ng-screen-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
  /* Переход свайпом: новый раздел коротко въезжает сбоку (200 мс).
     next — пришёл справа (листали влево), prev — слева */
  body[data-swipe="next"] .ng-screen-anim, body[data-swipe="next"] .ng-assistant-anim { animation: nx-swipe-next 200ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  body[data-swipe="prev"] .ng-screen-anim, body[data-swipe="prev"] .ng-assistant-anim { animation: nx-swipe-prev 200ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes nx-swipe-next { from { opacity: 0.35; transform: translateX(28px); } to { opacity: 1; transform: none; } }
  @keyframes nx-swipe-prev { from { opacity: 0.35; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
  /* Без движения — экран просто меняется */
  @media (prefers-reduced-motion: reduce) {
    body[data-swipe] .ng-screen-anim, body[data-swipe] .ng-assistant-anim { animation: none; }
  }
          /* Приветствие: всплывает, цвет перетекает от синего к мятному */
        @keyframes nx-greet-in {
          0%   { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        @keyframes nx-gradient-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .nx-greeting-anim {
          background: linear-gradient(90deg, var(--text-strong) 0%, var(--blue-light) 30%, var(--mint) 50%, var(--blue-light) 70%, var(--text-strong) 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: nx-greet-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both,
                     nx-gradient-flow 5s linear infinite;
        }

        /* Новые сообщения мягко появляются снизу */
        @keyframes nx-msg-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .nx-msg { animation: nx-msg-in 320ms ease backwards; }

        /* Граница поля ввода перетекает, пока ассистент отвечает */
        @keyframes nx-border-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Скелетон ответа: серые полоски мягко пульсируют прозрачностью.
           Одна анимация, без свечения и градиентов. */
        @keyframes nx-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        /* Для тех, у кого в системе отключена анимация */
        /* ─── Плавная смена темы ──────────────────────────────
           Основной способ: View Transitions. Браузер делает снимок
           старого экрана и плавно растворяет его в новом. */
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation-duration: 380ms;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Запасной способ для браузеров без View Transitions:
           на время смены у всех элементов плавно меняются цвета */
        .nx-theme-anim, .nx-theme-anim *, .nx-theme-anim *::before, .nx-theme-anim *::after {
          transition: background-color 380ms ease, color 380ms ease,
                      border-color 380ms ease, fill 380ms ease, stroke 380ms ease !important;
        }

        /* Светлая тема: тёмный текст на светлом фоне выглядит тоньше, чем
           светлый на тёмном. Делаем весь текст чуть плотнее, отключаем
           «утончающее» сглаживание, а самые тонкие цифры — потолще */
        :root[data-theme="light"] body {
          font-weight: 500;
          -webkit-font-smoothing: auto;
          -moz-osx-font-smoothing: auto;
        }
        :root[data-theme="light"] .nx-weather-value { font-weight: 400 !important; }

        /* В светлой теме карточки настроек чуть светлее фона страницы */
        :root[data-theme="light"] .nx-set-group { background: var(--panel); }
        /* ─── Глобальный поиск ─────────────────────────────── */
        .nx-search-row:hover { background-color: var(--hover) !important; }
        .nx-search-row:focus-visible { outline: 1px solid var(--mint); outline-offset: -2px; }
                /* ─── Системные уведомления (тосты) ──────────────────
           Плашка сверху справа, как системное уведомление телефона:
           иконка NEXA, заголовок, текст, крестик закрытия. */
        @keyframes nx-toast-in  { from { opacity: 0; transform: translateY(-14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes nx-toast-out { to   { opacity: 0; transform: translateY(-8px) scale(0.98); } }
        .nx-toast-host {
          position: fixed; top: 16px; right: 16px; z-index: 500;
          display: flex; flex-direction: column; gap: 10px;
          width: 380px; max-width: calc(100vw - 32px);
          pointer-events: none;
        }
        .nx-toast {
          pointer-events: auto;
          background: var(--glass);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: 14px;
          padding: 12px 12px 12px 14px;
          display: flex; align-items: flex-start; gap: 12px;
          box-shadow: var(--glass-shadow);
          animation: nx-toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-toast-icon {
          width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%;
          background: linear-gradient(135deg, var(--blue-dark), var(--mint-dark));
          border: 1px solid color-mix(in srgb, var(--mint) 27%, transparent);
          display: flex; align-items: center; justify-content: center;
        }
        .nx-toast-body { flex: 1; min-width: 0; padding-top: 1px; text-align: left; }
        .nx-toast-title { font-size: 13.5px; font-weight: 500; line-height: 1.3; }
        .nx-toast-text {
          font-size: 12.5px; color: var(--muted); margin-top: 2px; line-height: 1.4;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
          .nx-toast-close {
          background: transparent; border: none; padding: 4px;
          cursor: pointer; flex-shrink: 0; display: flex; color: var(--muted);
          align-self: center;
        }
        @media (max-width: 768px) {
          .nx-toast-host {
            top: calc(var(--sat) + 10px);
            left: 10px; right: 10px; width: auto;
          }
        }
        @media (max-width: 768px) {
          .nx-search-overlay { padding: 6vh 12px 12px !important; }
          .nx-search-panel input { font-size: 16px !important; }
        }

        /* ─── Медиа и Файлы ─────────────────────────────────── */
        /* Блок мягко появляется: подробности хранилища, окно файла, список папки */
        @keyframes nx-pop-in {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .nx-pop { animation: nx-pop-in 220ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Ассистент на компьютере: справа закреплено меню (Новый диалог / Поиск /
           История) — сообщения пользователя не должны заезжать под него */
        @media (min-width: 769px) { .nx-msg-list { padding-right: 170px !important; } }
        /* «Раскрытие складкой»: элементы списка появляются по очереди —
           каждый чуть повёрнут от верхнего края и разворачивается к нам.
           Работает один раз при появлении (не повторяется).
           backwards, а не both: после анимации transform свободен,
           и нажатие/наведение на кнопки работают как обычно */
        @keyframes nx-unfold {
          from { opacity: 0; transform: perspective(700px) rotateX(-16deg) translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-stagger > * { animation: nx-unfold 560ms cubic-bezier(0.16, 1, 0.3, 1) backwards; transform-origin: 50% 0; }
        ${Array.from({ length: 14 }, (_, i) => `.nx-stagger > *:nth-child(${i + 2}) { animation-delay: ${(i + 1) * 45}ms; }`).join("\n        ")}
        /* Капли дождя: наклонены как складка, три раза пролетают вниз и замирают */
        .nx-drop { transform: rotate(28deg); transform-origin: 50% 0; }
        @keyframes nx-drop-fall {
          0%   { transform: rotate(28deg) translateY(-26px); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: rotate(28deg) translateY(30px); opacity: 0; }
        }
        .nx-drop { animation: nx-drop-fall 1100ms cubic-bezier(0.5, 0, 0.9, 0.6) 3; }
        @media (prefers-reduced-motion: reduce) { .nx-drop { animation: none !important; } }
        /* Баннер установки. Закрытие: плашка отклоняется от верхнего края и тает
           (как складка), а место под ней схлопывается */
        .nx-banner-wrap { display: grid; grid-template-rows: 1fr; margin-top: 18px; }
        .nx-banner-wrap > .nx-banner { min-height: 0; overflow: hidden; }
        @keyframes nx-banner-fold {
          to { opacity: 0; transform: perspective(600px) rotateX(-70deg) scale(0.96); }
        }
        @keyframes nx-banner-collapse {
          to { grid-template-rows: 0fr; margin-top: 0; }
        }
        .nx-banner-wrap.is-closing { animation: nx-banner-collapse 320ms cubic-bezier(0.4, 0, 0.2, 1) 180ms forwards; }
        .nx-banner-wrap.is-closing > .nx-banner {
          transform-origin: 50% 0;
          animation: nx-banner-fold 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        /* Расписание: корзина видна при наведении на дело (на телефоне — всегда) */
        .nx-sched-del { opacity: 0; transition: opacity 160ms ease, background-color 160ms ease; }
        .nx-sched-item:hover .nx-sched-del, .nx-sched-del:focus-visible { opacity: 1; }
        @media (hover: none) { .nx-sched-del { opacity: 1; } }
        /* Значок часов у поля времени — под цвет темы */
        :root[data-theme="dark"] input[type="time"] { color-scheme: dark; }
        :root[data-theme="light"] input[type="time"] { color-scheme: light; }
        /* Запуск: интерфейс один раз проявляется — только прозрачность и небольшой
           сдвиг снизу. Без размытия и масштаба: всё чёткое на каждом кадре */
        @keyframes nx-intro {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        #root { animation: nx-intro 650ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* В приложении: ждём, пока уйдёт заставка Android, и только тогда проявляемся */
        .nx-intro-wait #root { animation: none; opacity: 0; }
        .nx-intro-go #root { animation: nx-intro 750ms cubic-bezier(0.16, 1, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { #root, .nx-intro-go #root { animation: none; } .nx-intro-wait #root { opacity: 1; } }
        /* Аура нового диалога: по центру за приветствием и полем ввода.
           Края растворяются маской (не размытие). Приближение — по фокусу/тексту */
        .nx-aura {
          position: absolute; left: 50%; top: 50%; width: min(1120px, 150vw); height: 660px;
          pointer-events: none; z-index: 0;
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 72%);
          mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 72%);
          opacity: 0.8; transform: translate(-50%, -50%) scale(1);
          transition: opacity 700ms ease, transform 900ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-aura.is-active { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
        :root[data-theme="light"] .nx-aura { opacity: 0.38; }
        :root[data-theme="light"] .nx-aura.is-active { opacity: 0.55; }
        /* Появление: каждая грань разворачивается из центра складки, по очереди */
        @keyframes nx-aura-in {
          from { opacity: 0; transform: scale(0.35) rotate(-14deg); }
          to   { opacity: 1; transform: none; }
        }
        .nx-aura-facet { animation: nx-aura-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        /* Аура за ответом: слева внизу списка, за новым сообщением */
        .nx-reply-aura-pos {
          position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 0; pointer-events: none;
          transition: left 500ms cubic-bezier(0.16, 1, 0.3, 1), top 500ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-reply-aura {
          position: absolute; left: -310px; top: -180px; width: 620px; height: 360px;
          pointer-events: none;
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at 40% 55%, black 25%, transparent 72%);
          mask-image: radial-gradient(ellipse 50% 50% at 40% 55%, black 25%, transparent 72%);
          filter: blur(30px); opacity: 0.7; transform-origin: 30% 70%;
          transition: opacity ${REPLY_AURA_FADE}ms ease, transform ${REPLY_AURA_FADE}ms cubic-bezier(0.16, 1, 0.3, 1), filter ${REPLY_AURA_FADE}ms ease;
        }
        :root[data-theme="light"] .nx-reply-aura { opacity: 0.45; }
        /* Испаряется: разрастается, сильнее размывается и тает */
        .nx-reply-aura.is-fading { opacity: 0 !important; transform: scale(1.25) translateY(-20px); filter: blur(60px); }
        @keyframes nx-reply-aura-in {
          from { opacity: 0; transform: scale(0.6) rotate(-10deg); }
          to   { opacity: 1; transform: none; }
        }
        .nx-reply-aura-in { transform-origin: 47% 56%; animation: nx-reply-aura-in 800ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        @media (max-width: 768px) { .nx-reply-aura { width: 440px; height: 300px; left: -220px; top: -150px; } }
        @media (prefers-reduced-motion: reduce) {
          .nx-reply-aura-in { animation: none !important; }
          .nx-reply-aura { transition: opacity 300ms ease !important; }
          .nx-reply-aura-pos { transition: none !important; }
          .nx-reply-aura.is-fading { transform: none; filter: blur(30px); }
        }
        /* Размытие граней (исключение из правил, см. CLAUDE.md) */
        .nx-aura-blur { filter: blur(34px); }
        @media (max-width: 768px) { .nx-aura { width: 520px; height: 400px; top: var(--aura-y, 50%) !important; } .nx-aura-blur { filter: blur(24px); } }
        @media (prefers-reduced-motion: reduce) {
          .nx-aura-facet { animation: none !important; }
          .nx-aura { transition: none !important; }
        }
        /* Все кнопки — скруглённые: кнопки с текстом — «таблетки», кнопки-значки — круги.
           Скошенные чипсы пути (складка), строки списков и карточки не трогаем */
        .nx-ghost-btn, .nx-primary, .nx-icon-btn, .nx-action { border-radius: 999px !important; }
        /* Градиент — на всю кнопку вместе с рамкой. Иначе под прозрачной рамкой 1px
           браузер повторяет градиент с другого края: по бокам видны тонкие полоски
           чужого цвета (голубая слева, синяя справа) */
        .nx-primary, [style*="linear-gradient"] { background-origin: border-box !important; }
        /* Стрелка в строке чуть шагает вправо при наведении — «можно перейти» */
        .nx-chev { display: flex; transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
        .nx-row-btn:hover .nx-chev { transform: translateX(3px); }
        /* Полоски "где хранится" вырастают слева направо */
        @keyframes nx-bar-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .nx-bar { transform-origin: left; animation: nx-bar-in 420ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Поиск устройства: квадратные волны расходятся от устройства
           и гаснут. Две волны на каждый из трёх сигналов, потом стоп */
        @keyframes nx-ping {
          from { transform: scale(1); opacity: 0.9; }
          to   { transform: scale(2.6); opacity: 0; }
        }
        .nx-ping {
          position: absolute; left: 50%; top: 50%;
          width: 76px; height: 76px; margin: -38px 0 0 -38px;
          box-sizing: border-box; border: 1.5px solid var(--mint); border-radius: 4px;
          opacity: 0; pointer-events: none;
          animation: nx-ping 1200ms cubic-bezier(0.16, 1, 0.3, 1) 2 both;
        }
        /* Подключение устройства: по серой складке один раз проходит
           мятная полоса — показывает, что идёт поиск связи */
        @keyframes nx-scan {
          from { transform: translateX(-140px) skewX(-18deg); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          to   { transform: translateX(140px) skewX(-18deg); opacity: 0; }
        }
        .nx-scan { animation: nx-scan 1400ms cubic-bezier(0.4, 0, 0.2, 1) 1 both; }
        /* Иконка устройства проявляется при подключении */
        @keyframes nx-icon-on {
          from { opacity: 0.3; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-icon-on { animation: nx-icon-on 420ms cubic-bezier(0.16, 1, 0.3, 1) 1; }
        /* ═══ ЕДИНАЯ СИСТЕМА СОСТОЯНИЙ ═══════════════════════════
           Все нажимаемые элементы ведут себя одинаково:
             hover    — лёгкая подложка (--hover) или чуть ярче;
             pressed  — подложка плотнее (--pressed), элемент «вдавливается»;
             focus    — мятная рамка (управление с клавиатуры);
             disabled — бледный, не реагирует;
             loading  — aria-busy: не бледнеет, курсор «ждите».
           Чтобы новая кнопка вела себя так же, дай ей один из классов:
             nx-row-btn   — строка списка        nx-ghost-btn — кнопка с рамкой
             nx-icon-btn  — кнопка-иконка        nx-primary   — главная (градиент)
             nx-cat-card  — карточка             nx-link-btn  — текстовая ссылка
             nx-crumb, nx-seg-btn — скошенные складки (путь и хранилище)
           Состояния loading / success / error / empty — компоненты
           StateButton, StateNote и EmptyState. */
        .nx-row-btn, .nx-ghost-btn, .nx-icon-btn, .nx-primary, .nx-cat-card, .nx-link-btn, .nx-crumb {
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease,
                      transform 120ms ease, filter 160ms ease, opacity 200ms ease;
        }
        /* hover */
        .nx-row-btn:hover, .nx-ghost-btn:hover, .nx-icon-btn:hover { background-color: var(--hover) !important; }
        .nx-cat-card:hover { border-color: var(--muted-soft) !important; }
        .nx-link-btn:hover { color: var(--text) !important; }
        .nx-primary:hover, .nx-crumb:hover, .nx-seg-btn:hover { filter: brightness(1.12); }
        /* pressed */
        .nx-row-btn:active, .nx-ghost-btn:active, .nx-icon-btn:active { background-color: var(--pressed) !important; }
        .nx-ghost-btn:active, .nx-icon-btn:active, .nx-primary:active, .nx-cat-card:active { transform: scale(0.97); }
        .nx-row-btn:active { transform: scale(0.99); }
        .nx-primary:active, .nx-crumb:active, .nx-seg-btn:active { filter: brightness(0.9); }
        /* focus — рамка для управления с клавиатуры */
        .nx-row-btn:focus-visible, .nx-ghost-btn:focus-visible, .nx-icon-btn:focus-visible,
        .nx-primary:focus-visible, .nx-cat-card:focus-visible, .nx-link-btn:focus-visible {
          outline: 1px solid var(--mint); outline-offset: 2px;
        }
        /* Загрузка файла: полоска один раз заполняется слева направо */
        @keyframes nx-upload { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .nx-upload-bar { transform-origin: left; animation: nx-upload linear 1 both; }
        /* Поле ввода (название устройства): в фокусе рамка мятная, при ошибке остаётся красной */
        .nx-input { transition: border-color 160ms ease; }
        /* «Устройство ищут»: квадратные волны расходятся от центра */
        .nx-find-wave { animation: nx-find-wave 1.8s ease-out infinite; opacity: 0; }
        @keyframes nx-find-wave { from { transform: rotate(45deg) scale(0.5); opacity: 0.9; } to { transform: rotate(45deg) scale(1.25); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .nx-find-wave { animation: none; opacity: 0.5; } }
        /* Блок «Связь устройств»: три колонки на компьютере */
        .nx-msg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: stretch; }
        /* Приложение: на самом верху страница не «пружинит» сама — у нас свой жест обновления.
           Только на html (вся страница)! На body нельзя: body у нас — отдельный
           прокручиваемый слой, и запрет на нём обрывает прокрутку страницы */
        html.nx-native { overscroll-behavior-y: contain; }
        /* Дни над расписанием: скруглённые плашки (не «таблетки»), подсветка при наведении */
        .nx-day-chip { transition: border-color 160ms ease; }
        /* Полоса дней листается пальцем — полоса прокрутки под ней не нужна */
        .nx-day-strip { scrollbar-width: none; }
        .nx-day-strip::-webkit-scrollbar { display: none; }
        .nx-day-chip[aria-selected="false"]:hover { border-color: var(--mint) !important; }
        /* Колонки разделены тонкой линией, как строки в списке устройств */
        .nx-link-col + .nx-link-col { border-left: 1px solid ${C.border}; }
        .nx-inbox-list > .nx-inbox-item:first-child { border-top: none !important; }
        /* Колонки не раздвигаются длинным текстом — он переносится или обрезается */
        .nx-link-grid > * { min-width: 0; }
        /* Строка синхронизации аккаунта: на компьютере — внизу слева, у боковой панели */
        .nx-sync-status { left: 98px; bottom: 20px; }
        .nx-input:focus:not([aria-invalid="true"]) { border-color: var(--mint) !important; }
        /* У сегментов и чипсов края срезаны, рамку не видно — подчёркиваем подпись */
        .nx-seg-btn:focus-visible, .nx-crumb:focus-visible { outline: none; text-decoration: underline; }
        /* Складка хранилища: без прямоугольной рамки фокуса — с клавиатуры она просто ярче */
        .nx-sf:focus { outline: none; }
        .nx-sf:focus-visible { filter: brightness(1.25); }
        /* disabled — нельзя нажать */
        :is(.nx-row-btn, .nx-ghost-btn, .nx-icon-btn, .nx-primary, .nx-cat-card, .nx-link-btn):disabled {
          opacity: 0.45; cursor: default !important; transform: none !important;
          filter: none !important; background-color: transparent !important;
        }
        .nx-primary:disabled { background-color: initial !important; }
        /* loading — кнопка занята, но не бледнеет */
        :is(.nx-ghost-btn, .nx-primary)[aria-busy="true"] { opacity: 1; cursor: progress !important; }

        /* Индикатор загрузки: у квадрата крутится одна мятная грань */
        @keyframes nx-spin { to { transform: rotate(360deg); } }
        .nx-spin { animation: nx-spin 800ms linear infinite; }
        /* Ошибка: элемент один раз коротко вздрагивает */
        @keyframes nx-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); } 75% { transform: translateX(4px); }
        }
        .nx-shake { animation: nx-shake 260ms ease 1; }
        /* Строка пути прокручивается, но свой скроллбар не рисует:
           вместо него тонкая полоска под чипсами */
        .nx-no-scrollbar { scrollbar-width: none; }
        /* Блоки только для телефона (на телефоне становятся flex-строкой) */
        .nx-only-mobile { display: none; }
        @media (max-width: 768px) { .nx-only-mobile { display: flex !important; } }
        .nx-no-scrollbar::-webkit-scrollbar { display: none; }
        /* Складка справа на "Медиа" и "Файлах" — только на широком экране */
        /* На средних экранах складки уже — подписи на них чуть мельче */
        @media (max-width: 1360px) {
          .nx-seg-label span { font-size: 10.5px !important; }
        }
        /* Прогноз на 2 недели: на широком экране — панель справа (.nx-fc-aside),
           на узком — список под кнопкой (.nx-fc-inline). Стрелка кнопки:
           на узком при открытии смотрит вниз, на широком — влево («закрыть») */
        .nx-fc-chev { transition: transform 200ms ease; }
        .nx-fc-chev.is-open { transform: rotate(90deg); }
        @media (min-width: 1101px) {
          .nx-fc-inline { display: none; }
          .nx-fc-chev.is-open { transform: rotate(180deg); }
        }
        /* Панель выезжает слева направо — из-под колонки погоды */
        @keyframes nx-fc-in {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-fc-slide { animation: nx-fc-in 260ms cubic-bezier(0.16, 1, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { .nx-fc-slide { animation: none; } }
        @media (max-width: 1100px) {
          .nx-fc-aside { display: none !important; }
          .nx-media-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .nx-media-art { display: none !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nx-greeting-anim, .nx-msg { animation: none !important; }
          .nx-pop, .nx-bar { animation: none !important; }
          .nx-stagger > * { animation: none !important; }
          .nx-chev { transition: none !important; }
          .nx-tab-move { transition: none !important; }
          .nx-ping, .nx-scan { display: none; }
          .nx-icon-on, .nx-shake { animation: none !important; }
          /* Разрыв без движения: грани сразу встают на место, меняется только цвет */
          .nx-facet { transition: background 200ms ease !important; }
          .nx-spin { animation-duration: 2400ms; }
          .nx-row-btn:active, .nx-ghost-btn:active, .nx-icon-btn:active,
          .nx-primary:active, .nx-cat-card:active { transform: none; }
        }

        /* ─── Фирменный скроллбар NEXA ──────────────────────── */
        /* Мятный ползунок везде: у страницы и у всех прокручиваемых блоков.
           scrollbar-color передаётся по наследству, поэтому хватает html —
           и новые блоки сами получат мятный ползунок */
        html {
          scrollbar-color: color-mix(in srgb, var(--mint) 70%, transparent) transparent;
        }
        .nx-scroll { scrollbar-width: thin; }
        /* Для браузеров, которые не понимают scrollbar-color (старый Safari) */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--mint) 70%, transparent);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--mint);
          background-clip: padding-box;
        }

        /* ─── Планшет ──────────────────────────────────────── */
        @media (max-width: 960px) {
          .ng-home-grid { grid-template-columns: 1fr !important; }
          .ng-cat-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ─── Мобильный ────────────────────────────────────── */
                @media (max-width: 768px) {
          /* Навигация */
          .ng-sidebar { display: none !important; }
          .ng-home-desktop { display: none !important; }
          .ng-home-mobile { display: block !important; }
          .ng-mobile-tabbar { display: block !important; }
          .ng-hamburger { display: flex !important; }
          .ng-menu-block { display: none !important; }

          /* Отступ снизу под таб-панель */
          .ng-main-content { padding-bottom: 110px; }

          /* Скрыть время/дату */
          .ng-timedate { display: none !important; }

          /* Все заголовки-дисплеи меньше */
          .ng-display { font-size: 24px !important; }

          /* Экран настроек на телефоне */
          .ng-display.nx-section-title { font-size: 18px !important; margin-bottom: 10px !important; }
          .nx-settings-search { display: none !important; }
          .nx-pair-body { flex-direction: column; align-items: flex-start !important; }
          .nx-pair-or { display: none !important; }
          /* Связь устройств — одной колонкой */
          .nx-msg-grid { grid-template-columns: 1fr !important; }
          .nx-quick-actions { grid-template-columns: 1fr 1fr !important; }
          .nx-link-col + .nx-link-col { border-left: none !important; border-top: 1px solid ${C.border}; }
          /* Строка синхронизации — над нижней панелью */
          .nx-sync-status { left: 16px !important; bottom: calc(var(--sab) + 96px) !important; }
          /* Строка с переключателем темы: переключатель уходит под текст
             и растягивается на всю ширину, чтобы ничего не обрезалось */
          .nx-set-row { padding: 12px 14px !important; gap: 12px !important; }
          .nx-set-icon { width: 36px !important; height: 36px !important; }
          .nx-set-title { font-size: 15px !important; }
          .nx-set-sub { font-size: 12.5px !important; }
          /* Переключатель темы уходит на отдельную строку под текстом
             и растягивается на всю ширину карточки */
          .nx-set-row-wrap { flex-wrap: wrap; row-gap: 12px !important; }
          .nx-set-row-wrap .nx-set-right { flex-basis: 100%; }
          .nx-set-row-wrap .nx-seg { width: 100%; }
          .nx-seg button { padding: 10px 0 !important; font-size: 14px !important; }
          .nx-settings-head { margin-bottom: 20px !important; }
          .nx-set-group { margin-bottom: 22px !important; }

          /* Единый padding для всех экранов */
          .ng-screen {
            max-width: 100% !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
            padding: 16px 16px 24px !important;
          }

           /* Складка меньше */
          .ng-fold-wrapper img {
            width: 140px !important;
            height: 140px !important;
          }
          .ng-home-hero {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }
          .ng-home-hero-text { flex: 1 !important; min-width: 0 !important; }
          .ng-home-hero-art { flex-shrink: 0 !important; }

           /* ─── Логотип NEXA — опустить и уменьшить ──────────── */
  .ng-home-logo {
    margin-top: 12px !important;
    margin-bottom: 20px !important;
  }
  .ng-home-logo img {
    height: 20px !important;
    margin: 0 !important;
  }
  .ng-home-logo > div {
    font-size: 10px !important;
    letter-spacing: 0.12em !important;
    margin-top: 2px !important;
  }

          /* Дисклеймер с переносом */
          .ng-disclaimer {
            white-space: normal !important;
            max-width: 100% !important;
            padding: 0 8px !important;
            line-height: 1.4 !important;
          }

          /* Заголовок страницы в одну строку с иконками поиска и профиля.
             Справа оставляем место под эти иконки, подзаголовок прячем */
          .ng-display.nx-page-title {
            font-size: 30px !important;
            margin: 12px 0 24px !important;
            padding-right: 128px; /* место под колокольчик, поиск и профиль */
          }
          /* Панель уведомлений на телефоне — по ширине экрана */
          .nx-notes { position: fixed !important; top: 70px !important; left: 12px !important; right: 12px !important; width: auto !important; }
          .nx-page-sub { display: none !important; }

          /* Хранилище: те же складки в один ряд, только меньше.
             Заголовок "Хранилище" стоит над карточкой (.nx-storage-head) */
          .nx-storage-label { display: none !important; }
          .nx-storage-box { padding: 12px 10px !important; margin-bottom: 28px !important; }
          .ng-storage-folds { height: 92px !important; }
          /* Подпись ближе к левому краю складки, чтобы поместилась в узкие */
          .ng-storage-folds .nx-seg-label span:nth-child(1) { font-size: 9.5px !important; }
          .ng-storage-folds .nx-seg-label span:nth-child(2) { font-size: 9px !important; }
          .ng-storage-folds .nx-seg-label span:nth-child(3) { display: none !important; }

          /* ─── Сегодня на телефоне ─── */
          /* Блоки друг под другом: погода, расписание, завтра, прогноз */
          .nx-today-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-areas: "sched" "now" "next" "month" !important;
            grid-template-rows: auto !important;
            gap: 28px !important;
          }
          /* Карточка погоды на телефоне — как на компьютере (заголовок, дата,
             город, температура и состояние в строку, детали с разделителями),
             только отступы внутри чуть меньше */
          .nx-weather { padding: 18px !important; }
          /* Расписание без рамки, время слева от линии */
          .nx-sched { border: none !important; padding: 0 !important; }
          .nx-sched-head { font-size: 22px !important; margin-bottom: 18px !important; }
          .nx-sched-head > svg { display: none; } /* только значок календаря, плюс в кнопке остаётся */
          .nx-sched-list { --dot-x: 62px !important; } /* 46 время + 4 отступ + 12 половина кружка */
          .nx-sched-item {
            grid-template-columns: 46px 24px minmax(0, 1fr) !important;
            grid-template-areas: "time dot box" !important;
            column-gap: 4px !important;
          }
          .nx-sched-time { align-self: center; margin-bottom: 0 !important; font-size: 12.5px !important; }
          .nx-sched-title { font-size: 15px !important; }
          .nx-sched-form input { font-size: 16px !important; } /* iPhone не приближает страницу */
          .nx-sched-hint { visibility: hidden; } /* Enter/Esc на телефоне не нужны — место под кнопки остаётся */
          .nx-sched-until { margin-bottom: 16px !important; }
          /* Файлы: поиск под путём на всю ширину, список без своей прокрутки */
          .nx-files-top { flex-direction: column !important; align-items: stretch !important; gap: 18px !important; }
          .nx-files-search { width: 100% !important; margin-top: 0 !important; }
          .nx-files-search input { font-size: 16px !important; }
          /* Кнопки "Новая папка" / "Добавить файл" — под заголовком, поровну */
          .nx-files-head { flex-direction: column; align-items: stretch !important; }
          .nx-files-actions > button { flex: 1 1 0; padding: 11px 12px !important; }
          /* «Передать на…»: на телефоне только значок, кнопка покрупнее для пальца */
          .nx-transfer-label { display: none; }
          .nx-transfer-btn { padding: 9px !important; }
          /* Экран устройства: сцена ниже, статус и настройки одной колонкой */
          .nx-device-stage { height: 360px !important; }
          /* На телефоне складка шире — за устройством, по центру сцены */
          .nx-device-fold { width: 86% !important; left: 7% !important; margin-top: calc(86% * -0.35) !important; }
          .nx-device-info { grid-template-columns: minmax(0, 1fr) !important; }
          .nx-device-title { font-size: 30px !important; }
          /* Фон на телефоне: на весь экран, грани в обоих углах — поменьше
             и бледнее, чтобы не спорить с текстом на узком экране */
          .nx-backdrop { left: 0 !important; }
          .nx-bd-tl, .nx-bd-br { opacity: 0.75; }
          .nx-backdrop svg { width: 210px; height: 188px; }
          /* Номера строк сетки слева на узком экране налезают на заголовки */
          .nx-bd-row { display: none; }
          .nx-files-list { max-height: none !important; min-height: 0 !important; overflow: visible !important; padding-right: 0 !important; }
          /* Подробности хранилища: кнопка "Открыть в файлах" на всю ширину */
          .nx-storage-detail { gap: 16px !important; }
          .nx-storage-detail > button { width: 100%; text-align: center !important; padding: 12px 14px !important; }

          /* Окно просмотра файла на телефоне — шторка снизу */
          .nx-viewer { align-items: flex-end !important; padding: 0 !important; }
          .nx-viewer-panel {
            width: 100% !important;
            max-height: 90vh !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            padding-bottom: var(--sab);
          }
          .nx-viewer-preview > div { height: 180px !important; }
          .nx-viewer-actions > button { flex: 1 1 auto; justify-content: center; }

          /* Крошки в файлах */
          .ng-crumbs {
            justify-content: flex-start !important;
            white-space: nowrap !important;
          }

          /* Ассистент: переписке — всё место между шапкой и полем ввода.
             Снизу запас ровно под нижнюю панель: её 68 px + системная полоса
             (--sab) + 4 px. Клавиатура открыта — панели нет, запас минимальный */
          .ng-assistant-wrapper { left: 0 !important; }
          .ng-assistant-inner {
            --chat-bottom: calc(72px + var(--sab));
            padding: 8px 14px var(--chat-bottom) 14px !important;
          }
          body.kb-open .ng-assistant-inner { --chat-bottom: 6px; }
          /* Шапка: одна строка «ИИ — Ассистент», версия мелко рядом, без описания */
          .ng-assistant-inner .nx-assistant-title {
            font-size: 20px !important; line-height: 1.2 !important;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .nx-assistant-ver {
            display: inline !important; margin-left: 6px;
            font-family: 'NexaNumbers', 'Raleway', sans-serif; font-size: 11px; font-weight: 400; color: var(--muted-soft); letter-spacing: 0;
          }
          .ng-assistant-inner .nx-assistant-subtitle { display: none !important; }
          .ng-hamburger { width: 40px; height: 40px; margin-left: -8px; }
          /* Переписка вплотную к шапке и полю ввода; сообщения чуть плотнее */
          .nx-chat-area { margin: 6px 0 0 !important; }
          .nx-msg-col { gap: 14px !important; padding-bottom: 22px !important; }
          /* Закреплённая область ввода: фон экрана и мягкий переход в переписку
             сверху — последние строки не обрываются на краю. Переход не ловит
             нажатия, а внизу переписки под него оставлен запас (padding выше) */
          /* Подложка — на всю ширину экрана и вниз до самой нижней панели
             (тот же запас --chat-bottom), чтобы не было краёв и полос */
          .nx-chat-dock {
            position: relative; gap: 4px !important;
            margin: 0 -14px calc(-1 * var(--chat-bottom));
            padding: 0 14px calc(2px + var(--chat-bottom)) !important;
            background: var(--bg);
          }
          .nx-chat-dock::before {
            content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 22px;
            background: linear-gradient(to top, var(--bg), transparent);
            pointer-events: none;
          }
          /* Сине-мятная обводка поля остаётся, внешнее свечение на телефоне убираем */
          .nx-input-ring { box-shadow: none !important; }
          .ng-disclaimer { font-size: 10.5px !important; }
          /* Клавиатура открыта — подпись под полем убираем: место нужнее переписке */
          body.kb-open .ng-disclaimer { display: none !important; }

          /* История — шторка слева на 85% ширины, поверх нижней панели.
             Высота — видимая область (над клавиатурой, когда пишем в поиск) */
          .nx-hist-drawer {
            position: fixed; top: var(--vvt, 0px); left: 0; height: var(--vvh, 100%);
            width: 85%; max-width: 380px; margin: 0; z-index: 310;
            padding: calc(var(--sat) + 18px) 14px calc(var(--sab) + 12px);
            background: var(--bg); border-right: 1px solid var(--border-strong);
            transform: translateX(-102%); visibility: hidden;
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 280ms;
          }
          .nx-hist-drawer.is-open {
            transform: translateX(0); visibility: visible;
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
          }
          /* Панель идёт за пальцем — без плавности */
          .nx-hist-drawer.is-dragging { transition: none; }
          .nx-hist-scrim {
            display: block; position: fixed; inset: 0; z-index: 305; background: var(--scrim);
            opacity: 0; pointer-events: none; transition: opacity 240ms ease;
          }
          .nx-hist-scrim.is-open { opacity: 1; pointer-events: auto; }
          .nx-hist-head { padding-left: 2px; min-height: 36px; }
          .nx-hist-open { font-size: 15px; padding: 10px 4px 10px 10px; }
          .nx-hist-more { width: 34px; height: 34px; }
          /* 16px — чтобы iPhone не приближал страницу при вводе */
          .nx-hist-search input, .nx-hist-rename { font-size: 16px; }
          .nx-hist-new { padding: 12px 14px; }

          /* Футер на мобильном скрываем */
          .ng-footer { display: none !important; }

          /* Защита от горизонтальной прокрутки */
          html, body {
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }

          /* TopBar — поверх контента справа сверху */
          .ng-topbar {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            padding: 28px 16px 0 0 !important;
            z-index: 50 !important;
            gap: 6px !important;
          }

           /* Поле ввода: 16px, чтобы iPhone не приближал страницу при вводе */
          .ng-assistant-inner input {
            font-size: 16px !important;
          }
     body {
    padding-top: var(--sat);
    padding-bottom: var(--sab);
    background: var(--bg);
  }

    /* Убираем скроллбар страницы, когда открыт Ассистент.
     Внутренние блоки всё равно скроллятся, если нужно.
     Высота — ровно видимое окно (100%), а не 100vh: 100vh на телефоне
     не уменьшается от клавиатуры и адресной строки, да ещё прибавлялись
     отступы под системные полосы — страница выходила длиннее экрана,
     и браузер «подтягивал» её к полю ввода, сдвигая всё вверх. */
  body:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100%; min-height: 0; box-sizing: border-box;
  }
  html:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100%; min-height: 0;
  }
      /* Приветствие, подзаголовок и сообщения в чате на телефоне */
          .ng-assistant-inner .ng-greeting { font-size: 24px !important; }
          /* Пустой экран ассистента: поле внизу, подсказки над ним, приветствие по центру */
          .nx-empty-col { justify-content: flex-end !important; gap: 12px !important; padding-bottom: 6px !important; }
          .nx-empty-greet { margin: auto 0; }
          .nx-chips { order: 1; }
          .nx-dock { order: 2; }
          /* Подсказки — компактная строка, листается вбок, справа мягко гаснет */
          .nx-chips {
            flex-wrap: nowrap !important; justify-content: flex-start !important; overflow-x: auto; gap: 6px !important;
            width: calc(100% + 32px); margin: 0 -16px; padding: 0 16px; box-sizing: border-box;
            -webkit-mask-image: linear-gradient(90deg, black 82%, transparent);
            mask-image: linear-gradient(90deg, black 82%, transparent);
          }
          .nx-chips button { padding: 6px 11px !important; font-size: 12px !important; gap: 5px !important; }
          .ng-input-field { font-size: 16px !important; }
          .nx-bubble-text { font-size: 16px !important; line-height: 1.5 !important; }
          .nx-user-bubble { max-width: 88% !important; }
          .nx-ai-col { max-width: calc(100% - 48px) !important; }
          }
            /* Клавиатура открыта — панель прячется сразу, без анимации:
               иначе она мелькает поверх клавиатуры. Появляется — плавно */
            body.kb-open .ng-mobile-tabbar {
            transform: translateY(120%);
            opacity: 0;
            pointer-events: none;
            transition: none;
          }
            .ng-mobile-tabbar {
            transition: transform 220ms ease, opacity 220ms ease;
}
        
      `}</style>
      {/* Фон за содержимым: на «Настройках» — сетка-чертёж, на остальных — грани складки */}
      {tab === "settings" && !openDevice ? <BackdropGrid /> : <BackdropFolds />}
      {/* Версия приложения запрещена — поверх всего экран «Обновите» */}
      {appUpdate?.required && <ForceUpdateScreen update={appUpdate} />}
      {/* Приложение: «потяните, чтобы обновить» */}
      <PullIndicator pull={pull.pull} busy={pull.busy} />
      {/* Синхронизация аккаунта: «Загружаем…» или «Нет связи, работаем локально» */}
      {/* На экране ассистента строка живёт внутри панели истории — не перекрывает чат */}
      {tab !== "assistant" && <SyncStatus loading={syncLoading} text={syncError} onRetry={retrySync} />}
      {/* Первый запуск: войти или продолжить без аккаунта */}
      {showGate && <AuthGate onGuest={() => { saveGuest(true); setGuest(true); }} />}
      {authOpen && !auth.user && <AuthModal onClose={() => { setAuthOpen(false); setPendingPair(null); setPendingLogin(null); }}
        hint={pendingPair ? "Войдите той же почтой, что и на другом устройстве, — потом подключим это устройство"
          : pendingLogin ? "Чтобы разрешить вход на другом устройстве, сначала войдите здесь" : null} />}
      {/* Подключение по коду: окно с кодом и окно «Подключаем…» */}
      {pairOpen && <PairModal session={pairView} online={link.status === "online"} onNewCode={newPairCode}
        onDemo={() => { closePair(); setAddOpen(true); }} onClose={closePair}
        onClaim={claimPair} onScan={canScanQr ? scanAndHandle : null} />}
      {claim && <PairStatusDialog claim={claim} onClose={() => setClaim(null)} />}
      {approve && auth.user && <ApproveLoginModal key={approve.n} initialCode={approve.code} onClose={() => setApprove(null)} onScan={canScanQr ? scanAndHandle : null} />}
      {/* Это устройство ищут */}
      {locked && <LockOverlay from={locked.from} onUnlock={unlockSelf} />}
      {finding && <FindOverlay from={finding.from} onFound={() => stopFinding(true)} onTimeout={() => stopFinding(false)} />}
      <Sidebar active={tab} onChange={goTab} />
          <MobileTabBar active={tab} onChange={goTab} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {/* На экране "Ассистент" своя правая панель вместо обычной
            строки времени/поиска/профиля, поэтому TopBar тут не рисуем */}
        {tab !== "assistant" && (
          <TopBar>
            {tab === "settings" ? null : <TimeDate />}
            <NotificationBell notes={notes} onSeen={() => setNotes((s) => ({ ...s, seenAt: Date.now() }))} onClear={() => setNotes({ items: [], seenAt: Date.now() })} />
            <IconBtn icon={Icon.search} onClick={() => setSearchOpen(true)} label="Поиск" />
            <IconBtn icon={Icon.user} onClick={() => setTab("settings")} label="Настройки" />
          </TopBar>
        )}

        {/* maxWidth 1440 — контент не растягивается до бесконечности на
            очень широких мониторах, но при этом свободно заполняет
            обычное окно браузера */}
        <div className="ng-main-content" style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto" }}>
    {/* Открыт экран устройства — показываем его вместо текущего раздела */}
    {activityOpen ? (
    <div key="activity" className="ng-screen-anim">
      <ScreenActivity items={activity} onBack={() => setActivityOpen(false)} onClear={() => setActivity([])} />
    </div>
  ) : openDevice ? (
    <div key={`dev-${openDevice.id}`} className="ng-screen-anim">
      <DeviceScreen
        key={openDevice.id}
        device={openDevice}
        devices={devices}
        files={files}
        folders={folders}
        received={received[openDevice.id]}
        demo={demo}
        fileCount={files.filter(onDeviceFile(openDevice)).length}
        onBack={() => setOpenDeviceId(null)}
        onSetOnline={(online) => patchDevice(openDevice.id, { online })}
        onSetting={(key) => patchDevice(openDevice.id, { [key]: !openDevice[key] })}
        onOpenFiles={() => openDeviceFiles(openDevice.id)}
        onRemove={() => { const real = openDevice.real; removeDevices([openDevice.id]); if (real) setTimeout(() => link.emit("devices.changed", {}), 2000); }}
        onToast={showToast}
        onFind={findDevice}
        findState={openDevice.real ? findState[openDevice.device_id] : undefined}
        onRename={(name) => renameDevice(openDevice.id, name)}
        link={link}
        realActions={openDevice.real && (
          <RealDeviceActions d={openDevice} linkOnline={link.status === "online"}
            st={{ find: findState[openDevice.device_id], lock: lockState[openDevice.device_id], send: sendState[openDevice.device_id] }}
            act={{ find: findDevice, lock: lockDevice, sendFile: sendFileTo, cancelSend, openLink: openLinkOn, reconnect: openPair }} />
        )}
      />
    </div>
  ) : tab === "assistant" ? (
    <ScreenAssistant
      initialChatId={searchChatId}
      chats={chats}
      setChats={setChats}
      onToast={showToast}
      tab={tab}
      setTab={goTab}
      devices={devices}
      onAddDevice={onAddDevice}
      onUploadFiles={() => uploadInputRef.current?.click()}
      account={auth.user ? { email: auth.user.email || "" } : null}
      sync={{ loading: syncLoading, text: syncError, onRetry: retrySync }}
      bell={<NotificationBell notes={notes} onSeen={() => setNotes((s) => ({ ...s, seenAt: Date.now() }))} onClear={() => setNotes({ items: [], seenAt: Date.now() })} />}
    />
  ) : (
    <div key={tab} className="ng-screen-anim">
      {tab === "home" && (
        <ScreenHome
          devices={devices}
          received={received}
          update={appUpdate}
          onNavigate={goTab}
          onOpenDevice={showDevice}
          onAddDevice={onAddDevice}
          onRestoreDevices={restoreDevices}
          activityBlock={uid ? <ActivityBlock items={activity} onOpen={() => { setActivityOpen(true); setOpenDeviceId(null); }} /> : null}
          findState={findState}
          onFind={findDevice}
        />
      )}
      {tab === "today" && <ScreenToday schedule={schedule} onAddItem={addScheduleItem} onRemoveItem={removeScheduleItem} />}
      {tab === "media" && <ScreenMedia files={files} uid={uid} onOpenFile={setOpenFile} onOpenCategory={openCategory} onTransfer={openTransfer} />}
      {tab === "files" && (
        <ScreenFiles
          key={`files-${searchFolder || "root"}`}
          files={files}
          filter={filesFilter}
          device={devices.find((d) => d.id === filesDevice)}
          initialFolder={searchFolder}
          onClearFilter={() => { setFilesFilter(null); setFilesDevice(null); }}
          onOpenFile={setOpenFile}
          folders={folders}
          uploads={uploads}
          onAddFiles={addFiles}
          onUploadAction={uploadAction}
          onCreateFolder={createFolder}
          onTransfer={openTransfer}
        />
      )}
      {tab === "settings" && <ScreenSettings onOpenSearch={() => setSearchOpen(true)} user={auth.user} onLogin={() => setAuthOpen(true)} onDeleteData={deleteMyData} onApproveLogin={() => openApprove(null)} sys={thisSys} />}
    </div>
  )}
</div>
        {/* Нижняя строка: слева логотип, справа ссылка "Подробнее о системе".
    justifyContent: "space-between" разводит их по разным краям строки. */}
    {tab !== "assistant" && (
    <div className="ng-footer" style={{
    padding: "0 40px 30px", width: "100%", maxWidth: 1440, margin: "0 auto",
    boxSizing: "border-box",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  }}>
    <Logo small />
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {tab === "home" && (
        <div style={{ fontSize: 13, color: C.mutedSoft }}>
          Подробнее о системе →
        </div>
      )}
      <div style={{ fontSize: 11, color: C.mutedSoft, opacity: 0.6, fontFamily: "monospace" }}>
        v{VERSION}
      </div>
    </div>
  </div>
)}
</div>
      {/* Окно просмотра файла поверх всего. key — чтобы для нового файла
          окно открывалось "с нуля", без сообщений от прошлого */}
      {/* Берём файл из общего списка по id, чтобы новое имя сразу было видно в окне */}
      {openFile && files.some((f) => f.id === openFile.id) && (
        <FileViewer
          key={openFile.id}
          file={files.find((f) => f.id === openFile.id)}
          folders={folders}
          devices={devices}
          onClose={closeViewer}
          onDelete={deleteFile}
          onRename={(name) => renameFile(openFile.id, name)}
          onSent={(device) => finishTransfer(files.find((f) => f.id === openFile.id), device)}
          onToast={showToast}
        />
      )}
      {/* Окно устройства поверх всего. key — чтобы для другого устройства
          окно открывалось "с нуля" (без идущего поиска от прошлого) */}
      {/* Окно добавления устройства: тип → поиск → название → готово */}
      {addOpen && (
        <AddDeviceModal
          names={devices.map((d) => d.name)}
          onAdd={addDevice}
          onClose={() => setAddOpen(false)}
        />
      )}
      {/* Меню «Передать на…» и полёт карточки к устройству */}
      {transfer && (
        <TransferMenu
          anchor={transfer.anchor}
          file={transfer.file}
          devices={devices}
          sendingId={transfer.sendingId}
          onPick={pickTransfer}
          onClose={() => setTransfer(null)}
        />
      )}
      {flight && <FoldFlight file={flight.file} from={flight.from} to={flight.to} onDone={endFlight} />}
      {searchOpen && (
        <GlobalSearch
          files={files}
          chats={chats}
          folders={folders}
          devices={devices}
          onOpenDevice={showDevice}
          onClose={() => setSearchOpen(false)}
          onOpenFile={(f) => setOpenFile(f)}
          onOpenFolder={openFolderFromSearch}
          onOpenChat={openChatFromSearch}
          onNavigate={goTab}
        />
      )}
      {/* Выбор файлов по команде ассистента «загрузи файл» */}
      <input
        ref={uploadInputRef} type="file" multiple hidden
        onChange={(e) => {
          if (e.target.files?.length) { addFiles(e.target.files, null); goTab("files"); }
          e.target.value = "";
        }}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
     </div>
  );
}
