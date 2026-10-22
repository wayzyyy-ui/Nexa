// Индикатор «потяните, чтобы обновить» (только приложение)
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { PULL_THRESHOLD, usePullState } from "../lib/hooks.js";
import { Spinner } from "./base.jsx";

// Значок над страницей: выезжает за пальцем, поворачивается, после порога — крутится
export function PullIndicator() {
  const { pull, busy } = usePullState(); // своё хранилище: NexaApp при натяжении не перерисовывается
  if (!pull && !busy) return null;
  const ready = pull >= PULL_THRESHOLD;
  return (
    <div role="status" aria-live="polite" className="nx-pull" style={{
      position: "fixed", left: "50%", top: `calc(var(--sat) + ${pull - 28}px)`, zIndex: 400,
      transform: "translateX(-50%)", opacity: Math.min(1, pull / PULL_THRESHOLD),
      transition: busy || !pull ? "top 200ms ease, opacity 200ms ease" : "none",
      width: 40, height: 40, borderRadius: "50%", boxSizing: "border-box",
      border: `1px solid ${ready ? C.mint : C.borderStrong}`, background: C.panel,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span className="visually-hidden" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {busy ? "Обновляем" : ready ? "Отпустите, чтобы обновить" : "Потяните, чтобы обновить"}
      </span>
      {busy ? <Spinner s={16} />
        : <span className="nx-pull-icon" style={{ display: "flex", transform: `rotate(${pull * 3}deg)` }}>{Icon.refresh({ c: ready ? C.mint : C.muted, s: 17 })}</span>}
    </div>
  );
}
