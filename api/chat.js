import { GoogleGenAI } from '@google/genai';

// Название модели лежит в одном месте, чтобы менять только здесь
const MODEL = 'gemini-3.8-flash';

// Ограничения, чтобы посторонние не расходовали твою квоту
const MAX_MESSAGE_LENGTH = 4000;  // максимум символов в одном сообщении
const MAX_HISTORY_ITEMS = 20;     // сколько последних сообщений чата отдаём модели
const RATE_LIMIT = 20;            // сколько запросов разрешено
const RATE_WINDOW_MS = 60 * 1000; // за какое время (одна минута) с одного адреса

const SYSTEM_INSTRUCTION =
  'Отвечай обычным текстом. Для выделения важных слов можешь использовать **жирный** (двойные звёздочки). Не используй ### для заголовков, не делай маркированные списки через - или *, не используй обратные кавычки и подчёркивания. Пиши короткими абзацами, отделяя их пустой строкой.';

// Счётчик запросов по адресам: { адрес: [время запроса, время запроса, ...] }
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  // оставляем только запросы за последнюю минуту
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

// Проверяем и чистим историю, которую прислал фронтенд.
// Присылать можно что угодно, поэтому доверять ей напрямую нельзя.
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  const cleaned = history
    .filter(m =>
      m &&
      (m.role === 'user' || m.role === 'model') &&
      typeof m.parts?.[0]?.text === 'string' &&
      m.parts[0].text.trim()                      // пустые сообщения выкидываем
    )
    .slice(-MAX_HISTORY_ITEMS)                    // берём только последние сообщения
    .map(m => ({
      role: m.role,
      parts: [{ text: m.parts[0].text.slice(0, MAX_MESSAGE_LENGTH) }],
    }));

  // Gemini ждёт, что разговор начинается с реплики пользователя
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();

  return cleaned;
}

async function tryGenerate(ai, contents, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContentStream({
        model: MODEL,
        contents,
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
    } catch (error) {
      const isQuota = error?.status === 429 || error?.message?.includes('quota');
      // При превышении квоты не ждём: серверная функция Vercel
      // живёт ограниченное время, ожидание в 35 секунд её просто оборвёт
      if (isQuota) throw error;
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Определяем адрес того, кто отправил запрос
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

  // История прошлых сообщений + новый вопрос в конце
  const contents = [
    ...cleanHistory(history),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const stream = await tryGenerate(ai, contents);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const chunk of stream) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }

    res.end();
  } catch (error) {
    console.error('Gemini API error:', error);
    if (!res.headersSent) {
      const isQuota = error?.status === 429 || error?.message?.includes('quota');
      res.status(isQuota ? 429 : 500).json({
        error: isQuota ? 'Лимит запросов к AI исчерпан, попробуйте позже' : 'Ошибка при обращении к AI',
      });
    } else {
      res.end();
    }
  }
}