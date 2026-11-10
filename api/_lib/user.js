/* Кто спрашивает ассистента (api/chat.js). До 2026-11-11 /api/chat отвечал любому в интернете —
   чужой мог тратить квоту Gemini (держали только лимиты с адреса). Теперь приложение шлёт ключ
   входа (Authorization: Bearer …), а сервер проверяет его, когда в Vercel включено
   CHAT_REQUIRE_AUTH=1. Включать — только когда старые версии, которые ключ не шлют, обновились:
   сайт и Android получают веб-часть сами, приложению для ПК нужен новый установщик.

   Проверка — у Supabase (auth.getUser), удачная запоминается на 5 минут (в памяти «тёплой»
   функции, по sha256 ключа) — следующие вопросы не ждут лишнего запроса. Ключ в журнал не пишем. */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const OK_MS = 5 * 60 * 1000;
const seen = new Map(); // sha256(ключ) → до какого времени считаем проверенным
let client = null, testGetUser = null;
export const __setUserTest = (fn) => { testGetUser = fn; seen.clear(); };

function getUser(token) {
  if (testGetUser) return testGetUser(token);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ||= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client.auth.getUser(token);
}

// Нужен ли вход: только если включено и сервер умеет проверять (иначе — как раньше)
export const authRequired = () => process.env.CHAT_REQUIRE_AUTH === '1';

/* true — можно отвечать. Вход не требуется — всегда true. */
export async function chatAllowed(req) {
  if (!authRequired()) return true;
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4096) return false;
  const h = createHash('sha256').update(token).digest('hex');
  const until = seen.get(h);
  if (until && until > Date.now()) return true;
  try {
    const r = await getUser(token);
    if (!r) return true; // сервер не настроен (нет ключей Supabase) — не запираем ассистента
    if (r.error || !r.data?.user) return false;
    if (seen.size > 2000) seen.clear();
    seen.set(h, Date.now() + OK_MS);
    return true;
  } catch {
    console.error('chat auth', 'fail');
    return false;
  }
}
