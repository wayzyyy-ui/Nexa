// Обновление приложения: общий ход установки изнутри (updState / updStart) и APK для сайта
import { useState, useEffect, useSyncExternalStore } from "react";
import { updateCanInstall, updateInstall, updateSigner, updateDownload } from "../native.js";

export const APK_URL = "/nexa.apk";

/* Обновление для тех, кто скачал APK с сайта.
   Сайт не видит, установлено ли приложение, поэтому запоминаем в браузере,
   какую версию человек скачал. Если на сайте (version.json) версия новее —
   на Главной показываем баннер «Обновить», даже если баннер установки закрыли */
export const INSTALL_DISMISS_KEY = "nexa-install-dismissed"; // баннер установки закрыли крестиком

export const APK_DOWNLOADED_KEY = "nexa-apk-downloaded"; // версия последнего скачанного APK

export const rememberApkDownload = (version) => { try { localStorage.setItem(APK_DOWNLOADED_KEY, version); } catch {} };

// "0.5.6" → 506, как versionCode в Android-сборке
export const versionCode = (v) => { const [a = 0, b = 0, c = 0] = String(v).split(".").map((x) => parseInt(x, 10) || 0); return a * 10000 + b * 100 + c; };

// Есть ли на сайте APK новее скачанного. Возвращает { version } или null
export function useSiteApkUpdate(enabled) {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let had = null;
    try { had = localStorage.getItem(APK_DOWNLOADED_KEY); } catch {}
    if (!had) return; // APK с этого браузера не качали — предлагать нечего
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (v && Number(v.versionCode) > versionCode(had)) setUpdate({ version: v.version }); })
      .catch(() => {});
  }, [enabled]);
  return update;
}

/* Баннер «Доступна новая версия» — только в Android-приложении.
   update = { version, url, required } (см. checkForUpdate в src/native.js) или null.
   Приложение работает, но баннер закрыть нельзя — мягко подталкиваем обновиться.
   Если версия совсем старая (required), вместо него — ForceUpdateScreen */
export const UPDATE_DISMISS_KEY = "nexa-update-dismissed"; // сайт: какую версию уже скрыли

/* ═══ ОБНОВЛЕНИЕ ИЗНУТРИ ПРИЛОЖЕНИЯ (только Android, NexaUpdatePlugin) ═══
   Ход один на всё приложение (Главная, Настройки, экран «Обновите»):
   idle → downloading (процент, «Отменить») → проверка размера и SHA-256 →
   needPerm (нет права ставить приложения: экран настроек, после возврата — дальше само) →
   installing (открыто окно Android «Установить?» — тихой установки не бывает).
   error — «Повторить»; signer — новый APK подписан другим ключом: поверх не встанет. */
export let updState = { state: "idle", loaded: 0, total: 0, error: "", version: "" };

export const updSubs = new Set();

export const updSet = (patch) => { updState = { ...updState, ...patch }; updSubs.forEach((f) => f()); };

export const useUpdState = () => useSyncExternalStore((f) => { updSubs.add(f); return () => updSubs.delete(f); }, () => updState);

export async function updProceed() {
  if (!(await updateCanInstall())) { updSet({ state: "needPerm" }); return; }
  try { await updateInstall(); updSet({ state: "installing" }); }
  catch (e) { updSet({ state: "error", error: e?.message || "Не получилось открыть установщик Android" }); }
}

export async function updStart(info) {
  if (["downloading", "installing"].includes(updState.state) && updState.version === info.version) {
    if (updState.state === "installing") updProceed(); // «Открыть установщик ещё раз»
    return;
  }
  // Подпись: Android ставит обновление поверх только с тем же ключом — проверяем заранее
  if (info.signer) {
    const mine = await updateSigner();
    if (mine && mine !== info.signer) { updSet({ state: "signer", version: info.version }); return; }
  }
  updSet({ state: "downloading", loaded: 0, total: info.size || 0, error: "", version: info.version });
  try {
    await updateDownload(info, (loaded, total) => updSet({ loaded, total: total || info.size || 0 }));
  } catch (e) {
    if (e?.code === "cancel") { updSet({ state: "idle" }); return; }
    updSet({ state: "error", error: e?.message || "Не скачалось — проверьте интернет и повторите" });
    return;
  }
  await updProceed();
}

// Вернулись из настроек «Установка неизвестных приложений» — продолжаем сами
export const updResume = () => { if (updState.state === "needPerm") updProceed(); };
