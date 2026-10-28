/* Отчёты о сбоях без личных данных — серверная функция Vercel.
   POST { reports: [...] } (до 10, тело до 20 КБ; приложение шлёт text/plain — без предварительного запроса CORS).
   Каждый отчёт ещё раз чистится (cleanReport — те же правила, что в приложении: клиенту не верим) и пишется
   в таблицу error_reports (supabase/error-reports.sql) через nexa_error_hit — одинаковые склеиваются счётчиком.
   IP не хранится — только его отпечаток в счётчике лимита. Нет таблицы / ключей — одна короткая строка в журнал.
   POST { action: "export", days } с заголовком x-nexa-admin — список для автора (scripts/errors.mjs). */
import { createClient } from '@supabase/supabase-js';
import { allow, clientKey } from './_lib/rate-limit.js';
import { adminGate } from './_lib/admin.js';
import { cleanReport } from '../src/lib/crashReport.js';

const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
const MAX_BODY = 20000;

let testAdmin = null;
export const __setErrorsTest = (a) => { testAdmin = a; };
function admin() {
  if (testAdmin) return testAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY) return res.status(413).end();
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }
  if (!body || typeof body !== 'object') return res.status(400).end();
  if (JSON.stringify(body).length > MAX_BODY) return res.status(413).end();
  const sb = admin();

  if (body.action === 'export') {
    const gate = await adminGate(req, 'errors');
    if (gate) return res.status(gate.code).json({ error: gate.error });
    if (!sb) return res.status(503).json({ error: 'not_configured' });
    const days = Math.min(90, Math.max(1, Number(body.days) || 7));
    const { data, error } = await sb.from('error_reports').select('*')
      .gt('last_seen', new Date(Date.now() - days * 864e5).toISOString()).order('last_seen', { ascending: false }).limit(1000);
    if (error) return res.status(500).json({ error: error.code || 'db' });
    return res.status(200).json({ rows: data || [] });
  }

  const list = Array.isArray(body.reports) ? body.reports.slice(0, 10).map(cleanReport).filter(Boolean) : [];
  if (!list.length) return res.status(204).end();
  const who = clientKey(req);
  // С одного адреса: не больше 10 пачек за 10 минут и 60 отчётов в час (сбой в цикле не забьёт таблицу)
  if (!(await allow([[`err:req:${who}`, 10, 600]]))) return res.status(429).end();
  if (!sb) {
    for (const r of list.slice(0, 3)) console.warn('client-error', r.fp, r.version, r.platform, r.kind, r.name, r.frames[0] ? `${r.frames[0].file}:${r.frames[0].line}` : '-');
    return res.status(202).json({ stored: 0 });
  }
  let stored = 0;
  for (const r of list) {
    if (!(await allow([[`err:n:${who}`, 60, 3600]]))) break;
    const { error } = await sb.rpc('nexa_error_hit', { p: r });
    if (!error) stored++;
    else console.warn('client-error', r.fp, r.version, r.platform, r.kind, r.name, 'db', error.code || '');
  }
  return res.status(202).json({ stored });
}
