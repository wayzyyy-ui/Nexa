// Настройки → «Приложение для ПК» (только в окне NEXA для Windows): автозапуск и трей
import { useEffect, useState } from "react";
import { isDesktop } from "../lib/platform.js";
import { autostartGet, autostartSet } from "../lib/desktop.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Toggle } from "./base.jsx";

export function DesktopSettings() {
  // null — ещё не знаем (или Windows не ответила), true / false — включён ли автозапуск
  const [auto, setAuto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { if (isDesktop) autostartGet().then(setAuto); }, []);
  if (!isDesktop) return null;
  const flip = async () => {
    setBusy(true); setErr(false);
    const r = await autostartSet(!auto);
    if (r === null) setErr(true); else setAuto(r);
    setBusy(false);
  };
  return (
    <>
      <SectionTitle>Приложение для ПК</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.power({ c: C.muted, s: 18 })} title="Запускать вместе с компьютером"
          subtitle={err ? <span style={{ color: C.red }}>Не получилось изменить — попробуйте ещё раз</span>
            : "NEXA сразу свернётся в трей: устройства видят компьютер «в сети», уведомления приходят"}
          right={<Toggle on={!!auto} onClick={flip} disabled={busy || auto === null} label="Запускать вместе с компьютером" />} />
        <SettingsRow last icon={Icon.info({ c: C.muted, s: 18 })} title="Закрытие окна"
          subtitle="Крестик сворачивает NEXA в трей — значок у часов на панели задач. Выйти совсем: правой кнопкой по значку → «Выйти»" />
      </SettingsGroup>
    </>
  );
}

/* Своя рамка окна приложения для ПК (системная выключена — decorations: false в tauri.conf.json):
   полоса сверху, за которую окно перетаскивают (двойной щелчок — развернуть), и круглые кнопки
   «Свернуть», «Развернуть», «Закрыть» в стиле NEXA — в конце верхней строки, после профиля.
   «Закрыть» прячет NEXA в трей (как раньше крестик системы — оболочка ловит закрытие окна) */
const win = () => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow());

export function DesktopDragStrip() {
  if (!isDesktop) return null;
  return <div data-tauri-drag-region className="nx-pc-drag" aria-hidden="true" />;
}

export function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    let off = null, stop = false;
    win().then(async (w) => {
      const sync = () => w.isMaximized().then((v) => !stop && setMax(v)).catch(() => {});
      sync();
      off = await w.onResized(sync);
      if (stop) off();
    }).catch(() => {});
    return () => { stop = true; off?.(); };
  }, []);
  if (!isDesktop) return null;
  const act = (fn) => () => win().then(fn).catch(() => {});
  const line = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  return (
    <div className="nx-pc-winbtns" role="group" aria-label="Окно">
      <button type="button" className="nx-icon-btn nx-pc-winbtn" onClick={act((w) => w.minimize())} aria-label="Свернуть" title="Свернуть">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8h9" {...line} /></svg>
      </button>
      <button type="button" className="nx-icon-btn nx-pc-winbtn" onClick={act((w) => w.toggleMaximize())} aria-label={max ? "Восстановить" : "Развернуть"} title={max ? "Восстановить" : "Развернуть"}>
        {max
          ? <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="5.5" width="7.5" height="7.5" rx="1.6" {...line} /><path d="M5.5 5.5V4.6c0-.9.7-1.6 1.6-1.6h4.3c.9 0 1.6.7 1.6 1.6v4.3c0 .9-.7 1.6-1.6 1.6h-.9" {...line} /></svg>
          : <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="2" {...line} /></svg>}
      </button>
      <button type="button" className="nx-icon-btn nx-pc-winbtn is-close" onClick={act((w) => w.close())} aria-label="Закрыть (NEXA останется в трее)" title="Закрыть — NEXA останется в трее">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" {...line} /></svg>
      </button>
    </div>
  );
}
