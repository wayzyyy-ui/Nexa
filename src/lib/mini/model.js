// NEXA Mini: сама нейросеть (только предсказание). Обучение — в train.js.
// Устройство: вход (признаки фразы) → скрытый слой (ReLU) → выход по числу намерений → softmax.
import { DIM, featurize } from "./features.js";

// Новая сеть с случайными стартовыми весами (rand — функция 0..1, чтобы обучение можно было повторить)
export function createModel(labels, hidden, rand) {
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const fill = (n, std) => Float32Array.from({ length: n }, () => gauss() * std);
  return {
    dim: DIM, hidden, labels: [...labels],
    W1: fill(DIM * hidden, 0.3), b1: new Float32Array(hidden),
    W2: fill(hidden * labels.length, Math.sqrt(2 / hidden)), b2: new Float32Array(labels.length),
  };
}

// Прямой проход: признаки → вероятности по каждому намерению
export function forward(model, feats) {
  const { hidden: H, labels, W1, b1, W2, b2 } = model;
  const K = labels.length;
  const h = Float32Array.from(b1);
  for (let n = 0; n < feats.idx.length; n++) {
    const row = feats.idx[n] * H;
    const v = feats.val[n];
    for (let j = 0; j < H; j++) h[j] += v * W1[row + j];
  }
  for (let j = 0; j < H; j++) if (h[j] < 0) h[j] = 0; // ReLU
  const logits = Float32Array.from(b2);
  for (let j = 0; j < H; j++) {
    if (h[j] === 0) continue;
    const row = j * K;
    for (let k = 0; k < K; k++) logits[k] += h[j] * W2[row + k];
  }
  let max = -Infinity;
  for (let k = 0; k < K; k++) if (logits[k] > max) max = logits[k];
  let sum = 0;
  const probs = new Float32Array(K);
  for (let k = 0; k < K; k++) { probs[k] = Math.exp(logits[k] - max); sum += probs[k]; }
  for (let k = 0; k < K; k++) probs[k] /= sum;
  return { probs, h };
}

// Фраза → { label, confidence, second, margin } (second — вторая по вероятности догадка)
export function predict(model, text) {
  const { probs } = forward(model, featurize(text));
  let best = 0;
  for (let k = 1; k < probs.length; k++) if (probs[k] > probs[best]) best = k;
  let sec = best === 0 ? 1 : 0;
  for (let k = 0; k < probs.length; k++) if (k !== best && probs[k] > probs[sec]) sec = k;
  return {
    label: model.labels[best], confidence: probs[best],
    second: model.labels[sec], margin: probs[best] - probs[sec],
  };
}

// Сохранение / загрузка весов (обычный JSON; числа с тремя знаками после запятой)
const r3 = (a) => Array.from(a, (x) => Math.round(x * 1000) / 1000);
export function modelToJSON(model, meta = {}) {
  return {
    format: "nexa-mini", version: 1, dim: model.dim, hidden: model.hidden, labels: model.labels,
    W1: r3(model.W1), b1: r3(model.b1), W2: r3(model.W2), b2: r3(model.b2), meta,
  };
}
export function modelFromJSON(json) {
  if (!json || json.format !== "nexa-mini" || json.version !== 1) throw new Error("Неизвестный формат весов NEXA Mini");
  if (json.dim !== DIM) throw new Error("Веса обучены для другого размера признаков — переобучите модель");
  if (json.W1.length !== json.dim * json.hidden || json.W2.length !== json.hidden * json.labels.length) throw new Error("Веса повреждены");
  return {
    dim: json.dim, hidden: json.hidden, labels: json.labels, meta: json.meta || {},
    W1: Float32Array.from(json.W1), b1: Float32Array.from(json.b1),
    W2: Float32Array.from(json.W2), b2: Float32Array.from(json.b2),
  };
}
