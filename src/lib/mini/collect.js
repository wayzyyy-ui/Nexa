/* Сбор непонятых фраз для дообучения NEXA Mini — ТОЛЬКО с согласия человека.
   Чистые правила без интерфейса и сети (тесты — tests/mini-collect.test.mjs). Ход — useMiniCollect (collectHook.js).

   Что собираем: фразы, которые дошли до Mini и НЕ выполнились командой — Mini не уверена
   (уверенность ниже порога, но не нулевая) или предохранитель отменил её решение.
   Не собираем: то, что выполнили правила или Mini, вопросы-объяснения, длинные сообщения,
   сообщения с файлом, команды памяти, похожее на пароли, ссылки, почты, телефоны и длинные числа.
   Уходит только текст фразы, догадка сети и её уверенность — без аккаунта, устройства и имени. */
import { isSensitive } from "../textcheck.js";

export const COLLECT_MAX_WORDS = 12;
export const COLLECT_MAX_CHARS = 120;
export const COLLECT_DAY_MAX = 20;            // не больше фраз с устройства за сутки
export const COLLECT_SEND_GAP_MS = 5 * 60e3;  // пачкой, не чаще раза в 5 минут
export const COLLECT_ASK_DELAY_MS = 2500;     // окно «Помочь улучшить?» — через пару секунд после входа на Главную
const DAY_MS = 24 * 3600e3;

// Ключи на этом устройстве
export const CONSENT_KEY = "nexa-mini-help";      // true — согласие дано; false или нет — выключено
export const ASKED_KEY = "nexa-mini-help-asked";  // карточку уже показывали (ответ «Нет» — тоже сюда)
export const QUEUE_KEY = "nexa-mini-queue";       // { items: [{ text, intent, confidence }], sentDay, sentCount, lastSend, seen: [отпечатки] }

// Похоже на личное: ссылка, почта, телефон, длинное число (карта, счёт, код)
const LINK = /(https?:\/\/|www\.|[a-zа-я0-9-]+\.(ru|рф|com|net|org|io|su)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+/;
const PHONE = /(\+?\d[\d\s()-]{8,}\d)/;
const LONG_NUM = /\d{5,}/;
// Команды памяти («запомни…», «забудь…») не берём совсем — в них личные сведения
const MEMORY_CMD = /^(запомни|запомнить|не запоминай|забудь|что ты обо мне помнишь|что ты помнишь)/;

// Слова про секреты — фразу не берём целиком, даже если сам пароль не написан
const SECRET_WORD = /(парол|password|passwd|пин код|пинкод|pin|логин|login|токен|token|cvv|cvc|секретн)/i;
// Слово похоже на пароль: длинное и пёстрое (буквы разного регистра, цифры, знаки)
// (знаки по краям слова — «Настройки,» — не считаем, иначе обычные слова с запятой похожи на пароль)
const looksSecret = (word) => { const w = word.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""); return w.length >= 8 && [/[a-zа-я]/, /[A-ZА-Я]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(w)).length >= 3; };

const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();

/* Можно ли эту фразу отправить (проверка и на сервере тоже). Ответ — причина отказа или null */
export function phraseProblem(text) {
  const t = norm(text);
  if (!t) return "empty";
  if (t.length > COLLECT_MAX_CHARS) return "long";
  if (t.split(" ").length > COLLECT_MAX_WORDS) return "long";
  const low = t.toLowerCase().replace(/ё/g, "е");
  if (MEMORY_CMD.test(low)) return "memory";
  if (LINK.test(t) || EMAIL.test(t)) return "link";
  if (PHONE.test(t) || LONG_NUM.test(t)) return "number";
  if (SECRET_WORD.test(low) || isSensitive(t) || t.split(" ").some((w) => isSensitive(w) || looksSecret(w))) return "sensitive";
  return null;
}

/* Стоит ли собирать это решение Mini (decide из index.js): { run, reason, guess } */
export function worthCollecting(decision) {
  if (!decision || decision.run) return false;                     // выполнили — значит поняла
  if (decision.reason !== "unsure" && decision.reason !== "no-cue") return false;
  const c = decision.guess?.confidence;
  return typeof c === "number" && c > 0;
}

// Короткий отпечаток фразы (FNV-1a) — чтобы не слать одно и то же дважды
export function phraseKey(text) {
  let h = 0x811c9dc5;
  const s = norm(text).toLowerCase().replace(/ё/g, "е");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export const emptyQueue = () => ({ items: [], sentDay: 0, sentCount: 0, lastSend: 0, seen: [] });

/* Добавить фразу в очередь. Без согласия — очередь не трогаем вовсе.
   Возвращает новую очередь (или ту же, если добавлять нельзя) */
export function enqueuePhrase(queue, { text, decision, consent, online = true, now = Date.now() }) {
  const q = queue || emptyQueue();
  // Без сети не копим: отправить всё равно нельзя, а хранить лишнее на устройстве незачем
  if (!consent || !online || !worthCollecting(decision)) return q;
  if (phraseProblem(text)) return q;
  const key = phraseKey(text);
  if (q.seen.includes(key)) return q;
  // Сутки сменились — счётчик с начала
  const sameDay = now - q.sentDay < DAY_MS;
  const used = (sameDay ? q.sentCount : 0) + q.items.length;
  if (used >= COLLECT_DAY_MAX) return q;
  const g = decision.guess;
  return {
    ...q,
    items: [...q.items, { text: norm(text), intent: String(g.label || ""), confidence: Math.round(g.confidence * 1000) / 1000 }],
    seen: [...q.seen, key].slice(-300),
  };
}

/* Что отправить сейчас: { batch, queue } — batch пустой, если рано, нет согласия, нет сети или нечего */
export function takeBatch(queue, { consent, online, now = Date.now() }) {
  const q = queue || emptyQueue();
  if (!consent || !online || !q.items.length) return { batch: [], queue: q };
  if (now - q.lastSend < COLLECT_SEND_GAP_MS) return { batch: [], queue: q };
  const sameDay = now - q.sentDay < DAY_MS;
  const left = COLLECT_DAY_MAX - (sameDay ? q.sentCount : 0);
  if (left <= 0) return { batch: [], queue: q };
  const batch = q.items.slice(0, left);
  return {
    batch,
    queue: { ...q, items: q.items.slice(batch.length), lastSend: now, sentDay: sameDay ? q.sentDay : now, sentCount: (sameDay ? q.sentCount : 0) + batch.length },
  };
}

// Отправка не удалась (нет связи, сервер не ответил) — фразы не копим заново: выбрасываем, это не страшно
// (не хранить лишнего важнее, чем не потерять пару примеров)

// Показать ли карточку «Помочь улучшить ассистента?»
export function shouldAsk({ consent, asked }) {
  return !consent && !asked;
}
