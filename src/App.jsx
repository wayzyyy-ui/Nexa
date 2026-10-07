import { useState, useEffect, useRef, startTransition } from "react";
// flushSync нужен для плавной смены темы: React обновляет экран сразу,
// пока браузер делает снимок для анимации
import { flushSync } from "react-dom";
// Подключаем свой логотип из папки assets
import foldSvg from "./assets/fold.svg";
const VERSION = "0.3.0";


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
function switchTheme(theme, update) {
  const run = () => { applyTheme(theme); if (update) flushSync(update); };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) { run(); return; }

  if (document.startViewTransition) {
    document.startViewTransition(run);
    return;
  }

  const root = document.documentElement;
  root.classList.add("nx-theme-anim");
  run();
  setTimeout(() => root.classList.remove("nx-theme-anim"), 400);
}
applyTheme(readTheme());


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
        {accent !== false && Icon.chevron({})}
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

// Настройки устройства по умолчанию (переключатели в окне устройства)
const DEVICE_DEFAULTS = { sync: true, dnd: false, saver: false };
const DEVICES_KEY = "nexa-devices"; // ключ в localStorage

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
function ScreenHome({ devices, onNavigate, onOpenDevice }) {
  // Сколько устройств сейчас в сети — для счётчика рядом с заголовком
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="ng-screen ng-home" style={{ padding: "28px 40px 40px", textAlign: "left" }}>

      {/* ══════════ ДЕСКТОПНАЯ ВЕРСИЯ ══════════ */}
      {/* Высота — почти на всё окно (минус футер и отступы), а содержимое
          стоит по центру по вертикали, чтобы снизу не было пустоты */}
      <div className="ng-home-desktop">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 40 }}>
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

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 16 }}>
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
              {/* Каждая строка — кнопка: открывает окно устройства */}
              {devices.map((d) => (
                <button key={d.id} type="button" className="nx-row-btn" onClick={() => onOpenDevice(d.id)}
                  style={{ ...btnReset, display: "block", width: "100%" }}>
                  <Row
                    leftIcon={d.icon({ c: C.text, s: 19 })}
                    title={d.name}
                    subtitle={deviceStatus(d)}
                    right={<Dot color={d.online ? C.green : C.red} />}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Правая колонка: складка сверху, AI-карточка снизу.
              Отступ сверху — чтобы складка не залезала под часы */}
          <div style={{ display: "flex", flexDirection: "column", paddingTop: 48 }}>
            {/* Складка крупнее за счёт scale: место в раскладке остаётся
                прежним (340px), поэтому остальные блоки не сдвигаются.
                Края картинки прозрачные, так что на соседей она не «наезжает» */}
            <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ transform: "scale(1.4)", transformOrigin: "center" }}>
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
          <div style={{ flexShrink: 0, alignSelf: "center" }}>
            <FoldHero size={130} />
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
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
          }}>
            {/* Карточка — кнопка: открывает окно устройства */}
            {devices.map((d) => (
              <button
                type="button"
                key={d.id}
                className="nx-row-btn"
                onClick={() => onOpenDevice(d.id)}
                style={{
                  ...btnReset,
                  border: `1px solid ${C.border}`, borderRadius: 14,
                  padding: 14, cursor: "pointer", position: "relative",
                  display: "flex", flexDirection: "column", gap: 10,
                  minHeight: 96,
                }}
              >
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Dot color={d.online ? C.green : C.red} />
                </div>
                <div style={{ width: 26, height: 26 }}>
                  {d.icon({ c: C.text, s: 24 })}
                </div>
                <div style={{ marginTop: "auto" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{deviceStatus(d)}</div>
                </div>
              </button>
            ))}
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
function TempFold({ temp, tone }) {
  return (
    <div className="nx-temp" style={{ position: "relative", display: "inline-flex", alignItems: "flex-start", paddingRight: 22, flexShrink: 0 }}>
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

// Карточка погоды (на экране "Сегодня" их две: на сегодня и на завтра).
// city и details необязательные: у карточки "на завтра" их нет.
// art — показать складку внутри карточки (только на телефоне, как в макете).
// note — своя подпись под состоянием вместо «Ощущается как …» (для завтра)
// cityNote — мелкая подпись после города: откуда взялось местоположение
// veil — «вуаль», когда настоящих данных нет: { kind: "loading" | "error", text, onRetry }.
//   Значения размываются, поверх — сообщение и кнопка «Обновить»
function WeatherCard({ title, date, city, cityNote, temp, cond, feels, note, tone, details, art, veil }) {
  return (
    <div className="nx-weather" style={{
      position: "relative", overflow: "hidden",
      border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "22px 24px",
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
        {city && (
          <div className="nx-weather-city" style={{ gridArea: "city", display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: C.muted, marginTop: 8, minWidth: 0 }}>
            <span className="nx-weather-pin" style={{ display: "flex", width: 24, justifyContent: "center", flexShrink: 0 }}>{Icon.pin({ c: C.muted, s: 20 })}</span>
            {/* Длинное название города обрезается многоточием, подпись не съезжает */}
            <span className="nx-weather-cityname" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
            {cityNote && (
              <span className="nx-weather-note" style={{ flexShrink: 0, marginLeft: -6, fontSize: 11, color: C.mutedSoft, whiteSpace: "nowrap" }}>· {cityNote}</span>
            )}
          </div>
        )}
      </div>

      {/* Значения погоды. Если настоящих данных нет (veil), они размыты,
          а поверх — сообщение: «загружаем» или «не удалось + Обновить» */}
      <div style={{ position: "relative" }}>
        <div aria-hidden={veil ? true : undefined} style={veil ? {
          filter: "blur(8px)", opacity: 0.45, pointerEvents: "none", userSelect: "none",
        } : { transition: "filter 300ms ease, opacity 300ms ease" }}>
          <div className="nx-weather-main" style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            <TempFold temp={temp} tone={tone} />
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
                  border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "7px 14px", fontSize: 13,
                  background: C.panel,
                }}>
                  {Icon.refresh({ c: C.text, s: 14 })} Обновить
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Расписание на сегодня. place — где проходит (видно только на телефоне)
const SCHEDULE = [
  { time: "09:30", title: "Лекция по проектированию", place: "Колледж" },
  { time: "11:00", title: "Встреча с куратором", place: "Колледж" },
  { time: "13:00", title: "Обед", place: "Кафе у дома" },
  { time: "14:30", title: "Работа над дипломом", place: "Дома" },
  { time: "17:00", title: "Тренировка", place: "Фитнес-клуб" },
];

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
function weatherCodeToText(code) {
  const clear = { tone: C.mint };
  const gray = { tone: C.muted };
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
const DEFAULT_LOCATION = { city: "Казань", lat: 55.79, lon: 49.11, source: "default" };
const GEO_TIMEOUT_MS = 6000;        // дольше 6 секунд геолокацию не ждём
const GEO_CACHE_MS = 10 * 60 * 1000; // браузер может отдать координаты из кэша за 10 минут
const IP_GRACE_MS = 1500;           // столько ждём геолокацию, прежде чем поставить город по IP
const CITY_LOOKUP_MS = 3000;        // дольше 3 секунд название города не ждём

// Подпись под городом на карточке погоды: откуда взялось местоположение
const LOCATION_SOURCE_TEXT = {
  geo: "определено точно",
  ip: "примерно по IP",
  default: "по умолчанию",
};

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
  const [loc, setLoc] = useState(DEFAULT_LOCATION);

  useEffect(() => {
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

    // Способ 1: по IP. ipapi присылает город латиницей, поэтому
    // название переспрашиваем по координатам — уже по-русски
    fetch("https://ipapi.co/json/", { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        // При превышении лимита ipapi отвечает { error: true } — это тоже «не вышло»
        if (!data || data.error || data.latitude == null || data.longitude == null) return;
        const lat = round2(data.latitude);
        const lon = round2(data.longitude);
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
  }, []);

  return loc;
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
      .then((data) => setState({
        loading: false, error: null, updatedAt: Date.now(), ...parseWeather(data),
      }))
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
              {/* Маленькая складка в цвет погоды: мятная — ясно, серая — облачно */}
              <span aria-hidden="true" style={{
                width: 16, height: 11, flexShrink: 0,
                clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0 100%)",
                background: `linear-gradient(135deg, ${sky.tone}, color-mix(in srgb, ${sky.tone} 25%, transparent))`,
              }} />
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
function ScreenToday() {
  // Сначала определяем город, потом по нему грузим погоду
  const location = useLocation();
  // Реальная погода; пока её нет (грузится или ошибка) — заглушки
  const weather = useWeather(location.lat, location.lon);
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

      <div className="nx-today-grid" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 356px)",
        // Кнопка прогноза — в последней строке, вровень с низом расписания
        gridTemplateAreas: `"sched now" "sched next" "sched ." "sched month"`,
        gridTemplateRows: "auto auto 1fr auto",
        gap: "18px 44px", alignItems: "start",
      }}>
        <section className="nx-sched" style={{ gridArea: "sched", border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "26px 28px 30px" }}>
          <div className="nx-sched-head" style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: fontDisplay, fontSize: 20, marginBottom: 22 }}>
            {Icon.calendar({ c: C.text, s: 24 })} Расписание
          </div>

          {/* Вертикальная линия таймлайна — один div. --dot-x — где центр
              кружков; на телефоне время стоит слева, и линия сдвигается */}
          <div className="nx-sched-list" style={{ position: "relative", "--dot-x": "12px" }}>
            <div className="nx-sched-line" style={{ position: "absolute", left: "var(--dot-x)", top: 8, bottom: -10, width: 1, background: C.muted }} />
            {SCHEDULE.map((it) => (
              <div key={it.time} className="nx-sched-item" style={{
                display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)",
                gridTemplateAreas: `"dot time" ". box"`, columnGap: 20, marginBottom: 14,
              }}>
                <span className="nx-sched-dot" style={{
                  gridArea: "dot", justifySelf: "center", alignSelf: "center", position: "relative",
                  width: 12, height: 12, boxSizing: "border-box", borderRadius: "50%",
                  border: `1.5px solid ${C.text}`, background: C.bg,
                }} />
                <div className="nx-sched-time" style={{ gridArea: "time", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{it.time}</div>
                <div className="nx-sched-box" style={{
                  gridArea: "box", border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "9px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="nx-sched-title" style={{ fontSize: 18 }}>{it.title}</div>
                    <div className="nx-sched-place" style={{ display: "none", fontSize: 12, color: C.muted, marginTop: 2 }}>{it.place}</div>
                  </div>
                  {Icon.chevron({ c: C.text })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ gridArea: "now" }}>
            <WeatherCard title="Погода" date={formatWeatherDate(now.date)} city={location.city} cityNote={LOCATION_SOURCE_TEXT[location.source]} art
            temp={now.temp} cond={nowSky.text} feels={now.feels} tone={nowSky.tone}
            details={[
              { label: "Ветер", value: `${now.wind} м/с` },
              { label: "Влажность", value: `${now.humidity} %` },
              { label: "Давление", value: `${now.pressure} мм` },
            ]}
            veil={veil} />
                    <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 8, paddingLeft: 2, minHeight: 22,
            // Пока данных нет, о загрузке и ошибке говорит сама карточка (вуаль).
            // Строку прячем, но место оставляем — чтобы ничего не прыгало
            visibility: weather.now ? "visible" : "hidden",
          }}>
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
        </div>
        <div style={{ gridArea: "next" }}>
          <WeatherCard title="Погода (завтра)" date={formatWeatherDate(tomorrow.date)}
            temp={tomorrow.temp} cond={tomorrowSky.text} note={`Ночью ${signed(tomorrow.min)}°`} tone={tomorrowSky.tone}
            veil={veil} />
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

// Устройства, на которые можно "отправить" файл из окна просмотра
const SEND_TARGETS = ["Смартфон", "Ноутбук", "Часы", "ТВ"];
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
  if (mb < 1000) return `${mb} МБ`;
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
function FileThumb({ file, w = 52, h = 34, iconSize = 16, radius = 6 }) {
  const cat = catOf(file);
  const plain = file.cat === "doc" || file.cat === "other";
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

/* Один сегмент диаграммы хранилища — стеклянная складка.
   ВАЖНО: форма вырезается через css clip-path прямо на самом элементе,
   а не отдельной svg-картинкой поверх текста — раньше подписи были
   нарисованы отдельным слоем и на разной ширине окна съезжали
   относительно формы. Сейчас подпись лежит внутри той же фигуры.
   Сегмент — это кнопка: по нажатию он выделяется, остальные бледнеют.
   Нажимается только сама фигура: clip-path обрезает и область клика. */
function StorageSegment({ cat, first, dimmed, active, onClick }) {
  return (
    <button type="button" className="nx-seg-btn" onClick={onClick} aria-pressed={active} style={{
      ...btnReset,
      flex: cat.flex,
      position: "relative", top: cat.top, height: cat.h,
      marginLeft: first ? 0 : -30, // складки наезжают друг на друга
      clipPath: cat.clip,
      background: foldFill(cat),
      color: C.onFold,
      opacity: dimmed ? 0.4 : 1,
      transition: "opacity 200ms ease",
      display: "flex", alignItems: "center",
    }}>
      {/* paddingLeft в % считается от ширины самой складки,
          поэтому подпись всегда попадает внутрь фигуры */}
      <div className="nx-seg-label" style={{ "--lx": cat.labelX, paddingLeft: "var(--lx)", lineHeight: 1.25, whiteSpace: "nowrap" }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 12.5 }}>{cat.label}</span>
        <span style={{ display: "block", fontSize: 12 }}>{cat.gb} ГБ</span>
        <span style={{ display: "block", fontSize: 11.5, opacity: 0.75 }}>{cat.pct}%</span>
      </div>
    </button>
  );
}

// ЭКРАН "МЕДИА И ФАЙЛЫ" — диаграмма хранилища + категории + недавние файлы
// files — общий список файлов из App, onOpenFile открывает окно просмотра,
// onOpenCategory переводит на экран "Файлы" с фильтром по категории
// (null — без фильтра).
function ScreenMedia({ files, onOpenFile, onOpenCategory }) {
  // Какой сегмент хранилища выбран (id категории или null)
  const [selected, setSelected] = useState(null);
  const sel = MEDIA_CATS.find((c) => c.id === selected);
  const used = MEDIA_CATS.reduce((sum, c) => sum + c.gb, 0);
  const countOf = (id) => files.filter((f) => f.cat === id).length;
  const recent = sortByRecent(files).slice(0, 4);

  return (
    <MediaLayout>
      <MediaTitle title="Медиа и файлы" subtitle="Ваши фотографии, видео, документы и всё, что важно" />

      {/* Только на телефоне: заголовок хранилища над карточкой, как в макете */}
      <div className="nx-only-mobile nx-storage-head" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="ng-display" style={{ fontSize: 22, fontWeight: 400 }}>Хранилище</div>
        <div style={{ fontSize: 13, color: C.muted }}>{used} ГБ / {STORAGE_TOTAL} ГБ</div>
      </div>

      <div className="nx-storage-box" style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "18px 20px", marginBottom: 34 }}>
        <div className="ng-storage-card" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div className="nx-storage-label" style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-start", width: 150 }}>
            {Icon.drive({ c: C.text, s: 24 })}
            <div>
              <div style={{ fontSize: 14 }}>Хранилище</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{used} ГБ / {STORAGE_TOTAL} ГБ</div>
            </div>
          </div>
          {/* Собираем диаграмму из массива MEDIA_CATS — чтобы поменять пропорции
              или форму складки, меняй объект в этом массиве */}
          <div className="ng-storage-segments" style={{ display: "flex", flex: 1, height: 132, minWidth: 0 }}>
            {MEDIA_CATS.map((c, i) => (
              <StorageSegment
                key={c.id} cat={c} first={i === 0}
                active={selected === c.id}
                dimmed={selected !== null && selected !== c.id}
                // Повторное нажатие снимает выделение
                onClick={() => setSelected(selected === c.id ? null : c.id)}
              />
            ))}
          </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 34 }} className="ng-cat-grid">
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
      <div style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 6, top: 24, bottom: 24, width: 1, background: C.borderStrong }} />
        {recent.map((f) => (
          <div key={f.id} style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: -26, top: "50%", marginTop: -7, width: 14, height: 14, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${C.text}`, background: C.bg }} />
            <button type="button" className="nx-row-btn" onClick={() => onOpenFile(f)} style={{
              ...btnReset, width: "100%", boxSizing: "border-box",
              border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "7px 14px 7px 8px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <FileThumb file={f} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>{fileMeta(f)}</div>
              </div>
              {Icon.chevron({ s: 18 })}
            </button>
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
function ScreenFiles({ files, filter, device, onClearFilter, onOpenFile, initialFolder }) {
  // Текущая папка (null — корень хранилища)
  const [folder, setFolder] = useState(initialFolder || null);
  // Строка поиска: ищет только в текущей папке (или категории)
  const [query, setQuery] = useState("");
  // Положение прокрутки строки пути: для полоски под чипсами и затухания справа
  const [scroll, setScroll] = useState({ left: 0, ratio: 1, more: false });
  const crumbsRef = useRef(null);

  const cat = MEDIA_CATS.find((c) => c.id === filter);
  const folderById = (id) => FOLDERS.find((f) => f.id === id);

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
  const subfolders = flat ? [] : FOLDERS.filter((f) => f.parent === folder && match(f.name));
  const list = sortByRecent((flat
    ? files.filter((f) => (!cat || f.cat === cat.id) && (!device || onDevice(f)))
    : files.filter((f) => f.folder === folder)).filter((f) => match(f.name)));
  // Сколько всего лежит внутри папки (подпапки + файлы)
  const countIn = (id) => FOLDERS.filter((f) => f.parent === id).length + files.filter((f) => f.folder === id).length;

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

      <div style={{
        fontFamily: fontDisplay, fontSize: 18, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.04em",
        paddingBottom: 10, borderBottom: `1px solid ${C.borderStrong}`,
      }}>
        {heading}
      </div>

      {/* Список прокручивается внутри себя, как в макете.
          key меняется при смене папки — список появляется заново с анимацией */}
      <div key={device ? `dev-${device.id}` : cat ? `cat-${cat.id}` : `f-${folder}`} className="nx-pop nx-scroll nx-files-list" style={{
        maxHeight: "calc(100vh - 400px)", minHeight: 260, overflowY: "auto", paddingRight: 14,
      }}>
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
        {list.map((f) => (
          <button type="button" key={f.id} className="nx-row-btn" onClick={() => onOpenFile(f)} style={rowStyle}>
            <FileThumb file={f} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>
                {fileMeta(f)}{flat ? ` · ${folderById(f.folder).name}` : ""}
              </div>
            </div>
            {Icon.chevron({ s: 18 })}
          </button>
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
              text={device ? "Файлы появятся, когда устройство что-нибудь сохранит." : "Добавьте файлы с любого устройства — они появятся тут."}
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
function FileViewer({ file, devices = DEVICES, onClose, onDelete, onToast }) {
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
      onToast?.({ title: "Файл отправлен", text: `${file.name} → ${target}` });
    }, 900);
  };
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const cat = catOf(file);
  const folder = FOLDERS.find((f) => f.id === file.folder);

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
    ["Папка", folder ? folder.name : "—"],
  ];

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 6,
    padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
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
            <div style={{ fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
            <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>{fileMeta(file)}</div>
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
            <FileThumb file={file} w="100%" h={220} iconSize={44} radius={8} />
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
                Это демо: файл пропадёт из списков, но вернётся после перезагрузки страницы.
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
                    {SEND_TARGETS.filter((d) => d !== file.device).map((d) => {
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

/* ОКНО УСТРОЙСТВА — открывается по нажатию на устройство на «Главной»
   или из поиска. Всё в демо-режиме: состояние (в сети ли, переключатели)
   живёт в App и запоминается в браузере.
   Закрывается крестиком, клавишей Esc или кликом по затемнению. */
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

function DeviceViewer({ device: d, fileCount, onClose, onSetOnline, onSetting, onOpenFiles, onToast }) {
  const [ringing, setRinging] = useState(false); // идёт ли сейчас поиск
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

  // Esc закрывает окно; пока окно открыто, страница под ним не скроллится.
  // onClose храним в ref, чтобы эффект не перезапускался на каждой перерисовке
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
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {/* stopPropagation — клик внутри окна не должен его закрывать */}
      <div
        role="dialog" aria-modal="true" aria-label={d.name}
        className="nx-viewer-panel nx-pop nx-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14,
          boxSizing: "border-box", textAlign: "left",
        }}
      >
        {/* Шапка: крупное название и статус */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "22px 22px 16px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 400, lineHeight: 1.1 }}>{d.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mutedSoft, marginTop: 6 }}>
              <Dot color={d.online ? C.green : C.red} />
              {d.online ? deviceStatus(d) : `Не в сети · был в сети ${d.lastSeen}`}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Сцена: крупное устройство на стеклянной складке. Складка
            цветная, пока устройство в сети, и серая, когда отключено.
            Во время поиска от устройства расходятся волны сигнала */}
        <div style={{ padding: "0 18px" }}>
          <div className="nx-device-stage" style={{
            position: "relative", height: 210, borderRadius: 20, overflow: "hidden",
            background: `color-mix(in srgb, ${C.text} 6%, ${C.panel})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Складка-«конверт»: четыре треугольника сходятся к центру.
                ВАЖНО: складка не пересоздаётся при переключении (нет key),
                иначе грани появились бы сразу в новом положении без перехода.
                Разрыв при отключении делают сами грани (см. tear),
                «раскрытие» при подключении запускается эффектом через foldRef */}
            <div
              ref={foldRef}
              style={{ position: "absolute", width: 236, height: 166 }}
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
            <div
              key={flip && flip.on ? `icon-${flip.n}` : "icon"}
              className={flip && flip.on ? "nx-icon-on" : undefined}
              style={{ position: "relative", display: "flex" }}
            >
              {d.icon({ c: d.online ? C.onFold : C.muted, s: 64 })}
            </div>
          </div>
        </div>

        {/* Заряд и память */}
        <div style={{ padding: "20px 22px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
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
          gap: 10, padding: "20px 22px 4px",
        }}>
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
          <StateButton
            state={power}
            labels={powerLabels}
            icon={Icon.power({ c: d.online ? C.red : C.green, s: 16 })}
            onClick={toggleOnline}
            style={pillBtn}
          >
            {d.online ? "Отключить" : "Подключить"}
          </StateButton>
        </div>
        {!d.online && power === "idle" && (
          <div style={{ padding: "10px 22px 0", fontSize: 12, color: C.mutedSoft }}>
            Найти можно только устройство в сети
          </div>
        )}

        {/* Переключатели. Энергосбережение — только у устройств с батареей */}
        <div style={{ margin: "20px 22px 22px", border: `1px solid ${C.border}`, borderRadius: 12 }}>
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
function GlobalSearch({ files, devices: allDevices = DEVICES, onOpenDevice, onClose, onOpenFile, onOpenFolder, onOpenChat, onNavigate }) {
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
  const folders = hasQuery ? FOLDERS.filter((f) => match(f.name)) : [];
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
function ScreenAssistant({ initialChatId, onToast }) {
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
const [chats, setChats] = useState(() => {
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

  useEffect(() => {
    try { localStorage.setItem('nexa-chats', JSON.stringify(chats)); } catch {}
  }, [chats]);
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

  const newChat = () => { setCurrentChatId(null); setInput(''); };
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
        .filter(m => !m.error)
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

  // Обычная отправка сообщения из поля ввода
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { role: 'user', text };
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
    await streamAnswer(chatId, before, text);
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
    setChats(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      return {
        ...c,
        // Если правим самое первое сообщение, обновляем и название чата в истории
        title: index === 0
          ? (newText.length > 40 ? newText.slice(0, 40) + '…' : newText)
          : c.title,
        messages: [...previous, { role: 'user', text: newText }],
      };
    }));
    streamAnswer(currentChatId, previous, newText);
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

  const isEmpty = messages.length === 0 && !isLoading;

 const titleOnly = (
  <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
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
          width: 30, height: 30, borderRadius: 4,
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
    borderRadius: 999,
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
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "8px 8px 8px 18px", borderRadius: 999,
          background: C.bg, boxSizing: "border-box",
          cursor: "text",
        }}
      >
        <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Написать сообщение..."
        className="ng-input-field"
        type="search"
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
            minWidth: 0,
          }}
        />
        <button
          onClick={sendMessage}
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
            style={{ flex: 1, padding: "12px 16px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, cursor: "pointer" }}
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
          <>
            {/* Приветствие — по центру свободного места */}
            <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 0,
            padding: "0 16px",
            marginTop: 0,
}}>
          <div
            className="ng-greeting nx-greeting-anim"
            style={{ textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}
            >
            {greeting}
          </div>
        </div>

            {/* Поле ввода — прижато к низу, без дисклеймера */}
            <div style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              paddingBottom: 8,
            }}>
              {inputRow}
            </div>
          </>
        ) : (
          <>
            {/* Сообщения сверху */}
            <div
              ref={listRef}
              className="nx-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                overscrollBehavior: "contain", // прокрутка списка не тянет за собой страницу
                marginTop: 24,
                marginBottom: 16,
                minHeight: 0,
                paddingLeft: 8,
                paddingRight: 8,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 10 }}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    role={m.role}
                    text={m.text}
                    error={m.error}
                    isLastAi={m.role === 'ai' && i === messages.length - 1}
                    disabled={isLoading}
                    onRegenerate={regenerate}
                    onEdit={(newText) => editMessage(i, newText)}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.role !== 'ai' && <AssistantSkeleton />}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Поле ввода + дисклеймер (дисклеймер только в чате) */}
            <div style={{
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
function MessageBubble({ role, text, error, isLastAi, disabled, onRegenerate, onEdit }) {
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
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transform: on ? "translateX(18px)" : "translateX(0)",
        transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
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
    <div className="nx-set-group" style={{ border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 28 }}>
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
  const setTheme = (t) => {
    if (t === theme) return;
    switchTheme(t, () => setThemeState(t));
  };

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
    <div className="ng-screen" style={{ padding: "28px 40px 40px" }}>
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
          last wrap
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

  // Общие данные для "Медиа" и "Файлов": список файлов (удаление в демо
  // убирает файл отсюда до перезагрузки), фильтр по категории
  // и файл, открытый в окне просмотра.
  const [files, setFiles] = useState(DEMO_FILES);
  const [filesFilter, setFilesFilter] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFolder, setSearchFolder] = useState(null);
  const [searchChatId, setSearchChatId] = useState(null);
    // Системные уведомления (тосты). Живут в корне — любой экран
  // может показать сообщение через onToast = showToast.
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = (t) => {
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
  const [deviceState, setDeviceState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DEVICES_KEY)) || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(DEVICES_KEY, JSON.stringify(deviceState)); } catch {}
  }, [deviceState]);
  // Итоговый список: данные устройства + настройки по умолчанию + сохранённое
  const devices = DEVICES.map((d) => ({ ...d, ...DEVICE_DEFAULTS, ...deviceState[d.id] }));
  const patchDevice = (id, patch) => setDeviceState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const [openDeviceId, setOpenDeviceId] = useState(null);   // чьё окно открыто
  const openDevice = devices.find((d) => d.id === openDeviceId);
  const [filesDevice, setFilesDevice] = useState(null);     // отбор файлов по устройству
  const onDeviceFile = (d) => (f) => f.device === d.name || f.device === d.alias;

  // Переход по меню всегда открывает "Файлы" без фильтра
  const goTab = (t) => { setFilesFilter(null); setFilesDevice(null); setTab(t); };
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
  const deleteFile = (f) => {
    setFiles((list) => list.filter((x) => x.id !== f.id));
    setOpenFile(null);
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
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
        
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
        /* У сегментов и чипсов края срезаны, рамку не видно — подчёркиваем подпись */
        .nx-seg-btn:focus-visible, .nx-crumb:focus-visible { outline: none; text-decoration: underline; }
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
            padding-right: 96px;
          }
          .nx-page-sub { display: none !important; }

          /* Хранилище: те же складки в один ряд, только меньше.
             Заголовок "Хранилище" стоит над карточкой (.nx-storage-head) */
          .nx-storage-label { display: none !important; }
          .nx-storage-box { padding: 12px 10px !important; margin-bottom: 28px !important; }
          .ng-storage-segments { height: 84px !important; }
          .ng-storage-segments > * { margin-left: -14px !important; }
          .ng-storage-segments > *:first-child { margin-left: 0 !important; }
          /* Подпись ближе к левому краю складки, чтобы поместилась в узкие */
          .ng-storage-segments .nx-seg-label { padding-left: calc(var(--lx) * 0.75) !important; }
          .ng-storage-segments .nx-seg-label span:nth-child(1) { font-size: 9.5px !important; }
          .ng-storage-segments .nx-seg-label span:nth-child(2) { font-size: 9.5px !important; }
          .ng-storage-segments .nx-seg-label span:nth-child(3) { font-size: 9px !important; }

          /* ─── Сегодня на телефоне ─── */
          /* Блоки друг под другом: погода, расписание, завтра, прогноз */
          .nx-today-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-areas: "now" "sched" "next" "month" !important;
            grid-template-rows: auto !important;
            gap: 28px !important;
          }
          /* Карточка погоды: город и дата в одну строку, складка справа */
          .nx-weather { padding: 18px !important; }
          /* Шапка карточки на телефоне: город — своей строкой во всю ширину
             (название целиком, без многоточия), дата — под ним мелко */
          .nx-weather-head { grid-template-areas: "city city" "date date" !important; }
          .nx-weather-city { flex-wrap: wrap; row-gap: 2px; }
          .nx-weather-cityname { white-space: normal !important; overflow: visible !important; }
          .nx-weather-note { margin-left: 0 !important; }
          .nx-weather-date { margin: 4px 0 0 26px; } /* 26 = ширина значка + отступ: вровень с названием */
          .nx-weather-title { display: none !important; }
          .nx-weather-city { margin-top: 0 !important; gap: 6px !important; color: var(--text) !important; font-size: 15px !important; }
          .nx-weather-pin { width: auto !important; }
          .nx-weather-art { display: block !important; }
          .nx-weather-main { flex-direction: column; align-items: flex-start !important; gap: 8px !important; }
          /* Детали: крупное значение сверху, подпись под ним, без разделителей */
          .nx-weather-detail { display: flex; flex-direction: column-reverse; border-left: none !important; padding-left: 0 !important; }
          .nx-weather-value { color: var(--text) !important; font-size: 18px !important; margin-top: 0 !important; }
          /* Расписание без рамки, время слева от линии */
          .nx-sched { border: none !important; padding: 0 !important; }
          .nx-sched-head { font-size: 22px !important; margin-bottom: 18px !important; }
          .nx-sched-head svg { display: none; }
          .nx-sched-list { --dot-x: 62px !important; } /* 46 время + 4 отступ + 12 половина кружка */
          .nx-sched-item {
            grid-template-columns: 46px 24px minmax(0, 1fr) !important;
            grid-template-areas: "time dot box" !important;
            column-gap: 4px !important;
          }
          .nx-sched-time { align-self: center; margin-bottom: 0 !important; font-size: 12.5px !important; }
          .nx-sched-title { font-size: 15px !important; }
          .nx-sched-place { display: block !important; }
          /* Файлы: поиск под путём на всю ширину, список без своей прокрутки */
          .nx-files-top { flex-direction: column !important; align-items: stretch !important; gap: 18px !important; }
          .nx-files-search { width: 100% !important; margin-top: 0 !important; }
          .nx-files-search input { font-size: 16px !important; }
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
            gap: 14px !important;
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
      <Sidebar active={tab} onChange={goTab} />
          <MobileTabBar active={tab} onChange={goTab} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {/* На экране "Ассистент" своя правая панель вместо обычной
            строки времени/поиска/профиля, поэтому TopBar тут не рисуем */}
        {tab !== "assistant" && (
          <TopBar>
            {tab === "settings" ? null : <TimeDate />}
            <IconBtn icon={Icon.search} onClick={() => setSearchOpen(true)} label="Поиск" />
            <IconBtn icon={Icon.user} onClick={() => setTab("settings")} label="Настройки" />
          </TopBar>
        )}

        {/* maxWidth 1440 — контент не растягивается до бесконечности на
            очень широких мониторах, но при этом свободно заполняет
            обычное окно браузера */}
        <div className="ng-main-content" style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto" }}>
    {tab === "assistant" ? (
    <ScreenAssistant initialChatId={searchChatId} onToast={showToast} />
  ) : (
    <div key={tab} className="ng-screen-anim">
      {tab === "home" && <ScreenHome devices={devices} onNavigate={goTab} onOpenDevice={setOpenDeviceId} />}
      {tab === "today" && <ScreenToday />}
      {tab === "media" && <ScreenMedia files={files} onOpenFile={setOpenFile} onOpenCategory={openCategory} />}
      {tab === "files" && (
        <ScreenFiles
          key={`files-${searchFolder || "root"}`}
          files={files}
          filter={filesFilter}
          device={devices.find((d) => d.id === filesDevice)}
          initialFolder={searchFolder}
          onClearFilter={() => { setFilesFilter(null); setFilesDevice(null); }}
          onOpenFile={setOpenFile}
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
      {openFile && <FileViewer key={openFile.id} file={openFile} devices={devices} onClose={closeViewer} onDelete={deleteFile} onToast={showToast} />}
      {/* Окно устройства поверх всего. key — чтобы для другого устройства
          окно открывалось "с нуля" (без идущего поиска от прошлого) */}
      {openDevice && (
        <DeviceViewer
          key={openDevice.id}
          device={openDevice}
          fileCount={files.filter(onDeviceFile(openDevice)).length}
          onClose={() => setOpenDeviceId(null)}
          onSetOnline={(online) => patchDevice(openDevice.id, { online })}
          onSetting={(key) => patchDevice(openDevice.id, { [key]: !openDevice[key] })}
          onOpenFiles={() => openDeviceFiles(openDevice.id)}
          onToast={showToast}
        />
      )}
      {searchOpen && (
        <GlobalSearch
          files={files}
          devices={devices}
          onOpenDevice={setOpenDeviceId}
          onClose={() => setSearchOpen(false)}
          onOpenFile={(f) => setOpenFile(f)}
          onOpenFolder={openFolderFromSearch}
          onOpenChat={openChatFromSearch}
          onNavigate={goTab}
        />
      )}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
     </div>
  );
}
