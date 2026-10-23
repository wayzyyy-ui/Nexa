// Передача файла «как по воздуху»: плашка сверху экрана у отправителя и у получателя.
// Отправка: файл слева «перелетает» по дуге к устройству справа, вокруг устройства — кольцо
// настоящего процента загрузки, в конце — галочка. Приём: карточка опускается сверху,
// файл «прилетает» от устройства-отправителя, «Открыть» / крестик.
// Сама передача — прежняя (облако аккаунта + событие file.send), здесь только показ.
// Смахивается вверх, закрывается по Esc; при «уменьшении движения» — без полёта и сдвигов.
import { useEffect, useRef, useState } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset } from "./base.jsx";

const DEVICE_ICON = { phone: Icon.phone, tablet: Icon.tablet, laptop: Icon.laptop, desktop: Icon.desktop, watch: Icon.watch, buds: Icon.buds, tv: Icon.tv };
const devIcon = (type, p) => (DEVICE_ICON[type] || Icon.phone)(p);
// Значок по типу файла (без брендов): картинка, видео, музыка, остальное — документ
const fileIcon = (mime = "", p) => (/^image\//.test(mime) ? Icon.image : /^video\//.test(mime) ? Icon.video : /^audio\//.test(mime) ? Icon.music : Icon.doc)(p);

// Кольцо процента вокруг устройства (SVG, stroke-dashoffset)
function Ring({ value, done, error }) {
  const r = 25, len = 2 * Math.PI * r;
  return (
    <svg className="nx-air-ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" stroke={C.border} strokeWidth="2" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={error ? C.red : done ? C.green : C.mint} strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={len} strokeDashoffset={len * (1 - Math.max(0.02, Math.min(1, value)))} transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dashoffset 260ms linear, stroke 200ms ease" }} />
    </svg>
  );
}

/* drop — { kind: "send", devName, devType, name, mime } + st = { state: uploading|done|error, progress, error }
          | { kind: "in", fromName, fromType, name, mime, size, onOpen }
            (с st — приём «Рядом» с ходом: { state: receiving|done|error, progress, error })
   drop.actions — свои кнопки после конца [{ label, run, primary }]; drop.doneText — подпись после приёма;
   drop.onCancel — крестик, пока идёт передача (отменить);
   onClose — убрать плашку */
export function DropBanner({ drop, st, onClose }) {
  const ref = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const close = useRef(onClose); close.current = onClose;
  const leave = () => { setLeaving(true); setTimeout(() => close.current(), 220); };
  const leaveRef = useRef(leave); leaveRef.current = leave;
  const send = drop.kind === "send";
  const recv = !send && !!st; // приём «Рядом»: с ходом и итогом
  const state = st?.state || (send ? "uploading" : "in");
  const done = state === "done", error = state === "error";
  const busy = (send || recv) && !done && !error;

  // Сама уходит: доставлено — через 2,4 с, принято «Рядом» — через 15 с, файл через облако — через 9 с;
  // пока идёт передача и при ошибке — висит, пока не закроют
  useEffect(() => {
    if (error || busy) return;
    const t = setTimeout(() => leaveRef.current(), send ? 2400 : recv ? 15000 : 9000);
    return () => clearTimeout(t);
  }, [send, recv, busy, error]);

  // Esc и смахивание вверх
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = (e) => { if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) { e.stopPropagation(); leaveRef.current(); } };
    let s = null;
    const down = (e) => { if (e.touches.length === 1 && !e.target.closest("button")) s = { y: e.touches[0].clientY, at: performance.now(), dy: 0 }; };
    const move = (e) => {
      if (!s) return;
      s.dy = Math.min(0, e.touches[0].clientY - s.y);
      el.style.transition = "none";
      el.style.transform = `translate(-50%, ${s.dy}px)`;
      el.style.opacity = String(Math.max(0.2, 1 + s.dy / 140));
    };
    const up = () => {
      if (!s) return;
      const { dy, at } = s; s = null;
      el.style.transition = ""; el.style.transform = ""; el.style.opacity = "";
      if (dy < -40 || (dy < -16 && -dy / (performance.now() - at) > 0.5)) leaveRef.current();
    };
    window.addEventListener("keydown", key);
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });
    return () => {
      window.removeEventListener("keydown", key);
      el.removeEventListener("touchstart", down); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up); el.removeEventListener("touchcancel", up);
    };
  }, []);

  const pct = Math.round((st?.progress || 0) * 100);
  const title = send
    ? (error ? "Не отправлено" : done ? "Доставлено" : pct >= 100 ? "Передаём…" : `Отправляем · ${pct}%`)
    : recv ? (error ? "Не принято" : done ? "Получено" : `Принимаем · ${pct}%`)
    : "Файл для вас";
  const sub = error ? st?.error || "Попробуйте ещё раз"
    : send ? `«${drop.name}» → «${drop.devName}»`
    : done && drop.doneText ? `«${drop.name}» · ${drop.doneText}`
    : `«${drop.name}» от «${drop.fromName}»`;
  const flying = send || recv ? busy : true;
  const actions = drop.actions && !busy && !error ? drop.actions : null;

  return (
    <div ref={ref} role={error ? "alert" : "status"} aria-live="polite" data-no-swipe
      className={`nx-air nx-glass nx-glass-prominent ${send ? "is-send" : "is-in"}${recv ? " is-recv" : ""}${done ? " is-done" : ""}${error ? " is-error" : ""}${leaving ? " is-leaving" : ""}`}>
      {/* Сцена: файл ↔ дуга ↔ устройство */}
      <div className="nx-air-scene" aria-hidden="true">
        <div className="nx-air-node nx-air-left">
          {send ? fileIcon(drop.mime, { c: C.text, s: 18 }) : devIcon(drop.fromType, { c: C.text, s: 18 })}
        </div>
        <svg className="nx-air-arc" viewBox="0 0 100 24" preserveAspectRatio="none">
          <path d="M2 20 Q50 -8 98 20" fill="none" stroke={C.borderStrong} strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        </svg>
        {flying && <div className="nx-air-chip">{fileIcon(drop.mime, { c: C.onFold, s: 11 })}</div>}
        <div className="nx-air-node nx-air-right">
          {(send || recv) && <Ring value={done ? 1 : st?.progress || 0} done={done} error={error} />}
          {done && (send || recv) ? Icon.check({ c: C.green, s: 18 })
            : error ? Icon.alert({ c: C.red, s: 18 })
            : send ? devIcon(drop.devType, { c: C.text, s: 18 })
            : fileIcon(drop.mime, { c: C.mint, s: 18 })}
        </div>
      </div>
      <div className="nx-air-text">
        <div className="nx-air-title">{title}</div>
        <div className="nx-air-sub">{sub}</div>
      </div>
      <div className="nx-air-actions">
        {actions && actions.map((a) => (
          <button key={a.label} type="button" className={a.primary ? "nx-primary" : "nx-ghost-btn"} onClick={() => { a.run(); if (a.primary) leave(); }}
            style={{ ...btnReset, padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
              ...(a.primary ? { color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` } : { color: C.text, border: `1px solid ${C.borderStrong}` }) }}>
            {a.label}
          </button>
        ))}
        {!send && !recv && drop.onOpen && (
          <button type="button" className="nx-primary" onClick={() => { drop.onOpen(); leave(); }}
            style={{ ...btnReset, padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>
            Открыть
          </button>
        )}
        <button type="button" className="nx-icon-btn" onClick={() => { if (busy && drop.onCancel) drop.onCancel(); leave(); }} aria-label={busy && drop.onCancel ? "Отменить" : "Закрыть"}
          style={{ ...btnReset, width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon.close({ c: C.muted, s: 13 })}
        </button>
      </div>
    </div>
  );
}
