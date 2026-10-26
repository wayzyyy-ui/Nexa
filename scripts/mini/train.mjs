// NEXA mini-1: обучение, проверка и сохранение весов.
// Запуск: npm run mini:train
// 1) делит примеры на обучающие и проверочные, 2) учит сеть, 3) показывает точность и путаницу,
// 4) подбирает порог уверенности по проверочным данным, 5) обучает финальную сеть на всех примерах
// и сохраняет веса в src/lib/mini/weights.json.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TRAINING_DATA, LABELS, RUNNABLE } from "../../src/lib/mini/trainingData.js";
import { HOLDOUT } from "../../src/lib/mini/holdout.js";
import { trainModel, splitData, flatten, evaluate } from "../../src/lib/mini/train.js";
import { predict, modelToJSON } from "../../src/lib/mini/model.js";
import { INTENT_ACTIONS, decide } from "../../src/lib/mini/index.js";

const OUT = fileURLToPath(new URL("../../src/lib/mini/weights.json", import.meta.url));
const OPTS = { hidden: 32, epochs: 90, batch: 16, lr: 0.01, typos: 2, seed: 7 };
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const { train, val } = splitData(TRAINING_DATA, 5);
const holdout = flatten(HOLDOUT);
console.log(`Примеров: обучающих ${train.length}, проверочных ${val.length}, отложенных (holdout) ${holdout.length}\n`);

console.log("Обучение на обучающей части:");
const { model } = trainModel(train, LABELS, { ...OPTS, log: (s) => console.log("  " + s) });

for (const [name, set] of [["проверочные", val], ["holdout (новые формулировки)", holdout]]) {
  const r = evaluate(model, set);
  console.log(`\nТочность на ${name}: ${pct(r.accuracy)} (${r.total - r.wrong} из ${r.total})`);
  for (const [pair, phrases] of r.confusion) console.log(`  путает ${pair}: ${phrases.map((t) => `«${t}»`).join(", ")}`);
}

/* Порог уверенности. Команду выполняем, только если сеть уверена (confidence), её догадка заметно опережает вторую (margin)
   и предохранитель подтвердил намерение словами фразы (см. decide в src/lib/mini/index.js: считаем ровно так же, как в приложении).
   «Опасная ошибка» — фраза выполнена НЕ так, как нужно (вопрос принят за команду или команда за другую).
   Выбираем самую смелую пару порогов без опасных ошибок на проверочных данных; не нашли — берём пару с наименьшим числом ошибок. */
function stats(set, th, mg) {
  let need = 0, ok = 0, danger = 0; const wrong = []; // wrong — какие фразы выполнены не так (для разбора)
  for (const ex of set) {
    const want = INTENT_ACTIONS[ex.label] ? ex.label : null;
    if (want) need++;
    const run = decide(model, ex.text, { threshold: th, margin: mg }).run;
    if (run && run.intent === want) ok++;
    if (run && run.intent !== want) { danger++; wrong.push(`«${ex.text}» → ${run.intent} (нужно ${want || "в Gemini"})`); }
  }
  return { need, ok, danger, wrong, coverage: need ? ok / need : 0 };
}
console.log("\nПорог уверенности: охват команд (сколько нужных команд выполнено) и опасные ошибки");
const grid = [];
for (const th of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) for (const mg of [0.2, 0.3, 0.5]) grid.push({ th, mg, v: stats(val, th, mg), h: stats(holdout, th, mg) });
for (const g of grid.filter((x) => x.mg === 0.3)) {
  console.log(`  порог ${g.th} (запас 0.3): проверочные охват ${pct(g.v.coverage)}, опасных ${g.v.danger}  |  holdout охват ${pct(g.h.coverage)}, опасных ${g.h.danger}`);
  if (g.th >= 0.8) for (const w of [...g.v.wrong, ...g.h.wrong]) console.log(`      опасная: ${w}`);
}
// Порог ниже 0.8 не берём, даже если на проверке всё чисто: проверочных фраз мало, лучше запас
const safe = grid.filter((g) => g.th >= 0.8 && g.v.danger === 0).sort((a, b) => b.v.coverage - a.v.coverage)[0];
const best = safe || grid.filter((g) => g.th >= 0.8).sort((a, b) => a.v.danger - b.v.danger || b.v.coverage - a.v.coverage)[0];
const chosen = { th: best.th, mg: best.mg };
console.log(`Выбрано: порог ${chosen.th}, запас над второй догадкой ${chosen.mg}${safe ? "" : " (пары без опасных ошибок на проверочных данных нет, взята с наименьшим числом)"}; holdout для выбора не использовался`);

console.log("\nФинальное обучение на всех обучающих примерах:");
const all = [...train, ...val];
const final = trainModel(all, LABELS, { ...OPTS, log: (s) => console.log("  " + s) });
const hv = evaluate(model, val);
const hh = evaluate(model, holdout);
writeFileSync(OUT, JSON.stringify(modelToJSON(final.model, {
  threshold: chosen.th, margin: chosen.mg, examples: all.length,
  valAccuracy: Math.round(hv.accuracy * 1000) / 1000, holdoutAccuracy: Math.round(hh.accuracy * 1000) / 1000,
  note: "Точность измерена на модели, обученной без проверочных фраз; финальная модель обучена на всех обучающих.",
})));
console.log(`\nВеса сохранены: ${OUT}`);
console.log(`Намерения выполняет сама: ${RUNNABLE.join(", ")}`);
