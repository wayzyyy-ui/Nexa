/* Память ассистента: только то, что человек сам попросил запомнить.
   Модель в память ничего не пишет и ничего о человеке не «выводит».
   Хранение: гость — только этот браузер (nexa-memory), вошедший — nexa-memory@<uid> и копия
   в облаке (таблица memory, supabase/memory.sql, RLS «только свои»). Включено ли — у каждого
   устройства своё (nexa-memory-on…). Выход стирает память аккаунта из браузера вместе с остальным.
   В запрос к модели уходят только подходящие к вопросу записи (pickMemory, считается здесь,
   без лишних обращений к модели), не больше MEMORY_SEND_MAX */
import { isSensitive } from "./realtime.js";

export const MEMORY_MAX = 50;        // записей
export const MEMORY_ITEM_MAX = 200;  // знаков в записи
export const MEMORY_SEND_MAX = 5;    // записей в одном запросе
export const MEMORY_SEND_CHARS = 900; // знаков памяти в одном запросе

export const memoryKey = (uid) => (uid ? `nexa-memory@${uid}` : "nexa-memory");
export const memoryOnKey = (uid) => (uid ? `nexa-memory-on@${uid}` : "nexa-memory-on");
export function loadMemory(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.text === "string").slice(0, MEMORY_MAX) : [];
  } catch { return []; }
}
export function loadMemoryOn(key) {
  try { return localStorage.getItem(key) !== "false"; } catch { return true; }
}

