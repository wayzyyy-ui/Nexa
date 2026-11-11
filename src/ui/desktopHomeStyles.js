// Главная и боковое меню по светлому и тёмному макетам автора, ноябрь 2026.
import { DESKTOP_MQ } from "./theme.js";

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
  .nx-hd-h { display: block; margin: 0; color: var(--text); font-size: 17px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; }
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
`;
