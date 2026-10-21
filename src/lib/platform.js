/* На чём запущена NEXA: "android" — приложение Capacitor, "desktop" — приложение для ПК (Tauri),
   "web" — обычный сайт. Без зависимостей — проверяется тестами (tests/platform.test.mjs).

   Приложение для ПК узнаём по объекту, который Tauri кладёт в окно (__TAURI_INTERNALS__),
   и по режиму сборки (vite --mode desktop): сборка для ПК без Tauri (например, открыта в браузере
   для проверки) тоже ведёт себя как приложение для ПК. */
export function detectPlatform({ win, capacitorNative = false, mode = "" } = {}) {
  if (capacitorNative) return "android";
  if (mode === "desktop") return "desktop";
  if (win && (win.__TAURI_INTERNALS__ || win.__TAURI__)) return "desktop";
  return "web";
}

const platform = detectPlatform({
  win: typeof window !== "undefined" ? window : null,
  capacitorNative: typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.(),
  mode: (() => { try { return import.meta.env?.MODE || ""; } catch { return ""; } })(),
});
export const PLATFORM = platform;
export const isDesktop = platform === "desktop";
