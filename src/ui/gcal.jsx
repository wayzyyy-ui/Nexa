/* Настройки → «Приложения» → «Google Календарь». Название сервиса здесь нужно по смыслу —
   как подпись Gismeteo и Яндекс ID, это исключение из правила «без брендов». */
import { useState } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Spinner, btnReset } from "./base.jsx";
import { useGcal, gcalConnect, gcalCancel, gcalDisconnect } from "../lib/gcal.js";
import { useOnline } from "../lib/hooks.js";

const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap" };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const danger = { ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red };

export function GoogleCalendarSettings({ user, onLogin }) {
  const g = useGcal();
  const online = useOnline();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const off = async () => {
    setConfirm(false); setBusy(true); setError(null);
    setError(await gcalDisconnect());
    setBusy(false);
  };

  let subtitle = "Дела из вашего календаря появятся в расписании. Менять их в NEXA нельзя";
  let right = null;
  if (!user) {
    subtitle = "Нужен вход в аккаунт";
    right = <button type="button" className="nx-ghost-btn" style={ghost} onClick={onLogin}>Войти</button>;
  } else if (g.off) {
    subtitle = "Подключение календаря пока не настроено";
  } else if (g.connected) {
    subtitle = "Подключён: только чтение основного календаря";
    right = busy ? <Spinner />
      : confirm ? <button type="button" className="nx-ghost-btn" style={danger} onClick={off}>Да, отключить</button>
      : <button type="button" className="nx-ghost-btn" style={ghost} disabled={!online} onClick={() => setConfirm(true)}>Отключить</button>;
  } else if (g.phase === "waiting") {
    subtitle = "Разрешите доступ в браузере и вернитесь в NEXA";
    right = <button type="button" className="nx-ghost-btn" style={ghost} onClick={gcalCancel}>Отменить</button>;
  } else {
    right = g.phase === "starting" ? <Spinner />
      : <button type="button" className="nx-ghost-btn" style={ghost} disabled={!online} onClick={gcalConnect}>Подключить</button>;
  }
  const note = error || g.text;

  return (
    <>
      <SectionTitle>Календарь</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.calendar({ c: g.connected ? C.mint : C.muted, s: 18 })} title="Google Календарь" subtitle={subtitle} right={right} />
      </SettingsGroup>
      {note && <div role="status" style={{ fontSize: 13, color: C.red, margin: "8px 4px 0" }}>{note}</div>}
    </>
  );
}
