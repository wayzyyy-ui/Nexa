// Окно «Добавить устройство»: код и QR, ввод кода, статус подключения
import { useState, useEffect, useRef } from "react";
import { C, fontDisplay } from "./theme.js";
import { Icon } from "./icons.jsx";
import { mmss } from "../lib/format.js";
import { pairUrl, PAIR_TTL_MS } from "../lib/pairing.js";
import { btnReset, StateNote, SkewTag, QrCode, Spinner } from "./base.jsx";
import { BtEntry } from "./bluetooth.jsx";

/* Окно «Подключить устройство» на устройстве, которое выдаёт код.
   session — { code, expiresAt, used, lockedUntil } (живёт в NexaApp) */
// onClaim — ввели код с другого экрана; onScan — сканировать QR (только в приложении)
export function PairModal({ session, online, onNewCode, onClose, onClaim, onScan, onBt }) {
  const [mode, setModeNow] = useState("show"); // "show" — показать код, "enter" — ввести чужой
  const [slide, setSlide] = useState(null);    // откуда въезжает содержимое при смене вкладки
  const setMode = (m) => { if (m === mode) return; setSlide(m === "enter" ? "right" : "left"); setModeNow(m); };
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  const left = session ? session.expiresAt - now : 0;
  const expired = !session || left <= 0;
  const locked = session && session.lockedUntil > now;
  const step = (n, text) => (
    <li style={{ display: "flex", gap: 10, fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.text, marginTop: 1 }}>{n}</span>
      <span>{text}</span>
    </li>
  );
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      // Фон под окном «Добавить устройство» слегка размыт (разрешённое исключение)
      background: `color-mix(in srgb, ${C.bg} 55%, transparent)`,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-pair-title" className="nx-viewer-panel nx-pop nx-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18,
          boxSizing: "border-box", textAlign: "left", padding: "20px 22px 22px",
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-pair-title" style={{ fontFamily: fontDisplay, fontSize: 24, lineHeight: 1.15 }}>Подключить устройство</div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>Проще всего — войдите в ту же почту на другом устройстве: оно появится в списке само. Код ниже — если там уже выполнен вход</div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Два направления: это устройство показывает код или вводит чужой */}
        <div role="tablist" aria-label="Способ подключения" className="nx-seg" style={{ position: "relative", display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", marginTop: 18 }}>
          {/* Подсветка выбранной вкладки — одна плашка, переезжает при переключении */}
          <span aria-hidden="true" className="nx-seg-thumb" style={{
            position: "absolute", top: 0, bottom: 0, left: 0, width: "50%", borderRadius: 999,
            background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
            transform: mode === "enter" ? "translateX(100%)" : "none",
          }} />
          {[["show", "Показать код"], ["enter", "У меня есть код"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} style={{
              ...btnReset, position: "relative", flex: 1, padding: "9px 14px", fontSize: 13, whiteSpace: "nowrap", textAlign: "center",
              background: "transparent", transition: "color 200ms ease",
              color: mode === id ? C.onAccent : C.muted, fontWeight: mode === id ? 500 : 400,
            }}>{label}</button>
          ))}
        </div>
        <div key={mode} className={slide ? `nx-tab-in-${slide}` : undefined}>

        {!online ? (
          <div style={{ marginTop: 18 }}>
            <StateNote kind="error">Нет связи — подключение по коду сейчас недоступно. Проверьте интернет.</StateNote>
          </div>
        ) : mode === "enter" ? (
          <div style={{ marginTop: 4 }}>
            <PairCodeForm onClaim={(code) => { onClaim?.(code); onClose(); }} />
            {onScan && (
              <button type="button" className="nx-ghost-btn" onClick={() => { onClose(); onScan(); }} style={{
                ...btnReset, marginTop: 12, width: "100%", padding: "11px 16px", fontSize: 14, borderRadius: 999,
                border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {Icon.search({ c: C.text, s: 15 })} Сканировать QR с другого экрана
              </button>
            )}
          </div>
        ) : (
          <div className="nx-pair-body" style={{ display: "flex", gap: 20, marginTop: 20, alignItems: "stretch" }}>
            {/* QR ведёт на сайт с ?pair=КОД — камера телефона откроет его сама */}
            <div style={{ flexShrink: 0 }}>
              <SkewTag>Камерой телефона</SkewTag>
              <div style={{ marginTop: 10, opacity: expired || locked ? 0.25 : 1, transition: "opacity 200ms ease" }}>
                {session && <QrCode text={pairUrl(session.code)} size={164} radius={0} label="QR-код для подключения устройства" />}
              </div>
            </div>
            {/* Тонкая вертикальная грань между способами */}
            <div className="nx-pair-or" aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.mutedSoft, fontSize: 12 }}>
              <span style={{ flex: 1, width: 1, background: C.border }} />или<span style={{ flex: 1, width: 1, background: C.border }} />
            </div>
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
              <SkewTag active={false} style={{ alignSelf: "flex-start" }}>Кодом вручную</SkewTag>
              {/* Код по клеткам — как поле ввода на другом устройстве */}
              <div aria-label="Код подключения" style={{ display: "flex", gap: 5, marginTop: 14, userSelect: "all" }}>
                {(session?.code || "").split("").map((ch, i) => (
                  <span key={i} style={{
                    width: 34, height: 46, flexShrink: 0, boxSizing: "border-box",
                    border: `1px solid ${expired || locked ? C.border : C.borderStrong}`, borderRadius: 10,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontDisplay, fontSize: 22, color: expired || locked ? C.mutedSoft : C.text,
                    background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`,
                  }}>{ch}</span>
                ))}
              </div>
              {/* Сколько осталось: полоса тает вместе со временем */}
              <div aria-hidden="true" style={{ height: 3, marginTop: 14, background: `color-mix(in srgb, ${C.text} 8%, transparent)` }}>
                <div style={{
                  height: "100%", width: `${expired || locked ? 0 : Math.max(0, Math.min(100, (left / PAIR_TTL_MS) * 100))}%`,
                  background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, transition: "width 500ms linear",
                }} />
              </div>
              <div role="status" style={{ fontSize: 13, marginTop: 8, color: locked || expired ? C.red : C.muted }}>
                {locked ? `Много неверных попыток. Снова через ${mmss(session.lockedUntil - now)}`
                  : expired ? "Код истёк"
                  : <>Действует ещё <span style={{ fontFamily: fontDisplay, color: C.text }}>{mmss(left)}</span></>}
              </div>
              {(expired || locked) && (
                <button type="button" className="nx-primary" onClick={onNewCode} style={{
                  ...btnReset, marginTop: 12, alignSelf: "flex-start", padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 999,
                  border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  {Icon.refresh({ c: C.onFold, s: 14 })} Новый код
                </button>
              )}
            </div>
          </div>
        )}

        {mode === "show" && (
          <ol style={{ listStyle: "none", margin: "20px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {step(1, "Наведите камеру телефона на QR — откроется NEXA, останется войти и подтвердить")}
            {step(2, "Или на другом устройстве: «Добавить устройство» → «У меня есть код»")}
          </ol>
        )}
        </div>

        <BtEntry onOpen={onBt} />
      </div>
    </div>
  );
}

/* Окно на подключаемом устройстве: «Подключаем…» → «Подключено» или ошибка.
   claim — { phase: "waiting" | "ok" | "error", text } */
export function PairStatusDialog({ claim, onClose }) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const ok = claim.phase === "ok", waiting = claim.phase === "waiting";
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 320, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-claim-title" className="nx-viewer-panel nx-pop" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(380px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18, padding: "22px 22px 20px", boxSizing: "border-box", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <span style={{ width: 48, height: 48, borderRadius: 10, transform: "rotate(45deg)", border: `1px solid ${ok ? C.green : waiting ? C.mint : C.red}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ transform: "rotate(-45deg)", display: "flex" }}>
              {waiting ? <Spinner s={18} /> : ok ? Icon.check({ c: C.green, s: 20 }) : Icon.alert({ c: C.red, s: 20 })}
            </span>
          </span>
        </div>
        <div id="nx-claim-title" style={{ fontFamily: fontDisplay, fontSize: 22 }}>{waiting ? "Подключаем…" : ok ? "Подключено" : "Не получилось"}</div>
        <div role="status" style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {waiting ? "Проверяем код на другом устройстве" : ok ? "Это устройство теперь в списке ваших устройств" : claim.text}
        </div>
        <button type="button" className="nx-ghost-btn" onClick={onClose} style={{
          ...btnReset, marginTop: 18, padding: "9px 22px", fontSize: 14, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text,
        }}>
          {waiting ? "Скрыть" : ok ? "Готово" : "Закрыть"}
        </button>
      </div>
    </div>
  );
}

// Ввод кода с другого экрана (внизу колонки «Онлайн» в «Связи устройств»)
export function PairCodeForm({ onClaim }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (clean.length === 6) { onClaim(clean); setCode(""); } }}
      style={{ marginTop: 16 }}>
      <label htmlFor="nx-pair-code" style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 3 }}>Подключить по коду</label>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginBottom: 10, lineHeight: 1.4 }}>Код — на экране другого устройства: «Добавить устройство» → «Показать код»</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="nx-pair-code" className="nx-input" value={clean} onChange={(e) => setCode(e.target.value)}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="······"
          style={{
            flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: fontDisplay, fontSize: 19,
            letterSpacing: "0.32em", textAlign: "center", textTransform: "uppercase",
            border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "8px 10px", outline: "none",
          }} />
        <button type="submit" className={clean.length === 6 ? "nx-primary" : "nx-ghost-btn"} disabled={clean.length !== 6} style={{
          ...btnReset, flexShrink: 0, padding: "8px 16px", fontSize: 13, borderRadius: 999, fontWeight: 500,
          ...(clean.length === 6
            ? { border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }
            : { border: `1px solid ${C.borderStrong}`, color: C.mutedSoft }),
        }}>
          Подключить
        </button>
      </div>
    </form>
  );
}
