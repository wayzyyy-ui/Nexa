// Команды ассистента: распознаются в браузере до запроса в /api/chat (список продублирован в api/chat.js)
import { getTodayWeather, TODAY } from "./weather.js";
import { signed, plural } from "./format.js";

// ЭКРАН "АССИСТЕНТ" — поле ввода по центру + правая панель (новый диалог/поиск/...)
/* ═══ КОМАНДЫ АССИСТЕНТА ══════════════════════════════════════
   Ассистент — часть NEXA: если сообщение похоже на команду, выполняем
   её сразу (без сервера) и отвечаем от имени ассистента. Иначе вопрос
   уходит в /api/chat как обычно.

   Как распознаём: текст в нижний регистр, ё → е, без знаков препинания.
   Дальше ищем по началам слов (основам), а не по точной фразе:
   «включи светлую тему», «сделай светлую», «светлый режим» — одно и то же.

   Чтобы обычный вопрос («расскажи про светлую тему в дизайне») не стал
   командой, у большинства команд правило when: "verb" — сработает, только
   если есть глагол действия (включи, открой, покажи…) или фраза короткая
   (до 3 слов). when: "free" — достаточно самих слов (сводка, справка).
   Новую команду добавить просто: ещё одна строка в ASSISTANT_COMMANDS
   и её обработка в runCommand внутри ScreenAssistant. */
export const normalizeCommand = (text) => text
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

// Глаголы действия (начала слов)
export const ACTION_VERBS = [
  "включ", "сдела", "постав", "переключ", "смен", "помен", "откр", "покаж", "показ",
  "перейд", "перейти", "переход", "зайд", "верн", "давай", "добав", "загруз", "закач",
  "подключи", "вывед", "отобраз", "иди", "запуст", "выбер", "хочу", "нужн",
];

// С таких слов начинаются вопросы «про что-то» — это не команды
export const EXPLAIN_START = /^(расскаж|объясн|почему|зачем|что такое|что значит|в чем разница|чем отлича|напиши|придумай|переведи|сравни)/;

// Если в «сводке на сегодня» речь про это — это вопрос в чат, а не сводка
export const NOT_SUMMARY = ["новост", "мир", "праздн", "курс", "матч", "футбол", "фильм", "кино", "гороскоп"];

export const DEVICE_WORDS = ["устройств", "девайс", "гаджет"];

// Список команд. Порядок важен: сверху — более узкие
// (например, «загрузи файл» раньше, чем «открой файлы»)
export const ASSISTANT_COMMANDS = [
  { action: "help", when: "free",
    test: ({ n, has, words }) => has("умеешь") || (has("команд") && words.length <= 4)
      || /^(что|чем|как) ты (можешь|умеешь|поможешь)/.test(n) || /^(помощь|помоги|справка|help)$/.test(n) },
  { action: "summary", when: "free",
    test: ({ has }) => !has(...NOT_SUMMARY) && (has("сводк")
      || (has("сегодня", "сегодняшн") && has("что", "план", "дел", "повестк", "как", "какие", "какой"))) },
  { action: "summary", when: "verb",
    test: ({ has }) => has("погод") && !has("завтра", "недел", ...NOT_SUMMARY) },
  { action: "upload", when: "verb",
    test: ({ has }) => has("загруз", "закач", "залей", "добав") && has("файл", "фото", "документ", "картин", "изображ") },
  { action: "addDevice", when: "verb",
    test: ({ words, has }) => words.some((w) => /^(добав|подключи$|подключить$|привяж|присоедин)/.test(w))
      && has(...DEVICE_WORDS, "смартфон", "телефон", "ноутбук", "планшет", "часы", "наушник", "телевизор") },
  { action: "devices", when: "free",
    test: ({ has, hasVerb, short }) => has(...DEVICE_WORDS)
      && !has("купить", "куп", "лучше", "выбра", "посовет") // «какие устройства лучше купить» — вопрос в чат
      && (hasVerb || short || has("онлайн", "сети", "подключ", "сколько", "мои", "меня", "список", "статус", "все")) },
  { action: "theme", params: { mode: "light" }, when: "verb", test: ({ has }) => has("светл", "дневн") },
  { action: "theme", params: { mode: "dark" }, when: "verb", test: ({ has }) => has("темн", "ночн") },
  { action: "theme", params: { mode: "toggle" }, when: "verb",
    test: ({ has }) => has("тем", "оформлен", "режим") && has("переключ", "смен", "помен", "друг", "обрат") },
  { action: "navigate", params: { tab: "files" }, when: "verb", test: ({ has }) => has("файл") },
  { action: "navigate", params: { tab: "media" }, when: "verb", test: ({ has }) => has("медиа", "галере", "фото", "видео", "музык") },
  // «сегодня» ведёт на экран только с глаголом («покажи сегодня»): «какой сегодня праздник» — вопрос
  { action: "navigate", params: { tab: "today" }, when: "verb",
    test: ({ has, hasVerb }) => has("расписан", "календар") || (has("сегодня") && hasVerb) },
  { action: "navigate", params: { tab: "settings" }, when: "verb", test: ({ has }) => has("настройк", "параметр") },
  { action: "navigate", params: { tab: "home" }, when: "verb", test: ({ has }) => has("главн", "домой") },
];

