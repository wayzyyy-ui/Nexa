/* Ограничение частоты запросов к серверным функциям (ассистент, вход по QR).

   Файл в папке с «_» — Vercel не делает из него отдельный адрес.

   Как считает:
   - если в Vercel есть SUPABASE_SERVICE_ROLE_KEY и адрес проекта — счётчик живёт
     в базе (функция nexa_rate_hit из supabase/security-hardening.sql). Так лимит
     общий для всех копий сервера;
   - если нет (или база не ответила) — запасной счётчик в памяти этой копии
     сервера. Он слабее (у Vercel копий может быть несколько), но лучше, чем ничего.

   IP не храним: в ключ идёт только его отпечаток sha256. */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

let admin;
function adminClient() {
  if (admin !== undefined) return admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

// Отпечаток IP: адрес Vercel кладёт первым в x-forwarded-for
export function clientKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

// Запасной счётчик в памяти: ключ → { start, until, hits, limit }
const memory = new Map();
const MEMORY_MAX = 5000;
/* Не даём памяти расти бесконечно. Раньше при переполнении счётчик стирался целиком —
   и все лимиты разом обнулялись (достаточно было сделать 5000 запросов с разных адресов).
   Теперь убираем истёкшие, потом самые старые из тех, кто лимит ещё не исчерпал;
   заблокированные (дошли до лимита) — в последнюю очередь */
function trimMemory(now) {
  for (const [k, v] of memory) if (v.until <= now) memory.delete(k);
  // Map помнит порядок добавления: первыми идут самые старые окна
  for (const blockedToo of [false, true]) {
    for (const [k, v] of memory) {
      if (memory.size <= MEMORY_MAX * 0.9) return;
      if (blockedToo || v.hits < v.limit) memory.delete(k);
    }
  }
}
function memoryHit(key, limit, windowSec) {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || now >= cur.until) {
    memory.delete(key); // новое окно — в конец порядка
    memory.set(key, { start: now, until: now + windowSec * 1000, hits: 1, limit });
    if (memory.size > MEMORY_MAX) trimMemory(now);
    return true;
  }
  cur.hits += 1;
  return cur.hits <= limit;
}

/* Сколько правил разрешают ещё один запрос: rules — [[ключ, лимит, окно в секундах], …].
   Ответ — массив true / false по каждому правилу. Все правила проверяются ОДНОВРЕМЕННО:
   раньше — по очереди, и каждое правило было отдельным заходом в базу (у ассистента 2–3 подряд,
   по 50–150 мс каждый — до первых слов ответа). Счётчик в базе не ответил — запасной в памяти */
export async function allowEach(rules) {
  const sb = adminClient();
  return Promise.all(rules.map(async ([key, limit, windowSec]) => {
    let ok = null;
    if (sb) {
      try {
        const { data, error } = await sb.rpc('nexa_rate_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSec });
        if (!error && typeof data === 'boolean') ok = data;
      } catch {}
    }
    return ok === null ? memoryHit(key, limit, windowSec) : ok;
  }));
}

/* Можно ли ещё один запрос? true — можно (все правила разрешают), false — слишком часто */
export async function allow(rules) {
  return (await allowEach(rules)).every(Boolean);
}
