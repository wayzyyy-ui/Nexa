/* Чистые правила ИИ в заметках (без сети и интерфейса): когда показывать подсказку, как её дописать, куда вставить результат.
   Сеть — noteAi.js; тесты — tests/note-ai.test.mjs */
/* ─── Подсказка в строке ─── */
export const SUGGEST_PAUSE_MS = 900;      // пауза в наборе до запроса
export const SUGGEST_GAP_MS = 2500;       // не чаще одного запроса за это время
export const SUGGEST_MIN_CHARS = 8;       // меньше — ещё нечего продолжать
export const SUGGEST_MAX_CHARS = 90;      // подсказка длиннее не показывается (обрезаем по слову)

/* Нужна ли подсказка: курсор в самом конце текста, ничего не выделено, текст не пустой и не оборван
   на пустой строке. Подсказки в середине текста не показываем: серый хвост сдвинул бы текст ниже курсора */
export function suggestionWanted(text, selStart, selEnd) {
  if (selStart !== selEnd || selEnd !== text.length) return false;
  const t = text.replace(/\s+$/, "");
  if (t.length < SUGGEST_MIN_CHARS) return false;
  if (/\n\s*$/.test(text)) return false; // новая строка — человек начал новый абзац сам
  return true;
}

/* Что показать серым: убираем переводы строк, лишние пробелы, обрезаем по слову.
   Согласуем стык с уже набранным: после пробела — без второго пробела, после запятой — с пробелом,
   после буквы — как пришло (модель сама решает, дописывать слово или начать новое) */
export function joinSuggestion(before, raw) {
  let tail = String(raw || "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");
  if (!tail.trim()) return "";
  const last = before.slice(-1);
  if (/\s/.test(last)) tail = tail.replace(/^ +/, "");
  else if (/[.,!?;:)»”]/.test(last) && !tail.startsWith(" ")) tail = " " + tail;
  if (tail.length > SUGGEST_MAX_CHARS) {
    const cut = tail.slice(0, SUGGEST_MAX_CHARS);
    const sp = cut.lastIndexOf(" ");
    tail = sp > 8 ? cut.slice(0, sp) : cut;
  }
  tail = tail.replace(/\s+$/, "");
  return tail.trim() ? tail : "";
}

/* Заменить в тексте фрагмент [from, to) результатом ИИ. orig — что там было, когда запрос ушёл:
   если текст за это время менялся, ищем тот же фрагмент заново; не нашли — null (ничего не портим) */
export function replaceRange(text, from, to, orig, result) {
  let a = from, b = to;
  if (text.slice(a, b) !== orig) {
    const i = orig ? text.indexOf(orig) : -1;
    if (i < 0) return null;
    a = i; b = i + orig.length;
  }
  return { text: text.slice(0, a) + result + text.slice(b), caret: a + result.length };
}

/* Продолжение текста: дописать в конец (с пробелом или новой строкой, если нужно) */
export function appendContinuation(text, result) {
  const add = String(result || "").replace(/^\s+/, "");
  if (!add) return null;
  const sep = !text || /\s$/.test(text) ? "" : /[.!?…:)]$/.test(text) ? " " : " ";
  const out = text + sep + add;
  return { text: out, caret: out.length };
}
