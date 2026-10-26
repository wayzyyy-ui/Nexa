/* NEXA mini-1 в приложении: второй слой после обычных правил (src/lib/commands.js).
   Порядок для каждого сообщения: команды памяти → правила → NEXA mini-1 → Gemini.
   Mini только ОПРЕДЕЛЯЕТ намерение. Выполняет его тот же runCommand, что и для правил,
   поэтому она не может сделать ничего, чего не умеет ассистент. Не уверена — возвращает null,
   и вопрос уходит в Gemini как раньше. Это классификатор намерений, а не языковая модель. */
import { modelFromJSON, predict } from "./model.js";
import { normalize } from "./features.js";

// Что значит каждое намерение для runCommand (null — сеть узнала, но выполнять не будет)
export const INTENT_ACTIONS = {
  HELP: { action: "help", params: {} },
  SUMMARY: { action: "summary", params: {} },
  DEVICES: { action: "devices", params: {} },
  ADD_DEVICE: { action: "addDevice", params: {} },
  THEME_LIGHT: { action: "theme", params: { mode: "light" } },
  THEME_DARK: { action: "theme", params: { mode: "dark" } },
  THEME_TOGGLE: { action: "theme", params: { mode: "toggle" } },
  NAV_FILES: { action: "navigate", params: { tab: "files" } },
  NAV_MEDIA: { action: "navigate", params: { tab: "media" } },
  NAV_TODAY: { action: "navigate", params: { tab: "today" } },
  NAV_SETTINGS: { action: "navigate", params: { tab: "settings" } },
  NAV_HOME: { action: "navigate", params: { tab: "home" } },
  NAV_NOTES: { action: "notes", params: {} },
  NOTE_NEW: { action: "notes", params: { create: true } },
  VERSION: { action: "version", params: {} },
  UPLOAD: null, // окно выбора файла открывается только сразу по нажатию — этим занимаются правила
  GENERAL: null,
};

// Сообщения, которые начинаются как просьба что-то рассказать или написать, командами не бывают.
// «Как включить…», «как подключить…» (вопрос «как сделать», а не просьба сделать) и «что делать» — тоже вопросы.
const EXPLAIN_START = /^(расскаж|объясн|почему|зачем|что такое|что значит|в чем разница|чем отлича|напиши|придумай|переведи|сравни|что делать|как \S+(ть|ти|чь)( |$))/;
const MAX_WORDS = 12; // длинное сообщение — разговор, как и в правилах
// Удалять Mini не умеет: «удали устройство» не должно открывать список устройств — уходит в Gemini
const NOT_COMMAND = /(^| )(удал|стер|сотр|очист)/;

/* Предохранитель: сеть ошибается чаще всего на фразах, которые лишь похожи на команду («спасибо» → «добавить устройство»).
   Поэтому выбранное намерение должно подтверждаться хотя бы одним характерным словом (началом слова) в самой фразе.
   Решает по-прежнему сеть, предохранитель только может отменить её решение (тогда вопрос уйдёт в Gemini). */
const stems = (list) => new RegExp(`(^| )(${list.join("|")})`);
const CUES = {
  HELP: stems(["умеешь", "можешь", "команд", "помощ", "помоги", "справк", "функци", "возможност", "help", "тобой", "тебе", "с тобой", "что тут", "чем"]),
  SUMMARY: stems(["погод", "градус", "зонт", "куртк", "ветер", "дожд", "улиц", "окн", "воздух", "сводк", "план", "дел", "расписан", "встреч", "запланир", "ближайш", "следующ", "утренн", "у меня", "мой день", "обзор"]),
  DEVICES: stems(["устройств", "девайс", "гаджет", "телефон", "час", "ноутбук", "наушник", "планшет", "сети", "онлайн", "подключ", "заряд", "батаре", "техник", "экосистем", "связи"]),
  ADD_DEVICE: stems(["устройств", "девайс", "гаджет", "телефон", "смартфон", "час", "ноутбук", "наушник", "планшет", "телевизор", "qr", "код", "привяз", "подключ", "добав", "сопряг", "связать", "привяж"]),
  NAV_FILES: stems(["файл", "документ", "хранилищ", "папк", "загруз", "облак"]),
  NAV_MEDIA: stems(["медиа", "фото", "фотк", "видео", "галере", "музык", "снимк", "картин", "изображ"]),
  NAV_TODAY: stems(["расписан", "календар", "сегодня", "дел", "план", "повестк"]),
  NAV_SETTINGS: stems(["настро", "параметр", "профил", "аккаунт", "уведомл"]),
  NAV_HOME: stems(["главн", "дом", "начальн", "стартов"]),
  NAV_NOTES: stems(["замет", "записк", "записн", "блокнот", "запис"]),
  NOTE_NEW: stems(["замет", "записк", "блокнот", "запис", "запиш", "черкн"]),
  VERSION: stems(["верси", "сборк", "обновлен", "обновля", "о систем", "релиз", "изменени"]),
  THEME_TOGGLE: stems(["тем", "оформлен", "режим", "цвет", "инверт", "наоборот", "друг", "смен", "поменя", "переключ"]),
};
// Сеть и интернет — это не «подключить устройство к NEXA»: «код от wifi», «подключи интернет» уходят в Gemini
const NOT_ADD_DEVICE = /(wi ?fi|вай ?фай|интернет|роутер|модем|сет[ьи] |блютуз|bluetooth)/;
// Версия — только самой NEXA: фраза про NEXA / приложение / «у тебя» / «у меня», или совсем короткая («какая версия»).
// «Какая последняя версия питона» — вопрос про другое, уходит в Gemini
const VERSION_OF_NEXA = /(nexa|некс|приложен|сборк|о систем|о верси|обновлен|обновля|у тебя|тво[яй]|ты |у меня|стоит|установлен|изменени)/;
// «Закрой заметки», «выйди из файлов» — это не «открыть»: уходит в Gemini (закрывать разделы ассистент не умеет)
const CLOSE_START = /^(закрой|закрыть|выйди|выйти|убери|скрой|сверни)( |$)/;
// «В разделе сегодня», «открой вкладку» — это переход, а не сводка
const SECTION = /(раздел|вкладк|экран|перейд|зайди)/;
// Погода не здесь («на луне», «на марсе») — не сводка дня
const NOT_HERE = /(на|в) (луне|марсе|венере|юпитере|солнце|космосе|другой планете)/;
const LIGHT = stems(["светл", "бел", "дневн", "ярч", "поярч", "light"]);
const DARK = stems(["темн", "ночн", "ночь", "черн", "потемн", "затемн", "приглуш", "dark"]);

