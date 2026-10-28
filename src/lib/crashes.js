/* Отчёты о сбоях — ход на устройстве (правила и очистка — crashReport.js, сервер — api/errors.js).
   Ловит необработанные ошибки и обещания (window error / unhandledrejection) и падения экрана
   (CrashBoundary → reportCrash). Отчёты копятся 3 с и уходят пачкой; при уходе страницы — сразу (keepalive).
   Выключается на устройстве: Настройки → «Безопасность» → «Отчёты о сбоях» (nexa-crash-reports = "off"). */
import { useSyncExternalStore } from "react";
import { API_BASE } from "../native.js";
import { PLATFORM } from "./platform.js";
import { VERSION } from "../version.js";
import { makeReport, allowSend } from "./crashReport.js";

const KEY = "nexa-crash-reports";
const DAY_KEY = "nexa-crash-day";
const URL_ERRORS = `${API_BASE}/api/errors`;

const subs = new Set();
const readOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
let on = readOn();
export const useCrashReportsOn = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => on);
export function setCrashReports(v) {
  on = !!v;
  try { v ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, "off"); } catch {}
  if (!on) queue.length = 0;
  subs.forEach((f) => f());
}

const seen = new Set();
const queue = [];
let timer = null;
const screenNow = () => (location.pathname.split("/")[1] || "home").toLowerCase();

export function reportCrash(err, kind = "error") {
  try {
    if (!on) return;
    const r = makeReport(err, { kind, version: VERSION, platform: PLATFORM, screen: screenNow(), ua: navigator.userAgent });
    if (!r) return;
    let day = null;
    try { day = JSON.parse(localStorage.getItem(DAY_KEY)); } catch {}
    const ok = allowSend(r.fp, seen, day, new Date().toISOString().slice(0, 10));
    if (!ok.ok) return;
    seen.add(r.fp);
    try { localStorage.setItem(DAY_KEY, JSON.stringify(ok.day)); } catch {}
    queue.push(r);
    clearTimeout(timer);
    timer = setTimeout(flush, 3000);
  } catch {} // сам сбор отчётов не должен ломать NEXA
}

function flush() {
  clearTimeout(timer);
  if (!queue.length || navigator.onLine === false) return;
  const reports = queue.splice(0, 10);
  // text/plain — без предварительного запроса CORS; keepalive — уйдёт и при закрытии страницы
  fetch(URL_ERRORS, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ reports }), keepalive: true }).catch(() => {});
}

let installed = false;
export function installCrashReports() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    // Не загрузилась картинка / скрипт — это не исключение, e.error пустой; такие не шлём
    if (e?.error || e?.message) reportCrash(e.error || { name: "Error", message: e.message, stack: e.filename ? `at (${e.filename}:${e.lineno}:${e.colno})` : "" }, "error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e?.reason;
    reportCrash(r instanceof Error ? r : { name: "UnhandledRejection", message: typeof r === "string" ? r : r?.message || "" , stack: r?.stack }, "rejection");
  });
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}
