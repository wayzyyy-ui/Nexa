/* Обновление веб-части приложения без нового APK (OTA) — плагин @capgo/capacitor-updater
   в ручном режиме (autoUpdate: "off" в capacitor.config.json): всё решает этот модуль.

   Откуда: блок web в public/version.json — { version, url, sha256, size, notes, nativeMin }.
   Сам version.json читает checkForUpdate (native.js, не чаще раза в 6 часов) — здесь берём
   его последний ответ, второй раз сайт не спрашиваем.

   Ход:
   1) web.version новее этой веб-части (VERSION), versionCode APK ≥ nativeMin, версия не в списке
      «плохих», адрес — https на нашем сервере → download (плагин сам сверяет SHA-256 архива);
   2) next — бандл ждёт; setMultiDelay kill — при уходе в фон не применяется (иначе экран
      перезагрузился бы посреди дела);
   3) следующий запуск NEXA (otaStart, после первого кадра): сообщаем «запустились»
      (notifyAppReady) и, если бандл ждёт, — reload() под логотипом запуска;
   4) новая веб-часть не сообщила «запустились» за appReadyTimeout — плагин сам возвращает
      прежнюю; мы видим это через getFailedUpdate и запоминаем версию как плохую.
   nativeMin выше установленного APK — веб-часть не ставим: нужна новая версия приложения
   (её предлагает прежняя проверка APK). Новый APK поверх — плагин сам начинает
   со встроенной веб-части (resetWhenUpdate). */
import { useSyncExternalStore } from "react";
import { isNative, API_BASE, readUpdateCache, UPDATE_EVERY_MS } from "../native.js";
import { VERSION } from "../version.js";
import { parseWeb, planOta } from "./otaPlan.js";

const BAD_KEY = "nexa-ota-bad";       // версии, которые не запустились, — больше не качаем
const FAIL_KEY = "nexa-ota-fail";     // { version, at } — неудачная попытка: повтор не раньше интервала
// { id, version, at } — применяем этот бандл. Следующий запуск JS (уже в нём или снова в прежнем,
// если плагин откатил) по нему понимает, удалось ли
const TRYING_KEY = "nexa-ota-trying";

let api = null; // плагин — только в приложении и только по требованию
// Проверка ждёт, пока запуск решит, применять ли скачанное; reloading — сейчас перезагрузимся
let started = Promise.resolve(false), reloading = false;
// Модуль плагина нельзя возвращать из async-функции: JS вызовет у него .then (см. CLAUDE.md) —
// отдаём в обёртке { api }
const plugin = async () => {
  if (!isNative) return null;
  if (!api) api = (await import("@capgo/capacitor-updater")).CapacitorUpdater;
  return { api };
};

/* ── Состояние для Настроек ── */
// status: idle | checking | current | downloading | ready | needApk | error
let state = { status: "idle", version: "", percent: 0, text: "" };
const subs = new Set();
const setState = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const useOta = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

const readJson = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* Запуск NEXA (после первого кадра): «запустились» → была ли неудача → применить ждущий бандл.
   true — сейчас будет перезагрузка (логотип запуска не убираем) */
export function otaStart() {
  started = startImpl().then((r) => { reloading = r; return r; }, () => false);
  return started;
}
async function startImpl() {
  const p = (await plugin().catch(() => null))?.api;
  if (!p) return false;
  try { await p.notifyAppReady(); } catch {}
  let cur = null;
  try { cur = (await p.current())?.bundle; } catch {}
  // Чем закончилась прошлая попытка применить скачанную веб-часть
  const trying = readJson(TRYING_KEY, null);
  if (trying?.id) {
    try { localStorage.removeItem(TRYING_KEY); } catch {}
    if (cur?.id !== trying.id) await markBad(p, trying); // мы снова в прежней — новая не запустилась
  }
  // Плагин сам откатил сборку (не сообщила «запустились» вовремя)
  try { const failed = await p.getFailedUpdate(); if (failed?.bundle?.version) await markBad(p, failed.bundle); } catch {}
  try {
    const next = await p.getNextBundle();
    if (next && next.id !== cur?.id && next.status !== "error" && !readJson(BAD_KEY, []).includes(next.version)) {
      writeJson(TRYING_KEY, { id: next.id, version: next.version, at: Date.now() });
      await p.reload(); // применяет ждущий бандл (это новый запуск — работа не прерывается)
      return true;
    }
  } catch {
    // Перезагрузка не удалась (новая сборка не сообщила «запустились») — плагин остался на прежней
    const t = readJson(TRYING_KEY, null);
    if (t?.id) { try { localStorage.removeItem(TRYING_KEY); } catch {} await markBad(p, t); }
  }
  return false;
}

// Версия не запустилась: больше её не качаем и не применяем (плагин пропускает бандлы с ошибкой)
async function markBad(p, bundle) {
  const v = bundle.version;
  if (v) {
    const bad = readJson(BAD_KEY, []);
    if (!bad.includes(v)) writeJson(BAD_KEY, [...bad, v].slice(-20));
    setState({ status: "error", version: v, text: `Обновление интерфейса ${v} не запустилось — вернули прежнее. Ждём исправленное` });
  }
  if (bundle.id) {
    await p.setBundleError({ id: bundle.id }).catch(() => {});
    await p.delete({ id: bundle.id }).catch(() => {});
  }
}