// Сравнение без регистра, знаков и лишних пробелов
export const normMemory = (t) => String(t || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Уже есть такая (или почти такая: одна содержит другую) запись
export const findSameMemory = (items, text) => {
  const n = normMemory(text);
  return items.find((m) => { const o = normMemory(m.text); return o === n || (n.length > 8 && (o.includes(n) || n.includes(o))); }) || null;
};

/* Можно ли запомнить: пусто, слишком длинно, похоже на пароль или ключ — нельзя.
   Возвращает { ok, text } или { ok: false, reason } */
export function checkMemoryText(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim().replace(/^[«"']|[»"']$/g, "");
  if (!text) return { ok: false, reason: "empty" };
  if (isSensitive(text) || /пароль|password|пин-?код|cvv|cvc|номер карты|токен|api[\s-]?key|секретн/i.test(text) || /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(text)) return { ok: false, reason: "sensitive" };
  if (text.length > MEMORY_ITEM_MAX) return { ok: false, reason: "long", text: text.slice(0, MEMORY_ITEM_MAX) };
  return { ok: true, text };
}
export const MEMORY_REFUSE = {
  empty: "Что запомнить? Напишите, например: «Запомни: отвечай кратко»",
  sensitive: "Пароли, коды, ключи и номера карт не запоминаю — так безопаснее",
  long: `Слишком длинно — запомню до ${MEMORY_ITEM_MAX} знаков. Сформулируйте короче`,
  full: `Память заполнена (${MEMORY_MAX} записей) — удалите лишнее в Настройках → «Память ассистента»`,
  off: "Память выключена — включите её в Настройках → «Память ассистента»",
};

/* Команды памяти — разбираем ДО обычных команд и до запроса к модели.
   «Запомни: …», «Запомни, что …», «Запомни это» (без текста — прошлое сообщение человека),
   «Не запоминай» (отменить последнее запомненное), «Забудь: …», «Забудь это», «Забудь всё»,
   «Что ты (обо мне) помнишь?» */
export function parseMemoryCommand(text) {
  const t = String(text || "").trim();
  const low = t.toLowerCase().replace(/ё/g, "е");
  if (/^(что|о чем) ты (обо мне |про меня )?(помнишь|запомнил)\??$/.test(low) || /^(покажи|открой) (мою )?память\.?$/.test(low)) return { action: "memList" };
  // Граница слова — явно: \b в JS работает только с латиницей
  if (/^не (запоминай|запоминать|надо запоминать)(?=$|[\s,.!?:—–-])/.test(low)) return { action: "memUndo" };
  let m = low.match(/^(пожалуйста,?\s+)?запомни(ть)?(\s+пожалуйста)?(?=$|[\s,.!?:—–-])/);
  if (m) {
    let rest = t.slice(m[0].length).replace(/^[\s,:—–-]+/, "");
    if (/^(это|вот это)\.?$/i.test(rest) || !rest) return { action: "memAdd", text: null };
    rest = rest.replace(/^(что|о том, что)\s+/i, "");
    return { action: "memAdd", text: rest };
  }
  m = low.match(/^(пожалуйста,?\s+)?забудь(те)?(?=$|[\s,.!?:—–-])/);
  if (m) {
    const rest = t.slice(m[0].length).replace(/^[\s,:—–-]+/, "");
    if (/^(все|всё|всю память|все, что помнишь|всё, что помнишь)\.?$/i.test(rest)) return { action: "memClear" };
    if (/^(это|вот это)\.?$/i.test(rest) || !rest) return { action: "memForget", text: null };
    return { action: "memForget", text: rest.replace(/^(что|о том, что|про)\s+/i, "") };
  }
  return null;
}

// Найти запись для «Забудь …»: сначала точное совпадение, потом по общим словам
export function findMemoryToForget(items, text) {
  const same = findSameMemory(items, text);
  if (same) return same;
  const words = stems(text);
  if (!words.length) return null;
  let best = null, score = 0;
  for (const m of items) {
    const w = stems(m.text);
    const s = words.filter((x) => w.includes(x)).length / words.length;
    if (s > score) { score = s; best = m; }
  }
  return score >= 0.6 ? best : null;
}

// Слова → «основы» (первые 5 букв), без коротких служебных
const STOP = new Set(["котор", "чтобы", "когда", "потом", "очень", "этого", "такой", "такая", "можно", "нужно", "пожал", "сейча", "всегд"]);
function stems(text) {
  return [...new Set(normMemory(text).split(" ").filter((w) => w.length >= 4).map((w) => w.slice(0, 5)).filter((w) => !STOP.has(w)))];
}
// Пожелания к ответам — учитываются всегда (формат, тон, обращение)
const STYLE_RE = /^(отвечай|пиши|говори|называй|обращайся|объясняй|используй|не используй|не пиши|формат|кратко|подробно)|(^|[\s,.])(отвечай|пиши|на ты|на вы)(?=$|[\s,.!?:])/i;
export const isStyleMemory = (m) => !!m.always || STYLE_RE.test(String(m.text || "").trim());

/* Что из памяти отправить вместе с вопросом. Подбор здесь, на устройстве:
   - пожелания к ответам — всегда;
   - остальное — если есть общие слова с вопросом (вопрос без значимых слов — с двумя последними сообщениями);
   - то, что уже есть в самом диалоге дословно, не дублируем;
   - не больше MEMORY_SEND_MAX записей и MEMORY_SEND_CHARS знаков */
export function pickMemory(items, question, recent = []) {
  if (!items?.length) return [];
  // Подходит ли — по самому вопросу. Только если в нём нет значимых слов («а подробнее?»,
  // «и что дальше?»), смотрим два последних сообщения диалога
  let ctx = stems(question);
  if (!ctx.length) ctx = stems(recent.slice(-2).map((m) => m.text || "").join(" "));
  const inChat = normMemory(recent.map((m) => m.text || "").join(" "));
  const scored = items
    .filter((m) => !inChat.includes(normMemory(m.text)))
    .map((m) => {
      const w = stems(m.text);
      const hit = w.filter((x) => ctx.includes(x)).length;
      return { m, score: isStyleMemory(m) ? 100 : hit ? hit / Math.max(3, w.length) + hit : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.m.updatedAt || 0) - (a.m.updatedAt || 0));
  const out = []; let chars = 0;
  for (const { m } of scored) {
    if (out.length >= MEMORY_SEND_MAX || chars + m.text.length > MEMORY_SEND_CHARS) break;
    out.push(m.text); chars += m.text.length;
  }
  return out;
}

// Строки облака (supabase/memory.sql): id, text, always, created_at, updated_at
const toIso = (ms) => new Date(ms || Date.now()).toISOString();
const toMs = (iso) => (iso ? Date.parse(iso) || 0 : 0);
export const MEMORY_ROWS = {
  toRow: (m) => ({ id: m.id, text: m.text, always: !!m.always, created_at: toIso(m.createdAt) }),
  fromRow: (r) => ({ id: r.id, text: r.text || "", always: !!r.always, createdAt: toMs(r.created_at), updatedAt: toMs(r.updated_at) }),
  sort: (list) => [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  label: (m) => (m.text || "Запись памяти").slice(0, 40),
};
