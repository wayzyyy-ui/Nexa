// NEXA mini-1: превращаем фразу в набор чисел (признаков) для нейросети.
// Без библиотек. Одни и те же правила используются при обучении и в приложении.

export const DIM = 1024; // сколько «ячеек» для признаков (хэш-пространство)

// Тот же разбор текста, что в src/lib/commands.js: нижний регистр, ё → е, без знаков
export const normalize = (text) => String(text || "")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

// Быстрый хэш строки (FNV-1a) → номер ячейки
function cell(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

/* Признаки фразы:
   • куски по 3–5 букв внутри слова — так «светлую», «светлый», «светлее» похожи друг на друга
   • слово целиком и его первые 5 букв — простая замена стеммеру для русского
   • пары соседних слов — порядок слов («выключи светлую» ≠ «включи светлую»)
   Возвращает разреженный вектор: номера ячеек и значения (длина вектора = 1) */
export function featurize(text) {
  const words = normalize(text).split(" ").filter(Boolean);
  const counts = new Map();
  const add = (key) => {
    const i = cell(key);
    counts.set(i, (counts.get(i) || 0) + 1);
  };
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const padded = `^${w}$`;
    for (let n = 3; n <= 5; n++) {
      for (let i = 0; i + n <= padded.length; i++) add(`c${n}:${padded.slice(i, i + n)}`);
    }
    add(`w:${w}`);
    add(`p:${w.slice(0, 5)}`);
    if (k > 0) add(`b:${words[k - 1].slice(0, 5)}_${w.slice(0, 5)}`);
  }
  const idx = [];
  const val = [];
  let norm = 0;
  for (const [i, c] of counts) norm += c * c;
  norm = Math.sqrt(norm) || 1;
  for (const [i, c] of counts) { idx.push(i); val.push(c / norm); }
  return { idx: Int32Array.from(idx), val: Float32Array.from(val), words: words.length };
}
