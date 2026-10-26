/* Облегчённый режим: без размытия фона под «стеклом», без аур ассистента и бесконечных анимаций,
   спектральный фон ассистента — один неподвижный кадр. Нужен слабым телефонам и при экономии заряда.
   Настройка на устройстве — nexa-lite: "auto" (по умолчанию) | "on" | "off".
   Авто включается: экономия трафика, слабый сенсорный телефон (≤ 3 ГБ памяти или ≤ 4 ядра),
   заряд ≤ 20 % без зарядки. Класс nx-lite у html меняется редко (только при этих событиях) */
const KEY = "nexa-lite";
export const LITE_EVENT = "nexa-lite-change";

let lowBattery = false;

export function readLitePref() {
  try { const v = localStorage.getItem(KEY); return v === "on" || v === "off" ? v : "auto"; } catch { return "auto"; }
}

// Почему режим включился сам (null — не включился бы)
export function liteAutoReason() {
  const n = typeof navigator === "undefined" ? {} : navigator;
  if (n.connection?.saveData) return "экономия трафика";
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && ((n.deviceMemory && n.deviceMemory <= 3) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4))) return "слабый телефон";
  if (lowBattery) return "мало заряда";
  return null;
}

export function liteActive(pref = readLitePref()) {
  return pref === "on" || (pref === "auto" && !!liteAutoReason());
}

export function applyLite() {
  const on = liteActive();
  const root = document.documentElement;
  if (root.classList.contains("nx-lite") !== on) root.classList.toggle("nx-lite", on);
  window.dispatchEvent(new Event(LITE_EVENT));
}

export function setLitePref(v) {
  try { if (v === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* не страшно */ }
  applyLite();
}

// Один раз при запуске (main.jsx): сразу класс, потом следим за зарядом
export function initLite() {
  applyLite();
  navigator.getBattery?.().then((b) => {
    const check = () => {
      const low = !b.charging && b.level <= 0.2;
      if (low !== lowBattery) { lowBattery = low; applyLite(); }
    };
    check();
    b.addEventListener?.("levelchange", check);
    b.addEventListener?.("chargingchange", check);
  }).catch(() => {});
}
