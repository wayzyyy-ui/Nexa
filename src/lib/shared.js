// Общее состояние вкладок: канал BroadcastChannel nexa-sync, useSharedState, событие nexa-log
import { useState, useRef, useEffect } from "react";

export const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nexa-sync") : null;

export const TAB_ID = Math.random().toString(36).slice(2);

export function logEvent(note) {
  window.dispatchEvent(new CustomEvent("nexa-log", { detail: note }));
}

/* useState, который сам сохраняется в localStorage под key и делится
   с другими вкладками. load(key) — как прочитать значение.
   Пришедшее из другой вкладки сохраняем, но обратно не рассылаем.
   key может смениться (вошли в аккаунт или вышли) — тогда значение
   читается заново из нового места, старое остаётся лежать под своим ключом */
export function useSharedState(key, load) {
  const [state, setState] = useState(() => ({ key, value: load(key) }));
  // Ключ сменился — сразу берём значение нового ключа
  const cur = state.key === key ? state : { key, value: load(key) };
  if (cur !== state) setState(cur);
  const fromRemote = useRef(false);
  const savedKey = useRef(null); // под каким ключом сохраняли в прошлый раз
  useEffect(() => {
    try { localStorage.setItem(cur.key, JSON.stringify(cur.value)); } catch {}
    // Начальное значение и значение после смены ключа не рассылаем
    const switched = savedKey.current !== cur.key;
    savedKey.current = cur.key;
    if (switched) return;
    if (fromRemote.current) { fromRemote.current = false; return; }
    syncChannel?.postMessage({ key: cur.key, value: cur.value, from: TAB_ID });
  }, [cur]);
  useEffect(() => {
    if (!syncChannel) return;
    const onMessage = (e) => {
      if (e.data?.key !== key || e.data.from === TAB_ID) return;
      fromRemote.current = true;
      setState({ key, value: e.data.value });
    };
    syncChannel.addEventListener("message", onMessage);
    return () => syncChannel.removeEventListener("message", onMessage);
  }, [key]);
  // Как обычный setState: можно передать значение или функцию от старого
  const setValue = useRef((v) => setState((st) => ({ key: st.key, value: typeof v === "function" ? v(st.value) : v }))).current;
  return [cur.value, setValue];
}
