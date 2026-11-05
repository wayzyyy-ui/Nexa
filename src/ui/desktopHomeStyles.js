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
  .ng-home { padding-left: var(--page-x) !important; padding-right: calc(40 * var(--mk)) !important; }
  /* Отступы по высоте ужаты (2026-11-03): Главная помещается в окно без прокрутки, и под панелью окна ПК тоже */
  .nx-home-title { font-size: max(32px, calc(50 * var(--mk))) !important; font-weight: 500; line-height: 1.1; margin: 0 0 calc(40 * var(--mk)); }
  .nx-home-card-title { margin-bottom: calc(24 * var(--mk)) !important; }
  .nx-home-devices > .nx-stagger { gap: calc(18 * var(--mk)) !important; }
  .nx-home-about-row { padding-top: calc(10 * var(--mk)) !important; }
  .nx-home-brand-desk > span { gap: calc(40 * var(--mk)) !important; }
  .nx-home-brand-desk > span > svg:last-child { height: calc(40 * var(--mk)) !important; }
  .nx-home-grid2 { grid-template-columns: minmax(0, calc(718 * var(--mk))) minmax(250px, calc(389 * var(--mk))) minmax(0, 1fr); gap: calc(35 * var(--mk)) calc(37 * var(--mk)); }
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
  .nx-home-fold2 { margin-right: calc(-40 * var(--mk)); }
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
`;
