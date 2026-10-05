import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = `Ты — NEXA Assistant, AI-ассистент экосистемы NEXA. Отвечай кратко, 2-4 предложения. Для важного используй **жирный**. Твой создатель — команда NEXA. Если спросят прямо — ты ИИ-ассистент NEXA. Не упоминай Google, Gemini, OpenAI, DeepSeek.`;

export default async function handler(req, res) {
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