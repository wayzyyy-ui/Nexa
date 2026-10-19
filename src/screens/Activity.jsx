// Лента «Активность»: блок на Главной и отдельный экран
import { useState, useEffect } from "react";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { activityTime, ACTIVITY_MAX } from "../lib/activity.js";
import { btnReset } from "../ui/base.jsx";
import { Crumb } from "../ui/layout.jsx";

export const ACTIVITY_ICON = {
  connect: (c) => Icon.phone({ c, s: 15 }),
  disconnect: (c) => Icon.phone({ c, s: 15 }),
  text: (c) => Icon.chat({ c, s: 15 }),
  file: (c) => Icon.download({ c, s: 15 }),
  found: (c) => Icon.search({ c, s: 15 }),
  lock: (c) => Icon.lock({ c, s: 15 }),
  link: (c) => Icon.shareUp({ c, s: 15 }),
  sent: (c) => Icon.send({ c, s: 15 }),
};

// Список событий: значок в квадратике, подпись, время справа
export function ActivityList({ items, limit }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div>
      {list.map((it, i) => {
        const tone = it.kind === "disconnect" ? C.mutedSoft : it.kind === "connect" ? C.green : C.mint;
        return (
          <div key={it.id} className={i === 0 ? "nx-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {(ACTIVITY_ICON[it.kind] || ACTIVITY_ICON.sent)(tone)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nx-act-title" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
              {it.text && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.text}</div>}
            </div>
            <span className="nx-act-time" style={{ fontSize: 12, color: C.mutedSoft, flexShrink: 0, whiteSpace: "nowrap" }}>{activityTime(it.at)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Компактный блок на Главной: последние 4 события и «Вся активность»
export function ActivityBlock({ items, onOpen }) {
  return (
    <section aria-label="Активность" style={{ border: `1px solid ${C.border}`, borderRadius: 18, padding: "14px 18px 6px", background: C.bg, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>Активность</span>
        <button type="button" className="nx-link-btn" aria-label="Вся активность" onClick={onOpen} style={{
          ...btnReset, fontSize: 13, color: C.mutedSoft, borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 2,
        }}>
          Вся активность →
        </button>
      </div>
      {items.length === 0
        ? <div style={{ fontSize: 13, color: C.mutedSoft, padding: "10px 0 12px" }}>Здесь появятся события ваших устройств: подключения, файлы, поиск.</div>
        : <ActivityList items={items} limit={4} />}
    </section>
  );
}

export function ScreenActivity({ items, onBack, onClear }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") (confirm ? setConfirm(false) : onBack()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm]);
  const ghost = { ...btnReset, padding: "7px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div className="ng-screen" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 820 }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "18px 0 6px" }}>
        <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>Активность</div>
        {items.length > 0 && !confirm && (
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(true)} style={ghost}>Очистить</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.mutedSoft, marginBottom: 18, lineHeight: 1.5 }}>
        События этого устройства, последние {ACTIVITY_MAX}. На других устройствах — своя лента.
      </div>
      {confirm && (
        <div role="alert" className="nx-pop" style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", marginBottom: 16, borderRadius: 10,
          border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, background: `color-mix(in srgb, ${C.red} 8%, transparent)`,
        }}>
          <span style={{ flex: "1 1 200px", fontSize: 14 }}>Очистить всю ленту на этом устройстве? Вернуть не получится.</span>
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={ghost}>Отмена</button>
          <button type="button" className="nx-ghost-btn" onClick={() => { onClear(); setConfirm(false); }} style={{ ...ghost, borderColor: C.red, color: C.red }}>Очистить</button>
        </div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, padding: "4px 18px", background: C.bg }}>
        {items.length === 0
          ? <div style={{ fontSize: 14, color: C.mutedSoft, padding: "18px 0" }}>Пока пусто. Подключите устройство по коду — его события появятся здесь.</div>
          : <ActivityList items={items} />}
      </div>
    </div>
  );
}
