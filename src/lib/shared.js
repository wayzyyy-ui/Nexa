// Общее состояние вкладок: канал BroadcastChannel nexa-sync, useSharedState, событие nexa-log
import { useState, useRef, useEffect } from "react";

export const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nexa-sync") : null;

export const TAB_ID = Math.random().toString(36).slice(2);

export function logEvent(note) {
  window.dispatchEvent(new CustomEvent("nexa-log", { detail: note }));
}

/* Запись больших списков (диалоги, файлы, устройства) — не на каждое изменение, а через WRITE_DELAY_MS
   после последнего: JSON целого списка на каждое нажатие тормозил телефон. Маленькие значения пишутся сразу.
   Отложенное дописывается сразу при уходе в фон / закрытии страницы и по flushSharedState() */
const WRITE_DELAY_MS = 300;
const BIG_VALUE = 8000; // знаков JSON: больше — пишем с паузой
const pendingWrites = new Map(); // key → функция «записать сейчас»
export function flushSharedState() {
  const all = [...pendingWrites.values()];
  pendingWrites.clear();
  all.forEach((fn) => fn());
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSharedState);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSharedState(); });
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
  const timer = useRef(0);
  const big = useRef(false); // прошлый JSON был большим — следующий считаем уже при отложенной записи
  useEffect(() => {
    // Ключ сменился (вход / выход): недописанное старым ключом пишем, только если его не стёрли
    // (выход стирает данные аккаунта — иначе запись «воскресила» бы их)
    const prevKey = savedKey.current;
    if (prevKey !== null && prevKey !== cur.key && pendingWrites.has(prevKey)) {
      const fn = pendingWrites.get(prevKey);
      pendingWrites.delete(prevKey);
      clearTimeout(timer.current);
      try { if (localStorage.getItem(prevKey) !== null) fn(); } catch {}
    }
    // Начальное значение и значение после смены ключа не рассылаем
    const switched = prevKey !== cur.key;
    savedKey.current = cur.key;
    const remote = fromRemote.current;
    fromRemote.current = false;
    const send = !switched && !remote;
    const value = cur.value, key = cur.key;
    const write = () => {
      let json = null;
      try { json = JSON.stringify(value); localStorage.setItem(key, json); } catch {}
      big.current = !!json && json.length >= BIG_VALUE;
      if (send) syncChannel?.postMessage({ key, value, from: TAB_ID });
    };
    clearTimeout(timer.current);
    if (switched || !big.current) { pendingWrites.delete(cur.key); write(); return; }
    pendingWrites.set(cur.key, write);
    timer.current = setTimeout(() => { if (pendingWrites.get(cur.key) === write) { pendingWrites.delete(cur.key); write(); } }, WRITE_DELAY_MS);
  }, [cur]);
  // Ушли с экрана (компонент убрали) — дописываем сразу
  useEffect(() => () => { clearTimeout(timer.current); const k = savedKey.current; const fn = k && pendingWrites.get(k); if (fn) { pendingWrites.delete(k); fn(); } }, []);
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
