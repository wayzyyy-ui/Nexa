// Дизайн-токены (C — цвета через CSS-переменные, T — размеры), шрифты, медиазапросы и переключение темы.
// Тема применяется сразу при загрузке модуля — без вспышки не той темы
import { flushSync } from "react-dom";
import { setSystemBarsTheme } from "../native.js";
import { syncChannel, TAB_ID, logEvent } from "../lib/shared.js";

export const C = {
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
  lineBright: "var(--line-bright)", // яркая тонкая обводка карточек-«таблеток» (макет 2026-10)
  logo: "var(--logo)",           // цвет логотипа NEXA (в светлой теме — фирменный синий)
  actBg: "var(--act-bg)",         // фон карточки «Активность» на телефоне (макет 2026-10)
  // Экран входа (макет 2026-10): «стекло» карточки, текст, поле почты, фон под рендером
  gateCard: "var(--gate-card)", gateText: "var(--gate-text)", gateMuted: "var(--gate-muted)",
  gateBorder: "var(--gate-border)", gateField: "var(--gate-field)", gateFieldText: "var(--gate-field-text)", gateScene: "var(--gate-scene)",
  onFold: "var(--on-fold)",      // белый текст на цветных складках (в обеих темах)
  photoBg: "var(--photo-bg)",    // фон полноэкранного просмотра фото (в обеих темах тёмный)
  // Цвета складок-стёкол на экранах "Медиа" и "Файлы". Это как картинка,
  // поэтому в обеих темах они одинаковые
  foldDeep: "var(--fold-deep)",  // глубокий синий
  foldBlue: "var(--fold-blue)",  // яркий синий
  foldCyan: "var(--fold-cyan)",  // голубой
  foldMint: "var(--fold-mint)",  // мятный
  foldGreen: "var(--fold-green)",// зелёный
};

/* Размеры дизайн-системы для inline-стилей — те же числа, что CSS-переменные
   --fs-*, --sp-*, --r-* в блоке <style> (там же описание шкалы).
   Новые элементы собирать из этих значений, а не придумывать свои */
export const T = {
  // Шрифт: метка, мелкая подпись, вторичный, основной, строка, крупная строка, раздел, экран
  fs: { label: 11, small: 12, sub: 13, body: 14, row: 15, lead: 16, section: 22, page: 40 },
  // Отступы — шаг 4
  sp: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  // Углы: поля/плашки, средние карточки, крупные карточки и панели, кнопки
  r: { sm: 10, md: 14, lg: 18, pill: 999 },
};

/* ---------- ТЕМА ----------
   Выбор темы хранится в localStorage и вешается атрибутом data-theme на <html>.
   Применяем сразу при загрузке модуля, чтобы не было вспышки не той темы. */
export const THEME_KEY = "nexa-theme";

export function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {}
  return "dark";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  setSystemBarsTheme(theme); // в приложении: значки статус-бара под тему
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

// fromOtherTab — тему сменили в другой вкладке: просто повторяем,
// не рассылая обратно и не записывая событие второй раз
export function switchTheme(theme, update, fromOtherTab) {
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

// Один шрифт — Manrope: и заголовки (класс ng-display), и текст, и цифры
export const fontDisplay = "'Manrope', sans-serif";

export const fontBody = "'Manrope', sans-serif";

// Слой фона: от боковой панели до правого края (на телефоне — весь экран)
/* «Это телефон»: узкий экран ИЛИ сенсорный экран высотой до 500 px —
   так и повёрнутый горизонтально телефон остаётся в мобильном виде
   (раньше в ширину 844 px открывалась компьютерная версия). Планшеты
   и компьютеры выше 500 px — как раньше. DESKTOP_MQ — всё остальное */
export const PHONE_MQ = "(max-width: 768px), (pointer: coarse) and (max-height: 500px)";

export const DESKTOP_MQ = "(min-width: 769px) and (min-height: 501px), (min-width: 769px) and (pointer: fine)";

export const NAV_W = 96; // ширина боковой панели (к ней привязаны фон и экран ассистента)

/* Масштаб «Сегодня», «Медиа», «Файлов» на компьютере (--desk-zoom, см. .nx-media-main в appStyles):
   по макету 1920 × 1080 содержимое в масштабе 1:1 (макет 2026-10, второй вариант: раньше на 1920 было ×1,3 —
   крупнее макета). До 1920 × 1080 — 1, на большом мониторе растёт с окном — до 1,3.
   Считается здесь: в CSS длину на длину не поделить */
function applyDeskZoom() {
  const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty("--desk-zoom", String(Math.round(Math.min(1.3, Math.max(1, k)) * 1000) / 1000));
}
if (typeof window !== "undefined") { applyDeskZoom(); window.addEventListener("resize", applyDeskZoom); }
