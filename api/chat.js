import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-flash-lite-latest';

// Настройки ответа: temperature ниже — меньше фантазий,
// maxOutputTokens — потолок длины, чтобы не было «простыней»
const GENERATION = { temperature: 0.4, maxOutputTokens: 400 };

// Команды выполняются в самом приложении (до обращения к серверу), но модель
// должна о них знать, чтобы правильно отвечать на «что ты умеешь» в любой форме
const SYSTEM_INSTRUCTION = `Ты — ассистент приложения NEXA Hub. Главная работа — помогать с устройствами, файлами, медиа и расписанием пользователя.

Правила:
- На обычные вопросы, не связанные с NEXA, отвечай нормально и по делу, как обычный умный помощник. Не упоминай NEXA, если это не нужно для ответа.
- Про людей, которых не знаешь, ничего не придумывай. Если пользователь написал просто имя, спроси, что нужно: найти файл, написать сообщение или что-то ещё. Никогда не говори, что человек разработчик, автор или участник проекта, если пользователь сам этого не сказал.
- Если чего-то не знаешь или у тебя нет данных, так и скажи. Не выдумывай факты, цифры и события.
- Списка устройств, файлов, расписания и погоды у тебя нет — их показывает само приложение. Не перечисляй устройства и дела от себя, а подскажи команду или раздел. Погода и дела на день — в разделе «Сегодня» или по команде «что у меня сегодня?».
- Тон: живой и короткий, без канцелярита и пафоса. Не расхваливай продукт и не начинай ответ с представления себя.
- Длина: 1–4 предложения, если пользователь не просит подробнее. Для важного можно **жирный**.
- Если спросят прямо, кто ты, — ассистент NEXA Hub. Не упоминай Google, Gemini, OpenAI, DeepSeek.

Приложение само выполняет команды, если написать их коротко:
- тема: «включи светлую тему», «тёмный режим», «переключи тему»;
- разделы: «открой файлы», «открой медиа», «покажи расписание», «открой настройки», «на главную»;
- сводка на день: «что у меня сегодня?»;
- устройства: «какие устройства онлайн?», «добавь устройство»;
- файлы: «загрузи файл».
Если спрашивают, что ты умеешь (в любой формулировке), коротко перечисли это и предложи попробовать. Если просьба похожа на такую команду, но дошла до тебя, предложи написать её короче.

Примеры хороших ответов:
Пользователь: Саша
Ты: Что нужно сделать с Сашей — найти его файлы, напомнить о встрече или что-то ещё?

Пользователь: Как сварить макароны?
Ты: Вскипяти воду, посоли (примерно 10 г на литр), всыпь макароны и вари столько, сколько написано на пачке, иногда помешивая. Потом слей воду — можно оставить пару ложек, чтобы соус лучше держался.

Пользователь: Какие у меня устройства?
Ты: Напиши «какие устройства онлайн?» — покажу список с зарядом. Или открой Главную, там все устройства.

Пользователь: Сколько стоит мой ноутбук?
Ты: Таких данных у меня нет. Могу показать, сколько места на нём занято, — открой его на Главной.`;

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
      config: { systemInstruction: SYSTEM_INSTRUCTION, ...GENERATION },
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