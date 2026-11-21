import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C } from "../../ui/theme.js";

// Меню живёт поверх прокручиваемых карточек и учитывает доступную высоту над клавиатурой.
export function NoteMenu({ anchorRef, menuRef, width = 220, label, children }) {
  const fallback = useRef(null);
  const box = menuRef || fallback;
  useLayoutEffect(() => {
    const el = box.current, anchor = anchorRef.current;
    if (!el || !anchor) return;
    const viewport = window.visualViewport;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const y = viewport?.offsetTop || 0, x = viewport?.offsetLeft || 0;
      const bottom = y + (viewport?.height || window.innerHeight) - 8;
      const right = x + (viewport?.width || window.innerWidth) - 8;
      const below = bottom - r.bottom - 6, above = r.top - y - 14;
      const up = below < el.scrollHeight && above > below;
      el.style.maxHeight = Math.max(40, up ? above : below) + "px";
      el.style.left = Math.max(x + 8, Math.min(r.right, right) - el.offsetWidth) + "px";
      el.style.top = (up ? Math.max(y + 8, r.top - el.offsetHeight - 6) : Math.max(y + 8, r.bottom + 6)) + "px";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [anchorRef, box]);
  return createPortal(
    <div ref={box} role="menu" aria-label={label} data-no-swipe className="nx-scroll" style={{
      position: "fixed", zIndex: 420, width, maxWidth: "calc(100vw - 16px)", padding: 6, boxSizing: "border-box",
      overflowY: "auto", overscrollBehavior: "contain", background: C.panel, color: C.text,
      border: `1px solid ${C.borderStrong}`, borderRadius: 18, boxShadow: `0 12px 32px color-mix(in srgb, ${C.bg} 60%, transparent)`,
    }}>{children}</div>, document.body);
}
