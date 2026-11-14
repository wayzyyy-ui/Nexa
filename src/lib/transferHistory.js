// В истории только сведения; содержимое последней отправки остаётся в памяти вкладки.
import { useEffect, useRef } from "react";
import { useSharedState } from "./shared.js";
import { transferRecord, mergeTransfer } from "./transferHistoryPlan.js";

const load = key => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v.filter(x => x && typeof x.id === "string" && Array.isArray(x.files)).slice(0,100) : []; } catch { return []; } };

export function useTransferHistory(uid, direct) {
  const [rows, setRows] = useSharedState(`nexa-transfers@${uid || "guest"}`, load);
  const memory = useRef({ uid, out: null, seen: new Set() });
  if (memory.current.uid !== uid) memory.current = { uid, out: null, seen: new Set(), ignored: new Set([direct.out?.id, direct.inc?.id, direct.ask?.id]) };
  useEffect(() => {
    if (!uid) return;
    const asking = direct.ask && { ...direct.ask, fromName: direct.ask.name, phase: "asking" };
    for (const [direction, x] of [["out", direct.out], ["in", asking || direct.inc]]) {
      if (!x || memory.current.ignored?.has(x.id)) continue;
      const key = `${direction}:${x.id}:${x.phase}:${x.reason || ""}`;
      if (memory.current.seen.has(key)) continue;
      memory.current.seen.add(key);
      if (direction === "out" && x.file) memory.current.out = x;
      const row = transferRecord(x, direction);
      if (!["done", "failed"].includes(row.phase)) row.phase = "unknown";
      setRows(old => mergeTransfer(old, row));
    }
  }, [uid, direct.out, direct.inc, direct.ask, setRows]);
  const mark = (id, index, patch) => setRows(old => old.map(row => row.id === `in:${id}`
    ? { ...row, saved: { ...row.saved, [index]: { ...row.saved?.[index], ...patch } } } : row));
  return { rows, mark, cached: id => memory.current.out?.id === id ? memory.current.out : null,
    clear: () => { memory.current.out = null; setRows([]); } };
}
