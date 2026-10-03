import { GoogleGenAI } from '@google/genai';

// ─── Модели по приоритету ─────────────────────────────────
const MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
];

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 10;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

const SYSTEM_INSTRUCTION = `Ты — NEXA Assistant, AI-ассистент экосистемы NEXA. Отвечай кратко, 2-4 предложения. Для важного используй **жирный**. Твой создатель — команда NEXA. Если прямо спросят, ИИ ли ты — отвечай честно: "Да, я ИИ-ассистент NEXA". Не упоминай Google, Gemini, OpenAI, DeepSeek.`;

const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = history
    .filter(m =>
      m &&
      (m.role === 'user' || m.role === 'model') &&
      typeof m.parts?.[0]?.text === 'string' &&
      m.parts[0].text.trim()
    )
    .slice(-MAX_HISTORY_ITEMS)
    .map(m => ({
      role: m.role,
      parts: [{ text: m.parts[0].text.slice(0, MAX_MESSAGE_LENGTH) }],
    }));
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

// ─── Пробуем модели по очереди с замерами ─────────────────
async function tryGenerate(ai, contents) {
  let lastError;

  for (const model of MODELS) {
    const startedAt = Date.now();

    try {
      console.log(`[AI] ${model}: request started`);

      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: "low" },
        },
      });

      console.log(`[AI] ${model}: stream opened in ${Date.now() - startedAt} ms`);
      return stream;
    } catch (error) {
      lastError = error;
      console.log(
        `[AI] ${model}: failed after ${Date.now() - startedAt} ms, status ${error?.status}`
      );
      if (error?.status === 400) throw error;
    }
  }

  throw lastError;
}

// ─── Обработчик ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Слишком много запросов, попробуйте через минуту' });
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Сообщение слишком длинное' });
  }

  const contents = [
    ...cleanHistory(history),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const stream = await tryGenerate(ai, contents);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    for await (const chunk of stream) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    res.end();

  } catch (error) {
    console.error('Gemini API error:', error);
    if (!res.headersSent) {
      const status = error?.status;
      if (status === 503) {
        res.status(503).json({ error: 'AI перегружен. Попробуйте через минуту.' });
      } else if (status === 429 || error?.message?.includes('quota')) {
        res.status(429).json({ error: 'Лимит запросов исчерпан, попробуйте позже' });
      } else if (status === 404) {
        res.status(503).json({ error: 'AI временно недоступен. Попробуйте позже.' });
      } else {
        res.status(500).json({ error: 'Ошибка при обращении к AI' });
      }
    } else {
      res.end();
    }
  }
}