// Есть ли сеть — плагин без сети не отвечает «нет связи», а ждёт её
async function online() {
  try { return (await (await import("@capacitor/network")).Network.getStatus()).connected; } catch { return navigator.onLine; }
}
// Почему не скачалось: плагин сообщает только «ошибка». Сверяем архив сами (только при неудаче)
async function whyFailed(web) {
  if (!(await online())) return "Нет связи — скачаем позже";
  try {
    const res = await fetch(web.url, { cache: "no-store" });
    if (!res.ok) return "Архив обновления недоступен на сервере — повторим позже";
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await res.arrayBuffer()))].map((x) => x.toString(16).padStart(2, "0")).join("");
    if (hex !== web.sha256) return "Архив обновления повреждён (контрольная сумма не совпала) — не ставим, повторим позже";
  } catch { /* сервер не ответил на нашу проверку */ }
  return "Не удалось скачать обновление — повторим позже";
}

/* Проверка (после checkForUpdate: при запуске, возврате в приложение, «Проверить», «потяните»).
   build — versionCode установленного APK */
let running = false;
export async function otaCheck({ force = false, build } = {}) {
  const p = (await plugin().catch(() => null))?.api;
  if (!p || running || (await started) || reloading) return;
  running = true;
  try {
    if (build == null) build = (await (await import("@capacitor/app")).App.getInfo().catch(() => null))?.build;
    const web = parseWeb(readUpdateCache()?.latest?.web, API_BASE);
    const plan = planOta({ web, current: VERSION, build: Number(build) || 0, bad: readJson(BAD_KEY, []), fail: readJson(FAIL_KEY, null), force, every: UPDATE_EVERY_MS });
    // Уже скачано и ждёт запуска — не качаем второй раз
    const next = await p.getNextBundle().catch(() => null);
    if (plan.act === "download" && next?.version === web.version && next.status !== "error") {
      setState({ status: "ready", version: web.version, text: "" });
      return;
    }
    if (plan.act === "none" || plan.act === "current") { if (state.status !== "error") setState({ status: "current", version: VERSION, text: "" }); return; }
    if (plan.act === "bad") { setState({ status: "error", version: web.version, text: `Обновление интерфейса ${web.version} не запустилось — ждём исправленное` }); return; }
    if (plan.act === "needApk") { setState({ status: "needApk", version: web.version, text: "" }); return; }
    if (plan.act === "wait") { setState({ status: "error", version: web.version, text: "Прошлая попытка не удалась — повторим позже или нажмите «Проверить»" }); return; }

    // Без сети не начинаем (плагин ждал бы её молча, а «Скачиваем…» висело бы)
    if (!(await online())) {
      writeJson(FAIL_KEY, { version: web.version, at: Date.now() });
      setState({ status: "error", version: web.version, text: "Нет связи — скачаем позже" });
      return;
    }
    // Скачать: прогресс — событием download
    setState({ status: "downloading", version: web.version, percent: 0, text: "" });
    const sub = await p.addListener("download", (e) => { if (e?.bundle?.version === web.version || !e?.bundle) setState({ percent: Math.max(0, Math.min(100, Number(e?.percent) || 0)) }); }).catch(() => null);
    let bundle;
    try {
      bundle = await p.download({ url: web.url, version: web.version, checksum: web.sha256 });
    } catch (e) {
      writeJson(FAIL_KEY, { version: web.version, at: Date.now() });
      setState({ status: "error", text: /checksum/i.test(String(e?.message || e || "")) ? "Архив обновления повреждён (контрольная сумма не совпала) — не ставим, повторим позже" : await whyFailed(web) });
      return;
    } finally { sub?.remove?.(); }
    // Ждёт следующего запуска; при уходе в фон не применяется (условие kill)
    await p.next({ id: bundle.id });
    await p.setMultiDelay({ delayConditions: [{ kind: "kill" }] });
    // Прежний ждавший бандл (более старая версия) больше не нужен
    if (next && next.id !== bundle.id) p.delete({ id: next.id }).catch(() => {});
    try { localStorage.removeItem(FAIL_KEY); } catch {}
    setState({ status: "ready", version: web.version, percent: 100, text: "" });
  } catch {
    setState({ status: "error", text: "Проверка обновления интерфейса не удалась — повторим позже" });
  } finally { running = false; }
}

// «Перезапустить сейчас» в Настройках — только по нажатию человека
export async function otaApplyNow() {
  const p = (await plugin().catch(() => null))?.api;
  if (!p) return;
  const next = await p.getNextBundle().catch(() => null);
  if (next?.id) writeJson(TRYING_KEY, { id: next.id, version: next.version, at: Date.now() });
  await p.reload().catch(async () => { const t = readJson(TRYING_KEY, null); try { localStorage.removeItem(TRYING_KEY); } catch {} if (t?.id) await markBad(p, t); });
}
