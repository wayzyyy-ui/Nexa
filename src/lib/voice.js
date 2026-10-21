/* Голосовой ввод в ИИ-ассистента: речь → текст в поле ввода. Отправляет человек сам.

   Где что распознаёт:
   - сайт — распознавание речи браузера (SpeechRecognition / webkitSpeechRecognition: Chrome, Edge, Safari).
     Chrome и Edge отправляют звук на сервер своей компании — нужен интернет. В Firefox функции нет —
     кнопку микрофона не показываем;
   - Android-приложение — системный распознаватель телефона через свой модуль NexaSpeechPlugin.java
     (встроенный браузер приложения распознавать не умеет). Обычно это сервис Google, он тоже может
     работать через интернет.
   Мы звук не записываем, не храним и никуда не отправляем — получаем только готовый текст.
   В журналы распознанный текст не пишем.

   Как текст попадает в поле: то, что уже было написано, остаётся (base), распознанное
   дописывается после пробела и обновляется по ходу речи — без повторов, потому что каждый раз
   собираем фразу целиком заново. «Отмена» возвращает поле к base, ошибка поле не трогает.
   Человек начал печатать во время диктовки — диктовка тихо прекращается, его текст главнее.

   Состояния (state): idle — ждём; permission — спрашиваем доступ к микрофону; listening — слушаем
   (heard — текст уже пошёл); finishing — договорили, ждём итог; ошибка — error (текст причины,
   state снова idle). Зависнуть «на записи» нельзя: сторож прекращает тишину без событий,
   уход NEXA в фон и уход с экрана ассистента останавливают диктовку. */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { isNative, isDesktop } from "../native.js";

const LANG = "ru-RU";
const SILENT_MS = 15000;    // столько ждём первых слов, дальше — «не расслышал»
const MAX_MS = 120000;      // одна диктовка не дольше двух минут
const FINISH_MS = 6000;     // после «стоп» итог должен прийти за это время, иначе закрываем сами

const NativeSpeech = isNative ? registerPlugin("NexaSpeech") : null;
const WebRec = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;

// Есть ли чем распознавать здесь вообще (без запросов разрешений)
// Приложение для ПК: в WebView2 распознавание есть «на бумаге», но сразу падает с ошибкой
// network — службы распознавания у встроенного браузера Windows нет (проверено 2026-10-21).
// Поэтому на ПК микрофона и «Начать разговор» нет совсем, а не сломанная кнопка
export const voiceKind = NativeSpeech ? "native" : WebRec && !isDesktop ? "web" : null;

export const VOICE_ERRORS = {
  denied: isNative
    ? "Нет доступа к микрофону. Разрешите его в настройках телефона — а пока можно писать текстом"
    : "Нет доступа к микрофону. Разрешите его в настройках браузера — а пока можно писать текстом",
  unavailable: "Распознавание речи здесь недоступно — напишите текстом",
  network: "Нет связи — распознавание речи работает через интернет",
  "no-speech": "Не расслышал — нажмите на микрофон и скажите ещё раз",
  audio: "Микрофон занят другим приложением или не найден",
  busy: "Распознавание занято — попробуйте через пару секунд",
  language: "Русский язык для распознавания недоступен на этом устройстве",
  service: "Распознавание прервалось — попробуйте ещё раз",
};
// Коды ошибок браузера → наши
const WEB_CODES = { "not-allowed": "denied", "service-not-allowed": "denied", network: "network", "no-speech": "no-speech",
  "audio-capture": "audio", "language-not-supported": "language", "bad-grammar": "service" };

// Склеить куски фразы: без двойных пробелов и пустых кусков
const joinParts = (parts) => parts.map((t) => String(t || "").trim()).filter(Boolean).join(" ");

/* getText() — текущий текст поля, setText(t) — записать в поле.
   onEnd({ text, code, released, phrase }) — сессия закончилась (для режима разговора, src/lib/conversation.js):
   text — что сказано в этой сессии, code — ошибка (VOICE_ERRORS) или null, released — отменили сами.
   Возвращает { supported, state, heard, error, toggle, listen, stop, cancel, release, clearError };
   listen() — одна фраза с пустого поля (режим разговора), обычная диктовка — toggle() */
