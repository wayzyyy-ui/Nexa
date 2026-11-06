/* Google Календарь — ход на устройстве. Сервер — api/calendar-google.js, правила — gcalPlan.js.
   Дела лежат только в памяти и в кеше этого устройства (nexa-gcal@<id>, выход его стирает).
   Состояние общее на приложение: его читают NexaApp (расписание) и строка в Настройках. */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { API_BASE } from "../native.js";
import { PLATFORM } from "./platform.js";
import { openExternal } from "./desktop.js";
import { supabase } from "./supabase.js";
import { GCAL_FAIL, GCAL_PARAM, GCAL_POLL_MS, GCAL_REFRESH_MS, GCAL_RETURN_MS, GCAL_WAIT_MS, readCache } from "./gcalPlan.js";

const URL_API = `${API_BASE}/api/calendar-google`;
const EMPTY = { connected: false, items: [], at: 0, phase: "idle", text: null, off: false };
const EMPTY_LIST = [];

let state = EMPTY;
let uidNow = null;
let pollTimer = null;
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const useGcal = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

const cacheKey = (uid) => `nexa-gcal@${uid}`;
const writeCache = () => {
  try {
    if (state.connected) localStorage.setItem(cacheKey(uidNow), JSON.stringify({ connected: true, items: state.items, at: state.at }));
    else localStorage.removeItem(cacheKey(uidNow));
  } catch {}
};

async function call(body) {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) return { code: 401, data: {} };
  const res = await fetch(URL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { code: res.status, data };
}

function stopWaiting() { clearInterval(pollTimer); pollTimer = null; }

/* Перечитать дела. Сбой сети и Google — остаются последние сохранённые */
export async function gcalRefresh() {
  const uid = uidNow;
  if (!uid || state.off) return;
  if (navigator.onLine === false) return;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { code, data } = await call({ action: "events", tz });
    if (uid !== uidNow) return; // пока ждали, вышли из аккаунта
    if (code === 503 && data.reason === "not_configured") { set({ off: true }); return; }
    if (code !== 200) return;
    const wasConnected = state.connected;
    if (data.connected) {
      stopWaiting();
      set({ connected: true, items: Array.isArray(data.items) ? data.items : EMPTY_LIST, at: Date.now(), phase: "idle", text: null });
    } else {
      set({ connected: false, items: EMPTY_LIST, at: 0, ...(wasConnected && data.reason ? { text: GCAL_FAIL.reconnect } : {}) });
    }
    writeCache();
  } catch {}
}

/* Подключить: сайт уходит на страницу Google в этой же вкладке, приложения открывают
   внешний браузер и ждут — раз в 3 с и сразу при возврате в NEXA */
export async function gcalConnect() {
  set({ phase: "starting", text: null });
  try {
    const { code, data } = await call({ action: "start", client: PLATFORM });
    if (code !== 200 || typeof data.url !== "string") {
      set({ phase: "idle", text: GCAL_FAIL[data.reason] || data.error || GCAL_FAIL.server });
      return;
    }
    if (PLATFORM === "web") { window.location.href = data.url; return; }
    if (PLATFORM === "desktop") {
      if (!(await openExternal(data.url))) { set({ phase: "idle", text: GCAL_FAIL.server }); return; }
    } else window.location.href = data.url; // Android отдаёт чужие адреса системному браузеру
    set({ phase: "waiting" });
    const until = Date.now() + GCAL_WAIT_MS;
    stopWaiting();
    pollTimer = setInterval(() => {
      if (Date.now() > until) { stopWaiting(); set({ phase: "idle" }); return; }
      gcalRefresh();
    }, GCAL_POLL_MS);
  } catch { set({ phase: "idle", text: GCAL_FAIL.network }); }
}

export function gcalCancel() { stopWaiting(); set({ phase: "idle" }); }

/* Отключить: сервер отзывает доступ у Google и стирает ключ. Ответ — текст ошибки или null */
export async function gcalDisconnect() {
  try {
    const { code, data } = await call({ action: "disconnect" });
    if (code !== 200) return data.error || GCAL_FAIL.server;
    set({ connected: false, items: EMPTY_LIST, at: 0, text: null });
    writeCache();
    return null;
  } catch { return GCAL_FAIL.network; }
}

/* Сайт вернулся от Google (?gcal=…): убираем метку из адреса. Ответ — ok, причина или null */
function takeReturn() {
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get(GCAL_PARAM);
    if (v === null) return null;
    u.searchParams.delete(GCAL_PARAM);
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    return v;
  } catch { return null; }
}

/* Подключается один раз в NexaApp: кто вошёл → кеш этого аккаунта, потом свежие дела.
   onDone — итог возврата с сайта Google (для всплывающего) */
export function useGcalSync(uid, online, onDone) {
  useEffect(() => {
    stopWaiting();
    uidNow = uid || null;
    if (!uid) { state = EMPTY; subs.forEach((f) => f()); return undefined; }
    let cached = null;
    try { cached = readCache(localStorage.getItem(cacheKey(uid))); } catch {}
    state = { ...EMPTY, ...(cached || {}) };
    subs.forEach((f) => f());
    const back = takeReturn();
    gcalRefresh().then(() => {
      if (!back) return;
      if (back === "ok") onDone?.({ ok: true });
      else { set({ text: GCAL_FAIL[back] || GCAL_FAIL.server }); onDone?.({ ok: false, text: GCAL_FAIL[back] || GCAL_FAIL.server }); }
    });
    const again = () => { if (state.connected) gcalRefresh(); };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (state.phase === "waiting" || (state.connected && Date.now() - state.at > GCAL_RETURN_MS)) gcalRefresh();
    };
    const t = setInterval(again, GCAL_REFRESH_MS);
    window.addEventListener("nexa-refresh", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("nexa-refresh", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // onDone меняется при каждой отрисовке, а следить надо только за аккаунтом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  // Вернулась связь — сразу обновить
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && state.connected) gcalRefresh();
    wasOnline.current = online;
  }, [online]);
}
