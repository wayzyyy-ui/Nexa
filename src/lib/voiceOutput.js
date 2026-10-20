/* Голосовой вывод: прочитать вслух готовый ответ ИИ — Ассистента. Только по нажатию человека,
   само ничего не озвучивает.

   Чем читаем:
   - Android-приложение — системный синтез речи телефона через свой модуль NexaTtsPlugin.java
     (встроенный браузер приложения синтез речи не поддерживает надёжно);
   - сайт — синтез речи браузера (SpeechSynthesis). Нужен русский голос (ru): список голосов
     браузер отдаёт не сразу (событие voiceschanged). Русского голоса нет — кнопку не показываем.
   Ни звук, ни текст никуда не отправляем (кроме того, что делает сам синтезатор устройства).

   Длинный текст режем на фразы: браузер обрывает длинное произнесение (~15 с), очередь из фраз
   читаем по одной. Перед новым чтением — cancel: зависшая очередь браузера иначе молчит.
   Остановка — stopSpeaking(): новое чтение, микрофон, уход с экрана, смена диалога, уход в фон.

   Состояние — { supported, speakingId, error }: speakingId — какой ответ читается сейчас
   (кнопка «Остановить» у него), error — короткий текст, гаснет сам. */
import { useSyncExternalStore } from "react";
import { registerPlugin } from "@capacitor/core";
import { isNative } from "../native.js";
import { speechText, speechParts } from "./speechText.js";

const LANG = "ru-RU";
const ERROR_MS = 6000;

const NativeTts = isNative ? registerPlugin("NexaTts") : null;
const synth = !isNative && typeof window !== "undefined" ? window.speechSynthesis || null : null;
const Utterance = typeof window !== "undefined" ? window.SpeechSynthesisUtterance || null : null;

/* ── Состояние ── */
// errorId — у какого ответа показать ошибку
let state = { supported: false, speakingId: null, error: "", errorId: null };
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useVoiceOutput = () => useSyncExternalStore(subscribe, () => state, () => state);
let errorTimer = 0;
const fail = (text, id = state.speakingId) => {
  set({ speakingId: null, error: text, errorId: id });
  clearTimeout(errorTimer); errorTimer = setTimeout(() => set({ error: "", errorId: null }), ERROR_MS);
};

/* ── Доступность ── */
let ruVoice = null;
const pickVoice = () => {
  const voices = synth?.getVoices?.() || [];
  ruVoice = voices.find((v) => v.lang === LANG) || voices.find((v) => /^ru/i.test(v.lang)) || null;
  set({ supported: !!ruVoice });
};
if (synth && Utterance) {
  pickVoice();
  // Голоса приходят позже — ждём событие (Chrome) и на всякий случай смотрим ещё раз
  synth.addEventListener?.("voiceschanged", pickVoice);
  setTimeout(pickVoice, 1500);
}
if (NativeTts) {
  NativeTts.available().then((r) => set({ supported: !!r?.available && !!r?.ru })).catch(() => set({ supported: false }));
  NativeTts.addListener("done", (e) => { if (e?.id === state.speakingId) set({ speakingId: null }); });
  NativeTts.addListener("error", (e) => { if (e?.id === state.speakingId) fail("Не удалось прочитать ответ вслух"); });
}

/* ── Чтение ── */
let gen = 0; // номер чтения: события прошлых чтений после cancel игнорируем

export function stopSpeaking() {
  gen++;
  if (synth) { try { synth.cancel(); } catch { /* браузер мог уже остановиться */ } }
  if (NativeTts) NativeTts.stop().catch(() => {});
  if (state.speakingId) set({ speakingId: null });
}

// id — какой ответ читаем (для кнопки), text — исходный текст ответа (с разметкой)
export function speak(id, text) {
  stopSpeaking();
  const parts = speechParts(speechText(text));
  if (!parts.length) { fail("В этом ответе нечего читать вслух", id); return; }
  if (!state.supported) { fail("Озвучка на этом устройстве недоступна", id); return; }
  const my = ++gen;
  set({ speakingId: id, error: "", errorId: null });

  if (NativeTts) {
    NativeTts.speak({ id: String(id), parts, lang: LANG }).catch(() => { if (my === gen) fail("Не удалось прочитать ответ вслух"); });
    return;
  }
  // Браузер: фразы по очереди; следующая — по окончании предыдущей
  let i = 0;
  const next = () => {
    if (my !== gen) return;
    if (i >= parts.length) { set({ speakingId: null }); return; }
    const u = new Utterance(parts[i++]);
    u.lang = LANG;
    if (ruVoice) u.voice = ruVoice;
    u.onend = next;
    u.onerror = (e) => {
      if (my !== gen) return;
      // interrupted / canceled — это мы сами остановили
      if (e?.error === "interrupted" || e?.error === "canceled") return;
      fail(e?.error === "not-allowed" ? "Браузер не дал включить звук — нажмите ещё раз" : "Не удалось прочитать ответ вслух");
      gen++;
    };
    try { synth.speak(u); } catch { fail("Не удалось прочитать ответ вслух"); gen++; }
  };
  next();
}

// Ушли в фон (свернули, заблокировали экран, другая вкладка) — замолкаем
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.hidden && state.speakingId) stopSpeaking(); });
  window.addEventListener("pagehide", () => { if (state.speakingId) stopSpeaking(); });
}