export function useVoiceInput({ getText, setText, onEnd }) {
  const [supported, setSupported] = useState(!!voiceKind);
  const [state, setState] = useState("idle");
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState(null);
  const io = useRef({ getText, setText, onEnd });
  io.current = { getText, setText, onEnd };
  // Текущая сессия. Номер (id) отсекает запоздалые события прошлых сессий
  const sess = useRef(null);
  const seq = useRef(0);

  // В приложении — есть ли на телефоне сервис распознавания (без запроса разрешения)
  useEffect(() => {
    if (!NativeSpeech) return;
    NativeSpeech.available().then((r) => setSupported(!!r?.available)).catch(() => setSupported(false));
  }, []);

  // Закончить сессию: снять слушателей, таймеры, вернуть «ожидание»
  const finish = useCallback((s, errCode) => {
    if (!s || sess.current !== s) return;
    sess.current = null;
    clearTimeout(s.timer);
    s.subs?.forEach((p) => Promise.resolve(p).then((h) => h?.remove?.()).catch(() => {}));
    if (s.rec) { s.rec.onresult = s.rec.onerror = s.rec.onend = s.rec.onaudiostart = null; }
    setState("idle"); setHeard(false);
    // Фразу для разговора ошибку покажет сам разговор — не дублируем её под полем
    if (errCode && !s.phrase) setError(VOICE_ERRORS[errCode] || VOICE_ERRORS.service);
    const said = s.last ? s.last.slice(s.base.length).trim() : "";
    try { io.current.onEnd?.({ text: said, code: errCode || null, released: s.released, phrase: !!s.phrase }); } catch { /* разговор сам разберётся */ }
  }, []);

  // Дописать распознанное после текста, который был до диктовки
  const apply = (s, spoken) => {
    if (sess.current !== s || s.released) return;
    const t = spoken.trim();
    if (!t) return;
    const next = s.base + (s.base && !/\s$/.test(s.base) ? " " : "") + t;
    s.last = next;
    io.current.setText(next);
    setHeard(true);
    setState((st) => (st === "permission" ? "listening" : st));
    arm(s, MAX_MS);
  };

  // Сторож: сессия без событий слишком долго — прекращаем (молча или «не расслышал»)
  const arm = (s, ms, code) => {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { abortEngine(s); finish(s, code); }, ms);
  };
  const abortEngine = (s) => {
    try { s.rec?.abort(); } catch { /* уже остановлен */ }
    if (s.native) NativeSpeech.cancel().catch(() => {});
  };

  // phrase — одна фраза с пустого поля (режим разговора): браузер сам заканчивает на паузе в речи
  const start = async ({ phrase = false } = {}) => {
    if (sess.current || !voiceKind) return;
    setError(null);
    const s = { id: ++seq.current, base: phrase ? "" : io.current.getText() || "", last: null, released: false, native: !!NativeSpeech, phrase };
    sess.current = s;
    if (!NativeSpeech && navigator.onLine === false) { finish(s, "network"); return; }
    // «Разрешите доступ…» — только если разрешения ещё нет (в приложении знаем заранее)
    let granted = false;
    if (NativeSpeech) { try { granted = (await NativeSpeech.available())?.permission === "granted"; } catch { /* узнаем при запуске */ } }
    if (sess.current !== s) return;
    setState(granted ? "listening" : "permission");

    if (NativeSpeech) {
      s.subs = [
        NativeSpeech.addListener("partial", (e) => apply(s, e?.text || "")),
        NativeSpeech.addListener("final", (e) => apply(s, e?.text || "")),
        NativeSpeech.addListener("error", (e) => finish(s, s.released || e?.code === "no-speech" && s.last ? null : e?.code || "service")),
        NativeSpeech.addListener("end", () => finish(s)),
      ];
      try {
        s.asking = true; // окно разрешения Android может на миг увести NEXA «в фон» — это не уход
        await NativeSpeech.start({ lang: LANG });
        s.asking = false;
        // Пока ждали, диктовку уже отменили — микрофон сразу выключаем
        if (sess.current !== s) { NativeSpeech.cancel().catch(() => {}); return; }
        setState("listening");
        arm(s, SILENT_MS, "no-speech");
      } catch (e) {
        finish(s, ["denied", "unavailable"].includes(e?.code) ? e.code : "service");
      }
      return;
    }

    // Сайт: распознавание браузера. На телефоне режим «одна фраза» — в непрерывном
    // мобильный Chrome повторяет уже сказанное
    const rec = new WebRec();
    s.rec = rec;
    rec.lang = LANG;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = !phrase && !window.matchMedia?.("(pointer: coarse)").matches;
    rec.onaudiostart = () => { if (sess.current === s) { setState("listening"); arm(s, SILENT_MS, "no-speech"); } };
    rec.onresult = (e) => {
      // Каждый раз собираем всю фразу заново из всех кусков — так слова не дублируются
      const parts = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0]?.transcript);
      apply(s, joinParts(parts));
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return; // это мы сами остановили
      finish(s, s.released || (e.error === "no-speech" && s.last) ? null : WEB_CODES[e.error] || "service");
    };
    rec.onend = () => finish(s);
    try { rec.start(); } catch { finish(s, "service"); }
  };

  // «Стоп»: договорили — ждём итог (он допишется сам) и возвращаемся в ожидание
  const stop = () => {
    const s = sess.current;
    if (!s) return;
    setState("finishing");
    arm(s, FINISH_MS);
    try { s.rec?.stop(); } catch { /* уже остановлен */ }
    if (s.native) NativeSpeech.stop().catch(() => {});
  };
  // «Отмена»: бросить диктовку, вернуть поле к тексту, что был до неё
  const cancel = () => {
    const s = sess.current;
    if (!s) return;
    if (s.last !== null && !s.released) io.current.setText(s.base);
    s.released = true;
    abortEngine(s);
    finish(s);
  };
  // Человек сам правит поле во время диктовки — прекращаем, его текст оставляем как есть
  const release = () => {
    const s = sess.current;
    if (!s) return;
    s.released = true;
    abortEngine(s);
    finish(s);
  };
  const toggle = () => (sess.current ? stop() : start());

  // Ушли в фон — не слушаем незаметно; ушли с экрана — тоже
  useEffect(() => {
    const hidden = () => { const s = sess.current; if (document.visibilityState === "hidden" && s && !s.asking) { abortEngine(s); finish(s); } };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      const s = sess.current;
      if (s) { s.released = true; abortEngine(s); finish(s); }
    };
  }, [finish]);

  // Сообщение об ошибке гаснет само через 7 секунд
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(t);
  }, [error]);

  return { supported, state, heard, error, active: state !== "idle", toggle, listen: () => start({ phrase: true }), stop, cancel, release, clearError: () => setError(null) };
}
