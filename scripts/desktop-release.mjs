/* Правила выпуска приложения для ПК (без файлов и сборки — их проверяют тесты
   tests/desktop-release.test.mjs). Сам выпуск — scripts/release-desktop.mjs. */
import { cmpVersion } from "../src/lib/otaPlan.js";

/* Минимальная версия (старше неё — экран «Обновите NEXA», без «Позже»).
   prev — прошлый блок desktop из version.json (или null), mode — "hard" | "soft" | "".
   По умолчанию — как у APK: минимальная = прошлый выпуск (пропустившие два выпуска обязаны обновиться).
   hard — сразу эта версия (закрыть все старые), soft — оставить прежнюю минимальную.
   Повторный выпуск той же версии минимальную не поднимает */
export function desktopMinVersion({ prev, version, mode = "" }) {
  if (mode === "hard") return version;
  const before = prev?.minVersion || null;
  if (mode === "soft" || !prev?.version) return before;
  return cmpVersion(prev.version, version) < 0 ? prev.version : before;
}

// Блок desktop в public/version.json — его читают сайт («Скачать») и приложение («Обновить»)
export function desktopBlock({ version, size, sha256, notes, minVersion }) {
  return {
    version,
    url: "/nexa-setup.exe",
    exeUrl: `/nexa-setup.exe?v=${version}`, // номер в ссылке — браузер и Vercel не отдадут старый файл из кэша
    size, sha256, notes,
    ...(minVersion ? { minVersion } : {}),
  };
}

/* public/desktop/latest.json — формат модуля обновлений Tauri (tauri-plugin-updater):
   откуда скачать установщик и его подпись. Подпись проверяет само приложение открытым ключом */
export function latestJson({ version, notes, signature, url, pubDate }) {
  return {
    version,
    notes: notes.map((n) => `- ${n}`).join("\n"),
    pub_date: pubDate,
    platforms: { "windows-x86_64": { signature, url } },
  };
}

// Адрес сервера — только https и без хвоста «/»
export function apiBase(envText) {
  const m = /^\s*VITE_API_BASE\s*=\s*(\S+)\s*$/m.exec(envText || "");
  const v = m ? m[1].replace(/^["']|["']$/g, "").replace(/\/+$/, "") : "";
  return /^https:\/\/[a-z0-9.-]+$/i.test(v) ? v : null;
}
