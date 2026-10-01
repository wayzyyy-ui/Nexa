import { GoogleGenAI } from '@google/genai';

async function tryGenerate(ai, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
       const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: message,
        config: {
          systemInstruction: 'Отвечай обычным текстом. Для выделения важных слов можешь использовать **жирный** (двойные звёздочки). Не используй ### для заголовков, не делай маркированные списки через - или *, не используй обратные кавычки и подчёркивания. Пиши короткими абзацами, отделяя их пустой строкой.',
        },
      });
      return response.text;
    } catch (error) {
      // Если это последняя попытка — выбрасываем ошибку
      if (i === retries - 1) throw error;
      // Иначе — ждём секунду и пробуем снова
      console.log(`Попытка ${i + 1} не удалась, повторяю через 1 сек...`);
      await new Promise(r => setTimeout(r, 1000));
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
    const text = await tryGenerate(ai, message);
    res.status(200).json({ text });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Ошибка при обращении к AI' });
  }
}