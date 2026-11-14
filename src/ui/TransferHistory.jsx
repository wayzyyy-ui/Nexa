import { useState } from "react";
import { C } from "./theme.js";
import { btnReset } from "./base.jsx";
import { formatBytes } from "../lib/deviceInfo.js";
import { DIRECT_FAIL } from "../lib/directPlan.js";
import { ruFmt } from "../lib/ruFmt.js";

export function TransferHistory({ history, direct, devices, files, onRetry, onSave, onOpen }) {
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false);
  const button = { ...btnReset, padding: "10px 16px", border: `1px solid ${C.borderStrong}`, borderRadius: 999, fontSize: 13 };
  return <section style={{ marginBottom: 24 }} data-no-swipe>
    <button className="nx-ghost-btn" style={button} onClick={() => setOpen(!open)} aria-expanded={open}>Передачи · {history.rows.length}</button>
    {open && <div className="nx-glass nx-glass-subtle" style={{ borderRadius: 20, padding: 18, marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: C.muted, fontSize: 13 }}>Последние 100 передач напрямую · только на этом устройстве</span>
        {!!history.rows.length && <button className="nx-ghost-btn" style={button} onClick={() => setConfirm(true)}>Очистить историю</button>}
      </div>
      {confirm && <div style={{ marginTop: 12 }}><p>Удалить записи? Сохранённые файлы останутся.</p><button style={button} onClick={() => { history.clear(); setConfirm(false); }}>Очистить</button> <button style={button} onClick={() => setConfirm(false)}>Отмена</button></div>}
      {!history.rows.length && <p style={{ color: C.muted }}>Здесь появятся завершённые и прерванные передачи файлов.</p>}
      {history.rows.map(row => {
        const outgoing = row.direction === "out";
        const device = devices.find(d => d.device_id === row.peer || d.members?.includes(row.peer));
        const current = outgoing ? direct.out : direct.ask?.id === row.transferId ? { ...direct.ask, phase: "asking" } : direct.inc;
        const busy = current?.id === row.transferId && !["done", "failed"].includes(current.phase);
        const available = direct.inc?.id === row.transferId && direct.inc.phase === "done" ? direct.inc.files : null;
        return <article key={row.id} style={{ padding: "18px 0", borderBottom: `1px solid ${C.border}`, overflowWrap: "anywhere" }}>
          <div style={{ fontWeight: 650 }}>{outgoing ? "Кому" : "От кого"}: {row.peerName}</div>
          <div style={{ color: C.muted, fontSize: 12, margin: "4px 0 10px" }}>{ruFmt({day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(row.at))} · {formatBytes(row.size)}</div>
          <div style={{ color: row.phase === "done" ? C.mint : C.muted }}>{busy ? current.phase === "asking" ? "Ожидание подтверждения" : current.phase === "connecting" ? "Соединяем устройства" : "Передача выполняется — ход показан в карточке" : row.phase === "unknown" ? "Завершение не подтверждено" : row.phase === "done" ? outgoing ? "Получено устройством" : "Получено" : row.reason === "declined" && !outgoing ? "Вы отклонили запрос" : DIRECT_FAIL[row.reason] || "Передача прервана"}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>{row.files.map((f,i) => {
            const saved = row.saved?.[i], stored = saved?.fileId && files.find(x => x.id === saved.fileId);
            return <li key={i} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <span style={{ flex: "1 1 180px", minWidth: 0 }}>{f.name} <small style={{ color: C.muted }}>{formatBytes(f.size)}</small>
              {!outgoing && row.phase === "done" && <small style={{ display: "block", color: C.muted }}>{stored ? "Сохранено в «Файлы»" : saved?.device ? "Сохранено на устройство" : saved?.download ? "Скачивание запрошено" : available ? "Пока в памяти NEXA" : "Копия в памяти недоступна"}</small>}</span>
              {stored && <button style={button} onClick={() => onOpen({ id: stored.id })}>Показать в файлах</button>}
              {available?.[i]?.blob && <button style={button} onClick={() => onSave(available[i], row.transferId, i)}>Сохранить</button>}
            </li>;
          })}</ul>
          {outgoing && <><button className="nx-ghost-btn" style={button} disabled={!device?.online || (direct.out && !["done","failed"].includes(direct.out.phase))} onClick={() => onRetry(row, device)}>{history.cached(row.transferId) ? "Повторить" : "Выбрать файлы и повторить"}</button>
            {!device?.online && <p style={{ fontSize: 12, color: C.muted }}>Устройство недоступно. Откройте на нём NEXA.</p>}</>}
        </article>;
      })}
    </div>}
  </section>;
}
