// Своя верхняя панель окна — только приложение для ПК (Tauri), вместо рамки Windows (decorations: false).
// 36 px: слева знак и NEXA, справа «свернуть», «развернуть / вернуть», «закрыть».
// Перетаскивание — за пустое место (data-tauri-drag-region), двойной щелчок — развернуть / вернуть.
// «Закрыть» шлёт обычный запрос закрытия: lib.rs его перехватывает и прячет NEXA в трей, как раньше.
import { useEffect, useState } from "react";
import { C } from "./theme.js";
import { LogoMark, Logo } from "./base.jsx";

// Есть ли настоящее окно Tauri (в сборке --mode desktop, открытой в браузере, панели нет)
export const hasTitleBar = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
export const TITLEBAR_H = 36;

// Значки — контур 1.5 px, как в нашем наборе (Icon)
const glyph = {
  min: <path d="M5 12h14" />,
  max: <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />,
  restore: <><rect x="5" y="8.5" width="10.5" height="10.5" rx="2.2" /><path d="M8.5 8.5V7.2A2.2 2.2 0 0 1 10.7 5h6.1A2.2 2.2 0 0 1 19 7.2v6.1a2.2 2.2 0 0 1-2.2 2.2h-1.3" /></>,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
};
const Svg = ({ k }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph[k]}</svg>
);

export function DesktopTitleBar() {
  const [win, setWin] = useState(null);
  const [max, setMax] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (!hasTitleBar) return;
    let off = [];
    let alive = true;
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      if (!alive) return;
      setWin(w);
      const sync = () => w.isMaximized().then((m) => alive && setMax(m)).catch(() => {});
      sync();
      off.push(await w.onResized(sync));
      off.push(await w.onFocusChanged(({ payload }) => alive && setFocused(!!payload)));
    }).catch(() => {});
    return () => { alive = false; off.forEach((f) => { try { f(); } catch { /* уже снято */ } }); };
  }, []);

  // Отступ сверху у всего интерфейса — класс у html (один раз, не при прокрутке)
  useEffect(() => {
    if (!hasTitleBar) return;
    document.documentElement.classList.add("nx-titlebar");
    return () => document.documentElement.classList.remove("nx-titlebar");
  }, []);

  if (!hasTitleBar) return null;
  const toggle = () => win?.toggleMaximize().catch(() => {});
  return (
    // Двойной щелчок по области перетаскивания разворачивает / возвращает окно сам Tauri — своего обработчика нет
    <div className={`nx-titlebar-bar${focused ? "" : " is-blur"}`} data-tauri-drag-region>
      <span className="nx-titlebar-brand" data-tauri-drag-region aria-hidden="true">
        <LogoMark s={16} />
        <Logo bare h={10} />
      </span>
      <span className="nx-titlebar-gap" data-tauri-drag-region />
      <button type="button" className="nx-titlebar-btn" onClick={() => win?.minimize().catch(() => {})} aria-label="Свернуть" title="Свернуть"><Svg k="min" /></button>
      <button type="button" className="nx-titlebar-btn" onClick={toggle} aria-label={max ? "Вернуть" : "Развернуть"} title={max ? "Вернуть" : "Развернуть"}><Svg k={max ? "restore" : "max"} /></button>
      <button type="button" className="nx-titlebar-btn is-close" onClick={() => win?.close().catch(() => {})} aria-label="Закрыть" title="Закрыть (NEXA останется в трее)"><Svg k="close" /></button>
    </div>
  );
}

// Цвета панели — из токенов темы (обе темы), без своих hex
export const TITLEBAR_CSS = `
  .nx-titlebar-bar { position: fixed; top: 0; left: 0; right: 0; height: ${TITLEBAR_H}px; box-sizing: border-box; z-index: 2147482000; display: flex; align-items: stretch;
    background: color-mix(in srgb, var(--bg) 92%, black); border-bottom: 1px solid var(--border); color: var(--text);
    user-select: none; -webkit-user-select: none; transition: color 160ms ease; }
  .nx-titlebar-brand { display: flex; align-items: center; gap: 9px; padding: 0 14px; color: var(--logo); }
  .nx-titlebar-brand svg { display: block; }
  .nx-titlebar-gap { flex: 1; }
  .nx-titlebar-btn { all: unset; width: 46px; height: ${TITLEBAR_H}px; display: flex; align-items: center; justify-content: center; color: var(--text);
    cursor: default; transition: background-color 120ms ease, color 120ms ease; }
  .nx-titlebar-btn:hover { background: color-mix(in srgb, var(--text) 9%, transparent); }
  .nx-titlebar-btn:active { background: color-mix(in srgb, var(--text) 14%, transparent); }
  .nx-titlebar-btn.is-close:hover { background: var(--red); color: white; }
  .nx-titlebar-btn.is-close:active { background: color-mix(in srgb, var(--red) 80%, black); color: white; }
  .nx-titlebar-btn:focus-visible { outline: 2px solid var(--mint); outline-offset: -2px; }
  /* Окно не в фокусе — панель и значки приглушены */
  .nx-titlebar-bar.is-blur .nx-titlebar-btn:not(:hover), .nx-titlebar-bar.is-blur .nx-titlebar-brand { opacity: 0.45; }

  /* Интерфейс начинается под панелью: всё, что закреплено у верха окна, сдвигается на её высоту */
  html.nx-titlebar { --tb-h: ${TITLEBAR_H}px; }
  html.nx-titlebar body { padding-top: var(--tb-h); box-sizing: border-box; }
  html.nx-titlebar #root, html.nx-titlebar #root > div { min-height: calc(100vh - var(--tb-h)) !important; }
  html.nx-titlebar .ng-topbar { top: var(--tb-h) !important; }
  html.nx-titlebar .ng-sidebar { top: var(--tb-h) !important; height: calc(100vh - var(--tb-h)) !important; }
  html.nx-titlebar .ng-assistant-wrapper { top: var(--tb-h) !important; height: calc(100% - var(--tb-h)) !important; }
  html.nx-titlebar .ng-home-desktop { min-height: calc(100vh - var(--tb-h) - 98 * var(--mk)) !important; }
  html.nx-titlebar .nx-notepad-desk { height: max(340px, calc(100vh - var(--tb-h) - 303 * var(--mk))) !important; }
  html.nx-titlebar .nx-toast-host { top: calc(var(--tb-h) + 16px) !important; }
  html.nx-titlebar .nx-air.nx-glass { top: calc(var(--tb-h) + 12px) !important; }
  html.nx-titlebar .nx-photo-full, html.nx-titlebar .nx-video-full { top: var(--tb-h) !important; }
`;
