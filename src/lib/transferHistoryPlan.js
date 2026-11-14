import { directName } from "./directPlan.js";

export function transferRecord(x, direction, at = Date.now()) {
  return { id: `${direction}:${x.id}`, transferId: x.id, direction, at,
    peer: direction === "out" ? x.to : x.from,
    peerName: String(direction === "out" ? x.toName || "Устройство" : x.fromName || "Устройство").slice(0, 120),
    phase: x.phase, reason: x.reason || null,
    files: (x.files || []).slice(0, 50).map(f => ({ name: directName(f.name), size: f.size, mime: f.mime || "" })),
    size: x.total ?? x.size ?? 0 };
}
export function mergeTransfer(list, row) {
  const old = list.find(x => x.id === row.id);
  return [{ ...old, ...row, at: old?.at || row.at }, ...list.filter(x => x.id !== row.id)]
    .sort((a,b) => b.at - a.at).slice(0, 100);
}
