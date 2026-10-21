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

/* Смахнуть вверх (сенсорный экран): уведомление идёт за пальцем вверх и тает; провели больше 40 px
   или быстро — улетает и закрывается, иначе возвращается. Крестик работает как раньше.
   Обычные addEventListener (passive) — прокрутка и нажатия на кнопки не страдают */
function useSwipeUp(ref, onClose) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    let s = null;
    const down = (e) => { if (e.touches.length === 1) s = { y: e.touches[0].clientY, x: e.touches[0].clientX, at: performance.now(), dy: 0 }; };
    const move = (e) => {
      if (!s) return;
      const dy = e.touches[0].clientY - s.y, dx = e.touches[0].clientX - s.x;
      if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10) { s = null; el.style.transform = ""; el.style.opacity = ""; return; }
      s.dy = dy;
      if (still()) return;
      // Вверх — за пальцем; вниз — чуть-чуть, как пружина
      const y = dy < 0 ? dy : dy * 0.2;
      el.style.transition = "none";
      el.style.transform = `translateY(${y}px)`;
      el.style.opacity = String(dy < 0 ? Math.max(0.2, 1 + dy / 140) : 1);
    };
    const up = () => {
      if (!s) return;
      const { dy, at } = s; s = null;
      const fast = dy < -20 && -dy / (performance.now() - at) > 0.5;
      if (dy < -40 || fast) {
        if (still()) { close.current(); return; }
        el.style.transition = "transform 180ms ease-in, opacity 180ms ease-in";
        el.style.transform = "translateY(-120%)";
        el.style.opacity = "0";
        setTimeout(() => close.current(), 170);
      } else {
        el.style.transition = "transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 200ms ease";
        el.style.transform = "";
        el.style.opacity = "";
      }
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
