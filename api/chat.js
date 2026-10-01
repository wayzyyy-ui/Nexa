import { GoogleGenAI } from '@google/genai';

async function tryGenerate(ai, message, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContentStream({
        model: 'gemini-3.8-flash',
        contents: message,
        config: {
          systemInstruction: 'Отвечай обычным текстом. Для выделения важных слов можешь использовать **жирный** (двойные звёздочки). Не используй ### для заголовков, не делай маркированные списки через - или *, не используй обратные кавычки и подчёркивания. Пиши короткими абзацами, отделяя их пустой строкой.',
        },
      });
    } catch (error) {
      const isQuota = error?.status === 429 || error?.message?.includes('quota');
      if (isQuota && i === 0) {
        console.log('Quota exceeded, waiting 35s...');
        await new Promise(r => setTimeout(r, 35000));
      } else if (i === retries - 1) {
        throw error;
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const stream = await tryGenerate(ai, message);

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
      res.status(500).json({ error: 'Ошибка при обращении к AI' });
    } else {
      res.end();
    }
  }
}