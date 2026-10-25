/* ИИ в заметках: правка текста (сократить / переписать / исправить / продолжить) и подсказка продолжения при наборе.
   Ходит на тот же /api/chat, что и ассистент (режим mode: "note", см. api/chat.js) — своей системы запросов нет.
   Ключей на устройстве нет. Все запросы отменяются (AbortSignal) — устаревший ответ никогда не применяется.
   Чистые правила (когда показывать подсказку, куда вставить результат) — noteText.js, под тестами. */
import { API_CHAT_URL } from "../native.js";

export const NOTE_AI_TASKS = [
  { id: "shorten", label: "Сократить", hint: "Короче, главные мысли остаются" },
  { id: "rewrite", label: "Переписать", hint: "Яснее и грамотнее" },
  { id: "fix", label: "Исправить ошибки", hint: "Орфография и пунктуация" },
  { id: "continue", label: "Продолжить текст", hint: "Логичное продолжение" },
];
export const NOTE_AI_TEXT_MAX = 12000; // столько знаков принимает сервер

// Понятный текст ошибки по ответу сервера
const failText = (status, serverMsg) => {
  if (serverMsg) return serverMsg;
  if (status === 429) return "Слишком часто — подождите минуту";
  if (status === 413) return "Текст слишком длинный — выделите часть";
  if (status >= 500) return "ИИ сейчас недоступен — попробуйте позже";
  return "Не получилось — попробуйте ещё раз";
};

async function ask(body, signal) {
  let res;
  try {
    res = await fetch(API_CHAT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "note", ...body }), signal });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw Object.assign(new Error("net"), { userMessage: navigator.onLine === false ? "Нет связи — ИИ недоступен" : "Не удалось связаться с ИИ" });
  }
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).error; } catch { /* ответ без текста */ }
    throw Object.assign(new Error("server"), { userMessage: failText(res.status, msg), status: res.status });
  }
  const data = await res.json().catch(() => null);
  return typeof data?.text === "string" ? data.text : "";
}

// Действие над текстом: результат — строка (пустая — модель ничего не вернула)
export const NOTE_PROMPT_MAX = 300; // своя задача — как на сервере
export async function runNoteTask({ task, text, prompt, signal }) {
  const out = await ask({ task, text: String(text).slice(0, NOTE_AI_TEXT_MAX), ...(task === "custom" ? { prompt: String(prompt || "").slice(0, NOTE_PROMPT_MAX) } : {}) }, signal);
  return out.replace(/^\s*```[a-z]*\n?|\n?```\s*$/g, "").replace(/\s+$/, "");
}

// Подсказка продолжения: сырое продолжение (может начинаться с пробела); пустая — нет уверенного
export async function fetchSuggestion({ before, signal }) {
  return ask({ task: "suggest", before: String(before).slice(-1500) }, signal);
}

export * from "./noteText.js";
