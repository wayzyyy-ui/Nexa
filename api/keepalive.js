/* «Не дать базе уснуть»: бесплатный проект Supabase замораживают после недели без запросов.
   Раз в день Vercel Cron (vercel.json → crons) вызывает GET /api/keepalive — функция делает один
   лёгкий запрос к базе. Данных не читает и не меняет (берёт одну служебную строку счётчика лимитов),
   ничего не отдаёт, кроме { ok }. Ключи только из переменных окружения, в журнал — только код. */
import { createClient } from '@supabase/supabase-js';
import { allow } from './_lib/rate-limit.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  // Дергать могут все — не больше 6 раз в час с общего ключа, чтобы это не стало нагрузкой
  if (!(await allow([['keepalive', 6, 3600]]))) return res.status(429).json({ ok: false });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ ok: false, reason: 'not_configured' });
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.from('api_rate_limits').select('key').limit(1);
    if (error) { console.error('keepalive', error.code || 'error'); return res.status(200).json({ ok: false }); }
    return res.status(200).json({ ok: true });
  } catch {
    console.error('keepalive', 'fail');
    return res.status(200).json({ ok: false });
  }
}
