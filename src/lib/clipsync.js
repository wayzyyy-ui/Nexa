/* Общий буфер обмена (NEXA Flow как облачный буфер) — правила без интерфейса и сети.
   Тесты — tests/clipsync.test.mjs. Ход (канал, таблица clipboard, push) — в NexaApp.

   Запись: { id, text, from_device, from_name, at (мс), exp (мс, когда исчезнет), mine (своё) }.
   Включается на каждом устройстве отдельно (по умолчанию выключено): nexa-clip@<uid> { on, ttl }.
   Срок жизни выбирает отправитель: 1, 10 или 60 минут — потом запись пропадает везде.
   Текст хранится как есть (enc: 0); шифрование на устройствах — позже (место в таблице оставлено). */
import { isSensitive } from "./textcheck.js";

export const CLIP_MAX = 10000;          // знаков — длиннее не отправляем
export const CLIP_TTLS = [1, 10, 60];   // минут — варианты срока жизни
export const CLIP_TTL_DEFAULT = 10;
export const CLIP_KEEP = 30;            // сколько записей держим в списке на устройстве
export const loadClipPrefs = (raw) => {
  const ttl = CLIP_TTLS.includes(raw?.ttl) ? raw.ttl : CLIP_TTL_DEFAULT;
  return { on: raw?.on === true, ttl };
};

// Короткий отпечаток текста (FNV-1a) — сравнивать, не держа лишних копий
export function clipHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/* Отправлять ли новое содержимое буфера этого устройства.
   lastSent — отпечаток последнего отправленного; received — живые записи с других устройств
   (то, что пришло и, возможно, скопировано кнопкой, — обратно не отправляем: защита от петли).
   → { send: true } или { skip: "empty" | "long" | "same" | "loop" | "sensitive" } */
export function clipDecision({ text, lastSent, received = [], now = Date.now() }) {
  const t = typeof text === "string" ? text : "";
  if (!t.trim()) return { skip: "empty" };
  if (t.length > CLIP_MAX) return { skip: "long" };
  const h = clipHash(t);
  if (h === lastSent) return { skip: "same" };
  if (received.some((r) => r.exp > now && !r.mine && clipHash(r.text) === h)) return { skip: "loop" };
  // Похожее на пароль, ключ или код — не отправляем вовсе (менеджеры паролей помечают своё
  // и отдельно — это ловит оболочка ПК, а здесь — то, что скопировали руками)
  if (isSensitive(t)) return { skip: "sensitive" };
  return { send: true };
}

// Срок жизни → время исчезновения (мс)
export const clipExp = (ttlMin, now = Date.now()) => now + (CLIP_TTLS.includes(ttlMin) ? ttlMin : CLIP_TTL_DEFAULT) * 60000;

// Добавить записи: без повторов (по id), без просроченных, новые сверху, не больше CLIP_KEEP
export function clipMerge(list, add, now = Date.now()) {
  const byId = new Map();
  for (const it of [...(add || []), ...(list || [])]) if (it?.id && it.exp > now && !byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, CLIP_KEEP);
}
export const clipPurge = (list, now = Date.now()) => (list || []).filter((it) => it.exp > now);

// Строка таблицы clipboard → запись (неверное — null)
export function clipFromRow(row, selfId) {
  if (!row || typeof row.id !== "string" || typeof row.text !== "string" || row.enc) return null;
  const at = Date.parse(row.created_at), exp = Date.parse(row.expires_at);
  if (!Number.isFinite(at) || !Number.isFinite(exp)) return null;
  return { id: row.id, text: row.text, from_device: row.from_device, from_name: row.from_name || "Устройство", at, exp, mine: row.from_device === selfId };
}

// «Осталось 9 мин» / «меньше минуты»
export function clipLeft(exp, now = Date.now()) {
  const m = Math.floor((exp - now) / 60000);
  return m >= 1 ? `ещё ${m} мин` : "меньше минуты";
}

// Почему не отправили — для строки под переключателем
export const CLIP_SKIP_TEXT = {
  long: "Скопированное длиннее 10 000 знаков — не отправлено",
  sensitive: "Похоже на пароль или код — не отправлено",
};
