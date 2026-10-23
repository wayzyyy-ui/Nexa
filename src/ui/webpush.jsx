// Настройки → «Уведомления»: строка «Новые версии NEXA» для сайта (веб-уведомления, src/lib/webpush.js)
import { useEffect, useState } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SettingsRow, Toggle } from "./base.jsx";
import { webPushStatus, webPushEnable, webPushDisable } from "../lib/webpush.js";

export function WebPushRow({ last }) {
  const [st, setSt] = useState(null); // null — ещё не знаем; см. webPushStatus
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { webPushStatus().then(setSt); }, []);
  if (!st || st === "unsupported") return null;
  const flip = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = st === "on" ? await webPushDisable() : await webPushEnable();
    setBusy(false);
    if (r.error) { setErr(r.error); setSt(await webPushStatus()); } else setSt(r.status);
  };
  const sub = st === "home"
    ? "Чтобы приходили на этот телефон: «Поделиться» → «На экран Домой», затем откройте NEXA с экрана «Домой» и включите здесь"
    : st === "denied"
      ? "Браузер запретил уведомления для этого сайта — разрешите их в настройках браузера"
      : st === "on"
        ? "Придёт системное уведомление, даже если вкладка NEXA закрыта (браузер должен быть запущен)"
        : "Системное уведомление «Вышла NEXA …», даже когда вкладка закрыта";
  return (
    <SettingsRow last={last} icon={Icon.megaphone({ c: st === "on" ? C.mint : C.muted, s: 18 })} title="Новые версии NEXA в этом браузере"
      subtitle={<>{sub}{err && <span role="alert" style={{ display: "block", marginTop: 6, color: C.red }}>{err}</span>}</>}
      right={st === "home" || st === "denied" ? null : <Toggle on={st === "on"} onClick={flip} disabled={busy} label="Новые версии NEXA в этом браузере" />} />
  );
}
