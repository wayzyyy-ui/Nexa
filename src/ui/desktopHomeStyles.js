// Главная и боковое меню по светлому и тёмному макетам автора, ноябрь 2026.
import { DESKTOP_MQ, PHONE_MQ } from "./theme.js";

export const DESKTOP_HOME_CSS = `
/* Переливание двигается отдельным слоем: текст и значок остаются неподвижными. */
.nx-ai-pill.nx-ai-flow {
  position: relative; isolation: isolate; overflow: hidden;
  animation: none !important; background: color-mix(in srgb, var(--blue-light) 65%, var(--panel)) !important;
  border-color: color-mix(in srgb, var(--text) 35%, transparent) !important;
}
.nx-ai-pill .nx-ai-flow-art {
  position: absolute; inset: -80% -65%; pointer-events: none; z-index: -1;
  background:
    radial-gradient(ellipse at 76% 52%, color-mix(in srgb, var(--mint-light) 78%, transparent), transparent 48%),
    radial-gradient(ellipse at 24% 35%, color-mix(in srgb, var(--blue-light) 88%, transparent), transparent 54%),
    linear-gradient(110deg, color-mix(in srgb, var(--blue-light) 70%, var(--panel)), color-mix(in srgb, var(--mint-light) 66%, var(--panel)));
  animation: nx-ai-silk 26s ease-in-out infinite alternate;
}
.nx-ai-pill.nx-ai-flow::before, .nx-ai-pill.nx-ai-flow::after { display: none; }
/* Тёмная тема: та же расцветка, но глубже — плашка не спорит со светом вокруг */
:root:not([data-theme="light"]) .nx-ai-pill.nx-ai-flow { background: color-mix(in srgb, var(--blue-light) 35%, var(--bg)) !important; }
:root:not([data-theme="light"]) .nx-ai-pill .nx-ai-flow-art { filter: brightness(0.62) saturate(1.1); }
.nx-ai-pill.nx-ai-flow .nx-ai-pill-title { color: var(--on-fold); font-weight: 700; }
.nx-ai-pill.nx-ai-flow .nx-ai-pill-sub { color: color-mix(in srgb, var(--on-fold) 85%, transparent) !important; }
:root[data-theme="light"] .nx-ai-pill.nx-ai-flow .nx-ai-pill-sub { color: var(--muted) !important; }
@keyframes nx-ai-silk {
  0% { transform: translate3d(-9%, -3%, 0) rotate(-9deg); }
  50% { transform: translate3d(3%, 4%, 0) rotate(3deg); }
  100% { transform: translate3d(10%, -2%, 0) rotate(10deg); }
}
.nx-lite .nx-ai-flow-art { animation: none; }
@media (prefers-reduced-motion: reduce) { .nx-ai-pill .nx-ai-flow-art { animation: none; } }
@media ${DESKTOP_MQ} {
  :root[data-theme="light"] body:has(.nx-home-glow) .ng-sidebar { background: transparent !important; }
  /* Содержимое — по центру свободной области (2026-11-05, просьба автора), складка — фоном у правого края */
  .ng-home { position: relative; isolation: isolate; padding-left: var(--page-x) !important; padding-right: var(--page-x) !important; }
  .ng-home-desktop { width: 100%; max-width: var(--page-w); margin-inline: auto; }
  /* Отступы по высоте ужаты (2026-11-03): Главная помещается в окно без прокрутки, и под панелью окна ПК тоже */
  .nx-home-title { font-size: max(32px, calc(50 * var(--mk))) !important; font-weight: 500; line-height: 1.1; margin: 0 0 calc(40 * var(--mk)); }
  .nx-home-card-title { margin-bottom: calc(24 * var(--mk)) !important; }
  .nx-home-devices > .nx-stagger { gap: calc(18 * var(--mk)) !important; }
  .nx-home-about-row { padding-top: calc(10 * var(--mk)) !important; }
  .nx-home-brand-desk > span { gap: calc(40 * var(--mk)) !important; }
  .nx-home-brand-desk > span > svg:last-child { height: calc(40 * var(--mk)) !important; }
  .nx-home-grid2 { grid-template-columns: minmax(0, 1fr) minmax(250px, calc(389 * var(--mk))); grid-template-areas: "dev wx" "act wx" "act pills"; gap: calc(35 * var(--mk)) calc(37 * var(--mk)); }
  .nx-home-card { padding: calc(36 * var(--mk)) calc(48 * var(--mk)) calc(26 * var(--mk)); }
  .nx-home-card-title { font-size: max(18px, calc(25 * var(--mk))); margin-bottom: calc(32 * var(--mk)); }
  .nx-home-devices > .nx-stagger { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(24 * var(--mk)) !important; align-items: stretch; }
  .nx-home-devices-empty { grid-column: 1 / -1; }
  /* Обводка 1 px полупрозрачная: 0,5 px на экране без масштаба рисовалась «лесенкой» */
  /* Все плашки одной высоты — с запасом под название в две строки (2026-11-03: «Сайт на компьютере» была выше соседей) */
  .nx-home-devices .nx-dev-row { min-height: max(64px, calc(96 * var(--mk))); gap: calc(16 * var(--mk)); padding: calc(12 * var(--mk)) calc(24 * var(--mk)) !important;
    border: 1px solid color-mix(in srgb, var(--line-bright) 55%, transparent) !important; }
  .nx-home-devices .nx-dev-row-icon { width: calc(32 * var(--mk)); }
  .nx-home-devices .nx-dev-row-icon svg { height: max(22px, calc(34 * var(--mk))) !important; }
  .nx-home-devices .nx-dev-row-name { font-size: max(13px, calc(18 * var(--mk))); font-weight: 700; letter-spacing: -0.01em; white-space: normal; line-height: 1.2; overflow-wrap: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .nx-home-devices .nx-dev-row-sub { font-size: max(10px, calc(12 * var(--mk))); margin-top: 3px; }
  .nx-home-devices { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
  .nx-home-devices .nx-dev-row .nx-status-dot { width: 8px; height: 8px; }
  .nx-home-devices .nx-dev-row.is-add { gap: 10px; justify-content: center; background-color: color-mix(in srgb, var(--text) 3%, var(--bg)); }
  .nx-home-devices .nx-dev-row.is-add { border-style: dashed !important; }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-name { font-size: max(13px, calc(17 * var(--mk))); font-weight: 600; }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-icon { width: 22px; }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-icon svg { height: 24px !important; }
  .nx-home-grid2 > .nx-home-fold2 { position: absolute; top: calc(120 * var(--mk)); right: calc(-120 * var(--mk)); z-index: -1; margin: 0; }
  .nx-home-fold2 .nx-home-fold-art { height: calc(680 * var(--mk)); max-width: none; margin-top: calc(-75 * var(--mk)); }
  .nx-home-act { min-height: calc(200 * var(--mk)); }
  .nx-home-act > section > div:last-child > div { padding: calc(7 * var(--mk)) 0 !important; }
  .nx-hw-desk { min-height: calc(540 * var(--mk)); }
  .nx-home-pills2 .nx-ai-glow { min-height: max(68px, calc(98 * var(--mk))) !important; padding: 0 calc(24 * var(--mk)) !important; gap: calc(20 * var(--mk)) !important;
    box-shadow: 0 0 24px color-mix(in srgb, var(--blue-light) 45%, transparent), 10px 0 30px color-mix(in srgb, var(--mint-light) 35%, transparent) !important; }
  .nx-ai-glow .nx-ai-pill-icon { width: max(34px, calc(52 * var(--mk))); height: max(34px, calc(52 * var(--mk))); }
  .nx-ai-glow .nx-ai-pill-icon svg { width: 70%; height: 70%; }
  .nx-ai-glow .nx-ai-pill-title { font-size: max(14px, calc(20 * var(--mk))); margin-top: 0; }
  .nx-ai-glow .nx-ai-pill-sub { font-size: max(11px, calc(12 * var(--mk))) !important; margin-top: 2px !important; }
  :root[data-theme="light"] :is(.nx-home-card.nx-glass, .nx-home-act.nx-glass, .nx-hw-desk.nx-glass) {
    background: color-mix(in srgb, var(--panel) 83%, transparent) !important; border-color: color-mix(in srgb, var(--on-fold) 80%, transparent) !important; box-shadow: none !important;
  }
  :root[data-theme="light"] :is(.nx-home-card, .nx-home-act, .nx-hw-desk).nx-glass::before { opacity: 0.35; }
  :root[data-theme="light"] .nx-home-act > section { background: transparent !important; }
  :root[data-theme="light"] .nx-home-devices .nx-dev-row.is-add { border: 1px dashed var(--border-strong) !important; background: var(--on-fold) !important; }
  :root[data-theme="light"] .nx-home-fold-art { opacity: 0.85; }
  @media (max-width: 1300px) {
    .nx-home-devices > .nx-stagger { grid-template-columns: minmax(0, 1fr); }
    .nx-home-fold2 .nx-home-fold-art { height: calc(560 * var(--mk)); }
  }
}

/* ═══ Главная на компьютере, макет 2026-11-12 (шаг 1: размеры и цвет) ═══
   Разметка — src/screens/home/desktop.jsx, классы nx-hd-*. Размеры в px (не в --mk): четыре размера текста —
   заголовок страницы 64, заголовок карточки 17 жирный, текст 14, подписи 12–13. Телефон не затронут. */
@media ${DESKTOP_MQ} {
  .ng-home-desktop .nx-home-title { font-size: 64px !important; font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 28px; }
  /* Свои кнопки Главной: без оформления браузера, дальше — каждой своё */
  :is(.nx-hd-dev, .nx-hd-ai, .nx-hd-wx-main, .nx-hd-link) { appearance: none; font: inherit; color: var(--text); text-align: left; border: 0; background: none; padding: 0; margin: 0; }
  .nx-hd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
  .nx-hd-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .nx-hd-card { border-radius: 20px; padding: 20px; box-sizing: border-box; font-size: 14px; line-height: 1.4; }
  .nx-hd-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .nx-hd-h { display: block; margin: 0; color: var(--text); font-family: inherit; font-size: 17px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; }
  .nx-hd-sub { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
  .nx-hd-link { font-size: 13px; font-weight: 500; color: var(--mint); cursor: pointer; white-space: nowrap; border-radius: 6px; }
  .nx-hd-link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .nx-hd-link:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
  .nx-hd-note { font-size: 13px; color: var(--muted); }
  .nx-hd-line { height: 1px; background: var(--border-strong); margin: 14px 0; }

  /* Устройства: плашки 64 px, колонки от 240 px; фон нейтральный, статус — только точка 8 px */
  .nx-hd-devs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .nx-hd-dev { display: flex; align-items: center; gap: 12px; height: 64px; padding: 0 16px; box-sizing: border-box; border-radius: 14px; cursor: pointer;
    border: 1px solid var(--border-strong); background: color-mix(in srgb, var(--text) 5%, transparent); transition: border-color 160ms ease, background-color 160ms ease; }
  .nx-hd-dev:hover { border-color: color-mix(in srgb, var(--mint) 60%, transparent); background: color-mix(in srgb, var(--text) 8%, transparent); }
  .nx-hd-dev:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
  .nx-hd-dev-ico { width: 26px; display: flex; justify-content: center; flex-shrink: 0; }
  .nx-hd-dev-text { flex: 1; min-width: 0; }
  .nx-hd-dev-name { display: block; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-hd-dev-sub { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-hd-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .nx-hd-dev.is-add { border-style: dashed; background: transparent; }
  .nx-hd-dev.is-add .nx-hd-dev-name { font-weight: 600; }

  /* Активность: строки из общего ActivityList (текст 14, подписи 12) — плотнее */
  .nx-hd-card .nx-act-row { padding: 8px 0 !important; }
  .nx-hd-card .nx-act-row:last-child { padding-bottom: 0 !important; }

  /* Погода */
  .nx-hd-wx-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; width: 100%; cursor: pointer; border-radius: 12px; }
  .nx-hd-wx-main:focus-visible { outline: 2px solid var(--mint); outline-offset: 4px; }
  .nx-hd-temp { position: relative; flex-shrink: 0; padding-right: 6px; }
  .nx-hd-temp.is-veil { filter: blur(6px); opacity: 0.6; }
  .nx-hd-temp .nx-hw-facet { width: 84px; right: -10px; top: -8px; }
  .nx-hd-deg { position: relative; z-index: 1; font-size: 48px; font-weight: 600; line-height: 1; letter-spacing: -0.03em; }
  .nx-hd-wx-cond { margin-top: 10px; font-size: 14px; color: var(--muted); }
  .nx-hd-wx-cond b { font-weight: 700; color: var(--text); }
  .nx-hd-wx .nx-weather-attr { display: inline-block; margin-top: 4px; }
  .nx-hd-sched { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .nx-hd-sched-text { min-width: 0; font-size: 14px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-hd-sched-text b { color: var(--text); font-weight: 700; }
  .nx-hd-notes { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 40px; margin-top: 14px; box-sizing: border-box;
    font: inherit; font-size: 14px; color: var(--text); background: transparent; border: 1px solid var(--border-strong); cursor: pointer; }

  /* Ассистент */
  .nx-hd-ai { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 72px; padding: 12px 20px; box-sizing: border-box; border-radius: 20px; cursor: pointer; }
  .nx-hd-ai:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
  .nx-hd-ai-ico { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--blue), color-mix(in srgb, var(--blue) 55%, var(--mint))); }
  .nx-hd-ai-text { flex: 1; min-width: 0; }
  /* Шаг 2 — сцена: складка фоном всей Главной (FoldScene), вершины вдоль нижнего края окна, за карточками.
     Лежит по краям .ng-home (а не .ng-home-desktop — у того ширина ограничена), не ловит нажатия */
  .ng-home { min-height: calc(100vh - var(--tb-h, 0px)); box-sizing: border-box; }
  .nx-hd-scene { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: min(64vh, 700px); z-index: -1; pointer-events: none; display: block; }
  .ng-home-desktop { position: static; }
  /* Стекло поверх сцены: прозрачнее обычного «тихого», грани просвечивают; сверху тонкая светлая кромка (--g-tint) */
  .nx-hd-card.nx-glass, .nx-hd-ai.nx-glass { --g-alpha: 0.2; --g-blur: 16px; --g-rim: 1;
    --g-tint: linear-gradient(180deg, rgb(var(--glass-hi-rgb) / 0.34) 0, rgb(var(--glass-hi-rgb) / 0.34) 1px, transparent 1px); }
  :root[data-theme="light"] :is(.nx-hd-card, .nx-hd-ai).nx-glass { --g-alpha: 0.2;
    --g-tint: linear-gradient(180deg, rgb(var(--glass-hi-rgb) / 0.9) 0, rgb(var(--glass-hi-rgb) / 0.9) 1px, transparent 1px); }
  .nx-hd-dev { background: color-mix(in srgb, var(--text) 6%, transparent); }
  @media (prefers-reduced-motion: reduce) { .nx-hd-dev { transition: none; } }
}

/* ═══ Каркас на компьютере, макет 2026-11-12 (шаг 3) ═══
   Боковое меню — плавающая стеклянная панель 248 px с отступом 12 px (на всех разделах), справа вверху —
   поиск-таблетка 240 × 44 и одна общая таблетка (время, уведомления, быстрые действия, профиль).
   Главная: строка статуса, главная кнопка, содержимое сразу за панелью (без центрирования). */
@media ${DESKTOP_MQ} {
  /* --nav-w = отступ 12 + панель 248 (свёрнутая — 12 + 72): к ней привязаны верхняя строка, ассистент, фон */
  :root { --nav-w: 260px; }
  html.nx-side-min { --nav-w: 84px; }
  .ng-sidebar.nx-side { position: sticky; top: 12px; height: calc(100vh - 24px); margin: 12px 0 12px 12px; width: 248px; min-width: 248px;
    border-radius: 20px; border-right: 0; padding: 14px 12px 12px; --g-alpha: 0.42; --g-blur: 18px; --g-rim: 0.9; --g-depth: 0.7; }
  html.nx-side-min .ng-sidebar.nx-side { width: 72px; min-width: 72px; }
  /* Прежние правила делали меню прозрачным или белым — у панели остаётся заливка стекла */
  :root:root body .ng-sidebar.nx-side.nx-glass {
    background: linear-gradient(180deg, rgb(var(--glass-hi-rgb) / calc(0.035 * var(--g-hk))) 0%, transparent 30%), var(--g-tint), var(--g-fill) !important; }
  :root[data-theme="light"] .ng-sidebar.nx-side { --g-alpha: 0.24; }
  .nx-side-devs { display: flex; flex-direction: column; min-height: 0; flex: 0 1 auto; margin-top: 16px; }
  .nx-side-devs-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-right: 4px; margin-bottom: 4px; }
  .nx-side-devs-head .nx-side-sec { margin: 0; }
  :is(.nx-side-dev, .nx-side-add) { appearance: none; border: 0; background: none; font: inherit; color: var(--text); text-align: left; padding: 0; margin: 0; cursor: pointer; }
  .nx-side-add { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    background: color-mix(in srgb, var(--mint) 14%, transparent); }
  .nx-side-add:hover { background: color-mix(in srgb, var(--mint) 24%, transparent); }
  .nx-side-devs-list { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--text) 22%, transparent) transparent; }
  .nx-side-dev { display: flex; align-items: center; gap: 12px; width: 100%; padding: 6px 10px 6px 14px; border-radius: 10px; box-sizing: border-box; flex-shrink: 0; line-height: 1.3; }
  .nx-side-dev:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
  :is(.nx-side-dev, .nx-side-add):focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
  .nx-side-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .nx-side-dev-text { min-width: 0; flex: 1; }
  .nx-side-dev-name { display: block; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-side-dev-sub { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-side-devs-empty { font-size: 12px; color: var(--muted); padding: 6px 10px; }
  .nx-side-about-ico { width: 26px; display: flex; justify-content: center; flex-shrink: 0; }
  .nx-side-ver { font-size: 12px; color: var(--muted); padding: 8px 10px 0; white-space: nowrap; }
  .nx-side.is-min :is(.nx-side-devs, .nx-side-ver) { display: none; }

  /* Верхняя строка: поиск-таблетка и одна общая таблетка */
  .ng-topbar { gap: 12px !important; padding: 20px 32px 0 0 !important; align-items: center !important; }
  .ng-topbar .nx-top-search { width: 240px; height: 44px; justify-content: flex-start; gap: 10px; padding: 0 18px !important;
    font-size: 15px !important; font-weight: 600; color: var(--muted) !important; }
  .ng-topbar .nx-top-search svg { width: 18px; height: 18px; margin-left: 0; }
  .ng-topbar .nx-top-search svg * { stroke-width: 2.4; }
  .nx-top-group { display: flex; align-items: center; gap: 4px; height: 44px; padding: 0 0 0 18px; border-radius: 999px; box-sizing: border-box; }
  .nx-top-group .ng-timedate { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; margin-right: 8px; text-align: left; }
  .nx-top-group .ng-timedate > .nx-td-time { font-size: 15px !important; font-weight: 700; color: var(--text); }
  .nx-top-group .ng-timedate > .nx-td-time::after { content: " ·"; color: var(--muted); font-weight: 600; }
  .nx-top-group .ng-timedate > .nx-td-date { display: none; }
  .nx-top-group .ng-timedate > .nx-td-date-long { font-size: 15px !important; font-weight: 600; color: var(--muted); }
  .nx-top-group :is(.nx-tb-bell, .nx-tb-quick) { width: 34px !important; height: 34px !important; }
  .nx-tb-row .nx-top-group :is(.nx-tb-bell, .nx-tb-quick) svg { width: 20px !important; height: 20px !important; }
  /* Профиль — светлый круг в конце таблетки (своё фото — вместо значка) */
  .nx-top-group .nx-tb-user { width: 44px !important; height: 44px !important; min-width: 44px; margin-left: 6px; border-radius: 50% !important; overflow: hidden;
    background: var(--text) !important; }
  .nx-tb-row .nx-top-group .nx-tb-user svg { width: 24px !important; height: 24px !important; }
  .nx-top-group .nx-tb-user svg * { stroke: var(--bg); }

  /* Главная: содержимое сразу за панелью, без центрирования */
  .ng-home { padding: 24px 32px 40px 32px !important; }
  .ng-home-desktop { max-width: none; margin: 0; }
  .ng-home-desktop .nx-home-title { margin: 0 0 6px; }
  .nx-hd-grid { max-width: 1480px; }
  .nx-hd-status { font-size: 14px; color: var(--muted); margin: 0 0 20px; }
  .nx-hd-actions { display: flex; align-items: center; gap: 12px; margin: 0 0 24px; }
  :is(.nx-hd-add, .nx-hd-sq) { appearance: none; border: 0; font: inherit; margin: 0; cursor: pointer; }
  .nx-hd-add { display: inline-flex; align-items: center; gap: 10px; height: 52px; padding: 0 22px 0 18px; border-radius: 16px;
    background: var(--mint); color: var(--on-accent); font-size: 17px; font-weight: 700; transition: transform 140ms ease, filter 140ms ease; }
  .nx-hd-add:hover { filter: brightness(1.06); }
  .nx-hd-add:active { transform: scale(0.98); }
  .nx-hd-sq { width: 52px; height: 52px; padding: 0; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--text); }
  :is(.nx-hd-add, .nx-hd-sq):focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { .nx-hd-add { transition: none; } }
}
/* Часы: прежний вид двумя строками (вне общей таблетки компьютера) */
.ng-timedate { text-align: right; color: var(--text); }
.nx-td-time { font-size: 20px; font-weight: 400; }
.nx-td-date { font-size: 17px; }
.nx-td-date-long { display: none; }
@media ${DESKTOP_MQ} { .nx-top-group .nx-td-date-long { display: block; } }
/* Телефон: общей таблетки нет — обёртка «прозрачная», кнопки стоят как раньше */
@media ${PHONE_MQ} {
  .nx-top-group { display: contents; }
  .nx-top-group::before, .nx-top-group::after { display: none !important; }
}

/* ═══ Правки по макету 2026-11-13 (компьютер) ═══ */
@media ${DESKTOP_MQ} {
  /* Плашки устройств — «таблетки» со светом статуса (как на макете): зелёный — в сети, красный — не в сети.
     Заливка сверху гуще, к низу темнее, вокруг мягкое свечение того же цвета; точки статуса нет */
  .nx-hd-devs { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
  .nx-hd-dev { --st: var(--red); height: 72px; padding: 0 28px 0 24px; gap: 16px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st) 42%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--st) 36%, var(--bg)) 0%, color-mix(in srgb, var(--st) 16%, var(--bg)) 100%);
    box-shadow: 0 0 26px -8px color-mix(in srgb, var(--st) 70%, transparent), inset 0 1px 0 color-mix(in srgb, var(--st) 45%, transparent);
    transition: filter 160ms ease, box-shadow 160ms ease; }
  .nx-hd-dev[data-online="1"] { --st: var(--green); }
  .nx-hd-dev:hover { filter: brightness(1.14); border-color: color-mix(in srgb, var(--st) 70%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--st) 36%, var(--bg)) 0%, color-mix(in srgb, var(--st) 16%, var(--bg)) 100%);
    box-shadow: 0 0 30px -6px color-mix(in srgb, var(--st) 85%, transparent), inset 0 1px 0 color-mix(in srgb, var(--st) 45%, transparent); }
  .nx-hd-dev-ico { width: 38px; }
  .nx-hd-dev-name { font-size: 17px; }
  /* Светлая тема: свет мягче, заливка светлая */
  :root[data-theme="light"] .nx-hd-dev, :root[data-theme="light"] .nx-hd-dev:hover {
    background: linear-gradient(180deg, color-mix(in srgb, var(--st) 30%, var(--panel)) 0%, color-mix(in srgb, var(--st) 14%, var(--panel)) 100%);
    box-shadow: 0 0 22px -10px color-mix(in srgb, var(--st) 60%, transparent), inset 0 1px 0 color-mix(in srgb, var(--panel) 70%, transparent); }

  /* Всё содержимое Главной ниже (как на макете): заголовок и таблетки справа — на одной линии.
     Верхняя строка опускается только на Главной и переезжает плавно при смене раздела */
  .ng-home { padding-top: 44px !important; }
  /* Высоту окна держит сама .ng-home (min-height), прежний запас у .ng-home-desktop давал лишнюю прокрутку */
  .ng-home-desktop { min-height: 0; }
  .ng-topbar { transition: padding-top 240ms cubic-bezier(0.2, 0.9, 0.3, 1); }
  .ng-topbar[data-tab="home"] { padding-top: 54px !important; }
  .nx-hd-status { margin-bottom: 26px; }
  .nx-hd-actions { margin-bottom: 30px; }

  /* Профиль со своим фото: фото занимает весь круг (раньше вокруг маленького фото оставалось толстое светлое кольцо) */
  .nx-top-group .nx-tb-user .nx-set-avatar { width: 100% !important; height: 100% !important; }
  @media (prefers-reduced-motion: reduce) { .ng-topbar, .nx-hd-dev { transition: none; } }
}
`;
