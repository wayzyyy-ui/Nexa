import { useState, useEffect, useLayoutEffect, useRef, startTransition } from "react";
// flushSync нужен для плавной смены темы: React обновляет экран сразу,
// пока браузер делает снимок для анимации
import { flushSync, createPortal } from "react-dom";
// Подключаем свой логотип из папки assets
import foldSvg from "./assets/fold.svg";
const VERSION = "0.4.5";


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
   с другими вкладками. load — как прочитать начальное значение.
   Пришедшее из другой вкладки сохраняем, но обратно не рассылаем */
function useSharedState(key, load) {
  const [value, setValue] = useState(load);
  const fromRemote = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    if (first.current) { first.current = false; return; } // начальное значение не рассылаем
    if (fromRemote.current) { fromRemote.current = false; return; }
    syncChannel?.postMessage({ key, value, from: TAB_ID });
  }, [value]);
  useEffect(() => {
    if (!syncChannel) return;
    const onMessage = (e) => {
      if (e.data?.key !== key || e.data.from === TAB_ID) return;
      fromRemote.current = true;
      setValue(e.data.value);
    };
    syncChannel.addEventListener("message", onMessage);
    return () => syncChannel.removeEventListener("message", onMessage);
  }, [key]);
  return [value, setValue];
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

/* ---------- ФОН ЭКРАНОВ ----------
   Тонкая геометрия за содержимым, низкий контраст в обеих темах.
   BackdropFolds — грани складки в углах (все экраны),
   BackdropGrid — техническая сетка с метками (экран «Настройки»).
   Двигается только в ответ на курсор (компьютер), наклон телефона
   и прокрутку: курсор или наклон задают CSS-переменные --px/--py
   (от -1 до 1), прокрутка — --sy (от 0 до 1). React при этом не
   перерисовывается, меняется только transform.
   При «уменьшении движения» фон неподвижный. */
/* Наклон телефона (гироскоп). На iPhone датчик доступен только после
   разрешения, которое можно спросить лишь по нажатию — поэтому там
   по умолчанию выключено и включается в «Настройках». На Android — сразу. */
const TILT_KEY = "nexa-tilt"; // "on" | "off" в localStorage
// Разрешение нужно только на iPhone/iPad. Свежий Chrome тоже знает
// requestPermission, но сам ничего не спрашивает — поэтому проверяем именно iOS
// (iPad в режиме «как компьютер» выдаёт себя за Mac с сенсорным экраном)
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  const mobileNav = [
    { id: "home",      label: "Главная",   icon: Icon.home },
    { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
    { id: "today",     label: "Сегодня",   icon: Icon.calendar },
    { id: "media",     label: "Медиа",     icon: Icon.image },
    { id: "files",     label: "Файлы",     icon: Icon.folder },
  ];

  // Ширина одной ячейки в процентах (при пяти вкладках это 20%)
  const slotWidth = 100 / mobileNav.length;

  // pos: где сейчас стоит подсветка (номер вкладки, -1 если раздела нет в панели).
  // Храним отдельно от active, чтобы подсветка стартовала сразу при нажатии,
  // а не ждала, пока приложение перерисует новый экран.
  const [pos, setPos] = useState(() => mobileNav.findIndex((i) => i.id === active));

  // Запоминаем последнюю вкладку из панели, чтобы подсветка не прыгала в начало,
  // когда открыт раздел вне панели
  const lastPos = useRef(Math.max(pos, 0));
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
        padding: "0 12px env(safe-area-inset-bottom, 0px)",
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
              border: `1px solid ${C.borderStrong}`,
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
              {item.icon({ c: "currentColor", s: 22 })}
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
function loadDeviceStore() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(DEVICES_KEY)); } catch {}
  if (raw && raw.v === 2) {
    return { v: 2, state: raw.state || {}, added: raw.added || [], removed: raw.removed || [] };
  }
  return { v: 2, state: raw || {}, added: [], removed: [] };
}

// Подпись статуса: "Онлайн • 92%", "Онлайн" или "Не в сети"
const deviceStatus = (d) =>
  !d.online ? "Не в сети" : d.battery != null ? `Онлайн • ${d.battery}%` : "Онлайн";

