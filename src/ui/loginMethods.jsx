/* «Способы входа» в центре безопасности: почта (всегда, если она настоящая), Яндекс ID и Telegram.
   Привязать — тот же ход, что вход (src/lib/extAuth.js, purpose "link"): сайт уходит на страницу
   сервиса и возвращается, приложения ждут ответ из внешнего браузера.
   Отвязать — только если останется другой способ входа (сервер проверяет то же самое). */
import { useState } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Spinner, btnReset } from "./base.jsx";
import { useExtAuth, startExtAuth, cancelExtAuth, unlinkExt, resetExtAuth } from "../lib/extAuth.js";
import { EXT_NAME, linkedOf, canUnlinkHere, isServiceEmail } from "../lib/extAuthPlan.js";

const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap" };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const danger = { ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red };

// Какие сервисы показываем (Telegram добавится, когда будет готов его вход)
export const LINKABLE = [{ id: "yandex", icon: Icon.yandex }];

export function LoginMethods({ user, online }) {
  const ext = useExtAuth();
  const [busy, setBusy] = useState(null);   // провайдер, который сейчас отвязываем
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState(null);   // { provider, text, kind }
  const linked = linkedOf(user);
  const realEmail = user?.email && !isServiceEmail(user.email);

  const unlink = async (p) => {
    setConfirm(null); setBusy(p); setNote(null);
    const r = await unlinkExt(p);
    setBusy(null);
    setNote(r.ok ? { provider: p, kind: "ok", text: `${EXT_NAME[p]} отвязан` } : { provider: p, kind: "error", text: r.text });
  };

  return (
    <>
      <SectionTitle>Способы входа</SectionTitle>
      <SettingsGroup>
        {realEmail && (
          <SettingsRow icon={Icon.mail({ c: C.green, s: 18 })} title="Почта" subtitle={`${user.email} · код из письма`} />
        )}
        {LINKABLE.map(({ id, icon }, i) => {
          const on = linked.includes(id);
          const st = ext.provider === id && ext.purpose === "link" ? ext : { phase: "idle" };
          const wait = st.phase === "starting" || st.phase === "waiting" || st.phase === "signing";
          const msg = st.phase === "error" ? { kind: "error", text: st.text }
            : st.phase === "done" ? { kind: "ok", text: `${EXT_NAME[id]} привязан. Теперь можно входить и так` }
            : note?.provider === id ? note : null;
          const sub = busy === id ? "Отвязываем…"
            : wait ? (st.phase === "starting" ? "Готовим…" : "Завершите привязку в браузере. NEXA ждёт ответа")
            : on ? "Привязан · можно входить через него" : "Не привязан";
          const last = i === LINKABLE.length - 1 && confirm !== id;
          return (
            <div key={id}>
              <SettingsRow last={last && !msg}
                icon={icon({ c: on ? C.green : C.muted, s: 18 })}
                title={EXT_NAME[id]}
                subtitle={sub}
                right={wait ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Spinner s={14} />
                    {st.phase === "waiting" && <button type="button" className="nx-ghost-btn" onClick={cancelExtAuth} style={ghost}>Отменить</button>}
                  </span>
                ) : on ? (
                  canUnlinkHere(user, id)
                    ? <button type="button" className="nx-ghost-btn" disabled={!!busy || !online} onClick={() => setConfirm(id)} style={danger}>Отвязать</button>
                    : <span style={{ fontSize: 12, color: C.mutedSoft, maxWidth: 160, textAlign: "right", lineHeight: 1.4 }}>Единственный способ входа</span>
                ) : (
                  <button type="button" className="nx-ghost-btn" disabled={!online || ext.phase === "starting"}
                    onClick={() => { setNote(null); resetExtAuth(); startExtAuth(id, "link"); }} style={ghost}>Привязать</button>
                )} />
              {msg && (
                <div role={msg.kind === "error" ? "alert" : "status"} style={{ fontSize: 12, lineHeight: 1.5, color: msg.kind === "error" ? C.red : C.green, padding: "0 16px 12px" }}>{msg.text}</div>
              )}
              {confirm === id && (
                <div role="alert" className="nx-pop" style={{ margin: "0 16px 14px", padding: "12px 14px", borderRadius: 16, border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, background: `color-mix(in srgb, ${C.red} 7%, transparent)` }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Отвязать {EXT_NAME[id]}?</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Входить через него больше не получится. Привязать снова можно в любой момент</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(null)} style={ghost}>Отмена</button>
                    <button type="button" className="nx-primary" onClick={() => unlink(id)} style={{ ...pill, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500 }}>Отвязать</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </SettingsGroup>
    </>
  );
}
