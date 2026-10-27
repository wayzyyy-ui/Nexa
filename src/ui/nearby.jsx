// «Рядом» — окна передачи файла на соседний телефон без интернета (логика — src/lib/nearby.js).
// NearbySheet: вкладки «Отправить» (выбрать файл → телефоны рядом → нажать) и «Принять»
// (видно на 10 минут). NearbyAsk: «Принять файл от …?» с кодом для сверки на обоих телефонах.
// Ход передачи после «Принять» — на плашке сверху (DropBanner), окно само закрывается.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, Spinner } from "./base.jsx";
import { formatBytes } from "../lib/deviceInfo.js";
import { leftText } from "../lib/nearby.js";

const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 16px", borderRadius: 999, fontSize: 13, whiteSpace: "nowrap" };
const primary = { ...pill, fontWeight: 500, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` };
const ghost = { ...pill, color: C.text, border: `1px solid ${C.borderStrong}` };

// Окно поверх всего: затемнение, Esc закрывает (на телефоне — шторка снизу, её смахивают вниз)
function Layer({ label, onClose, children, z = 310 }) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return createPortal(
    <div className="nx-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: z, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" style={{
        width: "min(460px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 24, padding: 20, textAlign: "left",
      }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Через сколько перестанем быть видимыми — тикает раз в секунду, только пока окно открыто
function useLeft(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now()); // отсчёт — от включения, а не от открытия окна (иначе сначала «ещё 11 мин»)
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, until - now);
}

/* nb — useNearby(); tab — "send" | "recv"; myName — как этот телефон видят другие */
export function NearbySheet({ nb, tab: tab0 = "send", myName, onClose }) {
  const [tab, setTab] = useState(tab0);
  const fileRef = useRef(null);
  const left = useLeft(nb.recv.on ? nb.recv.until : 0);
  const s = nb.send;
  const searching = s && (s.phase === "search" || s.phase === "connecting" || s.phase === "waiting");
  // Открыли «Принять» — сразу видны на 10 минут, без отдельной кнопки (раз уже здесь — значит, принимаем).
  // Один раз на открытие вкладки: выключили руками или ошибка — сами снова не включаем
  const autoRecv = useRef(false);
  useEffect(() => {
    if (tab !== "recv") { autoRecv.current = false; return; }
    if (autoRecv.current) return;
    autoRecv.current = true;
    if (!nb.recv.on) nb.startRecv();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Закрыли окно до начала передачи — отправку отменяем (ничего не висит в фоне)
  const closeSheet = () => { if (s && !["sending", "done"].includes(s.phase)) nb.cancelSend(); onClose(); };

  return (
    <Layer label="Рядом" onClose={closeSheet}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>Рядом</div>
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>Файл на соседний телефон с NEXA — без интернета</div>
        </div>
        <button type="button" className="nx-icon-btn" onClick={closeSheet} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon.close({ c: C.muted, s: 16 })}
        </button>
      </div>

      {/* Вкладки */}
      <div role="tablist" aria-label="Рядом" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, marginTop: 16, borderRadius: 999, border: `1px solid ${C.border}` }}>
        {[["send", "Отправить"], ["recv", "Принять"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            style={{ ...btnReset, padding: "8px 10px", borderRadius: 999, fontSize: 13, fontWeight: 500, textAlign: "center",
              color: tab === id ? C.text : C.muted, background: tab === id ? `color-mix(in srgb, ${C.text} 9%, transparent)` : "transparent" }}>
            {label}{id === "recv" && nb.recv.on ? " · вкл." : ""}
          </button>
        ))}
      </div>

      {tab === "recv" ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: `1px solid ${nb.recv.on ? C.mint : C.border}` }}>
            <div className={nb.recv.on ? "nx-near-radar is-on" : "nx-near-radar"} aria-hidden="true">{Icon.phone({ c: nb.recv.on ? C.mint : C.muted, s: 18 })}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{nb.recv.on ? "Принимаем файлы рядом" : "Не принимаем"}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
                {nb.recv.on ? `Вас видно как «${myName}» · ещё ${leftText(left)}` : "Телефоны с NEXA поблизости вас сейчас не видят"}
              </div>
            </div>
            {nb.recv.on
              ? <button type="button" className="nx-ghost-btn" onClick={nb.stopRecv} style={{ ...ghost, padding: "7px 12px" }}>Выключить</button>
              : <button type="button" className="nx-primary" onClick={nb.startRecv} style={{ ...primary, padding: "7px 12px" }}>Включить</button>}
          </div>
          {nb.recv.error && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 10, lineHeight: 1.45 }}>{nb.recv.error}</div>}
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 12, lineHeight: 1.55 }}>
            Каждый файл вы принимаете сами — сверьте код на обоих телефонах. Работает, пока NEXA открыта: свернули — перестаёте быть видимым. Полученное сохраняется в «Загрузки».
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) nb.beginSend(f); }} />
          {!s ? (
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ ...btnReset, width: "100%", boxSizing: "border-box", padding: "22px 14px", borderRadius: 18, border: `1px dashed ${C.borderStrong}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: C.text }}>
              {Icon.plus({ c: C.mint, s: 20 })}
              <span style={{ fontSize: 14, fontWeight: 500 }}>Выбрать файл</span>
              <span style={{ fontSize: 12, color: C.mutedSoft, textAlign: "center", lineHeight: 1.45 }}>На том телефоне: NEXA → «Рядом» → «Принять»</span>
            </button>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, border: `1px solid ${C.border}` }}>
                {Icon.doc({ c: C.mint, s: 18 })}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.file.name}</div>
                  <div style={{ fontSize: 12, color: C.mutedSoft }}>{formatBytes(s.file.size)}</div>
                </div>
                {(s.phase === "search" || s.phase === "failed") && (
                  <button type="button" className="nx-ghost-btn" onClick={() => fileRef.current?.click()} style={{ ...ghost, padding: "6px 12px" }}>Другой</button>
                )}
              </div>

              {s.phase === "preparing" && <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginTop: 14 }}><Spinner s={11} /> Готовим файл…</div>}

              {searching && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
                    <span className="nx-near-dot" aria-hidden="true" />
                    {s.phase === "search" ? "Ищем телефоны с NEXA поблизости…"
                      : s.phase === "connecting" ? `Соединяемся с «${s.targetName}»…`
                      : `Ждём, пока на «${s.targetName}» примут`}
                  </div>
                  {s.phase === "waiting" && s.digits && (
                    <div style={{ marginTop: 10, fontSize: 13, color: C.text }}>
                      Код <b style={{ fontSize: 18, letterSpacing: "0.12em", color: C.mint }}>{s.digits}</b> — такой же должен быть на том телефоне
                    </div>
                  )}
                  <div className="nx-near-peers" role="list" aria-label="Телефоны рядом">
                    {nb.peers.map((p) => {
                      const active = s.target === p.endpointId;
                      return (
                        <button key={p.endpointId} type="button" role="listitem" disabled={s.phase !== "search"} onClick={() => nb.pick(p)}
                          className={`nx-near-peer${active ? " is-active" : ""}`} aria-label={`Отправить на «${p.name}»`}>
                          <span className="nx-near-avatar">{Icon.phone({ c: active ? C.mint : C.text, s: 22 })}</span>
                          <span className="nx-near-name">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {s.phase === "search" && !nb.peers.length && (
                    <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 6, lineHeight: 1.5 }}>
                      Пока никого. На том телефоне откройте NEXA → «Рядом» → «Принять». Bluetooth и Wi-Fi должны быть включены на обоих.
                    </div>
                  )}
                </div>
              )}

              {s.phase === "failed" && (
                <div style={{ marginTop: 14 }}>
                  <div role="alert" style={{ fontSize: 13, color: C.red, lineHeight: 1.45 }}>{s.error}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="button" className="nx-primary" onClick={nb.retrySend} style={primary}>Ещё раз</button>
                    <button type="button" className="nx-ghost-btn" onClick={closeSheet} style={ghost}>Закрыть</button>
                  </div>
                </div>
              )}
              {searching && s.phase !== "search" && (
                <button type="button" className="nx-ghost-btn" onClick={nb.cancelSend} style={{ ...ghost, marginTop: 14 }}>Отменить</button>
              )}
            </>
          )}
        </div>
      )}
    </Layer>
  );
}

