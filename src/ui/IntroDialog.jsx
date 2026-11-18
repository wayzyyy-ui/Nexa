// Общая оболочка приветствия и добровольного участия в обучении.
import { useEffect, useRef } from "react";
import { C, PHONE_MQ } from "./theme.js";
import { Icon } from "./icons.jsx";

const CSS = `
.nx-intro-wrap { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; overscroll-behavior: contain;
  padding: calc(20px + var(--sat)) 20px calc(20px + var(--sab)); box-sizing: border-box;
  background: color-mix(in srgb, var(--bg) 78%, transparent); }
.nx-intro-dialog { position: relative; width: min(520px, 100%); max-height: calc(100dvh - 40px - var(--sat) - var(--sab)); overflow-y: auto;
  box-sizing: border-box; padding: 28px; border-radius: 24px; border: 1px solid var(--surface-line);
  background: var(--panel); color: var(--text); text-align: left; }
.nx-intro-dialog h2 { font: inherit; color: var(--text); font-size: 22px; font-weight: 700; line-height: 1.3; margin: 16px 24px 18px 0; }
.nx-intro-dialog p { font-size: 14px; line-height: 1.6; margin: 12px 0; color: var(--muted); }
.nx-intro-dialog a { color: var(--text); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
.nx-intro-close { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; display: grid; place-items: center;
  border: 0; background: transparent; cursor: pointer; border-radius: 50%; }
.nx-intro-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.nx-intro-actions button { min-height: 44px; padding: 10px 20px; border-radius: 999px; font: inherit; font-size: 14px; cursor: pointer;
  border: 1px solid var(--surface-line); color: var(--text); background: transparent; }
.nx-intro-actions .nx-primary { background: var(--mint); color: var(--on-accent); border-color: transparent; }
.nx-intro-dialog details { font-size: 12px; line-height: 1.5; color: var(--muted); margin-top: 16px; }
.nx-intro-dialog summary { cursor: pointer; color: var(--text); padding: 5px 0; }
.nx-intro-dialog details p { font-size: 12px; }
.nx-intro-dialog :focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
@media ${PHONE_MQ} { .nx-intro-wrap { padding-left: 16px; padding-right: 16px; } .nx-intro-dialog { padding: 22px; } .nx-intro-dialog h2 { font-size: 20px; } }
`;

export function IntroDialog({ title, onClose, children, actions }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    el.querySelector("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const focusable = [...el.querySelectorAll('button, a[href], summary, [tabindex="0"]')].filter((n) => n.getClientRects().length && !n.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (!el.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first)?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="nx-intro-wrap" onClick={onClose}>
    <style>{CSS}</style>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="nx-intro-dialog nx-scroll" data-no-swipe onClick={(e) => e.stopPropagation()}>
      <button type="button" className="nx-intro-close" aria-label="Закрыть" onClick={onClose}>{Icon.close({ c: C.muted, s: 16 })}</button>
      {Icon.sparkle({ c: C.mint, s: 28 })}
      <h2>{title}</h2>
      {children}
      <div className="nx-intro-actions">{actions}</div>
    </section>
  </div>;
}
