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
