// Мобильная Главная по макету автора «Меню iPhone 17», ноябрь 2026.
// Отдельный блок в общих стилях: компьютер и экспериментальный вид сохраняют свою раскладку.
import { PHONE_MQ } from "./theme.js";

export const MOBILE_HOME_CSS = `
@media ${PHONE_MQ} {
  .ng-home:has(.nx-home-redesign) {
    --hm: clamp(0.85px, 0.248756vw, 1.2px);
    /* Боковой отступ — 16 px, как у остальных экранов телефона (.ng-screen) */
    padding: calc(28 * var(--hm)) 16px 24px !important;
  }
  .nx-home-redesign .nx-home-head {
    min-height: calc(36 * var(--hm)); margin: 0 calc(-4 * var(--hm)) calc(12 * var(--hm));
    grid-template-columns: 1fr auto 1fr;
  }
  .nx-home-redesign .nx-home-head > span:nth-child(2) svg { height: calc(23 * var(--hm)); width: auto; }
  .nx-home-redesign .nx-home-head > span:last-child { gap: 0 !important; }
  .nx-home-redesign .nx-home-head :is(.nx-tb-quick, .nx-tb-bell) {
    width: calc(37 * var(--hm)) !important; min-width: 32px; height: 44px !important;
  }
  .nx-home-redesign .nx-home-head :is(.nx-tb-quick, .nx-tb-bell) svg { width: calc(23 * var(--hm)) !important; height: calc(23 * var(--hm)) !important; }
  .nx-home-redesign .nx-home-search {
    height: calc(28 * var(--hm)); min-height: 0; font-size: calc(15 * var(--hm)); gap: calc(7 * var(--hm));
    background: color-mix(in srgb, var(--text) 10%, var(--bg)) !important;
    border-color: color-mix(in srgb, var(--text) 24%, transparent) !important;
    box-shadow: none; backdrop-filter: none;
  }
  .nx-home-redesign .nx-home-search svg { width: calc(14 * var(--hm)); height: calc(14 * var(--hm)); }
  .nx-home-redesign .nx-home-search::before, .nx-home-redesign .nx-home-search::after,
  .nx-home-redesign .nx-ai-pill::before, .nx-home-redesign .nx-ai-pill::after,
  .nx-home-redesign .nx-hw-mob::before, .nx-home-redesign .nx-hw-mob::after { display: none; }
  .nx-home-redesign .nx-home-device-section { margin-top: calc(14 * var(--hm)) !important; }
  .nx-home-redesign .nx-home-device-heading { margin-bottom: calc(14 * var(--hm)) !important; }
  .nx-home-redesign .nx-home-device-heading > .ng-display { font-size: calc(20 * var(--hm)) !important; font-weight: 700 !important; letter-spacing: -0.02em; }
  .nx-home-redesign .nx-home-device-heading > button { min-height: 32px; font-size: calc(16 * var(--hm)) !important; gap: 6px !important; }
  .nx-home-redesign .nx-dpager-page { gap: calc(15 * var(--hm)) calc(21 * var(--hm)); }
  .nx-home-redesign .nx-dev-pill {
    min-height: calc(69 * var(--hm)); gap: calc(7 * var(--hm));
    padding: calc(11 * var(--hm)) calc(12 * var(--hm)) !important;
    border-color: color-mix(in srgb, var(--text) 20%, transparent) !important;
    background-image: linear-gradient(155deg, color-mix(in srgb, var(--mint) 20%, var(--bg)), color-mix(in srgb, var(--mint) 3%, var(--bg))) !important;
  }
  .nx-home-redesign .nx-dev-pill[data-online="0"] {
    background-image: linear-gradient(150deg, color-mix(in srgb, var(--red) 28%, var(--bg)), color-mix(in srgb, var(--red) 8%, var(--bg))) !important;
  }
  .nx-home-redesign .nx-dev-pill-icon { display: flex; justify-content: center; width: calc(34 * var(--hm)); }
  .nx-home-redesign .nx-dev-pill-icon svg { height: calc(40 * var(--hm)); width: auto; max-width: 100%; }
  .nx-home-redesign .nx-dev-pill-name { font-size: calc(15.5 * var(--hm)); font-weight: 700; }
  .nx-home-redesign .nx-dev-pill-status { font-size: calc(10 * var(--hm)) !important; margin-top: 1px !important; }
  .nx-home-redesign .nx-dev-pill .nx-status-dot { width: calc(9 * var(--hm)); height: calc(9 * var(--hm)); }
  .nx-home-redesign .nx-dev-pill.is-add {
    background: color-mix(in srgb, var(--text) 3%, var(--bg)) !important;
    border-color: color-mix(in srgb, var(--text) 44%, transparent) !important;
    padding: calc(12 * var(--hm)) !important; gap: 8px !important;
  }
  .nx-home-redesign .nx-dev-pill.is-add > span { font-size: calc(15 * var(--hm)) !important; max-width: 90px; text-align: left; line-height: 1.05 !important; }
  .nx-home-redesign .nx-dev-pill.is-add > svg { flex-shrink: 0; }
  .nx-home-redesign .nx-dpager-dots { gap: 6px; align-items: center; min-height: 12px; margin-top: calc(13 * var(--hm)); }
  .nx-home-redesign .nx-dpager-dot { width: 5px; height: 5px; }
  .nx-home-redesign .nx-dpager-dot.is-on { width: 11px; height: 11px; border-radius: 0; clip-path: polygon(50% 0, 66% 34%, 100% 50%, 66% 66%, 50% 100%, 34% 66%, 0 50%, 34% 34%); }
  .nx-home-redesign .nx-home-assistant { margin-top: calc(19 * var(--hm)); }
  .nx-home-redesign .nx-ai-pill {
    min-height: calc(61 * var(--hm)); padding: calc(10 * var(--hm)) calc(18 * var(--hm)) !important;
    gap: calc(14 * var(--hm)); animation: none; background-size: 100% 100% !important;
    background-image: linear-gradient(105deg, color-mix(in srgb, var(--blue) 23%, var(--panel)), color-mix(in srgb, var(--mint) 20%, var(--panel))) !important;
    border-color: color-mix(in srgb, var(--text) 40%, transparent) !important;
    backdrop-filter: none; box-shadow: none;
  }
  .nx-home-redesign .nx-ai-pill-icon { width: calc(33 * var(--hm)); height: calc(33 * var(--hm)); }
  .nx-home-redesign .nx-ai-pill-icon svg { width: calc(22 * var(--hm)); height: calc(22 * var(--hm)); }
  .nx-home-redesign .nx-ai-pill-title { font-size: calc(17 * var(--hm)) !important; font-weight: 700; line-height: 1.2; }
  .nx-home-redesign .nx-ai-pill-sub { font-size: calc(10.5 * var(--hm)) !important; line-height: 1.3; margin-top: 2px !important; }
  .nx-home-redesign .nx-ai-pill > svg:last-child { display: none; }
  .nx-home-redesign .nx-home-duo { gap: calc(12 * var(--hm)); margin-top: calc(30 * var(--hm)); align-items: stretch; }
  .nx-home-redesign :is(.nx-hw-mob, .nx-hn-mob) {
    min-height: calc(213 * var(--hm)); border-radius: 999px !important;
    padding: calc(19 * var(--hm)) calc(14 * var(--hm)) calc(20 * var(--hm)) !important;
    background: transparent; box-shadow: none; backdrop-filter: none;
  }
  .nx-home-redesign .nx-hw-mob { border-color: color-mix(in srgb, var(--text) 35%, transparent); }
  .nx-home-redesign .nx-hw-main { flex: 1; align-items: center; }
  .nx-home-redesign .nx-hw-head { display: block; text-align: center; }
  .nx-home-redesign .nx-hw-title { font-size: calc(16 * var(--hm)); font-weight: 650; }
  .nx-home-redesign .nx-hw-city { font-size: calc(13 * var(--hm)); }
  .nx-home-redesign .nx-hw-date { display: none; }
  .nx-home-redesign .nx-hw-temp { align-self: center; font-size: calc(61 * var(--hm)); margin: calc(14 * var(--hm)) 0 calc(4 * var(--hm)); letter-spacing: -0.065em; }
  .nx-home-redesign .nx-hw-facet { width: 90%; right: -15%; top: -30%; }
  .nx-home-redesign .nx-deg-ring { width: 0.23em; height: 0.23em; border-width: 0.045em; margin-left: 0.07em; }
  .nx-home-redesign .nx-hw-cond { font-size: calc(14 * var(--hm)); line-height: 1.25; align-self: flex-start; margin-left: calc(13 * var(--hm)); }
  .nx-home-redesign .nx-hw-feels { font-size: calc(12 * var(--hm)); align-self: flex-start; margin-left: calc(13 * var(--hm)); white-space: nowrap; }
  .nx-home-redesign .nx-hw-mob .nx-weather-attr { align-self: center; font-size: calc(8 * var(--hm)) !important; margin-top: calc(8 * var(--hm)); }
  .nx-home-redesign .nx-hn-mob {
    align-items: center; padding-top: calc(30 * var(--hm)) !important; padding-bottom: calc(40 * var(--hm)) !important;
    background: linear-gradient(170deg, color-mix(in srgb, var(--mint) 1%, var(--bg)), color-mix(in srgb, var(--mint) 29%, var(--bg))) !important;
  }
  .nx-home-redesign .nx-hn-title { font-size: calc(16 * var(--hm)); font-weight: 650; }
  .nx-home-redesign .nx-hn-next { width: 100%; align-items: flex-end; padding-right: calc(10 * var(--hm)); box-sizing: border-box; }
  .nx-home-redesign .nx-hn-time { font-size: calc(15 * var(--hm)); opacity: 1; }
  .nx-home-redesign .nx-hn-what { font-size: calc(36 * var(--hm)); font-weight: 700; letter-spacing: -0.03em; }
  .nx-home-redesign .nx-hn-what.is-m { font-size: calc(26 * var(--hm)); }
  .nx-home-redesign .nx-hn-what.is-s { font-size: calc(20 * var(--hm)); }
  .nx-home-redesign .nx-hn-what.is-xs { font-size: calc(16 * var(--hm)); overflow-wrap: anywhere !important; }
  .nx-home-redesign .nx-hn-next.is-empty { align-items: center; text-align: center; padding-right: 0; }
  .nx-home-redesign .nx-act-pill { margin-top: calc(20 * var(--hm)); }
  .nx-home-redesign .nx-act-pill > section { border-radius: calc(18 * var(--hm)) !important; min-height: calc(140 * var(--hm)); padding: calc(10 * var(--hm)) calc(18 * var(--hm)) !important; }
  .nx-home-redesign .nx-act-pill > section > div:first-child > span { font-size: calc(18 * var(--hm)) !important; font-weight: 600 !important; }
  .nx-home-redesign .nx-home-more { margin-top: 18px; }
  /* Нижняя панель общая для всех мобильных разделов. */
  .ng-mobile-tabbar { padding: 0 20px calc(var(--sab) + 18px) !important; }
  .nx-tabbar-pill.nx-glass { --g-alpha: 0.65; --g-blur: 12px; padding: 0 6px !important; }
  .nx-tabbar-pill > div { height: 60px !important; }
  .nx-tabbar-pill button > svg { width: 24px; height: 24px; }
  .nx-tabbar-pill button[aria-label="Главная"] > svg { width: 27px; height: 27px; }
  /* Звёздочка ассистента нарисована выше центра своей рамки — опускаем, чтобы стояла в ряд с остальными */
  .nx-tabbar-pill button[aria-label="Ассистент"] > svg { transform: translateY(6%); }
  /* Линии той же толщины на экране, что у прежних значков 26 px: с размером они «жирнели» */
  .nx-tabbar-pill button > svg, .nx-tabbar-pill button > svg * { stroke-width: 1.5; }
  .nx-tabbar-pill button[aria-label="Главная"] > svg, .nx-tabbar-pill button[aria-label="Главная"] > svg * { stroke-width: 1.5; }
  .nx-tab-move > div { width: 58px !important; height: 46px !important; border-color: var(--border-strong) !important; }
}
`;
