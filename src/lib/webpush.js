/* Веб-уведомления сайта о новой версии (Web Push): браузер компьютера и телефона; на айфоне —
   только у сайта, добавленного на экран «Домой» и открытого оттуда (так устроены браузеры Apple).
   Сервер — api/webpush.js, фоновый помощник — public/nexa-sw.js (только уведомления, без кэша).
   В приложениях (Android, ПК) не используется: у них свои уведомления о версии. */
import { isNative, isDesktop, API_BASE } from "../native.js";
import { supabase } from "./supabase.js";

const SW = "/nexa-sw.js";
const KICK_KEY = "nexa-webpush-kick"; // когда последний раз «толкали» рассылку (не чаще раза в 6 часов)

const hasApi = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// Телефон или планшет с системой Apple (по возможностям, а не по названию в интерфейсе)
export const appleMobile = () => typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/* Что можно: "unsupported" — нет (или это приложение NEXA); "home" — нужно открыть сайт с экрана
   «Домой» (айфон в обычной вкладке); "denied" — браузер запретил; "on" / "off" */
export async function webPushStatus() {
  if (isNative || isDesktop) return "unsupported";
  if (!hasApi()) return appleMobile() && !standalone() ? "home" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch { return "off"; }
}

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

// Включить: разрешение браузера → помощник → подписка → сервер. Ответ — новое состояние или { error }
export async function webPushEnable() {
  if (!hasApi()) return { error: "Этот браузер не умеет такие уведомления" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { error: perm === "denied" ? "Уведомления запрещены — разрешите их в настройках браузера для этого сайта" : "Не разрешили — нажмите ещё раз" };
  try {
    const k = await (await fetch(`${API_BASE}/api/webpush?action=key`)).json();
    if (!k.ok) return { error: "Уведомления о версиях ещё не настроены на сервере" };
    const reg = await navigator.serviceWorker.register(SW, { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }));
    const { data } = (await supabase?.auth.getSession()) || {};
    const token = data?.session?.access_token;
    const r = await (await fetch(`${API_BASE}/api/webpush`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "subscribe", sub: sub.toJSON() }),
    })).json().catch(() => ({}));
    if (!r.ok) return { error: r.reason === "not_configured" ? "Уведомления о версиях ещё не настроены на сервере" : "Не получилось подписаться — попробуйте ещё раз" };
    return { status: "on" };
  } catch {
    return { error: "Не получилось подписаться — проверьте связь и попробуйте ещё раз" };
  }
}

export async function webPushDisable() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      fetch(`${API_BASE}/api/webpush`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
    await reg?.unregister();
  } catch {}
  return { status: "off" };
}

/* «Толкнуть» рассылку: сервер сам проверит version.json и разошлёт, если вышла новая версия.
   Сайт зовёт при открытии (не чаще раза в 6 часов), приложения — увидев новую версию (version —
   один раз на версию). Сервер всё равно шлёт о каждой версии только один раз */
export function kickWebPush(version) {
  try {
    const last = JSON.parse(localStorage.getItem(KICK_KEY) || "{}");
    if (version ? last.v === version : Date.now() - (last.at || 0) < 6 * 3600 * 1000) return;
    localStorage.setItem(KICK_KEY, JSON.stringify({ at: Date.now(), v: version || last.v || "" }));
  } catch {}
  fetch(`${API_BASE}/api/webpush?action=kick`, { mode: "no-cors" }).catch(() => {});
}
