// Bluetooth: выбор сопряжённых устройств (только приложение)
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { btStatus, btBonded, onBtChange, btRequest, btAvailable } from "../native.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { deviceType } from "../lib/devices.js";
import { btnReset, StateButton } from "./base.jsx";

export const BT_TYPE = { watch: "watch", buds: "buds", phone: "phone", laptop: "laptop", tv: "tv" };

/* Окно «По Bluetooth» (только приложение): сопряжённые с этим телефоном устройства.
   added — какие уже в NEXA (по отпечатку bt_id). onAdd(item) — добавить карточку */
export function BluetoothPicker({ added, onAdd, onClose }) {
  const [st, setSt] = useState(null);      // состояние Bluetooth и разрешения
  const [list, setList] = useState(null);  // сопряжённые устройства
  const [err, setErr] = useState(null);
  const load = async () => {
    const s0 = await btStatus(); setSt(s0);
    if (!s0.supported || s0.permission !== "granted" || !s0.enabled) { setList(null); return; }
    const r = await btBonded();
    if (r.error) { setErr(r.message || "Не получилось прочитать список"); return; }
    setErr(null); setList(r.devices || []);
  };
  useEffect(() => {
    load();
    const off = onBtChange(load);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { off(); window.removeEventListener("keydown", onKey); };
  }, []);
  const why = !st ? "Проверяем Bluetooth…"
    : !st.supported ? "Bluetooth на этом устройстве нет"
    : st.permission === "denied" ? "Разрешите NEXA «Устройства поблизости» в настройках телефона — иначе список не прочитать"
    : st.permission !== "granted" ? "NEXA нужно разрешение «Устройства поблизости», чтобы увидеть сопряжённые устройства. Сами устройства NEXA не подключает и не ищет"
    : !st.enabled ? "Bluetooth выключен — включите его в шторке телефона" : null;
  return createPortal(
    <div className="nx-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-bt-title" onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" style={{
        width: "min(460px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, padding: 20, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div id="nx-bt-title" className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>По Bluetooth</div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.close({ c: C.muted, s: 16 })}</button>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>Часы, наушники и другое, что уже сопряжено с этим телефоном в настройках Bluetooth</div>
        {why && <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 16, lineHeight: 1.5 }}>{why}</div>}
        {st?.supported && st.permission !== "granted" && st.permission !== "denied" && (
          <StateButton variant="primary" onClick={async () => { await btRequest(); load(); }} style={{ width: "100%", marginTop: 14, borderRadius: 999, padding: "11px 16px" }}>Разрешить</StateButton>
        )}
        {err && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 12 }}>{err}</div>}
        {list && !list.length && <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 16, lineHeight: 1.5 }}>Сопряжённых устройств нет. Сначала сопрягите часы или наушники в настройках Bluetooth телефона</div>}
        {list && list.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {list.map((it) => {
              const type = BT_TYPE[it.kind];
              const already = added.includes(it.id);
              return (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 14 }}>
                  <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {deviceType(type || "phone").icon({ c: it.connected ? C.mint : C.muted, s: 18 })}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name || deviceType(type || "phone").name}</span>
                    <span style={{ display: "block", fontSize: 12, color: it.connected ? C.green : C.mutedSoft, marginTop: 2 }}>
                      {[type ? deviceType(type).name : "Другое", it.connected ? "подключено" : "не подключено", it.battery != null ? `${it.battery}%` : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {already ? <span style={{ fontSize: 12, color: C.mutedSoft, flexShrink: 0 }}>Уже в NEXA</span>
                    : type ? <button type="button" className="nx-ghost-btn" onClick={() => onAdd({ ...it, type })} style={{ ...btnReset, flexShrink: 0, fontSize: 13, padding: "6px 14px", border: `1px solid ${C.borderStrong}`, color: C.text }}>Добавить</button>
                    : <span style={{ fontSize: 12, color: C.mutedSoft, flexShrink: 0, maxWidth: 110, textAlign: "right" }}>Такие NEXA пока не показывает</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Кнопка «По Bluetooth» в окнах добавления: в приложении — открывает выбор, на сайте — честно объясняет
export function BtEntry({ onOpen }) {
  if (!btAvailable) return (
    <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 12, lineHeight: 1.45 }}>Часы и наушники по Bluetooth — в приложении NEXA для Android: браузер не видит Bluetooth-устройства телефона</div>
  );
  return (
    <button type="button" className="nx-ghost-btn" onClick={onOpen} style={{
      ...btnReset, marginTop: 14, width: "100%", padding: "11px 16px", fontSize: 14, borderRadius: 999,
      border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      {Icon.buds({ c: C.text, s: 16 })} По Bluetooth — часы, наушники
    </button>
  );
}
