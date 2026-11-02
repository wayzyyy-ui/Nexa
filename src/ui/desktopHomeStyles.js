// Главная и боковое меню по светлому и тёмному макетам автора, ноябрь 2026.
import { DESKTOP_MQ, NAV_W } from "./theme.js";

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
  .ng-sidebar {
    --side-scale: clamp(0.65, min(100vw / 1920px, 100vh / 1080px), 1.25);
    padding-top: calc(55px * var(--side-scale)) !important;
    gap: calc(35px * var(--side-scale)) !important;
    border-right-color: var(--border-strong) !important;
  }
  .ng-sidebar .nx-nav-btn { width: calc(56px * var(--side-scale)) !important; height: calc(56px * var(--side-scale)) !important; min-height: 36px; border-radius: calc(16px * var(--side-scale)) !important; border: 0.5px solid var(--border-strong) !important; }
  .ng-sidebar .nx-nav-btn svg { width: 100%; height: 100%; }
  .ng-sidebar .nx-nav-btn[aria-current] { border-color: transparent !important; }
  .ng-sidebar .nx-side-thumb, .ng-sidebar .nx-side-mark { transform: translateY(calc(var(--side-y) * 1px * var(--side-scale))); }
  .ng-sidebar .nx-side-thumb { width: calc(56px * var(--side-scale)); height: calc(56px * var(--side-scale)); margin-left: calc(-28px * var(--side-scale)); border-radius: calc(16px * var(--side-scale)); }
  .ng-sidebar .nx-side-mark { height: calc(56px * var(--side-scale)); }
  :root[data-theme="light"] body:has(.nx-home-glow) .ng-sidebar { background: transparent !important; }
  .ng-home { padding-left: max(28px, calc(270 * var(--mk) - ${NAV_W}px)) !important; padding-right: calc(40 * var(--mk)) !important; }
  .nx-home-brand-desk { margin-bottom: calc(54 * var(--mk)); }
  .nx-home-brand-desk > span { gap: calc(40 * var(--mk)) !important; }
  .nx-home-brand-desk > span > svg:last-child { height: calc(40 * var(--mk)) !important; }
  .nx-home-grid2 { grid-template-columns: minmax(0, calc(718 * var(--mk))) minmax(250px, calc(389 * var(--mk))) minmax(0, 1fr); gap: calc(35 * var(--mk)) calc(37 * var(--mk)); }
  .nx-home-card { padding: calc(36 * var(--mk)) calc(48 * var(--mk)) calc(26 * var(--mk)); }
  .nx-home-card-title { font-size: max(18px, calc(25 * var(--mk))); margin-bottom: calc(32 * var(--mk)); }
  .nx-home-devices > .nx-stagger { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(24 * var(--mk)) !important; align-items: start; }
  .nx-home-devices-empty { grid-column: 1 / -1; }
  .nx-home-devices .nx-dev-row { min-height: max(60px, calc(94 * var(--mk))); gap: calc(16 * var(--mk)); padding: calc(12 * var(--mk)) calc(24 * var(--mk)) !important; }
  .nx-home-devices .nx-dev-row-icon { width: calc(32 * var(--mk)); }
  .nx-home-devices .nx-dev-row-name { font-size: max(14px, calc(23 * var(--mk))); white-space: normal; line-height: 1.15; overflow-wrap: anywhere; }
  .nx-home-devices .nx-dev-row-sub { font-size: max(10px, calc(12 * var(--mk))); margin-top: 3px; }
  .nx-home-devices .nx-dev-row .nx-status-dot { width: 8px; height: 8px; }
  .nx-home-devices .nx-dev-row.is-add { gap: 10px; justify-content: center; background-color: color-mix(in srgb, var(--text) 3%, var(--bg)); }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-name { font-size: max(13px, calc(20 * var(--mk))); }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-icon { width: 22px; }
  .nx-home-devices .nx-dev-row.is-add .nx-dev-row-icon svg { height: 24px !important; }
  .nx-home-fold2 { margin-right: calc(-40 * var(--mk)); }
  .nx-home-fold2 .nx-home-fold-art { height: calc(680 * var(--mk)); max-width: none; margin-top: calc(-75 * var(--mk)); }
  .nx-home-act { min-height: calc(230 * var(--mk)); }
  .nx-hw-desk { min-height: calc(627 * var(--mk)); }
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
  :root[data-theme="light"] .nx-home-devices .nx-dev-row.is-add { border: 0.5px dashed var(--border-strong) !important; background: var(--on-fold) !important; }
  :root[data-theme="light"] .nx-home-fold-art { opacity: 0.85; }
  @media (max-width: 1300px) {
    .nx-home-devices > .nx-stagger { grid-template-columns: minmax(0, 1fr); }
    .nx-home-fold2 .nx-home-fold-art { height: calc(560 * var(--mk)); }
  }
}
`;
