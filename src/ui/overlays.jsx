// Экраны поверх всего: «NEXA заблокирована» и «Устройство ищут», кнопка «Найти»
import { useRef, useEffect } from "react";
import { vibrate } from "../native.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, Spinner } from "./base.jsx";

/* ═══ ДЕМОНСТРАЦИОННАЯ БЛОКИРОВКА ЭКРАНА ══════════════════════
   Закрывает только интерфейс NEXA на этом устройстве. Это не системная
   блокировка телефона — так и написано на экране */
// data-nx-noback — «Назад» блокировку не закрывает (см. src/lib/router.js)
export function LockOverlay({ from, onUnlock }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nx-lock-title" data-nx-noback style={{
      position: "fixed", inset: 0, zIndex: 940, background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "calc(var(--sat) + 24px) 24px calc(var(--sab) + 24px)",
    }}>
      <span className="nx-pop" style={{ width: 64, height: 64, borderRadius: 10, border: `1px solid ${C.borderStrong}`, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 30 }}>
        <span style={{ transform: "rotate(-45deg)", display: "flex" }}>{Icon.lock({ c: C.mint, s: 26 })}</span>
      </span>
      <div id="nx-lock-title" className="ng-display" style={{ fontSize: 30, lineHeight: 1.15 }}>NEXA заблокирована</div>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 10, maxWidth: 340, lineHeight: 1.5 }}>
        Заблокировали с устройства «{from}».
      </div>
      <button type="button" className="nx-primary" onClick={onUnlock} autoFocus style={{
        ...btnReset, marginTop: 28, padding: "14px 40px", fontSize: 16, fontWeight: 500, borderRadius: 999,
        border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
      }}>
        Разблокировать
      </button>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 18, maxWidth: 320, lineHeight: 1.5 }}>
        Это демонстрация: закрыт только экран NEXA, телефон не заблокирован и данные не защищены.
      </div>
    </div>
  );
}

/* ═══ НАЙТИ УСТРОЙСТВО ════════════════════════════════════════ */
export const FIND_RING_MS = 60 * 1000; // сигнал сам выключается через минуту

// Кнопка «Найти» на карточке реального устройства и её состояния
export function FindChip({ state, onClick, compact, style }) {
  const look = {
    ringing: { text: "Ищем…", color: C.text, icon: <Spinner s={11} /> },
    found: { text: "Нашлось", color: C.green, icon: Icon.check({ c: C.green, s: 13 }) },
    timeout: { text: "Не ответило", color: C.mutedSoft, icon: null },
  }[state] || { text: "Найти", color: C.text, icon: Icon.search({ c: C.text, s: 13 }) };
  return (
    <button type="button" className="nx-ghost-btn" onClick={onClick} disabled={state === "ringing"}
      aria-label={state ? look.text : "Найти устройство"}
      style={{
        ...btnReset, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        padding: compact ? "4px 9px" : "6px 12px", fontSize: compact ? 11.5 : 12.5, borderRadius: 999,
        border: `1px solid ${C.borderStrong}`, color: look.color, background: C.bg, ...style,
      }}>
      {look.icon}{compact && !state ? null : null}{look.text}
    </button>
  );
}

/* Экран «Устройство ищут» поверх всего: вибрация, тихий повторяющийся
   сигнал (Web Audio) и большая кнопка «Нашёл». Сам выключается через минуту.
   Браузер может не разрешить звук без нажатия — тогда просто без звука */
export function FindOverlay({ from, onFound, onTimeout }) {
  const found = useRef(onFound); found.current = onFound;
  const timeout = useRef(onTimeout); timeout.current = onTimeout;
  useEffect(() => {
    let ctx = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { ctx = new AC(); ctx.resume?.().catch(() => {}); }
    } catch {}
    const beep = () => {
      vibrate(400);
      if (!ctx || ctx.state !== "running") return;
      try {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.3);
      } catch {}
    };
    beep();
    const tick = setInterval(beep, 1500);
    const stop = setTimeout(() => timeout.current?.(), FIND_RING_MS);
    const onKey = (e) => { if (e.key === "Escape") found.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(tick); clearTimeout(stop);
      window.removeEventListener("keydown", onKey);
      try { navigator.vibrate?.(0); } catch {}
      ctx?.close?.().catch(() => {});
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nx-find-title" className="nx-find-overlay" style={{
      position: "fixed", inset: 0, zIndex: 950, background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "calc(var(--sat) + 24px) 24px calc(var(--sab) + 24px)",
    }}>
      {/* Расходящиеся квадратные волны — «сигнал»; при reduced motion неподвижны */}
      <div aria-hidden="true" style={{ position: "relative", width: 150, height: 150, marginBottom: 36 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="nx-find-wave" style={{
            position: "absolute", inset: 0, border: `1px solid ${C.mint}`, borderRadius: 10,
            transform: "rotate(45deg)", animationDelay: `${i * 600}ms`,
          }} />
        ))}
        <span style={{ position: "absolute", inset: 46, border: `1px solid ${C.mint}`, borderRadius: 10, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "rotate(-45deg)", display: "flex" }}>{Icon.search({ c: C.mint, s: 24 })}</span>
        </span>
      </div>
      <div id="nx-find-title" className="ng-display" style={{ fontSize: 30, lineHeight: 1.15 }}>Устройство ищут</div>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 10, maxWidth: 320, lineHeight: 1.5 }}>
        Вас зовёт «{from}». Нажмите, когда найдёте — сигнал выключится.
      </div>
      <button type="button" className="nx-primary" onClick={() => found.current?.()} autoFocus style={{
        ...btnReset, marginTop: 30, padding: "16px 48px", fontSize: 17, fontWeight: 500, borderRadius: 999,
        border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        display: "inline-flex", alignItems: "center", gap: 10,
      }}>
        {Icon.check({ c: C.onFold, s: 18 })} Нашёл
      </button>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 16 }}>Сигнал выключится сам через минуту</div>
    </div>
  );
}
