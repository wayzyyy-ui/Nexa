// Плеер видео из «Файлов» (2026-10-27): на весь экран поверх окна файла, свои кнопки в стиле NEXA
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { isNative } from "../native.js";
import { fileUrl, forgetUrl } from "../lib/files.js";
import { FILE_SCOPE } from "../lib/fileStore.js";
import { useMediaQuery } from "../lib/hooks.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, Spinner } from "./base.jsx";

// 75 → «1:15», 3725 → «1:02:05»
export const clock = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/* Плеер. Содержимое — то же, что у «Открыть»: копия на этом устройстве или ссылка облака на час.
   Кнопки: воспроизвести / пауза (и нажатие по видео), полоса времени (перетаскивается), звук,
   на весь экран (на сайте), закрыть. Клавиши: пробел — пауза, ← → — на 5 с, M — звук, Esc — закрыть.
   Панели прячутся через 2,5 с воспроизведения и появляются от движения / касания.
   Формат не открылся (часто так бывает с MOV и HEVC) — честно пишем и советуем «Скачать» */
export function VideoPlayer({ file, onClose }) {
  const [src, setSrc] = useState({ url: null, state: "loading" }); // loading | ready | error
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0, buf: 0 });
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const rootRef = useRef(null), videoRef = useRef(null), barRef = useRef(null);
  const hideTimer = useRef(0);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canFull = !isNative && typeof document !== "undefined" && !!document.fullscreenEnabled;

  useEffect(() => {
    let off = false;
    setSrc({ url: null, state: "loading" });
    fileUrl(file, FILE_SCOPE)
      .then((url) => { if (!off) setSrc(url ? { url, state: "loading" } : { url: null, state: "error" }); })
      .catch(() => { if (!off) setSrc({ url: null, state: "error" }); });
    return () => { off = true; };
  }, [file.id, retry]);

  // Панели: показать и (если идёт видео) спрятать через 2,5 с
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (videoRef.current && !videoRef.current.paused) setChrome(false); }, 2500);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    poke();
  }, [poke]);
  const seekBy = useCallback((d) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d));
    poke();
  }, [poke]);

  // Клавиши — раньше всех (capture): Esc закрывает только плеер, а не окно файла под ним
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeRef.current(); }
      else if (e.key === " " || e.key === "k" || e.key === "л") { e.stopPropagation(); e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.stopPropagation(); e.preventDefault(); seekBy(-5); }
      else if (e.key === "ArrowRight") { e.stopPropagation(); e.preventDefault(); seekBy(5); }
      else if (e.key === "m" || e.key === "ь") { e.stopPropagation(); setMuted((m) => !m); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggle, seekBy]);

  // Фокус — внутрь плеера; закрыли — выйти из полноэкранного и вернуть фокус
  useEffect(() => {
    const prev = document.activeElement;
    rootRef.current?.focus();
    const onFull = () => setIsFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      document.removeEventListener("fullscreenchange", onFull);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      prev?.focus?.();
    };
  }, []);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  // Перемотка по полосе: нажали и ведём — пальцем или мышью
  const seekAt = (clientX) => {
    const v = videoRef.current, bar = barRef.current;
    if (!v || !bar || !Number.isFinite(v.duration)) return;
    const r = bar.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * v.duration;
  };
  const onBarDown = (e) => {
    e.stopPropagation();
    barRef.current.setPointerCapture?.(e.pointerId);
    seekAt(e.clientX); poke();
    const move = (ev) => seekAt(ev.clientX);
    const up = () => { barRef.current?.removeEventListener("pointermove", move); barRef.current?.removeEventListener("pointerup", up); barRef.current?.removeEventListener("pointercancel", up); };
    barRef.current.addEventListener("pointermove", move);
    barRef.current.addEventListener("pointerup", up);
    barRef.current.addEventListener("pointercancel", up);
  };
  const onBarKey = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") return; // общий обработчик выше
    if (e.key === "Home" && videoRef.current) videoRef.current.currentTime = 0;
    if (e.key === "End" && videoRef.current && Number.isFinite(videoRef.current.duration)) videoRef.current.currentTime = videoRef.current.duration;
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const onFoldC = C.onFold;
  const pill = { ...btnReset, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: `color-mix(in srgb, ${C.photoBg} 55%, transparent)`, border: `1px solid color-mix(in srgb, ${onFoldC} 22%, transparent)` };
  const fade = { opacity: chrome ? 1 : 0, pointerEvents: chrome ? "auto" : "none", transition: reduce ? "none" : "opacity 220ms ease" };
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;
  const bufPct = time.dur ? (time.buf / time.dur) * 100 : 0;

  return createPortal(
    <div ref={rootRef} className="nx-video-full" role="dialog" aria-modal="true" aria-label={`Видео «${file.name}»`} tabIndex={-1} data-no-swipe data-no-sheet-swipe
      onClick={(e) => e.stopPropagation()} onPointerMove={poke}
      style={{ position: "fixed", inset: 0, zIndex: 800, background: C.photoBg, color: onFoldC, outline: "none", cursor: chrome ? "default" : "none" }}>
      {src.url && src.state !== "error" && (
        <video ref={videoRef} key={src.url} src={src.url} autoPlay playsInline preload="auto"
          onClick={toggle}
          onLoadedMetadata={(e) => { const dur = e.currentTarget.duration; setSrc((s) => ({ ...s, state: "ready" })); setTime((t) => ({ ...t, dur })); }}
          onTimeUpdate={(e) => { const v = e.currentTarget; setTime({ cur: v.currentTime, dur: v.duration, buf: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0 }); }}
          onProgress={(e) => { const v = e.currentTarget; if (v.buffered.length) { const buf = v.buffered.end(v.buffered.length - 1); setTime((t) => ({ ...t, buf })); } }}
          onPlay={() => { setPlaying(true); poke(); }}
          onPause={() => { setPlaying(false); setChrome(true); clearTimeout(hideTimer.current); }}
          onEnded={() => { setPlaying(false); setChrome(true); }}
          onError={() => setSrc({ url: null, state: "error" })}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: C.photoBg,
            opacity: src.state === "ready" ? 1 : 0, transition: reduce ? "none" : "opacity 180ms ease" }} />
      )}
      {src.state === "loading" && (
        <div role="status" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, opacity: 0.8 }}>
          <Spinner s={16} /> Загружаем видео…
        </div>
      )}
      {src.state === "error" && (
        <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>Видео не открылось</div>
          <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.45, marginBottom: 14, maxWidth: 340 }}>
            {navigator.onLine === false ? "Нет связи — видео лежит в облаке. Подключитесь к сети и повторите"
              : "Этот формат здесь не воспроизводится или файл повреждён. Попробуйте «Скачать» в окне файла"}
          </div>
          <button type="button" className="nx-ghost-btn" onClick={() => { forgetUrl(FILE_SCOPE, file.id); setRetry((n) => n + 1); }}
            style={{ ...btnReset, padding: "10px 18px", fontSize: 13, color: onFoldC, border: `1px solid color-mix(in srgb, ${onFoldC} 40%, transparent)` }}>
            Повторить
          </button>
        </div>
      )}

      {/* Верх: имя и «закрыть» */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", alignItems: "center", gap: 12, padding: "calc(var(--sat) + 12px) 16px 24px",
        background: `linear-gradient(${C.photoBg}, transparent)`, ...fade }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
        <button type="button" className="nx-icon-btn" onClick={() => closeRef.current()} aria-label="Закрыть видео" title="Закрыть (Esc)" style={pill}>
          {Icon.close({ c: onFoldC, s: 18 })}
        </button>
      </div>

      {/* Большая кнопка по центру — пока на паузе */}
      {src.state === "ready" && !playing && (
        <button type="button" className="nx-icon-btn nx-video-big" onClick={toggle} aria-label="Воспроизвести"
          style={{ ...pill, position: "absolute", left: "50%", top: "50%", width: 72, height: 72, margin: "-36px 0 0 -36px" }}>
          {Icon.play({ c: onFoldC, s: 30 })}
        </button>
      )}

      {/* Низ: полоса времени и кнопки */}
      {src.state === "ready" && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 16px calc(var(--sab) + 14px)",
          background: `linear-gradient(transparent, ${C.photoBg})`, ...fade }}>
          <div ref={barRef} className="nx-video-bar" role="slider" tabIndex={0} aria-label="Перемотка" aria-valuemin={0}
            aria-valuemax={Math.round(time.dur || 0)} aria-valuenow={Math.round(time.cur)} aria-valuetext={`${clock(time.cur)} из ${clock(time.dur)}`}
            onPointerDown={onBarDown} onKeyDown={onBarKey}
            style={{ position: "relative", height: 22, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 999, background: `color-mix(in srgb, ${onFoldC} 22%, transparent)` }} />
            <div style={{ position: "absolute", left: 0, width: `${bufPct}%`, height: 4, borderRadius: 999, background: `color-mix(in srgb, ${onFoldC} 35%, transparent)` }} />
            <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 4, borderRadius: 999, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.mint})` }} />
            <div style={{ position: "absolute", left: `calc(${pct}% - 7px)`, width: 14, height: 14, borderRadius: "50%", background: onFoldC }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <button type="button" className="nx-icon-btn" onClick={toggle} aria-label={playing ? "Пауза" : "Воспроизвести"} style={pill}>
              {(playing ? Icon.pause : Icon.play)({ c: onFoldC, s: 18 })}
            </button>
            <button type="button" className="nx-icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Включить звук" : "Выключить звук"} style={pill}>
              {(muted ? Icon.muted : Icon.speaker)({ c: onFoldC, s: 18 })}
            </button>
            <div style={{ flex: 1, fontSize: 13, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{clock(time.cur)} / {clock(time.dur)}</div>
            {canFull && (
              <button type="button" className="nx-icon-btn" onClick={toggleFull} aria-label={isFull ? "Выйти из полноэкранного режима" : "На весь экран"} style={pill}>
                {(isFull ? Icon.shrink : Icon.expand)({ c: onFoldC, s: 18 })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