// Сколько ГБ занимают файлы на устройстве — считаем по данным хранилища
const deviceUsed = (d) =>
  MEDIA_CATS.reduce((sum, c) => sum + c.devices
    .filter(([n]) => n === d.name || n === d.alias)
    .reduce((s, [, gb]) => s + gb, 0), 0);

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
function ScreenHome({ devices, received = {}, onNavigate, onOpenDevice, onAddDevice, onRestoreDevices, canRestore }) {
  // Сколько устройств сейчас в сети — для счётчика рядом с заголовком
  const onlineCount = devices.filter((d) => d.online).length;

  // Пустой список: добавить новое или вернуть исходные
  const empty = devices.length === 0 && (
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
  );

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
                <button key={d.id} data-link-id={d.id} type="button" className="nx-row-btn" onClick={() => onOpenDevice(d.id)}
                  style={{ ...btnReset, display: "block", width: "100%" }}>
                  <Row
                    leftIcon={d.icon({ c: C.text, s: 19 })}
                    title={d.name}
                    subtitle={deviceStatus(d)}
                    right={<>
                      {received[d.id] && <ReceivedTag name={received[d.id].name} />}
                      <Dot color={d.online ? C.green : C.red} />
                    </>}
                  />
                </button>
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
                <FoldHero size={340} />
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
            <FoldHero size={168} />
          </div>
        </div>

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
              <button
                type="button"
                key={d.id}
                data-link-id={d.id}
                className="nx-row-btn"
                onClick={() => onOpenDevice(d.id)}
                style={{
                  ...btnReset,
                  border: `1px solid ${C.border}`, borderRadius: 14,
                  padding: 14, cursor: "pointer", position: "relative",
                  display: "flex", flexDirection: "column", gap: 10,
                  minHeight: 96, minWidth: 0,
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
                    : <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{deviceStatus(d)}</div>}
                </div>
              </button>
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
      </div>

    </div>
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
const sortSchedule = (list) => [...list].sort((a, b) => a.time.localeCompare(b.time));
// Пример, который раньше сохранялся сам: те же дела в том же количестве
const isOldExample = (list) => list.length === SCHEDULE.length &&
  SCHEDULE.every((x) => list.some((y) => y.time === x.time && y.title === x.title));
// По умолчанию расписание пустое. Если в браузере остался старый пример — тоже пустое
const loadSchedule = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SCHEDULE_KEY));
    if (Array.isArray(v)) return isOldExample(v) ? [] : sortSchedule(v);
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
    return () => {
      clearInterval(id);
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

/* Форма нового дела: время, название и место (необязательно).
   Enter — добавить, Esc — отмена */
function ScheduleForm({ existing, onSave, onCancel }) {
  const [time, setTime] = useState(nextHour);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const t = title.trim();
  const dup = existing.some((x) => x.time === time && x.title.toLowerCase() === t.toLowerCase());
  const error = !t ? null : !/^\d{2}:\d{2}$/.test(time) ? "Укажите время" : dup ? "Такое дело уже есть" : null;
  const save = () => { if (t && !error) onSave({ time, title: t, place: place.trim() }); };
  const field = {
    background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 14,
    border: `1px solid ${C.borderStrong}`, borderRadius: 4, padding: "8px 10px", outline: "none", minWidth: 0, boxSizing: "border-box",
  };
  return (
    <form className="nx-pop nx-sched-form" onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      style={{ border: `1px solid color-mix(in srgb, ${C.mint} 45%, transparent)`, borderRadius: 6, padding: 12, marginBottom: 20, display: "grid", gap: 8 }}>
      <div className="nx-sched-form-row" style={{ display: "grid", gridTemplateColumns: "124px minmax(0, 1fr)", gap: 8 }}>
        <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="nx-input" aria-label="Время" style={field} />
        <input autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className="nx-input"
          placeholder="Что за дело?" aria-label="Название" aria-invalid={!!error} style={field} />
      </div>
      <input value={place} maxLength={40} onChange={(e) => setPlace(e.target.value)} className="nx-input"
        placeholder="Где (необязательно)" aria-label="Место" style={field} />
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

// schedule — дела на сегодня (общие с ассистентом), onAddItem / onRemoveItem — добавить и удалить
function ScreenToday({ schedule = TODAY.schedule, onAddItem, onRemoveItem }) {
  // Живое расписание: «сейчас» обновляется сам (раз в 15 секунд)
  const clock = useClock();
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const nextIdx = schedule.findIndex((it) => toMinutes(it.time) >= nowMin); // -1 — всё прошло
  const next = nextIdx >= 0 ? schedule[nextIdx] : null;
  const cursorAt = nextIdx >= 0 ? nextIdx : schedule.length; // курсор «сейчас» — перед ближайшим делом
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
        <section className="nx-sched" style={{ gridArea: "sched", alignSelf: "stretch", border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "26px 28px 30px" }}>
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
          {/* Живая строка: сколько осталось до ближайшего дела */}
          <div role="status" className="nx-sched-until" style={{ fontSize: 13, color: C.muted, marginBottom: 20, minHeight: 18 }}>
            {next
              ? <>{untilText(toMinutes(next.time) - nowMin)} — <span style={{ color: C.text }}>{next.title.toLowerCase()}</span></>
              : schedule.length ? "На сегодня всё — дел больше нет" : null}
          </div>

          {adding && (
            <ScheduleForm existing={schedule} onCancel={() => setAdding(false)}
              onSave={(it) => { onAddItem?.(it); setAdding(false); }} />
          )}

          {schedule.length === 0 && !adding && (
            <EmptyState compact title="Дел на сегодня нет" text="Добавьте первое — оно появится на таймлайне"
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
                    {it.place && <div className="nx-sched-place" style={{ display: "none", fontSize: 12, color: C.muted, marginTop: 2 }}>{it.place}</div>}
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
            }).concat(cursorAt === schedule.length ? [nowMarker] : [])}
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
const STORAGE_TOTAL = 512; // объём хранилища в ГБ

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
const UPLOAD_MS = 1100; // сколько идёт "загрузка" (показываем полоску прогресса)

function loadFileStore() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(FILES_KEY)); } catch {}
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

// Размер: 0.4 → "400 КБ", 5.5 → "5.5 МБ", 1240 → "1.2 ГБ"
function formatSize(mb) {
  if (mb < 1) return `${Math.round(mb * 1000)} КБ`;
  if (mb < 1000) return `${Math.round(mb * 10) / 10} МБ`;
  return `${(mb / 1000).toFixed(1)} ГБ`;
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
const fileMeta = (f) => `${catOf(f).label} · ${formatWhen(f)} · ${formatSize(f.mb)}`;

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
// Если у файла есть preview (картинка, добавленная в этой вкладке) —
// показываем саму картинку. После перезагрузки превью нет, остаётся иконка
function FileThumb({ file, w = 52, h = 34, iconSize = 16, radius = 6, fit = "cover" }) {
  const cat = catOf(file);
  const plain = file.cat === "doc" || file.cat === "other";
  if (file.preview) {
    return (
      <div style={{ width: w, height: h, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: C.chip }}>
        <img src={file.preview} alt="" style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, flexShrink: 0, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: plain ? C.chip : `linear-gradient(${(file.id * 47) % 360}deg, ${cat.from}, ${cat.to})`,
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
              aria-label={`${c.label}: ${c.gb} ГБ`}
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
            <span style={{ display: "block", fontSize: 12 }}>{c.gb} ГБ</span>
            <span style={{ display: "block", fontSize: 11.5, opacity: 0.75 }}>{c.pct}%</span>
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
function ScreenMedia({ files, onOpenFile, onOpenCategory, onTransfer }) {
  // Какой сегмент хранилища выбран (id категории или null)
  const [selected, setSelected] = useState(null);
  // Добавленные пользователем файлы прибавляем к объёму своей категории
  const round1 = (n) => Math.round(n * 10) / 10;
  const addedMb = (id) => files.filter((f) => f.uploaded && (!id || f.cat === id)).reduce((s, f) => s + f.mb, 0);
  const cats = MEDIA_CATS.map((c) => ({ ...c, gb: round1(c.gb + addedMb(c.id) / 1000) }));
  const sel = cats.find((c) => c.id === selected);
  const ownMb = addedMb(null);
  const used = round1(MEDIA_CATS.reduce((sum, c) => sum + c.gb, 0) + ownMb / 1000);
  // Подпись под объёмом: сколько места заняли файлы, добавленные вами
  const ownNote = ownMb > 0 && (
    <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.35, whiteSpace: "nowrap" }}>
      <div style={{ color: C.mint }}>+ {formatSize(ownMb)}</div>
      <div style={{ color: C.mutedSoft }}>ваши файлы</div>
    </div>
  );
  const countOf = (id) => files.filter((f) => f.cat === id).length;
  const recent = sortByRecent(files).slice(0, 4);

  return (
    <MediaLayout>
      <MediaTitle title="Медиа и файлы" subtitle="Ваши фотографии, видео, документы и всё, что важно" />

      {/* Только на телефоне: заголовок хранилища над карточкой, как в макете */}
      <div className="nx-only-mobile nx-storage-head" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="ng-display" style={{ fontSize: 22, fontWeight: 400 }}>Хранилище</div>
        <div style={{ fontSize: 13, color: C.muted, textAlign: "right" }}>{used} ГБ / {STORAGE_TOTAL} ГБ{ownNote}</div>
      </div>

      <div className="nx-storage-box" style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "18px 20px", marginBottom: 34 }}>
        <div className="ng-storage-card" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div className="nx-storage-label" style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-start", width: 150 }}>
            {Icon.drive({ c: C.text, s: 24 })}
            <div>
              <div style={{ fontSize: 14 }}>Хранилище</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{used} ГБ / {STORAGE_TOTAL} ГБ</div>
              {ownNote}
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
              <div className="ng-display" style={{ fontSize: 26, fontWeight: 400 }}>{sel.gb} ГБ</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sel.label} · {sel.pct}% хранилища</div>
              <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>
                {countOf(sel.id)} {plural(countOf(sel.id), ["файл", "файла", "файлов"])} в списке
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Где хранится</div>
              {sel.devices.map(([name, gb]) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 12.5 }}>
                  <div style={{ width: 76, flexShrink: 0 }}>{name}</div>
                  <div style={{ flex: 1, height: 6, background: C.chip, overflow: "hidden" }}>
                    {/* Полоска "вырастает" слева направо — показывает долю устройства */}
                    <div className="nx-bar" style={{
                      width: `${(gb / sel.gb) * 100}%`, height: "100%",
                      background: `linear-gradient(90deg, ${sel.from}, ${sel.to})`,
                    }} />
                  </div>
                  <div style={{ width: 48, textAlign: "right", color: C.muted }}>{gb} ГБ</div>
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
function ScreenFiles({ files, filter, device, onClearFilter, onOpenFile, initialFolder, folders = FOLDERS, uploads = [], onAddFiles, onCreateFolder, onTransfer }) {
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

      {/* Идущие загрузки: имя и полоска, которая заполняется за UPLOAD_MS */}
      {uploads.map((u) => (
        <div key={u.id} role="status" className="nx-pop" style={{ padding: "12px 4px 10px", borderBottom: `1px solid color-mix(in srgb, ${C.borderStrong} 55%, transparent)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <Spinner />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.names.length === 1 ? `Загружаем «${u.names[0]}»` : `Загружаем ${u.names.length} ${plural(u.names.length, ["файл", "файла", "файлов"])}`}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.mutedSoft, whiteSpace: "nowrap" }}>в «{folderName(folders, u.folder)}»</span>
          </div>
          <div style={{ height: 2, background: C.border, marginTop: 10, overflow: "hidden" }}>
            <div className="nx-upload-bar" style={{
              height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
              animationDuration: `${UPLOAD_MS}ms`,
            }} />
          </div>
        </div>
      ))}

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
    ["Размер", formatSize(file.mb)],
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
  const main = videos[0] || DEMO_FILES.find((f) => f.cat === "video");
  const shelf = files.filter((f) => f.cat === "video" || f.cat === "photo").filter((f) => f.id !== main.id).slice(0, 4);
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
function DeviceScreen({ device: d, fileCount, devices, files, folders, received, onBack, onSetOnline, onSetting, onOpenFiles, onRemove, onToast }) {
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
  const used = deviceUsed(d);

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
  // У отключённого устройства полоски серые: данные на момент отключения
  const bars = [
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
          {d.online ? deviceStatus(d) : `Не в сети · был в сети ${d.lastSeen}`}
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
              style={{ position: "absolute", width: "min(460px, 54%)", height: "68%", left: "46%", top: "16%" }}
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
              {/* Полоска-«таблетка»: толстая, со скруглёнными краями */}
              <div style={{ flex: 1, height: 8, borderRadius: 999, background: `color-mix(in srgb, ${C.text} 10%, transparent)`, overflow: "hidden" }}>
                <div className="nx-bar" style={{
                  width: `${b.pct}%`, height: "100%", borderRadius: 999,
                  background: !d.online ? C.muted : b.low ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
                }} />
              </div>
              <div style={{ width: 96, flexShrink: 0, textAlign: "right", color: C.muted }}>{b.value}</div>
            </div>
          ))}
        </div>

        {/* Действия: три кнопки-«таблетки» равной ширины.
            На узком экране третья переносится на новую строку */}
        <div className="nx-device-actions" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))",
          gap: 10, padding: "20px 0 4px",
        }}>
          {/* Главная кнопка экрана — подключить / отключить, на всю ширину */}
          <StateButton
            state={power}
            labels={powerLabels}
            icon={Icon.power({ c: d.online ? C.red : C.green, s: 16 })}
            onClick={toggleOnline}
            style={{ ...pillBtn, gridColumn: "1 / -1" }}
          >
            {d.online ? "Отключить устройство" : "Подключить устройство"}
          </StateButton>
          {/* Пока устройство звонит, кнопка в состоянии «загрузка» */}
          <StateButton
            variant="primary"
            state={ringing ? "loading" : "idle"}
            labels={{ loading: "Звонит…" }}
            icon={Icon.search({ c: C.onFold, s: 16 })}
            disabled={!d.online || power === "loading"}
            onClick={find}
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
      </div>

      <div data-keep>
        {/* Переключатели. Энергосбережение — только у устройств с батареей */}
        <div style={{ margin: "20px 0 0", border: `1px solid ${C.border}`, borderRadius: 12 }}>
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
        </div>

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
function GlobalSearch({ files, folders: allFolders = FOLDERS, devices: allDevices = DEVICES, onOpenDevice, onClose, onOpenFile, onOpenFolder, onOpenChat, onNavigate }) {
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
    try {
      const saved = JSON.parse(localStorage.getItem("nexa-chats") || "[]");
      return saved.filter((c) => match(c.title));
    } catch { return []; }
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
function ScreenAssistant({ initialChatId, onToast, tab, setTab, devices = [], onAddDevice, onUploadFiles, bell }) {
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
// Диалоги: сохраняются в браузере и общие для всех вкладок
const [chats, setChats] = useSharedState('nexa-chats', () => {
  try {
    const saved = localStorage.getItem('nexa-chats');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
});
  const [currentChatId, setCurrentChatId] = useState(initialChatId || null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
  // Окно со списком сообщений: прокручиваем вниз только его, а не всю страницу
  const listRef = useRef(null);
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const [searchQuery, setSearchQuery] = useState('');

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

    // Определяем клавиатуру через visualViewport — работает надёжнее, чем focus/blur,
  // особенно на iOS. Если высота видимой области уменьшилась больше чем на 150px —
  // значит открылась клавиатура.
    // Определяем клавиатуру по уменьшению visualViewport.
  // Порог снижен до 80px, чтобы ловить и панель AutoFill iOS.
 useEffect(() => {
    const onFocusIn = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        document.body.classList.add('kb-open');
      }
    };
    const onFocusOut = () => {
      // Небольшая задержка — даём браузеру переключить фокус
      setTimeout(() => {
        const a = document.activeElement;
        const stillFocused = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
        if (!stillFocused) {
          document.body.classList.remove('kb-open');
        }
      }, 100);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.body.classList.remove('kb-open');
    };
  }, []);

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat?.messages || [];
  const isEmpty = messages.length === 0 && !isLoading;

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

  // Поле ввода растёт по высоте вместе с текстом (до ~6 строк, дальше прокрутка)
  useLayoutEffect(() => {
    const t = taRef.current;
    if (!t) return;
    t.style.height = "auto";
    const h = Math.min(t.scrollHeight, 168);
    t.style.height = `${h}px`;
    t.style.overflowY = t.scrollHeight > 168 ? "auto" : "hidden";
    // Одна строка — кнопка по центру поля, несколько — прижата к низу
    const oneLine = parseFloat(getComputedStyle(t).lineHeight) + 12 + 4;
    t.parentElement.style.alignItems = t.scrollHeight > oneLine ? "flex-end" : "center";
  }, [input, isEmpty]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, messages[messages.length - 1]?.text, isLoading]);

  // Клавиатура как в мессенджерах. Экран ассистента всегда ровно по видимой
  // области над клавиатурой: шапка стоит на месте, поле ввода сидит прямо
  // на клавиатуре, сжимается только список сообщений. Размер видимой области
  // кладём в CSS-переменные --vvh (высота) и --vvt (сдвиг сверху).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.style.setProperty('--vvt', `${vv.offsetTop}px`);
      // Браузер любит сдвигать страницу к полю ввода — возвращаем её на место
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      // Последнее сообщение остаётся видно над клавиатурой
      scrollToBottom();
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vvt');
    };
  }, []);

  const newChat = () => { if (currentChatId) rememberInputPos(); setCurrentChatId(null); setInput(''); };
  const openChat = (id) => { setCurrentChatId(id); setInput(''); };
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === currentChatId) setCurrentChatId(null);
    onToast?.({ title: "Диалог удалён" });
  };

    // Главная функция: отправляет вопрос на сервер и по мере прихода
  // текста вписывает ответ в чат. Используется и при обычной отправке,
  // и при повторе ответа, и при редактировании сообщения.
  // previousMessages это сообщения чата ДО вопроса, text это сам вопрос.
  const streamAnswer = async (chatId, previousMessages, text) => {
    setIsLoading(true);
    let fullText = '';

    // Записывает текст в последний ответ ИИ. Если ответа ещё нет, создаёт его.
    // Именно тут появляется пузырь, а вместе с ним пропадает "Печатает".
    const writeAnswer = (answerText, isError = false) => {
      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        const msgs = [...c.messages];
        const answer = { role: 'ai', text: answerText, ...(isError ? { error: true } : {}) };
        if (msgs[msgs.length - 1]?.role === 'ai') msgs[msgs.length - 1] = answer;
        else msgs.push(answer);
        return { ...c, messages: msgs };
      }));
    };

    try {
      // История для модели: сообщения с ошибками в неё не берём
      const history = previousMessages
        .filter(m => !m.error && !m.action) // команды и ошибки модели не нужны
        .map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }],
        }));

      const res = await fetch('/api/chat', {
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

      // Читаем ответ кусками и сразу показываем
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        if (fullText) writeAnswer(fullText);
      }

      if (!fullText.trim()) writeAnswer('Пустой ответ. Нажмите "повторить".', true);
    } catch (error) {
      if (fullText) {
        // Ответ оборвался посередине: оставляем то, что успело прийти
        writeAnswer(fullText + '\n\n(ответ оборвался, нажмите "повторить")', true);
      } else {
        writeAnswer(error.userMessage || 'Ошибка соединения с сервером.', true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Добавить сообщение в конец чата / поменять сообщение по id
  const pushMsg = (chatId, msg) => setChats(prev => prev.map(c =>
    c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c));
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
      setIsLoading(true); // пока собираем погоду — «печатает»
      const text = await buildTodaySummary();
      setIsLoading(false);
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
    const userMsg = { role: 'user', text, ...(cmd ? { action: true } : {}) };
    const before = currentChat?.messages || [];
    let chatId = currentChatId;

    if (!chatId) {
      chatId = Date.now().toString();
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
        messages: [...previous, { role: 'user', text: newText, ...(cmd ? { action: true } : {}) }],
      };
    }));
    if (cmd) runCommand(currentChatId, cmd);
    else streamAnswer(currentChatId, previous, newText);
  };
  
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

    const rightItems = [
    { label: "Новый диалог", icon: Icon.plus, onClick: newChat },
    {
      label: "Поиск",
      icon: Icon.search,
      onClick: () => {
        setIsHistoryOpen(true);
        // сбрасываем поиск при новом открытии
        setSearchQuery('');
      },
      active: isHistoryOpen,
    },
    {
      label: "История",
      icon: Icon.list,
      onClick: () => setIsHistoryOpen(v => !v),
      active: isHistoryOpen,
    },
  ];


 const titleOnly = (
  <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", position: "relative", zIndex: 2 }}>
    {/* Гамбургер — виден только на мобильном */}
    <button
      className="ng-hamburger"
      onClick={() => setIsHistoryOpen(v => !v)}
      style={{
        background: "transparent", border: "none",
        cursor: "pointer", padding: 4, display: "none",
        alignItems: "center", justifyContent: "center",
      }}
      aria-label="Меню"
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={C.text} strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      </svg>
    </button>
    <div style={{ textAlign: "left" }}>
      <div className="ng-display" style={{ fontSize: 40, fontWeight: 600, textAlign: "left" }}>
        ИИ - Ассистент
      </div>
       <div className="nx-assistant-subtitle" style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: "left" }}>
        Интеллектуальный центр системы NEXA · v{VERSION}
      </div>
    </div>
  </div>
);

const menuBlock = isHistoryOpen ? (
  // Когда открыта история — показываем только крестик закрытия
  <div className="ng-menu-block" style={{
    position: "fixed",
    top: 24,
    right: 40,
    zIndex: 200,
  }}>
    <button
      onClick={() => setIsHistoryOpen(false)}
      title="Закрыть историю"
      style={{
        width: 40, height: 40, borderRadius: "50%",
        border: `1px solid ${C.border}`,
        background: C.panel,
        color: C.text,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, lineHeight: 1,
      }}
    >
      ×
    </button>
  </div>
) : (
  // Обычное меню — когда история закрыта
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

    {/* Меню: Новый диалог / Поиск / История */}
    {rightItems.map((it) => (
      <div
        key={it.label}
        onClick={it.onClick}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 14,
          cursor: it.onClick ? "pointer" : "default",
        }}
      >
        {it.label}
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          border: `1px solid ${it.active ? C.mint : C.border}`,
          background: it.active ? C.mintDark : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 140ms ease, background 140ms ease",
        }}>
          {it.icon({ c: it.active ? C.mint : C.text, s: 15 })}
        </div>
      </div>
    ))}
  </div>
);

    const inputRow = (
  <div style={{
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

  // ─── ПАНЕЛЬ ИСТОРИИ (справа) ─────────────────────────────
    const historyPanel = (
    <div
      className={`ng-history-panel${isHistoryOpen ? " is-open" : ""}`}
      style={{
        width: isHistoryOpen ? 240 : 0,
        marginLeft: isHistoryOpen ? 24 : 0,
        flexShrink: 0,
        overflow: "hidden",
        opacity: isHistoryOpen ? 1 : 0,
        transition:
          "width 320ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "margin-left 320ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "opacity 220ms ease",
      }}
    >
      <div
        className="nx-scroll"
        style={{
          width: 240,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderLeft: `1px solid ${C.border}`,
          paddingLeft: 20,
          paddingRight: 4,
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        {/* Шапка с крестиком — только на мобильном (CSS покажет) */}
        <div className="ng-history-header">
          <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.mutedSoft, textTransform: "uppercase" }}>
            История
          </div>
          <button
            onClick={() => setIsHistoryOpen(false)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.text, fontSize: 24, lineHeight: 1, padding: 0 }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

                {/* Кнопки действий — только на мобильном (CSS покажет) */}
        <div className="ng-history-actions">
          <button
            onClick={() => { newChat(); setIsHistoryOpen(false); }}
            style={{ flex: 1, padding: "12px 16px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, color: C.text, fontSize: 14, cursor: "pointer" }}
          >
            + Новый диалог
          </button>
        </div>
        {/* Заголовок "История" — только на десктопе */}
        <div className="ng-history-title-desktop" style={{
          fontSize: 11, letterSpacing: "0.15em", color: C.mutedSoft,
          textTransform: "uppercase", paddingLeft: 4, marginBottom: 4,
        }}>
          История
        </div>

                {/* Поле поиска */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", marginBottom: 4,
          border: `1px solid ${C.border}`, borderRadius: 8,
          background: C.panel,
        }}>
          {Icon.search({ c: C.mutedSoft, s: 14 })}
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по диалогам..."
            style={{
              flex: 1, background: "transparent", border: "none",
              outline: "none", color: C.text, fontSize: 13, minWidth: 0,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: "transparent", border: "none",
                color: C.mutedSoft, cursor: "pointer", padding: 0,
                fontSize: 14, lineHeight: 1,
              }}
              title="Очистить"
            >
              ×
            </button>
          )}
        </div>

        {chats.length === 0 ? (
          <div style={{ fontSize: 13, color: C.mutedSoft, padding: "4px", lineHeight: 1.5 }}>
            Здесь появятся ваши диалоги
          </div>
        ) : chats.filter(c =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
          ).length === 0 ? (
          <div style={{ fontSize: 13, color: C.mutedSoft, padding: "4px", lineHeight: 1.5 }}>
            Ничего не найдено
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {chats
              .filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase().trim()))
              .map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => { openChat(chat.id); setIsHistoryOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    background: chat.id === currentChatId ? C.panel : "transparent",
                    border: `1px solid ${chat.id === currentChatId ? C.border : "transparent"}`,
                    transition: "background 140ms ease",
                  }}
                >
                  <div style={{
                    flex: 1, minWidth: 0, fontSize: 13, color: C.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {chat.title}
                  </div>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    title="Удалить"
                    style={{
                      background: "transparent", border: "none",
                      color: C.mutedSoft, cursor: "pointer",
                      fontSize: 14, padding: 2, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                   </div>
              ))}
          </div>
        )}
      </div>
    </div>
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
  flex: 1, display: "flex", flexDirection: "row",
  width: "100%", maxWidth: 1440, margin: "0 auto",
  padding: "66px 40px 20px 40px",
  overflow: "hidden",
  boxSizing: "border-box", minHeight: 0,
};
  return (
  <div className="ng-assistant-wrapper ng-assistant-anim" style={wrapperStyle}>
    {menuBlock}

    <div className="ng-assistant-inner" style={innerStyle}>
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
            <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginTop: 24, marginBottom: 16 }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 10 }}>
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
                {isLoading && messages[messages.length - 1]?.role !== 'ai' && <AssistantSkeleton />}
                <div ref={bottomRef} />
              </div>
            </div>
            </div>

            {/* Поле ввода + дисклеймер (дисклеймер только в чате) */}
            <div ref={inputDockRef} style={{
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

      {historyPanel}
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
          width: 40, height: 40, borderRadius: 4, border: `1px solid ${C.border}`, flexShrink: 0,
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
    <div className="nx-set-group" style={{ border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 28, background: C.bg }}>
      {children}
    </div>
  );
}

// ЭКРАН "НАСТРОЙКИ": профиль, тема, уведомления, аккаунт
function ScreenSettings({ onOpenSearch }) {
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
      {/* Справа отступ под иконки поиска и профиля, которые лежат поверх экрана */}
      <div className="nx-settings-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingRight: 110 }}>
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

      <SectionTitle>Профиль</SectionTitle>
      <SettingsGroup>
        <SettingsRow
          last
          icon={Icon.user({ c: C.muted, s: 20 })}
          title="Пользователь"
          subtitle={
            <>
              <div>user@example.com</div>
              <div style={{ color: C.green, display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <Dot color={C.green} /> Активный аккаунт
              </div>
            </>
          }
          right={Icon.chevron({})}
        />
      </SettingsGroup>

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

      <SectionTitle>Об аккаунте</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.logout({ c: C.text, s: 18 })} title="Выйти из аккаунта" subtitle="Завершить сессию на всех устройствах" right={Icon.chevron({})} />
        <SettingsRow last icon={Icon.info({ c: C.text, s: 18 })} title="О системе" subtitle={`NEXA ${VERSION}`} right={Icon.chevron({})} />
      </SettingsGroup>
    </div>
  );
}

/* ---------- 6. APP — корневой компонент ----------
   tab хранит id текущего открытого раздела (по умолчанию "home").
   setTab меняется при клике по иконке в Sidebar — от этого зависит,
   какой из шести экранов показывается ниже. */
export default function NexaApp() {
  // Ленивая инициализация: берём сохранённый экран из localStorage,
  // если его нет — начинаем с Главной.
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem('nexa-tab');
      return saved || 'home';
    } catch { return 'home'; }
  });

  // Каждый раз, когда экран меняется — сохраняем его id
  useEffect(() => {
    if (tab !== 'assistant') {
  try { localStorage.setItem('nexa-tab', tab); } catch {}
}
  }, [tab]);

  // Общие данные для "Медиа" и "Файлов": список файлов, фильтр по категории
  // и файл, открытый в окне просмотра.
  // Добавленные файлы, удаления, новые имена и папки запоминаем в браузере
  // useSharedState: сохраняется в браузере и делится с другими вкладками
  const [fileStore, setFileStore] = useSharedState(FILES_KEY, loadFileStore);
  // Превью картинок живут только пока открыта вкладка: { id: адрес картинки }
  const [previews, setPreviews] = useState({});
  // Идущие загрузки: [{ id, names, folder }] — для полоски прогресса
  const [uploads, setUploads] = useState([]);
  const folders = [...FOLDERS, ...fileStore.folders];
  const files = [
    ...DEMO_FILES.filter((f) => !fileStore.removed.includes(f.id)),
    ...fileStore.added.map((f) => ({ ...withWhen(f), uploaded: true })),
  ].map((f) => ({ ...f, name: fileStore.renamed[f.id] ?? f.name, preview: previews[f.id] }));
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
  const [deviceStore, setDeviceStore] = useSharedState(DEVICES_KEY, loadDeviceStore);
  // Итоговый список: исходные (кроме удалённых) + добавленные,
  // поверх — настройки по умолчанию и сохранённое состояние
  const devices = [
    ...DEVICES.filter((d) => !deviceStore.removed.includes(d.id)),
    ...deviceStore.added.map((d) => ({ ...d, icon: deviceType(d.type).icon })),
  ].map((d) => ({ ...d, ...DEVICE_DEFAULTS, ...deviceStore.state[d.id] }));
  const patchDevice = (id, patch) => setDeviceStore((s) => ({
    ...s, state: { ...s.state, [id]: { ...s.state[id], ...patch } },
  }));
  // Новое устройство: сразу в сети
  const addDevice = (type, name) => {
    const t = deviceType(type);
    const d = {
      id: `dev-${Date.now()}`, type, name,
      battery: t.battery, memory: t.memory, online: true, lastSeen: "только что",
    };
    setDeviceStore((s) => ({ ...s, added: [...s.added, d] }));
    logEvent({ title: "Устройство подключено", text: name, kind: "device" });
  };

  /* Расписание на сегодня: можно добавлять свои дела и удалять.
     Хранится в браузере (общее для вкладок), по умолчанию — пример.
     TODAY.schedule — то же самое для ассистента и превью часов */
  const [schedule, setSchedule] = useSharedState(SCHEDULE_KEY, loadSchedule);
  TODAY.schedule = schedule;
  const addScheduleItem = (it) => {
    setSchedule((list) => sortSchedule([...list, { id: `s${Date.now()}`, ...it }]));
    showToast({ title: "Дело добавлено", text: `${it.time} · ${it.title}`, kind: "schedule" });
  };
  const removeScheduleItem = (it) => {
    setSchedule((list) => list.filter((x) => !(x.time === it.time && x.title === it.title)));
    showToast({ title: "Дело удалено", text: `${it.time} · ${it.title}`, kind: "schedule" });
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
  // Переход по меню закрывает и экран устройства
  const goTab = (t) => { setFilesFilter(null); setFilesDevice(null); setOpenDeviceId(null); setTab(t); };
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
  // Удаление: демо-файл запоминаем в removed, добавленный просто убираем
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
    if (previews[f.id]) {
      URL.revokeObjectURL(previews[f.id]); // освобождаем память картинки
      setPreviews(({ [f.id]: _, ...rest }) => rest);
    }
    setOpenFile(null);
  };
  const renameFile = (id, name) =>
    setFileStore((s) => ({ ...s, renamed: { ...s.renamed, [id]: name } }));
  // Новая папка внутри parent (null — в корне). Возвращает её id
  const createFolder = (name, parent) => {
    const id = `u-${Date.now()}`;
    setFileStore((s) => ({ ...s, folders: [...s.folders, { id, name, parent }] }));
    return id;
  };
  /* Загрузка файлов с компьютера или телефона в папку folder.
     Сохраняем только сведения о файле; картинкам делаем превью.
     Сначала UPLOAD_MS идёт полоска прогресса, потом файлы
     появляются в списке и всплывает уведомление */
  const addFiles = (fileList, folder) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    const now = Date.now();
    const device = uploadDevice();
    const metas = picked.map((file, i) => ({
      id: now + i, name: file.name, cat: catFromFile(file), folder,
      device, mb: toMb(file.size), addedAt: now,
    }));
    const batch = { id: now, names: metas.map((m) => m.name), folder };
    setUploads((u) => [...u, batch]);
    setTimeout(() => {
      const urls = {};
      picked.forEach((file, i) => { if (file.type.startsWith("image/")) urls[metas[i].id] = URL.createObjectURL(file); });
      setPreviews((p) => ({ ...p, ...urls }));
      setFileStore((s) => ({ ...s, added: [...s.added, ...metas] }));
      setUploads((u) => u.filter((b) => b.id !== batch.id));
      const where = folderName(folders, folder);
      showToast(metas.length === 1
        ? { title: "Файл добавлен", text: `${metas[0].name} → ${where}` }
        : { title: `Добавлено ${metas.length} ${plural(metas.length, ["файл", "файла", "файлов"])}`, text: `В папку «${where}»` });
    }, UPLOAD_MS);
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
          --on-fold: #FFFFFF;
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
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
          --on-fold: #FFFFFF;
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
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
        .ng-devices-list { display: block; }
        .ng-devices-mobile { display: none; }
        .ng-history-header { display: none; }
        .ng-history-actions { display: none; }
        .ng-history-title-desktop { display: block; }
        
        
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
            top: calc(env(safe-area-inset-top, 0px) + 10px);
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
        /* Расписание: корзина видна при наведении на дело (на телефоне — всегда) */
        .nx-sched-del { opacity: 0; transition: opacity 160ms ease, background-color 160ms ease; }
        .nx-sched-item:hover .nx-sched-del, .nx-sched-del:focus-visible { opacity: 1; }
        @media (hover: none) { .nx-sched-del { opacity: 1; } }
        /* Значок часов у поля времени — под цвет темы */
        :root[data-theme="dark"] input[type="time"] { color-scheme: dark; }
        :root[data-theme="light"] input[type="time"] { color-scheme: light; }
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
        .nx-scroll {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--mint) 35%, transparent) transparent;
        }
        .nx-scroll::-webkit-scrollbar { width: 8px; }
        .nx-scroll::-webkit-scrollbar-track { background: transparent; }
        .nx-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 50%, transparent), color-mix(in srgb, var(--mint) 50%, transparent));
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .nx-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 85%, transparent), color-mix(in srgb, var(--mint) 85%, transparent));
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
            grid-template-areas: "now" "sched" "next" "month" !important;
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
          .nx-sched-place { display: block !important; }
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
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
          .nx-viewer-preview > div { height: 180px !important; }
          .nx-viewer-actions > button { flex: 1 1 auto; justify-content: center; }

          /* Крошки в файлах */
          .ng-crumbs {
            justify-content: flex-start !important;
            white-space: nowrap !important;
          }

          /* Ассистент */
          .ng-assistant-wrapper { left: 0 !important; }
          .ng-assistant-inner {
            padding: 24px 16px 76px 16px !important;
          }
          /* Когда клавиатура открыта — уменьшаем нижний отступ */
          body.kb-open .ng-assistant-inner {
            padding-bottom: 16px !important;
          }

          /* Панель истории на весь экран */
          .ng-history-panel {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 60px !important;
            width: 100% !important;
            margin-left: 0 !important;
            background: var(--bg) !important;
            z-index: 150 !important;
            padding: 24px 16px !important;
            border-left: none !important;
            border-right: none !important;
            transform: translateX(-100%);
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease !important;
            opacity: 0;
            box-sizing: border-box !important;
          }
             .ng-history-panel .nx-scroll > div:last-child > div > div {
    padding: 14px 14px !important;
    border-radius: 10px !important;
  }
  .ng-history-panel .nx-scroll > div:last-child > div > div > div:first-child {
    font-size: 14.5px !important;
  }
          .ng-history-panel.is-open {
            transform: translateX(0) !important;
            opacity: 1 !important;
            width: 100% !important;
            overflow-y: auto !important;
          }
          .ng-history-panel > div {
            width: 100% !important;
            height: auto !important;
            border-left: none !important;
            padding-left: 0 !important;
          }

            .ng-history-header {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .ng-history-header > div {
    font-size: 13px !important;
    letter-spacing: 0.2em !important;
    color: var(--muted) !important;
    font-weight: 500 !important;
  }
  .ng-history-header button {
    width: 36px !important;
    height: 36px !important;
    border-radius: 50% !important;
    background: var(--hover) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 20px !important;
            }

          .ng-history-actions {
    display: flex !important;
    gap: 10px !important;
    margin-bottom: 20px !important;
  }
  .ng-history-actions button {
    padding: 14px 16px !important;
    border-radius: 12px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    background: var(--panel) !important;
  }
          .ng-history-title-desktop { display: none !important; }

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
    padding-top: env(safe-area-inset-top, 0);
    padding-bottom: env(safe-area-inset-bottom, 0);
    background: var(--bg);
  }

    /* Убираем скроллбар страницы, когда открыт Ассистент.
     Внутренние блоки всё равно скроллятся, если нужно. */
  body:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100vh;
  }
  html:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100vh;
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
          .nx-assistant-subtitle { font-size: 13px !important; margin-top: 4px !important; }
          .nx-bubble-text { font-size: 16px !important; line-height: 1.5 !important; }
          .nx-user-bubble { max-width: 88% !important; }
          .nx-ai-col { max-width: calc(100% - 48px) !important; }
          }
            body.kb-open .ng-mobile-tabbar {
            transform: translateY(120%);
            opacity: 0;
            pointer-events: none;
          }
            .ng-mobile-tabbar {
            transition: transform 220ms ease, opacity 220ms ease;
}
        
      `}</style>
      {/* Фон за содержимым: на «Настройках» — сетка-чертёж, на остальных — грани складки */}
      {tab === "settings" && !openDevice ? <BackdropGrid /> : <BackdropFolds />}
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
    {openDevice ? (
    <div key={`dev-${openDevice.id}`} className="ng-screen-anim">
      <DeviceScreen
        key={openDevice.id}
        device={openDevice}
        devices={devices}
        files={files}
        folders={folders}
        received={received[openDevice.id]}
        fileCount={files.filter(onDeviceFile(openDevice)).length}
        onBack={() => setOpenDeviceId(null)}
        onSetOnline={(online) => patchDevice(openDevice.id, { online })}
        onSetting={(key) => patchDevice(openDevice.id, { [key]: !openDevice[key] })}
        onOpenFiles={() => openDeviceFiles(openDevice.id)}
        onRemove={() => removeDevices([openDevice.id])}
        onToast={showToast}
      />
    </div>
  ) : tab === "assistant" ? (
    <ScreenAssistant
      initialChatId={searchChatId}
      onToast={showToast}
      tab={tab}
      setTab={goTab}
      devices={devices}
      onAddDevice={() => setAddOpen(true)}
      onUploadFiles={() => uploadInputRef.current?.click()}
      bell={<NotificationBell notes={notes} onSeen={() => setNotes((s) => ({ ...s, seenAt: Date.now() }))} onClear={() => setNotes({ items: [], seenAt: Date.now() })} />}
    />
  ) : (
    <div key={tab} className="ng-screen-anim">
      {tab === "home" && (
        <ScreenHome
          devices={devices}
          received={received}
          onNavigate={goTab}
          onOpenDevice={showDevice}
          onAddDevice={() => setAddOpen(true)}
          onRestoreDevices={restoreDevices}
          canRestore={deviceStore.removed.length > 0}
        />
      )}
      {tab === "today" && <ScreenToday schedule={schedule} onAddItem={addScheduleItem} onRemoveItem={removeScheduleItem} />}
      {tab === "media" && <ScreenMedia files={files} onOpenFile={setOpenFile} onOpenCategory={openCategory} onTransfer={openTransfer} />}
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
          onCreateFolder={createFolder}
          onTransfer={openTransfer}
        />
      )}
      {tab === "settings" && <ScreenSettings onOpenSearch={() => setSearchOpen(true)} />}
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