// Есть ли у фразы подтверждение выбранного намерения. Для тем: слова «светлая» и «тёмная» вместе — неясно, какая нужна
function confirmed(label, n) {
  if (label === "THEME_LIGHT") return LIGHT.test(n) && !DARK.test(n);
  if (label === "THEME_DARK") return DARK.test(n) && !LIGHT.test(n);
  if (label === "ADD_DEVICE" && NOT_ADD_DEVICE.test(n + " ")) return false;
  if (label === "VERSION" && !VERSION_OF_NEXA.test(n + " ") && n.split(" ").length > 3) return false;
  if (label === "SUMMARY" && (NOT_HERE.test(n) || SECTION.test(n))) return false;
  if (CLOSE_START.test(n) && (label.startsWith("NAV_") || label === "NOTE_NEW")) return false;
  return CUES[label] ? CUES[label].test(n) : true;
}

let model = null; // загруженная сеть
let loading = null;

// Загружаем веса заранее (при открытии ассистента), отдельным куском кода, чтобы не утяжелять запуск
export function warmMini() {
  if (model || loading) return loading;
  loading = import("./weights.json")
    .then((m) => { model = modelFromJSON(m.default || m); })
    .catch(() => { model = null; loading = null; }); // не загрузилось — просто работаем без Mini
  return loading;
}

// Для тестов и обучения: подставить готовую сеть
export function setMiniModel(m) { model = m; }
export const miniReady = () => !!model;

// Решение сети по фразе (без проверки порога): { label, confidence, margin, … }
export function classify(text) {
  return model ? predict(model, text) : null;
}

/* Главная функция решения (её же использует обучение при подборе порога, чтобы цифры совпадали с приложением).
   Возвращает { run: {...} | null, reason }. reason — почему не выполняем (для отладки и тестов). */
export function decide(net, text, opts = {}) {
  const n = normalize(text);
  if (!n) return { run: null, reason: "empty" };
  if (n.split(" ").length > MAX_WORDS) return { run: null, reason: "long" };
  if (EXPLAIN_START.test(n) || NOT_COMMAND.test(n)) return { run: null, reason: "question" };
  const threshold = opts.threshold ?? net.meta?.threshold ?? 0.9;
  const minMargin = opts.margin ?? net.meta?.margin ?? 0.3;
  const r = predict(net, n);
  if (r.confidence < threshold || r.margin < minMargin) return { run: null, reason: "unsure", guess: r };
  const act = INTENT_ACTIONS[r.label];
  if (!act) return { run: null, reason: "not-runnable", guess: r };
  if (!confirmed(r.label, n)) return { run: null, reason: "no-cue", guess: r };
  return { run: { ...act, params: { ...act.params }, via: "mini", intent: r.label, confidence: r.confidence }, reason: "ok", guess: r };
}

/* Фраза → { action, params, via: "mini", intent, confidence } или null.
   null, если: сеть ещё не загрузилась, фраза длинная или похожа на вопрос, сеть не уверена,
   предохранитель не нашёл подтверждающих слов, либо намерение выполнять не нужно (тогда решает Gemini). */
// Полное решение (для сбора непонятых фраз, src/lib/mini/collect.js): { run, reason, guess } или null — сеть не загрузилась
export function miniDecide(text, opts = {}) {
  return model ? decide(model, text, opts) : null;
}

export function miniCommand(text, opts = {}) {
  return model ? decide(model, text, opts).run : null;
}
