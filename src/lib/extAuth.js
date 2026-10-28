/* Вход и привязка через Яндекс ID и Telegram — ход на устройстве.
   Правила — extAuthPlan.js, сервер — api/auth-yandex.js (и api/tg-*.js для Telegram).

   Сайт: страница входа открывается в этой же вкладке, Яндекс возвращает на /?ext_auth=yandex,
   попытка (id и секрет) ждёт в sessionStorage — resumeExtAuth забирает итог.
   Android и ПК: страница во внешнем браузере, приложение раз в 2 с спрашивает сервер
   (как вход по QR) и сразу — при возврате в NEXA. Итог — одноразовый пропуск → verifyOtp. */
import { useSyncExternalStore } from "react";
import { API_BASE } from "../native.js";
import { PLATFORM } from "./platform.js";
import { openExternal } from "./desktop.js";
import { supabase } from "./supabase.js";
import { EXT_TEXT, EXT_POLL_MS, EXT_WAIT_MS, EXT_PENDING_KEY, EXT_RETURN_PARAM, openMode, pollOutcome, readPending } from "./extAuthPlan.js";

export const EXT_URL = { yandex: `${API_BASE}/api/auth-yandex` };

/* Общее состояние (одно на приложение): кнопки на экране входа и в Настройках читают его.
   phase: idle | starting | waiting | signing | done | error */
let state = { phase: "idle" };
const subs = new Set();
const set = (s) => { state = s; subs.forEach((f) => f()); };
export const useExtAuth = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const resetExtAuth = () => { stop(); set({ phase: "idle" }); };

let timer = null, cur = null; // cur — { provider, id, secret, purpose, at } (секрет — только в памяти и в sessionStorage вкладки)
function stop() {
  clearInterval(timer); timer = null; cur = null;
  document.removeEventListener("visibilitychange", onVisible);
  try { sessionStorage.removeItem(EXT_PENDING_KEY); } catch {}
}
const onVisible = () => { if (document.visibilityState === "visible") pollOnce(); };

async function token() { return (await supabase?.auth.getSession())?.data.session?.access_token; }
async function call(provider, body, auth) {
  const res = await fetch(EXT_URL[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { code: res.status, data };
}

/* Начать вход (purpose "login") или привязку к вошедшему аккаунту ("link") */
export async function startExtAuth(provider, purpose = "login") {
  if (!EXT_URL[provider] || state.phase === "starting") return;
  stop();
  if (navigator.onLine === false) { set({ phase: "error", provider, purpose, text: EXT_TEXT.offline }); return; }
  set({ phase: "starting", provider, purpose });
  // Внешний браузер на ПК открываем после ответа сервера; на сайте — эта же вкладка
  try {
    const auth = purpose === "link" ? await token() : null;
    const { code, data } = await call(provider, { action: "start", purpose, client: PLATFORM }, auth);
    if (code === 503) { set({ phase: "error", provider, purpose, text: EXT_TEXT.not_configured }); return; }
    if (code !== 200 || typeof data.url !== "string" || !/^https:\/\//.test(data.url)) { set({ phase: "error", provider, purpose, text: data.error || EXT_TEXT.server }); return; }
    cur = { provider, id: data.id, secret: data.secret, purpose, at: Date.now() };
    try { sessionStorage.setItem(EXT_PENDING_KEY, JSON.stringify(cur)); } catch {}
    if (openMode(PLATFORM) === "same-tab") { location.assign(data.url); return; }
    set({ phase: "waiting", provider, purpose });
    if (PLATFORM === "desktop") { if (!(await openExternal(data.url))) { stop(); set({ phase: "error", provider, purpose, text: EXT_TEXT.server }); return; } }
    // Android: переход на чужой адрес Capacitor отдаёт системному браузеру (страница NEXA остаётся)
    else window.location.href = data.url;
    watch();
  } catch {
    stop(); set({ phase: "error", provider, purpose, text: EXT_TEXT.network });
  }
}

function watch() {
  clearInterval(timer);
  timer = setInterval(pollOnce, EXT_POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}

let polling = false;
async function pollOnce() {
  const c = cur;
  if (!c || polling) return;
  if (Date.now() - c.at > EXT_WAIT_MS) { stop(); set({ phase: "error", provider: c.provider, purpose: c.purpose, text: EXT_TEXT.expired }); return; }
  polling = true;
  try {
    const { code, data } = await call(c.provider, { action: "poll", id: c.id, secret: c.secret });
    if (cur !== c) return;
    const o = pollOutcome(code, data);
    if (o.next === "wait") return;
    stop();
    if (o.next === "fail") { set({ phase: "error", provider: c.provider, purpose: c.purpose, text: o.text }); return; }
    if (o.next === "linked") {
      // Свежие app_metadata (список привязанных сервисов) — в новой сессии
      try { await supabase.auth.refreshSession(); } catch {}
      set({ phase: "done", provider: c.provider, purpose: "link" }); return;
    }
    set({ phase: "signing", provider: c.provider, purpose: c.purpose });
    const { error } = await supabase.auth.verifyOtp({ token_hash: o.tokenHash, type: "magiclink" });
    set(error ? { phase: "error", provider: c.provider, purpose: c.purpose, text: EXT_TEXT.signin } : { phase: "done", provider: c.provider, purpose: c.purpose });
  } catch {
    // Сеть моргнула — спросим в следующий раз (таймер идёт)
  } finally { polling = false; }
}

/* Сайт вернулся со страницы входа (?ext_auth=…): убираем метку из адреса и забираем итог.
   Зовёт NexaApp один раз при запуске. Попытки нет (другая вкладка, истекла) — молча ничего */
export function resumeExtAuth() {
  let back = false;
  try {
    const u = new URL(window.location.href);
    back = u.searchParams.has(EXT_RETURN_PARAM);
    if (back) { u.searchParams.delete(EXT_RETURN_PARAM); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); }
  } catch {}
  let p = null;
  try { p = readPending(sessionStorage.getItem(EXT_PENDING_KEY)); } catch {}
  if (!p) { try { sessionStorage.removeItem(EXT_PENDING_KEY); } catch {} return; }
  // Приложение перезагрузило страницу посреди ожидания — ждём дальше; сайт — забираем итог
  cur = p;
  set({ phase: back ? "signing" : "waiting", provider: p.provider, purpose: p.purpose });
  pollOnce();
  watch();
}

// Отменить ожидание (страница во внешнем браузере больше не нужна)
export function cancelExtAuth() { stop(); set({ phase: "idle" }); }

/* Отвязать сервис у вошедшего. Ответ: { ok } или { ok: false, text } */
export async function unlinkExt(provider) {
  if (navigator.onLine === false) return { ok: false, text: EXT_TEXT.offline };
  try {
    const { code, data } = await call(provider, { action: "unlink" }, await token());
    if (code !== 200) return { ok: false, text: data.error || EXT_TEXT.server };
    try { await supabase.auth.refreshSession(); } catch {}
    return { ok: true };
  } catch { return { ok: false, text: EXT_TEXT.network }; }
}
