/* Режим разговора с ИИ — Ассистентом: сказал фразу → ответ → NEXA читает его вслух → снова слушает.

   Ничего нового и платного: распознавание — тот же голосовой ввод (src/lib/voice.js: браузер или
   системный сервис телефона), вопрос — та же отправка в чат (sendMessage → /api/chat, тот же список
   моделей Gemini, один запрос на одну фразу, как при обычном вводе), чтение — та же озвучка
   (src/lib/voiceOutput.js: SpeechSynthesis браузера или системный TextToSpeech Android).

   Ход (phase): listening — слушаем одну фразу → thinking — ждём ответ в чате → speaking — читаем
   его → снова listening. paused — микрофон выключен (кнопкой или после тишины), off — разговор
   закончен. Свой голос NEXA не слышит: микрофон включается только после того, как чтение
   закончилось, и ещё через ECHO_MS — пока затихнет звук. Ошибки микрофона и разрешения, нет сети,
   ответ не получен — разговор останавливается с понятной причиной (note). */
import { useEffect, useRef, useState } from "react";
import { speak, stopSpeaking } from "./voiceOutput.js";
import { VOICE_ERRORS } from "./voice.js";

const ECHO_MS = 500;      // после чтения: дать звуку затихнуть, потом микрофон
const ANSWER_MS = 90000;  // ответа так и нет — снова слушаем
const QUIET_TRIES = 2;    // столько фраз подряд тишина — ставим на паузу
export const CONV_PHASES = ["off", "listening", "thinking", "speaking", "paused"];

/* voice — useVoiceInput (listen, cancel, supported, heard); send(text) — отправить в чат;
   lastAi — последний ответ ассистента { at, text, error, speakId } или null; tts — useVoiceOutput.
   Возвращает { phase, muted, note, start, end, toggleMute, skip, onVoiceEnd } —
   onVoiceEnd передать в useVoiceInput({ onEnd }) */
export function useConversation({ voice, send, lastAi, tts }) {
  const [phase, setPhase] = useState("off");
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState("");
  const fresh = useRef({}); // свежие значения для таймеров и событий
  fresh.current = { phase, muted, voice, send };
  const timer = useRef(0), sentAt = useRef(0), quiet = useRef(0), reading = useRef(null);

  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
  // Фаза — сразу и в состояние, и в «свежие» значения: события микрофона приходят синхронно
  const go = (p) => { fresh.current.phase = p; setPhase(p); };
  const listen = (force) => {
    clearTimeout(timer.current);
    if (fresh.current.muted && !force) { go("paused"); return; }
    go("listening");
    fresh.current.voice.listen();
  };
  const end = (why = "") => {
    clearTimeout(timer.current);
    if (fresh.current.phase === "off" && !why) return;
    go("off"); setMuted(false); setNote(why);
    fresh.current.voice.cancel();
    stopSpeaking();
  };
  const start = () => {
    if (!voice.supported) return;
    stopSpeaking();
    quiet.current = 0; setNote(""); setMuted(false);
    if (navigator.onLine === false) { setNote("Нет связи — разговор работает только с интернетом"); return; }
    listen(true);
  };

  // Фраза закончилась (useVoiceInput → onEnd)
  const onVoiceEnd = ({ text, code, released, phrase }) => {
    if (!phrase || fresh.current.phase !== "listening") return;
    // Начали печатать или отправили сами — микрофон на паузу, разговор ждёт кнопки «Вкл. микрофон»
    if (released) { go("paused"); setMuted(true); return; }
    if (code && code !== "no-speech") { end(VOICE_ERRORS[code] || VOICE_ERRORS.service); return; }
    if (!text) {
      // Тишина: ещё раз послушать, потом — пауза (не держим микрофон впустую)
      if (++quiet.current >= QUIET_TRIES) { go("paused"); setMuted(true); setNote("Не слышно — включите микрофон, когда будете готовы"); }
      else later(() => listen(), 300);
      return;
    }
    quiet.current = 0;
    if (navigator.onLine === false) { end("Нет связи — разговор остановлен"); return; }
    sentAt.current = Date.now();
    go("thinking");
    fresh.current.send(text);
    later(() => { if (fresh.current.phase === "thinking") listen(); }, ANSWER_MS);
  };

  // Пришёл ответ на эту фразу — читаем вслух (нет голоса на устройстве — сразу слушаем дальше)
  useEffect(() => {
    if (phase !== "thinking" || !lastAi || !(lastAi.at >= sentAt.current)) return;
    clearTimeout(timer.current);
    if (lastAi.error) { end("Ответ не получен — разговор остановлен. Проверьте связь и начните снова"); return; }
    if (!tts.supported || !lastAi.text?.trim()) { later(() => listen(), ECHO_MS); return; }
    reading.current = lastAi.speakId;
    go("speaking");
    speak(lastAi.speakId, lastAi.text);
  }, [phase, lastAi?.at]);

  // Дочитали или чтение остановили — пауза на затихание звука и снова микрофон
  useEffect(() => {
    if (phase === "speaking" && tts.speakingId !== reading.current) later(() => { if (fresh.current.phase === "speaking") listen(); }, ECHO_MS);
  }, [phase, tts.speakingId]);

  // Ушли в фон, пропала сеть, ушли с экрана — разговор заканчивается
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") end(""); };
    const offline = () => { if (fresh.current.phase !== "off") end("Нет связи — разговор остановлен"); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("offline", offline);
      clearTimeout(timer.current);
    };
  }, []);

  // Причина остановки гаснет сама
  useEffect(() => {
    if (!note || phase !== "off") return;
    const t = setTimeout(() => setNote(""), 7000);
    return () => clearTimeout(t);
  }, [note, phase]);

  const toggleMute = () => {
    if (muted || phase === "paused") { setMuted(false); setNote(""); quiet.current = 0; if (phase === "paused" || phase === "listening") listen(true); return; }
    setMuted(true);
    if (phase === "listening") { fresh.current.voice.cancel(); go("paused"); }
  };
  // «Остановить речь» — замолчать и сразу слушать следующую фразу
  const skip = () => stopSpeaking();

  return { phase, muted, note, active: phase !== "off", start, end, toggleMute, skip, onVoiceEnd };
}
