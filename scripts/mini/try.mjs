// Проверить NEXA mini-1 на своих фразах: node scripts/mini/try.mjs "открой заметки" "какая версия nexa"
// Показывает, что решит сеть (выполнит команду или отдаст в Gemini) и почему
import { readFileSync } from "node:fs";
import { modelFromJSON } from "../../src/lib/mini/model.js";
import { decide } from "../../src/lib/mini/index.js";

const weights = JSON.parse(readFileSync(new URL("../../src/lib/mini/weights.json", import.meta.url), "utf8"));
const model = modelFromJSON(weights);
const phrases = process.argv.slice(2);
if (!phrases.length) { console.log('Напишите фразы в кавычках: node scripts/mini/try.mjs "открой заметки"'); process.exit(0); }
for (const text of phrases) {
  const d = decide(model, text);
  const g = d.guess ? `${d.guess.label} ${(d.guess.confidence * 100).toFixed(0)}%` : "—";
  console.log(`${d.run ? "✔ выполнит " + d.run.intent : "→ в Gemini (" + d.reason + ")"}  ·  догадка: ${g}  ·  «${text}»`);
}
