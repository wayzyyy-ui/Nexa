// Всплывающие уведомления (showToast → ToastHost)
import { useEffect, useRef } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset } from "./base.jsx";

/* ─── СИСТЕМНЫЕ УВЕДОМЛЕНИЯ (ТОСТЫ) ────────────────────────
   Короткая обратная связь поверх приложения: файл отправлен,
   ссылка скопирована, диалог удалён и т.п. Показываются стеком
   справа сверху, автоматически исчезают через несколько секунд.
   Вызов: onToast({ title, text }), где onToast = showToast из NexaApp. */
export function ToastHost({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="nx-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

/* Смахнуть (сенсорный экран): уведомление идёт за пальцем — вверх или в сторону — и тает; дальше порога
   (вверх 40 px, вбок 80 px) или быстро — улетает, остальные плавно занимают его место, потом закрывается;
   иначе возвращается на место. Крестик работает как раньше.
   Обычные addEventListener (passive) — прокрутка и нажатия на кнопки не страдают */
function useSwipeUp(ref, onClose) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    let s = null;
    const back = () => {
      el.style.transition = "transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 200ms ease";
      el.style.transform = ""; el.style.opacity = "";
    };
    const down = (e) => { if (e.touches.length === 1) s = { y: e.touches[0].clientY, x: e.touches[0].clientX, at: performance.now(), dy: 0, dx: 0, axis: null }; };
    const move = (e) => {
      if (!s) return;
      const dy = e.touches[0].clientY - s.y, dx = e.touches[0].clientX - s.x;
      if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (!s.axis) return;
      s.dy = dy; s.dx = dx;
      if (still()) return;
      el.style.transition = "none";
      if (s.axis === "x") {
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
      } else {
        // Вверх — за пальцем; вниз — чуть-чуть, как пружина
        el.style.transform = `translateY(${dy < 0 ? dy : dy * 0.2}px)`;
        el.style.opacity = String(dy < 0 ? Math.max(0.2, 1 + dy / 140) : 1);
      }
    };
    const up = (e) => {
      if (!s) return;
      const { dy, dx, at, axis } = s; s = null;
      if (!axis) return;
      const v = (axis === "x" ? Math.abs(dx) : -dy) / Math.max(1, performance.now() - at);
      const dist = axis === "x" ? Math.abs(dx) : -dy;
      const gone = e?.type !== "touchcancel" && (dist > (axis === "x" ? 80 : 40) || (dist > 20 && v > 0.5));
      if (!gone) { back(); return; }
      if (still()) { close.current(); return; }
      // Улетает, затем схлопывается по высоте — соседние уведомления съезжают на его место
      const out = axis === "x" ? `translateX(${dx > 0 ? "" : "-"}120%)` : "translateY(-120%)";
      el.style.transition = "transform 180ms ease-in, opacity 180ms ease-in";
      el.style.transform = out; el.style.opacity = "0";
      setTimeout(() => {
        el.style.pointerEvents = "none"; el.style.overflow = "hidden";
        el.style.height = el.offsetHeight + "px";
        void el.offsetHeight;
        el.style.transition = "height 200ms ease, padding 200ms ease, margin-bottom 200ms ease, border-width 200ms ease";
        el.style.height = "0px"; el.style.paddingTop = "0px"; el.style.paddingBottom = "0px"; el.style.marginBottom = "-10px"; el.style.borderWidth = "0px";
        setTimeout(() => close.current(), 200);
      }, 170);
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, [ref]);
}

export function ToastItem({ toast, onClose }) {
  const ref = useRef(null);
  useSwipeUp(ref, onClose);
  return (
    // data-no-swipe — жест по уведомлению не листает разделы
    <div ref={ref} className="nx-toast" role="status" data-no-swipe>
      <div className="nx-toast-icon">
        {Icon.sparkle({ c: C.mint, s: 16 })}
      </div>
      <div className="nx-toast-body">
        <div className="nx-toast-title">{toast.title}</div>
        {toast.text && <div className="nx-toast-text">{toast.text}</div>}
        {toast.action && (
          <button type="button" className="nx-ghost-btn" onClick={() => { toast.action.onClick(); onClose(); }} style={{
            ...btnReset, marginTop: 8, padding: "5px 12px", fontSize: 13, borderRadius: 999,
            border: `1px solid ${C.borderStrong}`, color: C.text,
          }}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="nx-toast-close" onClick={onClose} aria-label="Закрыть">
        {Icon.close({ c: C.muted, s: 14 })}
      </button>
    </div>
  );
}
