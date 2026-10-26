/* npm run mini:merge — перенести размеченные фразы из mini-review.csv в обучение NEXA mini-1 и переобучить её.
   Строка с заполненным «правильным намерением» → в src/lib/mini/trainingData.js, каждая 5-я — в holdout.js
   (по ним честно видно, понимает ли сеть новые фразы). Пустое намерение — строка остаётся в CSV на потом;
   «-» / «пропустить» — строка выбрасывается. Неизвестное намерение — ничего не пишем, показываем строки с ошибкой.
   Повторы (между собой и с тем, что уже есть) не добавляются.
   Потом сам запускает npm run mini:train и печатает точность до и после.
   Флаг --no-train — только перенести фразы, без обучения. */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TRAINING_DATA, LABELS } from "../../src/lib/mini/trainingData.js";
import { HOLDOUT } from "../../src/lib/mini/holdout.js";
import { flatten, evaluate } from "../../src/lib/mini/train.js";
import { modelFromJSON } from "../../src/lib/mini/model.js";
import { CSV_FILE, parseCsv, planMerge, insertPhrases, toCsv, phraseKey } from "./review-lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const csvPath = ROOT + CSV_FILE;
const TRAIN_FILE = ROOT + "src/lib/mini/trainingData.js", HOLD_FILE = ROOT + "src/lib/mini/holdout.js";
const WEIGHTS = ROOT + "src/lib/mini/weights.json";
const pct = (x) => `${(x * 100).toFixed(1)}%`;

if (!existsSync(csvPath)) { console.error(`Нет ${CSV_FILE} — сначала npm run mini:review`); process.exit(1); }
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const plan = planMerge(rows, { labels: LABELS, training: TRAINING_DATA, holdout: HOLDOUT });

if (plan.errors.length) {
  console.error("Неизвестное намерение — ничего не записано. Исправьте строки и запустите снова:");
  for (const e of plan.errors) console.error(`  строка ${e.line}: «${e.text}» → «${e.intent}»`);
  console.error("Можно: " + LABELS.join(", "));
  process.exit(1);
}
const addedTrain = plan.added.filter((a) => !a.holdout).length, addedHold = plan.added.length - addedTrain;
console.log(`Размечено: ${plan.added.length + plan.dups.length + plan.skipped.length + plan.rejected.length}. Добавляем: в обучение ${addedTrain}, в holdout ${addedHold}. ` +
  `Уже были: ${plan.dups.length}, выброшено: ${plan.skipped.length}${plan.rejected.length ? `, не прошли проверку приватности: ${plan.rejected.length}` : ""}. Ждут разметки: ${plan.left.length}`);
if (!plan.added.length && !plan.skipped.length && !plan.dups.length && !plan.rejected.length) { console.log("Нечего переносить."); process.exit(0); }

// Точность «до»: нынешние веса на будущем наборе проверки (старый holdout + новые фразы) и на всех новых фразах
const newHoldout = Object.fromEntries(LABELS.map((l) => [l, [...(HOLDOUT[l] || []), ...(plan.holdout[l] || [])]]));
const holdSet = flatten(newHoldout);
const newSet = plan.added.map((a) => ({ text: a.text, label: a.label }));
const measure = () => {
  const m = modelFromJSON(JSON.parse(readFileSync(WEIGHTS, "utf8")));
  return { hold: evaluate(m, holdSet), fresh: newSet.length ? evaluate(m, newSet) : null };
};
const before = measure();

// Пишем фразы. Потом проверяем, что файлы читаются и всё на месте; что-то не так — возвращаем как было
const srcTrain = readFileSync(TRAIN_FILE, "utf8"), srcHold = readFileSync(HOLD_FILE, "utf8");
if (plan.added.length) {
  writeFileSync(TRAIN_FILE, insertPhrases(srcTrain, "TRAINING_DATA", plan.train));
  writeFileSync(HOLD_FILE, insertPhrases(srcHold, "HOLDOUT", plan.holdout));
  try {
    const v = Date.now();
    const t = (await import(pathToFileURL(TRAIN_FILE).href + "?v=" + v)).TRAINING_DATA;
    const h = (await import(pathToFileURL(HOLD_FILE).href + "?v=" + v)).HOLDOUT;
    const tk = new Map(), hk = new Set();
    for (const [label, list] of Object.entries(t)) for (const p of list) {
      const k = phraseKey(p);
      if (tk.has(k) && tk.get(k) !== label) throw new Error(`фраза у двух намерений: «${p}»`);
      tk.set(k, label);
    }
    for (const list of Object.values(h)) for (const p of list) hk.add(phraseKey(p));
    for (const k of hk) if (tk.has(k)) throw new Error("фраза и в обучении, и в holdout");
    for (const a of plan.added) if (!(a.holdout ? hk : tk).has(phraseKey(a.text))) throw new Error(`не записалась «${a.text}»`);
  } catch (e) {
    writeFileSync(TRAIN_FILE, srcTrain); writeFileSync(HOLD_FILE, srcHold);
    console.error("Не удалось записать фразы, файлы возвращены как были:", e.message);
    process.exit(1);
  }
}
// В CSV остаётся только неразмеченное; всё разобрано — файл удаляем
if (plan.left.length) writeFileSync(csvPath, toCsv(plan.left)); else unlinkSync(csvPath);
console.log(`Записано в trainingData.js и holdout.js. ${plan.left.length ? `В ${CSV_FILE} осталось ${plan.left.length} неразмеченных.` : `${CSV_FILE} разобран и удалён.`}`);

if (args().includes("--no-train") || !plan.added.length) {
  if (plan.added.length) console.log("Обучение пропущено (--no-train). Запустите npm run mini:train, когда будете готовы.");
  process.exit(0);
}
console.log("\nОбучаем заново (npm run mini:train)…\n");
const run = spawnSync(process.execPath, [ROOT + "scripts/mini/train.mjs"], { stdio: "inherit", cwd: ROOT });
if (run.status !== 0) { console.error("\nОбучение не удалось — фразы записаны, веса прежние. Запустите npm run mini:train ещё раз."); process.exit(1); }

const after = measure();
const line = (name, b, a) => console.log(`  ${name.padEnd(34)} ${pct(b.accuracy).padStart(6)} → ${pct(a.accuracy).padStart(6)}  (${a.total - a.wrong} из ${a.total})`);
console.log("\nТочность до → после:");
line("holdout (проверка, вместе с новыми)", before.hold, after.hold);
if (before.fresh) line("новые фразы людей", before.fresh, after.fresh);
console.log("Новые фразы из обучения сеть теперь видела — честная оценка только по holdout.");

function args() { return process.argv.slice(2); }
