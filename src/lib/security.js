/* Центр безопасности: сеансы входа своего аккаунта и журнал безопасности.
   Сеансы — функции базы из supabase/security-sessions.sql (только свои, проверяет сама база):
   nexa_my_sessions() и nexa_revoke_session(sid). Ключа администратора в приложении нет.
   «Выйти на всех других устройствах» — встроенное signOut({ scope: "others" }) Supabase.
   Честно: завершённый сеанс больше не продлевается, но уже выданный пропуск (JWT)
   живёт до своего срока (по умолчанию до часа). Устройство в сети выходит сразу —
   после того как само проверит у сервера, что его сеанс завершён */
import { supabase } from "./supabase.js";
import { syncErrorKind } from "./sync.js";

// Номер сеанса — из пропуска (JWT) этого устройства. Сам пропуск никуда не пишем
export function sessionIdOf(session) {
  const t = session?.access_token;
  if (!t) return null;
  try {
    const part = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(decodeURIComponent(escape(atob(part + "===".slice((part.length + 3) % 4)))));
    return typeof json.session_id === "string" ? json.session_id : null;
  } catch { return null; }
}

// Функции ещё не установлены (security-sessions.sql не запущен)
const isMissingFn = (e) => ["PGRST202", "42883"].includes(String(e?.code)) || /could not find the function|does not exist/i.test(String(e?.message || ""));
function errorKind(e) {
  if (isMissingFn(e)) return "setup";
  return syncErrorKind(e);
}
export const SECURITY_ERROR_TEXT = {
  offline: "Нет связи — сведения о входах появятся, когда вернётся интернет",
  network: "Сервер не ответил — попробуйте ещё раз",
  setup: "Сведения о входах ещё не настроены: в Supabase нужно выполнить security-sessions.sql",
  auth: "Вход устарел — войдите заново",
  denied: "Нет доступа к сведениям о входах",
  server: "Не удалось получить сведения о входах",
};

/* Список своих сеансов: { ok: true, items: [{ id, createdAt, activeAt, ua, current }] }
   или { ok: false, kind } (kind — ключ SECURITY_ERROR_TEXT) */
export async function listSessions() {
  if (!supabase) return { ok: false, kind: "setup" };
  if (navigator.onLine === false) return { ok: false, kind: "offline" };
  try {
    const { data, error } = await supabase.rpc("nexa_my_sessions");
    if (error) return { ok: false, kind: errorKind(error) };
    const items = (Array.isArray(data) ? data : []).map((r) => ({
      id: String(r.id),
      createdAt: Date.parse(r.created_at) || null,
      activeAt: Date.parse(r.active_at) || null,
      ua: typeof r.user_agent === "string" ? r.user_agent : "",
      current: r.current === true,
    }));
    return { ok: true, items };
  } catch (e) {
    return { ok: false, kind: errorKind(e) };
  }
}

/* Завершить свой сеанс (не текущий). { ok: true } — сеанс удалён в базе;
   { ok: false, kind: "gone" } — такого сеанса уже нет (тоже не доступ) */
export async function revokeSession(sid) {
  if (!supabase) return { ok: false, kind: "setup" };
  if (navigator.onLine === false) return { ok: false, kind: "offline" };
  try {
    const { data, error } = await supabase.rpc("nexa_revoke_session", { sid });
    if (error) return { ok: false, kind: errorKind(error) };
    return data === true ? { ok: true } : { ok: false, kind: "gone" };
  } catch (e) {
    return { ok: false, kind: errorKind(e) };
  }
}

// Выйти на всех других устройствах (встроенная возможность Supabase)
export async function signOutOthers() {
  if (!supabase) return { ok: false, kind: "setup" };
  if (navigator.onLine === false) return { ok: false, kind: "offline" };
  try {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    return error ? { ok: false, kind: errorKind(error) } : { ok: true };
  } catch (e) {
    return { ok: false, kind: errorKind(e) };
  }
}

/* Жив ли сеанс ЭТОГО устройства — спрашиваем сервер (getUser проверяет сеанс в базе).
   "revoked" — только когда сервер прямо сказал, что сеанса нет; сбой сети — "unknown" */
export async function checkOwnSession() {
  if (!supabase || navigator.onLine === false) return "unknown";
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return "unknown";
    const { error } = await supabase.auth.getUser();
    if (!error) return "ok";
    const code = String(error.code || "");
    const msg = String(error.message || "").toLowerCase();
    if (code === "session_not_found" || code === "refresh_token_not_found" || msg.includes("session not found") || msg.includes("session from session_id claim")) return "revoked";
    return "unknown";
  } catch { return "unknown"; }
}

// Что за клиент по строке браузера — без марок и моделей (правило NEXA)
export function clientLabel(ua) {
  const s = String(ua || "");
  if (!s) return "Неизвестное устройство";
  const app = /; wv\)/.test(s);
  const phone = /Mobi|Android|iPhone|iPad/i.test(s);
  if (app) return "Приложение на телефоне";
  return phone ? "Браузер на телефоне" : "Браузер на компьютере";
}

/* ── Журнал безопасности: только то, что этот браузер видел сам ──
   Ключ nexa-security@<uid> (стирается при выходе вместе с остальными данными аккаунта).
   Записи { id, at, kind, title, text } — без кодов, токенов и адресов */
export const SECURITY_MAX = 50;
export const securityKey = (uid) => `nexa-security@${uid}`;
export function loadSecurity(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v.filter((x) => x && typeof x.at === "number" && typeof x.title === "string").slice(0, SECURITY_MAX) : [];
  } catch { return []; }
}
export const SECURITY_KINDS = ["login", "others", "revoke", "device-off", "device-on", "approve"];
