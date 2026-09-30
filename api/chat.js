// api/chat.js
// Это серверная функция Vercel. Она хранит секретный ключ Google
// и принимает запросы от фронтенда, чтобы ключ не утёк в браузер.

import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // Разрешаем только POST — то есть только отправку сообщений
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  // Простая проверка, что сообщение пришло
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Ключ берётся из переменных окружения Vercel (process.env),
    // а не лежит в коде. Это безопасно.
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: message,
    });

    // Отправляем ответ обратно в браузер
    res.status(200).json({ text: response.text });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Ошибка при обращении к AI' });
  }
}