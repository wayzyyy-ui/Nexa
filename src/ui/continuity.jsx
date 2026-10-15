// Продолжение работы на другом устройстве: окно «Продолжить на устройстве…» (отправитель)
// и карточка «Продолжить здесь?» (получатель). Логика и тексты — src/lib/continuity.js, ход — NexaApp
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, StateButton } from "./base.jsx";
import { CONT_STAGE, CONT_FAIL, contDone, contWhat } from "../lib/continuity.js";
import { lastSeenText, peerLabel } from "../lib/devices.js";

const pill = { ...btnReset, borderRadius: 999, padding: "9px 16px", fontSize: 13 };

// Секунды до конца срока (для подписи «ещё N с»)
function useSecondsLeft(exp) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return Math.max(0, Math.ceil((exp - now) / 1000));
}

/* Окно отправителя. item — { kind: "chat" | "file", ref, title };
   devices — карточки устройств аккаунта (real, со статусом); job — текущая попытка из NexaApp */
export function ContinueDialog({ item, devices, user, online, linkOnline, job, onSend, onCancelJob, onClose, onLogin }) {
  const targets = devices.filter((x) => x.real && !x.isSelf && !x.bt);
  const live = targets.filter((x) => x.online);
  const [pick, setPick] = useState(live[0]?.id || null);
  const target = live.find((x) => x.id === pick) || null;
  useEffect(() => { if (!target && live[0]) setPick(live[0].id); }, [live.map((x) => x.id).join()]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const mine = job && job.item.ref === item.ref ? job : null;
  const pending = mine && !contDone(mine.status);
  const why = !user ? "Продолжать работу можно только между устройствами своего аккаунта — войдите"
    : !online ? "Нет интернета — передать не получится"
    : !targets.length ? "Других устройств нет. Подключите второе кнопкой «Добавить устройство» на Главной"
    : !live.length ? "Ни одно устройство не в сети — откройте NEXA на нужном устройстве" : null;
  const stageColor = !mine ? C.muted : mine.status === "opened" ? C.green : mine.status === "failed" ? C.red : C.muted;

  return createPortal(
    <div className="nx-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-cont-title" onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" style={{
        width: "min(460px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, padding: 20, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div id="nx-cont-title" className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>Продолжить на устройстве</div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.close({ c: C.muted, s: 16 })}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 14, border: `1px solid ${C.border}` }}>
          {(item.kind === "chat" ? Icon.chat : Icon.doc)({ c: C.mint, s: 18 })}
          <span style={{ fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contWhat(item.kind, item.title)}</span>
        </div>
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 8, lineHeight: 1.5 }}>
          На том устройстве появится предложение — откроется, только если там нажмут «Открыть». Передаётся только ссылка на {item.kind === "chat" ? "диалог" : "файл"} вашего аккаунта, не содержимое
        </div>

        {targets.length > 0 && (
          <div role="radiogroup" aria-label="На каком устройстве продолжить" style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {targets.map((x) => {
              const on = x.online, sel = on && x.id === pick;
              return (
                <button key={x.id} type="button" role="radio" aria-checked={sel} disabled={!on || pending} onClick={() => setPick(x.id)} className="nx-ghost-btn" style={{
                  ...btnReset, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 16, textAlign: "left",
                  border: `1px solid ${sel ? C.mint : C.borderStrong}`, background: sel ? `color-mix(in srgb, ${C.mint} 10%, transparent)` : "transparent",
                  color: on ? C.text : C.mutedSoft, opacity: on ? 1 : 0.7,
                }}>
                  {(x.icon || Icon.phone)({ c: sel ? C.mint : on ? C.text : C.mutedSoft, s: 17 })}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14 }}>{x.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>
                      {(x.kind ? peerLabel(x) : "Устройство")} · {on ? <span style={{ color: C.green }}>в сети</span> : lastSeenText(x.seenAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {why && <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 14, lineHeight: 1.45 }}>{why}</div>}

        {mine && (
          <div role="status" style={{ marginTop: 14, padding: "10px 12px", borderRadius: 14, border: `1px solid color-mix(in srgb, ${stageColor} 40%, transparent)`, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ color: stageColor, fontWeight: 500 }}>«{mine.name}»: {CONT_STAGE[mine.status]}</div>
            {mine.status === "failed" && <div style={{ color: C.muted, marginTop: 2 }}>{CONT_FAIL[mine.reason] || CONT_FAIL.send}</div>}
            {mine.status === "connecting" && !linkOnline && <div style={{ color: C.muted, marginTop: 2 }}>Подключаемся к каналу связи…</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {!user ? (
            <StateButton variant="primary" onClick={onLogin} style={{ flex: 1, borderRadius: 999, padding: "11px 16px" }}>Войти</StateButton>
          ) : pending ? (
            <button type="button" className="nx-ghost-btn" onClick={onCancelJob} style={{ ...pill, flex: 1, border: `1px solid ${C.borderStrong}`, color: C.text }}>Отменить</button>
          ) : (
            <StateButton variant="primary" icon={Icon.send({ c: C.onFold, s: 14 })} disabled={!!why || !target}
              onClick={() => onSend(target, item)} style={{ flex: 1, borderRadius: 999, padding: "11px 16px" }}>
              {mine?.status === "failed" ? "Повторить" : target ? `Продолжить на «${target.name}»` : "Продолжить"}
            </StateButton>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* Карточка у получателя: что предлагают, с какого устройства, сколько осталось.
   Не модальная — работа на экране не прерывается. Esc / «Назад» Android = «Не сейчас» */
export function ContinueOffer({ offer, onOpen, onDecline }) {
  const left = useSecondsLeft(offer.exp);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Есть окно поверх — Esc сначала его
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return;
      onDecline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);
  return (
    <div role="dialog" aria-label="Продолжить на этом устройстве" className="nx-cont-offer nx-pop" style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(24px + var(--sab))", zIndex: 260,
      width: "min(420px, calc(100% - 32px))", boxSizing: "border-box", padding: 16, borderRadius: 20,
      background: C.panel, border: `1px solid ${C.mint}`, textAlign: "left",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", background: C.mintDark, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {(offer.kind === "chat" ? Icon.chat : Icon.doc)({ c: C.mint, s: 16 })}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Продолжить здесь?</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>С устройства «{offer.fromName}» · ещё {left} с</div>
        </div>
      </div>
      <div style={{ fontSize: 14, marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contWhat(offer.kind, offer.title)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="nx-ghost-btn" onClick={onDecline} style={{ ...pill, flex: 1, border: `1px solid ${C.borderStrong}`, color: C.text }}>Не сейчас</button>
        <StateButton variant="primary" onClick={onOpen} style={{ flex: 1, borderRadius: 999, padding: "9px 16px" }}>Открыть</StateButton>
      </div>
    </div>
  );
}
