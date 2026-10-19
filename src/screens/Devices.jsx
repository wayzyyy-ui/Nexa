// Экран «Все устройства»: все устройства аккаунта крупно — в сети и не в сети, переход к каждому.
// Открывается кнопкой «Все устройства» на Главной (компьютер) и счётчиком «N ●» (телефон)
import { useEffect } from "react";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { Crumb } from "../ui/layout.jsx";
import { EmptyState, StateButton } from "../ui/base.jsx";
import { DeviceRow } from "./Home.jsx";
import { plural } from "../lib/format.js";

export function ScreenDevices({ devices, received, findState, onOpenDevice, onFind, onAddDevice, onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  // Esc — назад (если поверх не открыто окно)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  const on = devices.filter((d) => d.online || d.isSelf);
  const off = devices.filter((d) => !(d.online || d.isSelf));
  const group = (title, list) => list.length > 0 && (
    <section style={{ marginTop: 30 }} aria-label={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: C.muted, marginBottom: 14 }}>
        {title} <span style={{ color: C.mutedSoft }}>{list.length}</span>
      </div>
      <div className="nx-stagger" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {list.map((d) => <DeviceRow key={d.id} d={d} received={received} findState={findState} onOpen={onOpenDevice} onFind={onFind} />)}
      </div>
    </section>
  );
  return (
    <div className="ng-screen nx-all-devices" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 1080, marginInline: "auto", boxSizing: "border-box" }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 26 }}>
        <div>
          <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>Все устройства</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 10 }}>
            {devices.length ? `${devices.length} ${plural(devices.length, ["устройство", "устройства", "устройств"])} в аккаунте · в сети ${on.length}` : "В аккаунте пока нет устройств"}
          </div>
        </div>
        {devices.length > 0 && (
          <StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={onAddDevice}>Добавить устройство</StateButton>
        )}
      </div>
      {devices.length === 0 && (
        <div style={{ marginTop: 30 }}>
          <EmptyState compact title="Устройств пока нет" text="Войдите в ту же почту на другом устройстве — оно появится здесь само"
            action={<StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={onAddDevice}>Добавить устройство</StateButton>} />
        </div>
      )}
      {group("В сети", on)}
      {group("Не в сети", off)}
    </div>
  );
}
