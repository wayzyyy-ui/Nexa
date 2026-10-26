// NEXA mini-1: обучение. Запускается на компьютере (npm run mini:train), в приложение не попадает.
// Всё написано вручную: прямой проход, ошибка (кросс-энтропия), обратный проход и обновление весов (Adam).
import { featurize } from "./features.js";
import { createModel, forward, predict } from "./model.js";

// Генератор случайных чисел с зерном: одинаковое зерно → одинаковое обучение
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Размеченные примеры { intent: [фразы] } → плоский список { text, label }
export const flatten = (data) => Object.entries(data).flatMap(([label, list]) => list.map((text) => ({ text, label })));

// Делим на обучающие и проверочные: каждая N-я фраза каждого намерения уходит в проверку
export function splitData(data, every = 5) {
  const train = [];
  const val = [];
  for (const [label, list] of Object.entries(data)) {
    list.forEach((text, i) => (i % every === every - 1 ? val : train).push({ text, label }));
  }
  return { train, val };
}

// Опечатки для обучения: пропуск, замена соседних или двойная буква (чтобы сеть не боялась «открй фаилы»)
export function addTypos(text, rand) {
  const chars = [...text];
  if (chars.length < 5) return text;
  const i = 1 + Math.floor(rand() * (chars.length - 2));
  const kind = rand();
  if (kind < 0.4) chars.splice(i, 1);
  else if (kind < 0.8) [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  else chars.splice(i, 0, chars[i]);
  return chars.join("");
}

const lossOf = (model, set) => {
  let s = 0;
  for (const ex of set) {
    const p = forward(model, ex.feats).probs[ex.y];
    s -= Math.log(Math.max(p, 1e-9));
  }
  return s / Math.max(1, set.length);
};

// Точность на списке { text, label }
export function evaluate(model, set) {
  let ok = 0;
  const confusion = new Map();
  for (const ex of set) {
    const r = predict(model, ex.text);
    if (r.label === ex.label) ok++;
    else {
      const key = `${ex.label} → ${r.label}`;
      confusion.set(key, [...(confusion.get(key) || []), ex.text]);
    }
  }
  return { accuracy: set.length ? ok / set.length : 0, total: set.length, wrong: set.length - ok, confusion };
}

/* Обучение. opts: hidden, epochs, batch, lr, decay, typos (сколько копий с опечатками на фразу), seed, log.
   Возвращает { model, history } */
export function trainModel(trainSet, labels, opts = {}) {
  const { hidden = 32, epochs = 90, batch = 16, lr = 0.01, decay = 1e-4, typos = 2, seed = 7, log = null } = opts;
  const rand = seededRandom(seed);
  const model = createModel(labels, hidden, rand);
  const K = labels.length;
  const H = hidden;
  const yOf = new Map(labels.map((l, i) => [l, i]));

  // Обучающие примеры: сами фразы + копии с опечатками
  const examples = [];
  for (const ex of trainSet) {
    examples.push({ feats: featurize(ex.text), y: yOf.get(ex.label) });
    for (let t = 0; t < typos; t++) examples.push({ feats: featurize(addTypos(ex.text, rand)), y: yOf.get(ex.label) });
  }
  const original = trainSet.map((ex) => ({ feats: featurize(ex.text), y: yOf.get(ex.label) }));

  // Adam: у каждого веса своя «память» о прошлых шагах
  const params = ["W1", "b1", "W2", "b2"];
  const grad = {}; const m1 = {}; const m2 = {};
  for (const p of params) { grad[p] = new Float32Array(model[p].length); m1[p] = new Float32Array(model[p].length); m2[p] = new Float32Array(model[p].length); }
  let step = 0;
  const history = [];

  for (let epoch = 1; epoch <= epochs; epoch++) {
    // Скорость обучения плавно падает к концу (иначе веса «дёргаются» и ошибка то растёт, то падает)
    const lrNow = lr * (0.05 + 0.95 * 0.5 * (1 + Math.cos((Math.PI * (epoch - 1)) / epochs)));
    // Перемешиваем примеры
    for (let i = examples.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [examples[i], examples[j]] = [examples[j], examples[i]]; }
    for (let start = 0; start < examples.length; start += batch) {
      const part = examples.slice(start, start + batch);
      for (const p of params) grad[p].fill(0);
      for (const ex of part) {
        const { probs, h } = forward(model, ex.feats);
        // Ошибка выхода: (вероятность − правильный ответ)
        const dlog = Float32Array.from(probs);
        dlog[ex.y] -= 1;
        // Обратный проход: выходной слой → скрытый → вход
        const dh = new Float32Array(H);
        for (let j = 0; j < H; j++) {
          if (h[j] <= 0) continue; // ReLU закрыт — ошибка дальше не идёт
          let s = 0;
          for (let k = 0; k < K; k++) {
            grad.W2[j * K + k] += h[j] * dlog[k];
            s += model.W2[j * K + k] * dlog[k];
          }
          dh[j] = s;
          grad.b1[j] += s;
        }
        for (let k = 0; k < K; k++) grad.b2[k] += dlog[k];
        for (let n = 0; n < ex.feats.idx.length; n++) {
          const row = ex.feats.idx[n] * H;
          const v = ex.feats.val[n];
          for (let j = 0; j < H; j++) if (dh[j] !== 0) grad.W1[row + j] += v * dh[j];
        }
      }
      step++;
      const b1c = 1 - Math.pow(0.9, step);
      const b2c = 1 - Math.pow(0.999, step);
      for (const p of params) {
        const w = model[p]; const g = grad[p]; const a = m1[p]; const b = m2[p];
        const reg = p === "W1" || p === "W2" ? decay : 0;
        for (let i = 0; i < w.length; i++) {
          const gi = g[i] / part.length + reg * w[i];
          a[i] = 0.9 * a[i] + 0.1 * gi;
          b[i] = 0.999 * b[i] + 0.001 * gi * gi;
          w[i] -= (lrNow * (a[i] / b1c)) / (Math.sqrt(b[i] / b2c) + 1e-8);
        }
      }
    }
    if (epoch === 1 || epoch % 10 === 0 || epoch === epochs) {
      const loss = lossOf(model, original);
      history.push({ epoch, loss });
      if (log) log(`эпоха ${String(epoch).padStart(3)}  ошибка на обучающих: ${loss.toFixed(4)}`);
    }
  }
  return { model, history };
}