// Текст → { action, params } или null (тогда это обычный вопрос)
export function parseCommand(text) {
  const n = normalizeCommand(text || "");
  if (!n) return null;
  const words = n.split(" ");
  if (words.length > 12) return null; // длинное сообщение — точно разговор, не команда
  const has = (...stems) => words.some((w) => stems.some((st) => w.startsWith(st)));
  const ctx = {
    n, words, has,
    hasVerb: words.some((w) => ACTION_VERBS.some((v) => w.startsWith(v))),
    short: words.length <= 3,
  };
  const explain = EXPLAIN_START.test(n);
  for (const c of ASSISTANT_COMMANDS) {
    if (!c.test(ctx)) continue;
    if (c.when === "free") return { action: c.action, params: c.params || {} };
    if (!explain && (ctx.hasVerb || ctx.short)) return { action: c.action, params: c.params || {} };
  }
  return null;
}

// Подписи разделов для ответов и плашек
export const TAB_TITLES = { home: "Главная", today: "Сегодня", media: "Медиа", files: "Файлы", settings: "Настройки" };

export const TAB_REPLIES = {
  home: "Перехожу на главную", today: "Открываю «Сегодня» с расписанием", media: "Открываю медиа",
  files: "Открываю файлы", settings: "Открываю настройки",
};

export const NAV_DELAY = 700; // переход — через 0,7 с, чтобы успеть прочитать ответ

export const ASSISTANT_HELP = [
  "Я не только отвечаю на вопросы, но и управляю NEXA. Например:",
  "• **Тема** — «включи светлую тему», «тёмный режим», «переключи тему»",
  "• **Переходы** — «открой файлы», «покажи медиа», «открой расписание», «настройки», «на главную»",
  "• **Сводка** — «что у меня сегодня?», «какая погода?»",
  "• **Устройства** — «какие устройства онлайн?», «добавь устройство»",
  "• **Файлы** — «загрузи файл»",
  "Всё остальное — просто спросите.",
].join("\n");

// Сводка «что у меня сегодня»: дата, погода, ближайшее дело и сколько дел
export async function buildTodaySummary() {
  const w = await getTodayWeather();
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const items = TODAY.schedule;
  const left = items.filter((it) => {
    const [h, m] = it.time.split(":").map(Number);
    return h * 60 + m >= minutes;
  });
  const date = now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const lines = [`**${date.charAt(0).toUpperCase() + date.slice(1)}.**`];
  lines.push(w
    ? `${TODAY.city}: ${signed(w.now.temp)}°, ${String(w.now.text || "").toLowerCase()}, ощущается как ${signed(w.now.feels)}°. ${w.attribution?.text || ""}${w.stale ? " (последние сохранённые данные)" : ""}.`
    : "Погоду сейчас загрузить не получилось.");
  const total = `${items.length} ${plural(items.length, ["дело", "дела", "дел"])}`;
  lines.push(!items.length
    ? "В расписании пока пусто — дела можно добавить на экране «Сегодня»."
    : left.length
    ? `В расписании ${total}, впереди ${left.length}. Ближайшее — **${left[0].time} · ${left[0].title}**${left[0].place ? ` (${left[0].place})` : ""}.`
    : `Все ${total} на сегодня позади — можно отдыхать.`);
  return lines.join("\n");
}

// Сводка по устройствам: сколько подключено и кто в сети (с зарядом)
export function buildDevicesSummary(devices) {
  if (!devices.length) return "Устройств пока нет. Скажите «добавь устройство», и я открою окно подключения.";
  const on = devices.filter((d) => d.online);
  const off = devices.filter((d) => !d.online);
  const lines = [`Подключено ${devices.length} ${plural(devices.length, ["устройство", "устройства", "устройств"])}, в сети — ${on.length}.`];
  if (on.length) lines.push(`**В сети:** ${on.map((d) => (d.battery != null ? `${d.name} (${d.battery}%)` : d.name)).join(", ")}.`);
  if (off.length) lines.push(`**Не в сети:** ${off.map((d) => d.name).join(", ")}.`);
  return lines.join("\n");
}
