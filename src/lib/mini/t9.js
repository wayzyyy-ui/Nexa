/* NEXA mini-1 · подсказки при наборе (2026-10-27) — работают прямо на устройстве, без сети и ожидания.
   Это не нейросеть-классификатор, а частотная модель слов: она «учится» на заметках самого человека
   (какие слова он пишет и какое слово обычно идёт за каким) плюс небольшой словарь частых слов.
   Посреди слова — дописывает его до самого частого подходящего; после пробела — предлагает слово,
   которое человек чаще всего пишет после предыдущего. Ничего не нашлось — подсказку даёт сервер (Gemini).
   Тексты заметок никуда не отправляются: модель живёт в памяти страницы. Тесты — tests/t9.test.mjs */

// Частые слова (без коротких предлогов — их дописывать незачем). Вес меньше, чем у слов самого человека
const BASE = `сегодня завтра вчера сейчас потом обязательно позвонить написать сделать купить проверить
отправить спросить узнать встреча встретиться работа работать проект задача задачи презентация документ
документы список молоко хлеб продукты магазин аптека врач запись записаться оплатить счёт счета деньги
подарок день рождения неделя неделе понедельник вторник среда среду четверг пятница пятницу суббота субботу
воскресенье утром вечером днём обед обеда ужин ужина тренировка тренировку зал прогулка семья маме папе
друзьям друзья пожалуйста спасибо например потому также только нужно надо можно хочу хотелось может будет
будут было были который которая которые которое потому что чтобы когда если после перед между через около
приложение приложения телефон компьютер ноутбук интерфейс дизайн макет макета экран экрана кнопка кнопку
настройки сообщение сообщения письмо письма ответ ответить идея идеи заметка заметки напоминание расписание
важно срочно быстро подготовить подготовка обсудить обсуждение созвон созвониться договориться забрать
отвезти привезти заказать доставка погода машина машину ремонт квартира квартиру билеты билет поездка`
  .split(/\s+/).filter(Boolean);

const WORD = /[a-zа-яё]+(?:-[a-zа-яё]+)*/gi;
const MIN_PREFIX = 2;       // с двух букв начинаем дописывать
const MIN_REST = 2;         // дописываем, только если осталось хотя бы 2 буквы
const MIN_NEXT = 2;         // следующее слово — если человек писал эту пару хотя бы дважды
const MAX_TEXT = 200000;    // столько знаков из заметок учитываем (хватает с запасом)

// Слова и пары самой заметки — без словаря частых слов
const buildOwn = (text) => buildT9([text], { base: false });

/* Модель из текстов: words — слово → сколько раз, pairs — «слово» → (следующее → сколько раз).
   Слова храним в нижнем регистре; короче 3 букв в дописывание не берём (предлоги, союзы) */
export function buildT9(texts = [], { base = true } = {}) {
  const words = new Map(), pairs = new Map();
  if (base) for (const w of BASE) words.set(w, (words.get(w) || 0) + 0.5);
  let budget = MAX_TEXT;
  for (const t of texts) {
    if (budget <= 0) break;
    const part = String(t || "").slice(0, budget);
    budget -= part.length;
    // Пары — только внутри строки: конец строки разрывает «последовательность»
    for (const line of part.split("\n")) {
      const list = (line.toLowerCase().match(WORD) || []);
      list.forEach((w, i) => {
        if (w.length >= 3) words.set(w, (words.get(w) || 0) + 1);
        if (i > 0) {
          const prev = list[i - 1];
          let m = pairs.get(prev);
          if (!m) pairs.set(prev, (m = new Map()));
          m.set(w, (m.get(w) || 0) + 1);
        }
      });
    }
  }
  return { words, pairs };
}

// Регистр как у начала слова: «Пре» → «Презентация», «ПРЕ» → «ПРЕЗЕНТАЦИЯ»
const caseLike = (prefix, rest) => {
  if (prefix.length > 1 && prefix === prefix.toUpperCase() && prefix !== prefix.toLowerCase()) return rest.toUpperCase();
  return rest;
};

/* Подсказка для текста before (курсор в конце). Возвращает хвост, который можно показать серым, или "".
   Посреди слова — окончание этого слова; после пробела — одно следующее слово (без пробела впереди) */
export function localSuggest(before, model) {
  if (!model || !before) return "";
  const text = String(before);
  // Сама открытая заметка: её слова (кроме недописанного последнего) тоже в счёт — модель из других
  // заметок про них ещё не знает. Последние 5000 знаков — быстро даже на длинной заметке
  const own = buildOwn(text.slice(-5000).replace(/[a-zа-яё-]+$/i, ""));
  const wordsOf = (w) => (model.words.get(w) || 0) + (own.words.get(w) || 0);
  const pairsOf = (p) => {
    const a = model.pairs.get(p), b = own.pairs.get(p);
    if (!a || !b) return a || b || null;
    const m = new Map(a);
    for (const [w, n] of b) m.set(w, (m.get(w) || 0) + n);
    return m;
  };
  // Посреди слова: последний «кусок» из букв
  const m = text.match(/([a-zа-яё]+(?:-[a-zа-яё]*)?)$/i);
  if (m) {
    const prefix = m[1], low = prefix.toLowerCase();
    if (low.length < MIN_PREFIX) return "";
    // Предыдущее слово — чтобы среди подходящих выбрать то, что обычно идёт после него
    const prevWord = (text.slice(0, text.length - prefix.length).toLowerCase().match(WORD) || []).pop();
    const after = prevWord ? pairsOf(prevWord) : null;
    let best = "", score = 0;
    for (const w of new Set([...model.words.keys(), ...own.words.keys()])) {
      if (w.length - low.length < MIN_REST || !w.startsWith(low)) continue;
      const s = wordsOf(w) + (after?.get(w) || 0) * 3;
      if (s > score || (s === score && w.length < best.length)) { best = w; score = s; }
    }
    return best ? caseLike(prefix, best.slice(low.length)) : "";
  }
  // После пробела (в той же строке): следующее слово по парам
  if (!/[ \t]$/.test(text)) return "";
  const line = text.slice(text.lastIndexOf("\n") + 1);
  const prev = (line.toLowerCase().match(WORD) || []).pop();
  const next = prev ? pairsOf(prev) : null;
  if (!next) return "";
  let best = "", count = 0;
  for (const [w, n] of next) if (w.length >= 3 && (n > count || (n === count && w.length < best.length))) { best = w; count = n; }
  return count >= MIN_NEXT ? best : "";
}
