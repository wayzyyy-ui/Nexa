// Подключение устройства по коду / QR: код, срок, блокировка после неверных попыток, разбор QR NEXA
import { isNative } from "../native.js";
import { PAIR_CODE_RE, PAIR_ALPHABET } from "./realtime.js";

/* ═══ ПОДКЛЮЧЕНИЕ УСТРОЙСТВА ПО КОДУ / QR ═════════════════════
   Устройство с окном «Подключить устройство» выдаёт одноразовый код (6 символов,
   2 минуты). Подключаемое устройство (вход в тот же аккаунт) шлёт pair.claim с кодом,
   выдавшее сверяет код у себя и отвечает pair.ok или pair.fail.
   Код живёт только в памяти выдавшего устройства и никуда не пишется */
export const PAIR_TTL_MS = 2 * 60 * 1000;     // код действует 2 минуты

export const PAIR_MAX_TRIES = 5;              // неверных попыток до блокировки

export const PAIR_LOCK_MS = 60 * 1000;        // блокировка на минуту

export const PAIR_ANSWER_MS = 6000;           // сколько ждём ответа на код

export const PAIR_LOCK_KEY = "nexa-pair-lock"; // у подключаемого: { wrong, until }

// Адрес для QR: на сайте — свой, в приложении — сайт NEXA
// Что за QR отсканировали: { pair: КОД } — подключение, { login: КОД } — вход
export function parseNexaQr(text) {
  try {
    const u = new URL(String(text).trim());
    const pair = (u.searchParams.get("pair") || "").toUpperCase();
    const login = (u.searchParams.get("login") || "").toUpperCase();
    if (PAIR_CODE_RE.test(pair)) return { pair };
    if (PAIR_CODE_RE.test(login)) return { login };
  } catch {}
  return null;
}

export const pairUrl = (code) => `${isNative ? "https://nexa-link.ru" : location.origin}/?pair=${code}`;

// Случайный код из «непохожих» символов (криптостойкий генератор)
export function makePairCode() {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => PAIR_ALPHABET[n % PAIR_ALPHABET.length]).join("");
}

export const readPairLock = () => { try { return JSON.parse(localStorage.getItem(PAIR_LOCK_KEY)) || { wrong: 0, until: 0 }; } catch { return { wrong: 0, until: 0 }; } };

export const savePairLock = (v) => { try { localStorage.setItem(PAIR_LOCK_KEY, JSON.stringify(v)); } catch {} };
