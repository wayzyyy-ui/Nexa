// «Сегодня» по макету автора: расписание, две карточки погоды и нижние таблетки.
import { DESKTOP_MQ } from "./theme.js";

export const TODAY_CSS = `
.nx-today-notes-icon { display: none; }
@media ${DESKTOP_MQ} {
  .nx-today-screen { padding: 44px 32px 48px !important; color: var(--text); }
  .nx-today-screen .nx-media-grid { grid-template-columns: minmax(0, 1188px) !important; justify-content: start; }
  .nx-today-screen .nx-media-main { zoom: 1; }
  .nx-today-screen .nx-page-title { font-size: 64px !important; font-weight: 700 !important; line-height: 1.1 !important; }
  .nx-today-screen .nx-page-gap { height: 78px !important; }

  .nx-today-screen .nx-today-grid,
  .nx-today-screen .nx-today-grid.is-fc {
    grid-template-columns: minmax(0, 1.32fr) minmax(0, 1fr) !important;
    grid-template-rows: minmax(300px, auto) minmax(180px, auto) auto !important;
    gap: 24px 44px !important; margin-right: 0; transition: none;
  }
  .nx-today-screen :is(.nx-sched, .nx-weather) {
    border-radius: 32px !important;
    border: 1px solid color-mix(in srgb, var(--text) 28%, transparent) !important;
    --g-alpha: 0.2; --g-blur: 14px; --g-rim: 0.45; --g-depth: 0.3;
  }
  .nx-today-screen :is(.nx-sched, .nx-weather).nx-glass::before { padding: 0.5px; }
  .nx-today-screen .nx-sched { padding: 28px 40px 36px !important; min-width: 0; }
  .nx-today-screen .nx-sched-head { font-size: 24px !important; margin-bottom: 22px !important; min-height: 42px; }
  .nx-today-screen .nx-sched-add-top { min-height: 42px; padding: 8px 16px !important; --g-alpha: 0.05; --g-depth: 0.15; --g-rim: 0.2; }
  .nx-today-screen :is(.nx-sched-add-top, .nx-sched-tools > button, .nx-today-pill) { color: var(--text) !important; border: 1px solid color-mix(in srgb, var(--text) 35%, transparent) !important; }
  .nx-today-screen .nx-day-strip { margin-bottom: 14px !important; }
  .nx-today-screen .nx-day-chip {
    box-sizing: border-box; flex: 0 0 calc((100% - 48px) / 7); min-width: 62px !important;
    display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;
    height: 80px; padding: 4px 6px 12px !important; border-radius: 20px !important;
  }
  .nx-today-screen .nx-day-num { font-size: 36px !important; line-height: 1 !important; }
  .nx-today-screen .nx-day-chip[aria-selected="false"] { border-color: color-mix(in srgb, var(--text) 35%, transparent) !important; }
  .nx-today-screen .nx-day-chip[aria-selected="true"] {
    background: var(--mint) !important; color: var(--on-accent) !important;
  }
  .nx-today-screen .nx-day-chip[aria-selected="true"] .nx-day-num { font-size: 44px !important; line-height: 1; font-weight: 700 !important; }
  .nx-today-screen .nx-day-dot { position: absolute; bottom: 5px; left: calc(50% - 2px); }
  .nx-today-screen .nx-sched-tools > button { min-height: 46px; font-weight: 600; }
  .nx-today-screen .nx-today-empty { padding-top: 0; }
  .nx-today-screen .nx-today-empty > div { padding: 26px 0 !important; }
  .nx-today-screen .nx-today-empty > div > svg { display: none; }
  .nx-today-screen .nx-today-empty > div > div:first-of-type { font-size: 21px !important; font-weight: 500 !important; }
  .nx-today-screen .nx-today-empty > div > div:nth-of-type(2) { font-size: 20px !important; max-width: none !important; }

  .nx-today-screen .nx-weather { padding: 26px 32px !important; height: 100%; }
  .nx-today-screen .nx-today-now { align-self: stretch; min-width: 0; }
  .nx-today-screen .nx-weather-head { grid-template-columns: auto minmax(0, 1fr) auto !important; grid-template-areas: "title city date" !important; gap: 10px !important; }
  .nx-today-screen .nx-weather-title { font-size: 24px !important; font-weight: 650; gap: 10px !important; white-space: nowrap; }
  .nx-today-screen .nx-weather-title > svg { width: 24px; height: 24px; flex-shrink: 0; }
  .nx-today-screen .nx-weather-city { margin-top: 0 !important; font-size: 16px !important; }
  .nx-today-screen :is(.nx-weather-pin, .nx-weather-note, .nx-weather-details) { display: none !important; }
  .nx-today-screen .nx-weather-head > :is([role="dialog"], .nx-city-picker) { grid-column: 1 / -1; grid-row: 2; }
  .nx-today-screen .nx-weather-body { justify-content: center !important; }
  .nx-today-screen .nx-weather-main { gap: 20px !important; margin-top: 12px !important; }
  .nx-today-screen .nx-weather-condition { font-size: 28px !important; line-height: 1.2; overflow-wrap: anywhere; }
  .nx-today-screen .nx-weather-feels { font-size: 18px !important; line-height: 1.35; }
  .nx-today-screen .nx-weather-summary { min-width: 0; }
  .nx-today-screen .nx-today-now .nx-weather-main { flex-direction: column; align-items: stretch !important; gap: 6px !important; }
  .nx-today-screen .nx-today-now .nx-temp { align-self: center; padding-right: 36px !important; }
  .nx-today-screen .nx-today-now .nx-temp-fold { top: -18px !important; bottom: -6px !important; }
  .nx-today-screen .nx-today-next .nx-weather-main { justify-content: center; }
  .nx-today-screen .nx-today-now .nx-temp > span:first-of-type { font-size: 104px !important; }
  .nx-today-screen .nx-today-now .nx-temp > span:last-of-type { font-size: 58px !important; color: var(--muted); }
  .nx-today-screen .nx-weather-footer { margin-top: 4px !important; }
  .nx-today-screen .nx-today-weather-status { flex-wrap: wrap; }
  .nx-today-screen .nx-today-weather-update:not(.is-alert) { display: none; }
  .nx-today-screen .nx-today-weather-status .nx-weather-attr { margin-left: auto; }
  .nx-today-screen .nx-today-next .nx-temp > span:first-of-type { font-size: 64px !important; }
  .nx-today-screen .nx-today-next .nx-weather-title { font-size: 23px !important; }
  .nx-today-screen .nx-today-next .nx-weather-head { grid-template-columns: minmax(0, 1fr) auto !important; grid-template-areas: "title date" !important; }

  .nx-today-screen .nx-today-pill { min-height: 76px; margin-top: 4px; font-size: 20px !important; font-weight: 700; --g-alpha: 0.12; --g-depth: 0.15; --g-rim: 0.2; }
  .nx-today-screen .nx-notepad-entry { border-color: color-mix(in srgb, var(--mint) 45%, transparent) !important; }
  .nx-today-screen .nx-today-notes-label { display: inline-flex; align-items: center; gap: 12px; }
  .nx-today-screen .nx-today-notes-icon { display: flex; }
  .nx-today-screen .nx-notepad-entry > span:last-child svg { display: none; }
  .nx-today-screen .nx-fc-chev { opacity: 0.6; }
  /* Прогноз раскрывается под кнопкой: расписание сохраняет свою ширину. */
  .nx-today-screen .nx-fc-inline { display: block; }
  .nx-today-screen .nx-fc-aside { display: none !important; }
  .nx-today-screen .nx-fc-chev.is-open { transform: rotate(90deg); }

  @media (max-width: 1450px) {
    .nx-today-screen .nx-today-grid, .nx-today-screen .nx-today-grid.is-fc { gap: 24px !important; }
    .nx-today-screen .nx-sched { padding: 24px !important; }
    .nx-today-screen .nx-weather { padding: 24px !important; }
    .nx-today-screen .nx-weather-head { grid-template-columns: minmax(0, 1fr) auto !important; grid-template-areas: "title date" "city city" !important; }
    .nx-today-screen .nx-weather-title, .nx-today-screen .nx-today-next .nx-weather-title { font-size: 20px !important; }
    .nx-today-screen .nx-weather-condition { font-size: 23px !important; }
    .nx-today-screen .nx-weather-feels { font-size: 15px !important; }
    .nx-today-screen .nx-today-next .nx-temp > span:first-of-type { font-size: 52px !important; }
  }
  @media (max-width: 1150px) {
    .nx-today-screen .nx-page-title { font-size: 48px !important; }
    .nx-today-screen .nx-page-gap { height: 56px !important; }
    .nx-today-screen .nx-today-grid, .nx-today-screen .nx-today-grid.is-fc {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-areas: "sched" "notes" "now" "next" "month" !important;
      grid-template-rows: auto !important;
    }
    .nx-today-screen .nx-sched { min-height: 420px; }
    .nx-today-screen .nx-today-now { min-height: 300px; }
    .nx-today-screen .nx-today-next { min-height: 180px; }
    .nx-today-screen .nx-today-pill { min-height: 60px; }
  }
}
`;
