import { useState, useEffect, useRef } from "react";
// flushSync нужен для плавной смены темы: React обновляет экран сразу,
// пока браузер делает снимок для анимации
import { flushSync } from "react-dom";
// Подключаем свой логотип из папки assets
import foldSvg from "./assets/fold.svg";
const VERSION = "0.1.1";


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
  hover: "var(--hover)",         // лёгкая подсветка кнопок
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
    setPos(index);                              // подсветка поехала сразу
    setTimeout(() => onChange(item.id), 60);    // экран меняем на долю секунды позже
  };

  const shownIndex = pos >= 0 ? pos : lastPos.current;

  return (
    <div
      className="ng-mobile-tabbar"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 200,
        display: "none",
      }}
    >
      <div style={{
        background: C.glass,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: 22,
        boxShadow: "var(--glass-shadow)",
        height: 64,
        padding: "0 8px",
        display: "flex",
      }}>
        <div style={{ position: "relative", flex: 1, display: "flex", height: "100%" }}>

          {/* Движущаяся подсветка: один элемент, который едет к нужной ячейке */}
          <div style={{
            position: "absolute",
            top: 8,
            left: 0,
            height: 48,
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
              height: 48,
              borderRadius: 14,
              background: "color-mix(in srgb, var(--mint) 12%, transparent)",
            }} />
          </div>

          {mobileNav.map((item, index) => {
            const isActive = index === pos;
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item, index)}
                aria-label={item.label}
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
                }}
              >
                <span style={{
                  display: "flex",
                  color: isActive ? C.mint : C.muted,
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                  transition: "color 240ms ease, transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}>
                  {item.icon({ c: "currentColor", s: 22 })}
                </span>
              </button>
            );
          })}
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
function TopBar({ children }) {
  return (
    <div className="ng-topbar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, padding: "24px 40px 0" }}>
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
// ЭКРАН "ГЛАВНАЯ" — список устройств + складка + карточка ассистента
function ScreenHome({ onNavigate }) {
  const devices = [
    { icon: Icon.phone,  name: "Смартфон",  status: "Онлайн • 92%", online: true },
    { icon: Icon.laptop, name: "Ноутбук",   status: "Не в сети",    online: false },
    { icon: Icon.watch,  name: "Часы",      status: "Онлайн • 64%", online: true },
    { icon: Icon.tv,     name: "Телевизор", status: "Онлайн",       online: true },
  ];

  return (
    <div className="ng-screen ng-home" style={{ padding: "8px 40px 40px", textAlign: "left" }}>

      {/* ══════════ ДЕСКТОПНАЯ ВЕРСИЯ ══════════ */}
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
                <span style={{
                  display: "flex", alignItems: "center",
                  gap: 6, fontSize: 13, color: C.muted,
                }}>
                  4 <Dot color={C.green} />
                </span>
              </div>
              {devices.map((d) => (
                <Row
                  key={d.name}
                  leftIcon={d.icon({ c: C.text, s: 19 })}
                  title={d.name}
                  subtitle={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>{d.status}</span>}
                  right={<Dot color={d.online ? C.green : C.red} />}
                />
              ))}
            </div>
          </div>

          {/* Правая колонка: складка сверху, AI-карточка снизу */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <FoldHero size={340} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 14 }}>
              <span>4</span>
              <Dot color={C.green} />
              {Icon.chevron({ c: C.muted, s: 16 })}
            </div>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
          }}>
            {devices.map((d) => (
              <div
                key={d.name}
                style={{
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
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{d.status}</div>
                </div>
              </div>
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

// Карточка погоды (используется дважды на экране "Сегодня": на сегодня и на завтра).
// details — необязательный массив (ветер/влажность/давление), если не передать,
// строка с деталями просто не рисуется — так у карточки "на завтра" её и нет.
function WeatherCard({ date, temp, cond, feels, details }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: 20, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={C.text} strokeWidth="1.6"><polygon points="12,3 20,12 12,21 4,12" /></svg>
          Погода
        </div>
        <div style={{ fontSize: 11, color: C.mutedSoft }}>{date}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted, margin: "6px 0 18px" }}>
        {Icon.pin({ c: C.muted, s: 13 })} Казань
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Маленький фрагмент складки вместо иконки солнца/тучки —
            угол и цвет можно менять в зависимости от погоды */}
        <div style={{ position: "relative", width: 60, height: 60, display: "flex", alignItems: "center" }}>
          <svg viewBox="0 0 60 60" width="60" height="60" style={{ position: "absolute" }}>
            <defs>
              <linearGradient id={`wg-${temp}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.mintLight} /><stop offset="100%" stopColor={C.blueDark} />
              </linearGradient>
            </defs>
            <polygon points="12,50 20,8 48,20 40,55" fill={`url(#wg-${temp})`} opacity="0.85" />
          </svg>
        </div>
        <div className="ng-display" style={{ fontSize: 40, fontWeight: 600 }}>{temp}°</div>
        <div>
          <div style={{ fontWeight: 500 }}>{cond}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>Ощущается как {feels}°</div>
        </div>
      </div>
      {details && (
        <div style={{ display: "flex", gap: 26, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          {details.map((d) => (
            <div key={d.label}>
              <div style={{ fontSize: 11.5, color: C.mutedSoft }}>{d.label}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ЭКРАН "СЕГОДНЯ" — расписание (таймлайн) + погода
function ScreenToday() {
  const items = [
    { time: "09:30", title: "Лекция по проектированию" },
    { time: "11:00", title: "Встреча с куратором" },
    { time: "13:00", title: "Обед" },
    { time: "14:30", title: "Работа над дипломом" },
    { time: "17:00", title: "Тренировка" },
  ];
  return (
     <div className="ng-screen" style={{ padding: "8px 40px 40px" }}>
      <div className="ng-display" style={{ fontSize: 30, fontWeight: 600 }}>Сегодня</div>
      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, marginBottom: 30 }}>
        Ваши дела, расписание и погода — всё в одном месте.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 30 }} className="ng-today-grid">
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 500, marginBottom: 20 }}>
            {Icon.calendar({ c: C.text, s: 18 })} Расписание
          </div>
          {/* Вертикальная линия таймлайна рисуется одним абсолютно
              позиционированным div, точки — кружки поверх неё */}
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 1, background: C.border }} />
            {items.map((it) => (
              <div key={it.time} style={{ position: "relative", marginBottom: 18 }}>
                <span style={{ position: "absolute", left: -20, top: 5, width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.text}`, background: C.bg }} />
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>{it.time}</div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14.5 }}>{it.title}</span>
                  {Icon.chevron({})}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <WeatherCard date="11 сентября 2026" temp={18} cond="Ясно" feels={17}
            details={[{ label: "Ветер", value: "3 м/с" }, { label: "Влажность", value: "62%" }, { label: "Давление", value: "758 мм" }]} />
          <WeatherCard date="12 сентября 2026" temp={12} cond="Пасмурно" feels={10} />
          <button style={{
            width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
            padding: "12px 16px", color: C.text, fontSize: 14, display: "flex", justifyContent: "space-between",
            alignItems: "center", cursor: "pointer",
          }}>
            Прогноз на месяц {Icon.chevron({})}
          </button>
        </div>
      </div>
    </div>
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
function MediaLayout({ children }) {
  return (
    <div className="ng-screen" style={{ padding: "8px 40px 40px", textAlign: "left" }}>
      <div className="nx-media-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>{children}</div>
        <div className="nx-media-art" style={{ position: "sticky", top: 120, display: "flex", justifyContent: "flex-end", paddingTop: 60, marginRight: -40 }}>
          <FoldHero size={440} />
        </div>
      </div>
    </div>
  );
}

// Заголовок экрана: крупный и лёгкий, как в макете
function MediaTitle({ title, subtitle }) {
  return (
    <>
      <div className="ng-display" style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontSize: 15, color: C.muted, margin: "10px 0 30px" }}>{subtitle}</div>
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
      <div className="nx-seg-label" style={{ paddingLeft: cat.labelX, lineHeight: 1.25 }}>
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

      <div style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "18px 20px", marginBottom: 34 }}>
        <div className="ng-storage-card" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-start", width: 150 }}>
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
function ScreenFiles({ files, filter, onClearFilter, onOpenFile }) {
  // Текущая папка (null — корень хранилища)
  const [folder, setFolder] = useState(null);
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
  }, [folder, filter]);

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
  const subfolders = cat ? [] : FOLDERS.filter((f) => f.parent === folder && match(f.name));
  const list = sortByRecent((cat ? files.filter((f) => f.cat === cat.id) : files.filter((f) => f.folder === folder)).filter((f) => match(f.name)));
  // Сколько всего лежит внутри папки (подпапки + файлы)
  const countIn = (id) => FOLDERS.filter((f) => f.parent === id).length + files.filter((f) => f.folder === id).length;

  const heading = cat ? `${cat.label} · все папки` : folder ? folderById(folder).name : "Хранилище";

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
            {cat ? (
              <>
                <Crumb onClick={onClearFilter}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Все папки</Crumb>
                <Crumb active>{cat.icon({ c: C.onFold, s: 15 })} {cat.label} · {list.length} {plural(list.length, ["файл", "файла", "файлов"])}</Crumb>
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
            placeholder={cat ? "Поиск в категории…" : "Поиск в этой папке…"}
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
      <div key={cat ? `cat-${cat.id}` : `f-${folder}`} className="nx-pop nx-scroll nx-files-list" style={{
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
                {fileMeta(f)}{cat ? ` · ${folderById(f.folder).name}` : ""}
              </div>
            </div>
            {Icon.chevron({ s: 18 })}
          </button>
        ))}
        {subfolders.length === 0 && list.length === 0 && (
          <div style={{ padding: "48px 4px", fontSize: 13.5, color: C.mutedSoft, textAlign: "center" }}>
            {q ? `Ничего не нашлось по запросу «${query.trim()}»` : "Здесь пока пусто"}
          </div>
        )}
      </div>
    </MediaLayout>
  );
}

/* ОКНО ПРОСМОТРА ФАЙЛА — открывается поверх любого экрана.
   Всё работает в демо-режиме: "отправка" и "ссылка" только показывают
   сообщение, а удаление убирает файл из списка до перезагрузки страницы.
   Закрывается крестиком, клавишей Esc или кликом по затемнению. */
function FileViewer({ file, onClose, onDelete }) {
  const [sendOpen, setSendOpen] = useState(false);   // открыт ли выбор устройства
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const [notice, setNotice] = useState("");           // сообщение после действия
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
    setNotice("Ссылка скопирована");
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
                <button type="button" onClick={() => onDelete(file)} style={{ ...ghostBtn, color: C.red, borderColor: C.red }}>
                  {Icon.trash({ c: C.red, s: 16 })} Удалить
                </button>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghostBtn}>Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <div className="nx-viewer-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setSendOpen(!sendOpen); setNotice(""); }} aria-expanded={sendOpen} style={{
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
                    {SEND_TARGETS.filter((d) => d !== file.device).map((d) => (
                      <button type="button" key={d} className="nx-ghost-btn" style={{ ...ghostBtn, padding: "8px 14px" }}
                        onClick={() => { setNotice(`Отправлено: ${d}`); setSendOpen(false); }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {notice && (
                <div key={notice} className="nx-pop" role="status" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.green }}>
                  {Icon.check({ c: C.green, s: 16 })} {notice}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ЭКРАН "АССИСТЕНТ" — поле ввода по центру + правая панель (новый диалог/поиск/...)
function ScreenAssistant() {
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
  const [currentChatId, setCurrentChatId] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
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
  bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
}, [messages.length, messages[messages.length - 1]?.text, isLoading]);

  const newChat = () => { setCurrentChatId(null); setInput(''); };
  const openChat = (id) => { setCurrentChatId(id); setInput(''); };
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === currentChatId) setCurrentChatId(null);
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
    position: "fixed",
    top: 0, left: 79, right: 0, bottom: 0,
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
              className="nx-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
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
function MessageBubble({ role, text, isLastAi, disabled, onRegenerate, onEdit }) {
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
        }}>
          NEXA Assistant
        </div>

        <div className="nx-bubble-text" style={{
          padding: "14px 18px", borderRadius: 16, borderTopLeftRadius: 4,
          background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`,
          border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 16, lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          position: "relative", overflow: "hidden",
        }}>
          {/* Тонкая цветная полоска слева внутри пузыря */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: `linear-gradient(180deg, ${C.blue}, ${C.mint})`, opacity: 0.85,
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
function ScreenSettings() {
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
    <div className="ng-screen" style={{ padding: "8px 40px 40px" }}>
      <div className="nx-settings-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div className="ng-display" style={{ fontSize: 40, fontWeight: 600 }}>Настройки</div>
        {/* Поиск по настройкам. На телефоне скрыт: там уже есть иконка поиска сверху */}
        <div className="nx-settings-search" style={{
          display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 999,
          padding: "8px 16px", width: 220,
        }}>
          {Icon.search({ c: C.mutedSoft, s: 15 })}
          <span style={{ fontSize: 13, color: C.mutedSoft }}>Поиск</span>
        </div>
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

  // Переход по меню всегда открывает "Файлы" без фильтра
  const goTab = (t) => { setFilesFilter(null); setTab(t); };
  // Из "Медиа" в "Файлы" с фильтром по категории (null — без фильтра)
  const openCategory = (cat) => { setFilesFilter(cat); setTab("files"); };
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
          --hover: rgba(255, 255, 255, 0.05);
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
          --text: #18203A;  --text-strong: #0E1428;  --text-soft: #232B47;
          --muted: #5A6478;  --muted-soft: #8891A3;
          --blue: #4A6FFF;  --blue-dark: #DCE4FF;  --blue-light: #7C97FF;
          --mint: #10BFA8;  --mint-dark: #D3F2EC;  --mint-light: #7EE6D8;
          --green: #1C9E5E;  --red: #D23C3C;
          --on-accent: #07080C;  --chip: #CBD3DE;
          --glass: rgba(248, 250, 252, 0.9);
          --glass-border: rgba(24, 32, 58, 0.10);
          --glass-shadow: 0 6px 20px rgba(24, 32, 58, 0.10);
          --hover: rgba(24, 32, 58, 0.06);
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
        .ng-home-desktop { display: block; }
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

        /* В светлой теме карточки настроек чуть светлее фона страницы */
        :root[data-theme="light"] .nx-set-group { background: var(--panel); }

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
        /* Подсветка при наведении */
        .nx-row-btn, .nx-ghost-btn, .nx-icon-btn, .nx-crumb { transition: background-color 160ms ease, border-color 160ms ease; }
        .nx-row-btn:hover, .nx-ghost-btn:hover, .nx-icon-btn:hover { background-color: var(--hover) !important; }
        .nx-cat-card:hover { border-color: var(--muted-soft) !important; }
        .nx-link-btn:hover { color: var(--text) !important; }
        /* Рамка фокуса для управления с клавиатуры */
        .nx-row-btn:focus-visible, .nx-ghost-btn:focus-visible, .nx-icon-btn:focus-visible,
        .nx-cat-card:focus-visible, .nx-link-btn:focus-visible {
          outline: 1px solid var(--mint); outline-offset: 2px;
        }
        /* У сегментов и чипсов края срезаны, рамку не видно — подчёркиваем подпись */
        .nx-seg-btn:focus-visible, .nx-crumb:focus-visible { outline: none; text-decoration: underline; }
        .nx-crumb:hover { filter: brightness(1.15); }
        /* Строка пути прокручивается, но свой скроллбар не рисует:
           вместо него тонкая полоска под чипсами */
        .nx-no-scrollbar { scrollbar-width: none; }
        .nx-no-scrollbar::-webkit-scrollbar { display: none; }
        /* Складка справа на "Медиа" и "Файлах" — только на широком экране */
        /* На средних экранах складки уже — подписи на них чуть мельче */
        @media (max-width: 1360px) {
          .nx-seg-label span { font-size: 10.5px !important; }
        }
        @media (max-width: 1100px) {
          .nx-media-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .nx-media-art { display: none !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nx-greeting-anim, .nx-msg { animation: none !important; }
          .nx-pop, .nx-bar { animation: none !important; }
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
          .ng-today-grid { grid-template-columns: 1fr !important; }
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

          /* Диаграмма хранилища вертикально */
          .ng-storage-card {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
          }
          .ng-storage-segments {
            flex-direction: column !important;
            height: auto !important;
            gap: 6px !important;
          }
          .ng-storage-segments > * {
            margin-left: 0 !important;
            clip-path: none !important;
            border-radius: 8px !important;
            padding: 12px 16px !important;
            min-width: 0 !important;
            width: 100% !important;
            height: auto !important;
            box-sizing: border-box !important;
          }
          .ng-storage-segments > * { top: 0 !important; }
          .ng-storage-segments .nx-seg-label { padding-left: 0 !important; }
          .ng-storage-segments .nx-seg-label > span {
            display: inline-block !important;
            margin-right: 12px !important;
            vertical-align: middle !important;
          }
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

  .ng-mobile-tabbar {
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
  }

    .ng-mobile-tabbar > div {
    margin: 16px 16px 8px 16px;
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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* На экране "Ассистент" своя правая панель вместо обычной
            строки времени/поиска/профиля, поэтому TopBar тут не рисуем */}
        {tab !== "assistant" && (
          <TopBar>
            {tab === "settings" ? null : <TimeDate />}
            <IconBtn icon={Icon.search} />
            {/* Профиль открывает настройки: на телефоне это единственный путь к ним,
                в таб-баре для настроек места нет */}
            <IconBtn icon={Icon.user} onClick={() => setTab("settings")} label="Настройки" />
          </TopBar>
        )}

        {/* maxWidth 1440 — контент не растягивается до бесконечности на
            очень широких мониторах, но при этом свободно заполняет
            обычное окно браузера */}
        <div className="ng-main-content" style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto" }}>
  {tab === "assistant" ? (
    <ScreenAssistant />
  ) : (
    <div key={tab} className="ng-screen-anim">
      {tab === "home" && <ScreenHome onNavigate={goTab} />}
      {tab === "today" && <ScreenToday />}
      {tab === "media" && <ScreenMedia files={files} onOpenFile={setOpenFile} onOpenCategory={openCategory} />}
      {tab === "files" && (
        <ScreenFiles files={files} filter={filesFilter} onClearFilter={() => setFilesFilter(null)} onOpenFile={setOpenFile} />
      )}
      {tab === "settings" && <ScreenSettings />}
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
      {openFile && <FileViewer key={openFile.id} file={openFile} onClose={closeViewer} onDelete={deleteFile} />}
     </div>
  );
}