// Кто-то рядом хочет передать файл: принять или нет решает человек, сверив код
// direct — прямая передача по сети (src/lib/direct.js), а не «Рядом»: свои тексты
export function NearbyAsk({ ask, onAccept, onReject, direct = false }) {
  return (
    <Layer label="Принять файл?" onClose={onReject} z={330}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
        <div className="nx-near-radar is-on" aria-hidden="true">{(direct ? Icon.handoff : Icon.phone)({ c: C.mint, s: 20 })}</div>
        <div className="ng-display" style={{ fontSize: 18, fontWeight: 600 }}>«{ask.name}» передаёт файл{direct ? " напрямую" : ""}</div>
        <div style={{ fontSize: 14, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ask.file}</div>
        <div style={{ fontSize: 12, color: C.mutedSoft }}>{ask.size ? formatBytes(ask.size) : ""}</div>
        {ask.digits && (
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Код <b style={{ fontSize: 18, letterSpacing: "0.12em", color: C.mint }}>{ask.digits}</b> — сверьте с тем телефоном
          </div>
        )}
        <div style={{ fontSize: 12, color: C.mutedSoft, lineHeight: 1.5 }}>{direct
          ? "С вашего устройства, без облака — по сети Wi-Fi. Без «Принять» ничего не придёт"
          : "Принимайте только от тех, кого знаете. Без «Принять» ничего не придёт"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="nx-ghost-btn" onClick={onReject} style={ghost}>Отклонить</button>
          <button type="button" className="nx-primary" onClick={onAccept} style={primary}>Принять</button>
        </div>
      </div>
    </Layer>
  );
}
