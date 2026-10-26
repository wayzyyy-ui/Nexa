/* Непонятые фразы для дообучения NEXA Mini (src/lib/mini/collect.js) — только с согласия человека в приложении.
   POST { phrases: [{ text, intent, confidence }] } → { saved }

   Что сохраняем: текст короткой просьбы, догадку сети и её уверенность. БЕЗ аккаунта, устройства,
   имени и адреса: в таблице mini_phrases (supabase/mini-phrases.sql) таких полей нет. IP — только
   как sha256 для лимита и нигде не записывается. Все проверки фразы повторяются здесь (клиенту не верим).
   В журнал — только числа. Записи старше 90 дней стирает nexa_mini_phrases_cleanup (и сам триггер).

   Выгрузка для дообучения (только автор, скрипт scripts/mini/review.mjs → npm run mini:review):
   POST { action: "export", afterId } с заголовком x-nexa-admin = NEXA_ADMIN_SECRET (api/_lib/admin.js) →
   { phrases: [{ id, text, intent_guess, confidence, created_at }], last, more } — по порядку id, не больше
   EXPORT_MAX за раз (more: true — есть ещё, скрипт спросит снова с afterId = last). */
import { createClient } from '@supabase/supabase-js';
import { allow, clientKey } from './_lib/rate-limit.js';
import { adminGate } from './_lib/admin.js';
import { phraseProblem, COLLECT_DAY_MAX } from '../src/lib/mini/collect.js';

const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
const INTENTS = /^[A-Z_]{2,20}$/;
const MAX_BODY = 8 * 1024;
const EXPORT_MAX = 2000;

let sb;
function admin() {
  if (sb !== undefined) return sb;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  sb = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return sb;
}
// Для проверки: подменить клиент базы
export function __setAdmin(c) { sb = c; }

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

// Фраза → строка таблицы или null (не прошла проверку)
export function cleanPhrase(p) {
  if (!p || typeof p !== 'object') return null;
  const text = String(p.text ?? '').replace(/\s+/g, ' ').trim();
  if (phraseProblem(text)) return null;
  const intent = INTENTS.test(String(p.intent || '')) ? p.intent : null;
  const c = Number(p.confidence);
  const confidence = Number.isFinite(c) && c > 0 && c <= 1 ? Math.round(c * 1000) / 1000 : null;
  return { text, intent_guess: intent, confidence };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Только POST' });
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return res.status(413).json({ error: 'Слишком большой запрос' });
  if (req.body?.action === 'export') return exportPhrases(req, res);

  const list = Array.isArray(req.body?.phrases) ? req.body.phrases : null;
  if (!list || !list.length || list.length > COLLECT_DAY_MAX) return res.status(400).json({ error: 'Неверный запрос' });

  // С одного адреса: не больше 3 пачек за 10 минут и 60 фраз в сутки (адреса операторов бывают общими — с запасом)
  const ip = clientKey(req);
  if (!(await allow([[`phrases:10m:${ip}`, 3, 600], [`phrases:day:${ip}`, 60, 86400]]))) {
    return res.status(429).json({ error: 'Слишком часто' });
  }

  const seen = new Set();
  const rows = [];
  for (const p of list) {
    const r = cleanPhrase(p);
    if (!r || seen.has(r.text.toLowerCase())) continue;
    seen.add(r.text.toLowerCase());
    rows.push(r);
  }
  if (!rows.length) return res.status(200).json({ saved: 0 });

  const db = admin();
  if (!db) return res.status(200).json({ saved: 0, reason: 'not_configured' });
  const { error } = await db.from('mini_phrases').insert(rows);
  if (error) {
    console.error('phrases: insert', error.code || 'error');
    return res.status(200).json({ saved: 0, reason: error.code === '42P01' ? 'not_configured' : 'error' });
  }
  return res.status(200).json({ saved: rows.length });
}

/* Выгрузка собранных фраз автору (см. начало файла). Аккаунтов и устройств в таблице нет — отдаём то, что есть */
async function exportPhrases(req, res) {
  const gate = await adminGate(req, 'phrases');
  if (gate) return res.status(gate.code).json({ error: gate.error });
  const after = Number(req.body?.afterId) || 0;
  const db = admin();
  if (!db) return res.status(200).json({ phrases: [], reason: 'not_configured' });
  const { data, error } = await db.from('mini_phrases').select('id, text, intent_guess, confidence, created_at')
    .gt('id', after).order('id', { ascending: true }).limit(EXPORT_MAX + 1);
  if (error) {
    console.error('phrases: export', error.code || 'error');
    return res.status(200).json({ phrases: [], reason: error.code === '42P01' ? 'not_configured' : 'error' });
  }
  const more = data.length > EXPORT_MAX;
  const phrases = data.slice(0, EXPORT_MAX);
  return res.status(200).json({ phrases, last: phrases.length ? phrases[phrases.length - 1].id : after, more });
}
