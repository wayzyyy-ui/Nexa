/* Когда другим устройствам говорить «обновись» после отправки списка устройств в облако.
   Служебные поля — «был в сети» (seenAt) и последние сведения (sys: заряд, сеть, место) —
   меняются часто и сами по себе: из-за них все устройства аккаунта перечитывали весь список.
   Остальным они не срочны (кто в сети сейчас — и так видно по Presence), поэтому сигнал
   уходит, только если в записи изменилось что-то кроме них: название, тип, Bluetooth и т. п.,
   новая запись или удаление */
export const QUIET_KEYS = ["seenAt", "sys"];

// Отпечаток записи без служебных полей
export function deviceSignature(item) {
  const state = { ...(item?.state || {}) };
  for (const k of QUIET_KEYS) delete state[k];
  return JSON.stringify([item?.name ?? "", item?.type ?? "", Object.keys(state).sort().map((k) => [k, state[k]])]);
}

/* Нужен ли сигнал «обновись»: ids — отправленные записи, deletes — сколько удалили,
   list — список устройств сейчас (devicesToList), last — Map id → отпечаток при прошлом сигнале
   (обновляется здесь же). Ничего не знаем о том, что ушло (старый вызов без сведений) — сигнал нужен */
export function needsSignal({ ids, deletes = 0 } = {}, list = [], last = new Map()) {
  if (!Array.isArray(ids)) return true;
  let loud = deletes > 0;
  const byId = new Map(list.map((i) => [i.id, i]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) { loud = true; continue; }
    const sig = deviceSignature(item);
    if (last.get(id) !== sig) { loud = true; last.set(id, sig); }
  }
  return loud;
}
