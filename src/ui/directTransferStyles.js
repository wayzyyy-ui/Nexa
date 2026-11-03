import { PHONE_MQ } from "./theme.js";

export const DIRECT_TRANSFER_CSS = `
.nx-transfer-host { position: fixed; top: calc(var(--sat) + var(--tb-h, 0px) + 18px); right: 24px; z-index: 760; width: min(430px, calc(100vw - 32px)); max-height: calc(100dvh - var(--sat) - var(--sab) - var(--tb-h, 0px) - 40px); overflow-y: auto; display: grid; gap: 14px; overscroll-behavior: contain; }
.nx-transfer-card { border: 1px solid var(--line-bright); border-radius: 28px; background: var(--bg); color: var(--text); padding: 20px; box-shadow: 0 12px 40px color-mix(in srgb, var(--bg) 35%, transparent); animation: nx-transfer-appear 300ms ease-out both; }
.nx-transfer-heading { display: flex; align-items: center; gap: 10px; }
.nx-transfer-heading > div { flex: 1; min-width: 0; }
.nx-transfer-heading h2 { font-size: 18px; font-weight: 650; margin: 4px 0; line-height: 1.25; }
.nx-transfer-heading .nx-icon-btn { width: 40px; height: 40px; flex-shrink: 0; }
.nx-transfer-eyebrow { font-size: 10px; letter-spacing: 0.08em; color: var(--mint); }
.nx-transfer-peer { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.nx-transfer-fold { width: 78px; height: 60px; flex-shrink: 0; overflow: visible; }
.is-asking .nx-transfer-fold { animation: nx-transfer-fold-in 350ms ease-out both; }
.nx-transfer-plane { transform-box: view-box; transform-origin: 50% 75%; transition: transform 300ms ease, opacity 300ms ease; }
.nx-transfer-plane.is-left { transform: translateX(calc(var(--unfold) * -12px)) rotate(calc(var(--unfold) * -14deg)); }
.nx-transfer-plane.is-right { transform: translateX(calc(var(--unfold) * 12px)) rotate(calc(var(--unfold) * 14deg)); }
.nx-transfer-plane.is-bottom { opacity: calc(0.2 + var(--unfold) * 0.6); }
.nx-transfer-crease { opacity: 0.3; stroke-dasharray: 20 80; }
.is-receiving .nx-transfer-crease, .is-sending .nx-transfer-crease { opacity: 1; animation: nx-transfer-light 1800ms linear infinite; }
.is-done .nx-transfer-plane { transition-duration: 500ms; }
.is-done .nx-transfer-crease { opacity: 1; stroke-dasharray: none; }
.nx-transfer-summary { margin: 12px 0 8px; font-size: 12px; color: var(--muted); }
.nx-transfer-hint { margin: 10px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
.nx-transfer-files { padding: 0; margin: 10px 0; max-height: 190px; overflow-y: auto; list-style: none; }
.nx-transfer-files li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.nx-transfer-files li:last-child { border-bottom: none; }
.nx-transfer-file-name { flex: 1; min-width: 0; }
.nx-transfer-file-name > span { display: block; font-size: 13px; overflow-wrap: anywhere; }
.nx-transfer-file-name small { color: var(--muted); font-size: 11px; }
.nx-transfer-preview, .nx-transfer-file-icon { width: 46px; height: 46px; flex-shrink: 0; border-radius: 12px; object-fit: cover; display: flex; align-items: center; justify-content: center; background: var(--panel); }
.nx-transfer-progress { margin-top: 12px; height: 4px; border-radius: 999px; background: var(--border); overflow: hidden; }
.nx-transfer-progress > span { display: block; width: 100%; height: 100%; transform-origin: left; background: var(--mint); transition: transform 200ms linear; }
.nx-transfer-meter { display: flex; justify-content: space-between; gap: 10px; margin-top: 7px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.nx-transfer-status { font-size: 12px; color: var(--muted); margin-top: 10px; }
.is-failed .nx-transfer-status { color: var(--red); }
.is-done .nx-transfer-status { color: var(--green); }
.nx-transfer-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.nx-transfer-card :is(.nx-primary, .nx-ghost-btn) { font: inherit; font-size: 12px; min-height: 40px; padding: 8px 14px; cursor: pointer; border: 1px solid var(--border-strong); color: var(--text); background: transparent; }
.nx-transfer-card .nx-primary { background: var(--mint); color: var(--on-accent); border-color: transparent; }
.nx-transfer-card button:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
.is-received { animation: nx-transfer-reveal 500ms ease-out both; }
@keyframes nx-transfer-appear { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes nx-transfer-fold-in { from { opacity: 0; transform: perspective(240px) rotateY(55deg) scale(0.6); } to { opacity: 1; transform: perspective(240px) rotateY(0) scale(1); } }
@keyframes nx-transfer-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes nx-transfer-light { from { stroke-dashoffset: 90; } to { stroke-dashoffset: -10; } }
@media ${PHONE_MQ} { .nx-transfer-host { right: 16px; top: calc(var(--sat) + 12px); max-height: calc(100dvh - var(--sat) - var(--sab) - 100px); } .nx-transfer-card { padding: 16px; border-radius: 24px; } .nx-transfer-card :is(.nx-primary, .nx-ghost-btn) { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .nx-transfer-card, .nx-transfer-card *, .nx-transfer-card *::before { animation: none !important; transition: none !important; } }
`;
