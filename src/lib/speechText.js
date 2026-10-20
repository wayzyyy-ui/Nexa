/* Текст ответа ассистента → что читать вслух (без разметки, ссылок целиком и кода) и как
   разрезать на фразы. Без побочных действий — проверяется тестами (tests/voiceOutput.test.mjs),
   читает src/lib/voiceOutput.js. */
const PART_MAX = 220;       // фраза не длиннее — браузер не обрывает длинное произнесение

/* ── Текст для чтения: без разметки, без длинных ссылок, без кода ── */
export function speechText(md) {
  let s = String(md || "");
  s = s.replace(/```[\s\S]*?```/g, " Пример кода пропущен. ");      // блоки кода
  s = s.replace(/<[^>]+>/g, " ");                                    // теги HTML
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");                       // картинки
  s = s.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");                 // [текст](адрес) → текст
  // Голые ссылки — только сайт: «ссылка на example.com»
  s = s.replace(/\bhttps?:\/\/(?:www\.)?([^/\s)]+)[^\s)]*/gi, (_, host) => `ссылка на ${host}`);
  s = s.replace(/`([^`]+)`/g, "$1");                                  // `код в строке`
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");                           // # заголовки
  s = s.replace(/^\s*>\s?/gm, "");                                    // > цитаты
  s = s.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "");                   // пункты списков
  s = s.replace(/^\s*\|?[\s:-]*\|[\s|:-]*$/gm, "");                   // разделители таблиц
  s = s.replace(/\s*\|\s*/g, ", ");                                    // ячейки таблиц
  s = s.replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, "$2");      // **жирный**, *курсив*, ~~зачёркнутый~~
  s = s.replace(/[*_~#`]+/g, " ");                                     // остатки символов разметки
  // Строки без точки в конце — отдельные фразы (иначе синтезатор читает их одним духом)
  s = s.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => (/[.!?…:;,]$/.test(l) ? l : l + ".")).join(" ");
  return s.replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

// Фразы не длиннее PART_MAX: по концу предложения, иначе по запятой / пробелу
export function speechParts(text, max = PART_MAX) {
  const out = [];
  // Конец предложения — знак и пробел после него (точка внутри «example.com» или «3.5» — не конец)
  for (const sentence of String(text).split(/(?<=[.!?…])\s+/)) {
    let rest = sentence.trim();
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(", ", max), rest.lastIndexOf(" ", max));
      const at = cut > max / 3 ? cut + 1 : max;
      out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
