/* Ход сбора непонятых фраз (правила — collect.js). Живёт в NexaApp: согласие нужно и Настройкам,
   и карточке в ассистенте, и центру безопасности. Всё хранится только на этом устройстве.
   Без согласия: в очередь ничего не пишем, на сервер ничего не уходит */
import { useCallback, useEffect, useRef } from "react";
import { useSharedState } from "../shared.js";
import { API_BASE } from "../../native.js";
import { CONSENT_KEY, ASKED_KEY, QUEUE_KEY, emptyQueue, enqueuePhrase, takeBatch, shouldAsk } from "./collect.js";

export const PHRASES_URL = `${API_BASE}/api/phrases`;

const readJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
// useSharedState хранит JSON: true / false. Всё, что не true, — согласия нет
const loadConsent = (key) => readJSON(key, false) === true;
const loadAsked = (key) => readJSON(key, { asked: false });
const loadQueue = (key) => ({ ...emptyQueue(), ...readJSON(key, {}) });

export function useMiniCollect({ online }) {
  const [consent, setConsentRaw] = useSharedState(CONSENT_KEY, loadConsent);
  const [ask, setAsk] = useSharedState(ASKED_KEY, loadAsked);
  const [queue, setQueue] = useSharedState(QUEUE_KEY, loadQueue);
  const queueRef = useRef(queue); queueRef.current = queue;
  const sending = useRef(false);

  // Выключили — очередь сразу стираем (не держим ни одной фразы без согласия)
  const setConsent = useCallback((on) => {
    setConsentRaw(!!on);
    setAsk((a) => ({ ...a, asked: true }));
    if (!on) setQueue(emptyQueue());
  }, [setConsentRaw, setAsk, setQueue]);

  /* Решение по сообщению ассистенту (вызывает ScreenAssistant для каждого вопроса без файла):
     с согласием кладём непонятую фразу в очередь, без согласия — ничего */
  const onMessage = useCallback((text, decision) => {
    if (!consent) return;
    setQueue((q) => enqueuePhrase(q, { text, decision, consent, online }));
  }, [consent, online, setQueue]);

  // Отправка пачкой: раз в минуту смотрим, не пора ли (сам интервал между пачками — 5 минут, правило в collect.js)
  const flush = useCallback(async () => {
    if (sending.current) return;
    const { batch, queue: next } = takeBatch(queueRef.current, { consent, online: online && navigator.onLine !== false });
    if (!batch.length) return;
    sending.current = true;
    setQueue(next); // не получилось отправить — фразы не возвращаем: лишнего не храним
    try {
      await fetch(PHRASES_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrases: batch }), keepalive: true,
      });
    } catch { /* нет связи — не страшно */ } finally { sending.current = false; }
  }, [consent, online, setQueue]);
  useEffect(() => {
    if (!consent) return;
    flush();
    const t = setInterval(flush, 60e3);
    return () => clearInterval(t);
  }, [consent, flush]);
  // Новая фраза в очереди — пробуем через несколько секунд (если с прошлой пачки прошло 5 минут, уйдёт сразу)
  const queued = queue.items.length;
  useEffect(() => {
    if (!consent || !queued) return;
    const t = setTimeout(flush, 3000);
    return () => clearTimeout(t);
  }, [consent, queued, flush]);

  return {
    consent, setConsent,
    showAsk: shouldAsk({ consent, asked: !!ask.asked }),
    answerAsk: (yes) => setConsent(!!yes),
    dismissAsk: () => setAsk((a) => ({ ...a, asked: true })), // закрыли по Esc — тоже больше не спрашиваем
    onMessage,
  };
}
