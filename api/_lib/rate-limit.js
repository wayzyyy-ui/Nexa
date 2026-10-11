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

// Запасной счётчик в памяти: ключ → { start, hits }
const memory = new Map();
function memoryHit(key, limit, windowSec) {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || now - cur.start > windowSec * 1000) {
    memory.set(key, { start: now, hits: 1 });
    if (memory.size > 5000) memory.clear(); // не даём памяти расти бесконечно
    return true;
  }
  cur.hits += 1;
  return cur.hits <= limit;
}

/* Можно ли ещё один запрос? rules — [[ключ, лимит, окно в секундах], …].
   true — можно, false — слишком часто */
export async function allow(rules) {
  const sb = adminClient();
  for (const [key, limit, windowSec] of rules) {
    let ok = null;
    if (sb) {
      try {
        const { data, error } = await sb.rpc('nexa_rate_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSec });
        if (!error && typeof data === 'boolean') ok = data;
      } catch {}
    }
    if (ok === null) ok = memoryHit(key, limit, windowSec);
    if (!ok) return false;
  }
  return true;
}
