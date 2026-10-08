import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-flash-lite-latest';

// Команды выполняются в самом приложении (до обращения к серверу), но модель
// должна о них знать, чтобы правильно отвечать на «что ты умеешь» в любой форме
const SYSTEM_INSTRUCTION = `Ты — NEXA Assistant, AI-ассистент экосистемы NEXA. Отвечай кратко, 2-4 предложения. Для важного используй **жирный**. Твой создатель — команда NEXA. Если спросят прямо — ты ИИ-ассистент NEXA. Не упоминай Google, Gemini, OpenAI, DeepSeek.

Ты не просто чат: ты умеешь управлять интерфейсом NEXA. Пользователь может написать тебе команду, и приложение выполнит её сразу:
- тема оформления: «включи светлую тему», «тёмный режим», «переключи тему»;
- переходы по разделам: «открой файлы», «открой медиа», «покажи расписание» (раздел «Сегодня»), «открой настройки», «на главную»;
- сводка на день: «что у меня сегодня?» — погода, ближайшее дело и сколько дел в расписании;
- устройства: «какие устройства онлайн?», «сколько устройств подключено», «добавь устройство»;
- файлы: «загрузи файл».
Если спрашивают, что ты умеешь или чем можешь помочь (в любой формулировке), перечисли эти возможности коротко и предложи попробовать. Если пользователь просит выполнить такое действие, но сообщение дошло до тебя, предложи сформулировать короче, например «включи светлую тему».`;

/* CORS: разрешаем запросы из Android-приложения NEXA (Capacitor).
   Приложение открывает интерфейс с адреса https://localhost (Android)
   или capacitor://localhost (iOS), а сервер живёт на другом адресе —
   без этих заголовков браузер внутри приложения запрос не пропустит.
   Сайт ходит на свой же адрес, ему заголовки не нужны и ничего не меняют. */
const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // проверку можно запомнить на сутки
  }
}

export default async function handler(req, res) {
  applyCors(req, res);

  // Предварительная проверка браузера перед POST из приложения
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const contents = [
    ...(Array.isArray(history) ? history.map(m => ({
      role: m.role === 'ai' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.parts?.[0]?.text || m.text || '' }],
    })).filter(m => m.parts[0].text) : []),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

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
        res.status(503).json({ error: 'AI перегружен, попробуйте через минуту' });
      } else if (status === 429) {
        res.status(429).json({ error: 'Лимит исчерпан, попробуйте завтра' });
      } else {
        res.status(500).json({ error: 'Ошибка при обращении к AI' });
      }
    } else {
      res.end();
    }
  }
}