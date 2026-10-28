/* Проверки перед любым выпуском — запускают release:android, release:web и release:desktop сами
   (и вручную: npm run release:check). Что-то не прошло — выпуск останавливается, ничего не собрано.

   1) Правила доступа в supabase/*.sql (scripts/lib/sql-check.mjs): RLS, правила, auth.uid(), anon, search_path.
   2) Тесты приложения (npm test) и ошибки линтера (oxlint; предупреждения не мешают).
   3) Уязвимые пакеты: npm audit — high / critical в пакетах, которые попадают в приложение, останавливают выпуск;
      в пакетах для сборки — только предупреждение (в приложение они не попадают).
   4) Правила базы на настоящем Postgres (supabase/tests, локально, к Supabase не подключается) — все сразу.
   5) ПК (--desktop): cargo audit по desktop/src-tauri/Cargo.lock, если установлен.

   Флаги (только осознанно, выпуск печатает предупреждение): --skip-audit (нет интернета), --skip-db. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { checkSql } from "./lib/sql-check.mjs";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const args = process.argv.slice(2);
const desktop = args.includes("--desktop");
const skipAudit = args.includes("--skip-audit");
const skipDb = args.includes("--skip-db");

const fails = [], warns = [];
const step = (t) => console.log(`\n▶ ${t}`);
const tail = (s, n = 25) => String(s || "").trim().split(/\r?\n/).slice(-n).join("\n");
const sh = (cmd, cwd = path(".")) => spawnSync(cmd, { cwd, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// 1) Правила доступа в SQL
step("Правила доступа в supabase/*.sql");
{
  const files = {};
  for (const n of readdirSync(path("supabase"))) if (n.endsWith(".sql") && n !== "security-test.sql") files[n] = readFileSync(path(`supabase/${n}`), "utf8");
  const probs = checkSql(files);
  if (probs.length) fails.push(`SQL: ${probs.length} замечаний\n${probs.map((p) => `    ${p.file} · ${p.what}: ${p.text}`).join("\n")}`);
  else console.log(`  ✔ ${Object.keys(files).length} файлов, замечаний нет`);
}

// 2) Тесты и линтер
step("Тесты приложения");
{
  const r = sh("node --test tests/*.test.mjs");
  const pass = (r.stdout.match(/ℹ pass (\d+)/) || [])[1], fail = (r.stdout.match(/ℹ fail (\d+)/) || [])[1];
  if (r.status !== 0) fails.push(`Тесты не прошли (${fail || "?"} с ошибкой)\n${tail(r.stdout.split(/\r?\n/).filter((l) => /^✖|not ok|Error|expected|actual/.test(l)).join("\n"))}`);
  else console.log(`  ✔ ${pass} из ${pass}`);
}
step("Линтер (oxlint)");
{
  const r = sh("npx oxlint");
  if (r.status !== 0) fails.push(`Линтер нашёл ошибки\n${tail(r.stdout.split(/\r?\n/).filter((l) => /error/i.test(l)).join("\n"))}`);
  else console.log("  ✔ без ошибок");
}

// 3) Уязвимые пакеты
step("Уязвимые пакеты (npm audit)");
const audit = (extra) => {
  const r = sh(`npm audit --json ${extra}`);
  try { return JSON.parse(r.stdout); } catch { return null; }
};
const bad = (j) => Object.entries(j?.vulnerabilities || {}).filter(([, v]) => v.severity === "high" || v.severity === "critical");
if (skipAudit) warns.push("npm audit пропущен (--skip-audit)");
else {
  const prod = audit("--omit=dev");
  if (!prod?.metadata) fails.push("npm audit не ответил (нет интернета?). Повторите или осознанно: --skip-audit");
  else {
    const hits = bad(prod);
    if (hits.length) fails.push(`Уязвимости в пакетах приложения: ${hits.map(([k, v]) => `${k} (${v.severity})`).join(", ")}\n    Обновите их (npm audit — что и до какой версии) и повторите выпуск`);
    else console.log("  ✔ в пакетах приложения high / critical нет");
    const all = audit("");
    const dev = bad(all).filter(([k]) => !prod.vulnerabilities?.[k]);
    if (dev.length) warns.push(`в пакетах для сборки (в приложение не попадают): ${dev.map(([k, v]) => `${k} (${v.severity})`).join(", ")}`);
  }
}

// 4) Правила базы на настоящем Postgres — все тесты сразу (у каждого свой Postgres и порт)
step("Правила базы на локальном Postgres (supabase/tests)");
const DB_TESTS = ["limits-test.mjs new", "storage-quota-test.mjs new", "clipboard-test.mjs", "notes-test.mjs", "chats-append-test.mjs", "auth-providers-test.mjs", "error-reports-test.mjs"];
if (skipDb) warns.push("проверка базы пропущена (--skip-db)");
else if (!existsSync(path("supabase/tests/node_modules/embedded-postgres"))) fails.push("Нет зависимостей проверки базы: cd supabase/tests && npm install");
else {
  const started = Date.now();
  const results = await Promise.all(DB_TESTS.map((t) => new Promise((done) => {
    const p = spawn(`node ${t}`, { cwd: path("supabase/tests"), shell: true });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", () => {}); // журнал Postgres — не нужен
    const timer = setTimeout(() => p.kill(), 180000);
    p.on("close", (code) => { clearTimeout(timer); done({ t, code, out }); });
  })));
  for (const r of results) {
    const bad = r.out.split(/\r?\n/).filter((l) => l.startsWith("✘"));
    if (r.code !== 0 || bad.length) fails.push(`База: ${r.t} — ${bad.length ? bad.length + " проверок не прошли" : "упал (код " + r.code + ")"}\n${tail(bad.join("\n") || r.out, 10)}`);
  }
  if (!results.some((r) => r.code !== 0)) console.log(`  ✔ ${DB_TESTS.length} наборов за ${Math.round((Date.now() - started) / 1000)} с`);
}

// 5) Пакеты приложения для ПК (Rust)
if (desktop) {
  step("Пакеты приложения для ПК (cargo audit)");
  const has = sh("cargo audit --version");
  if (has.status !== 0) warns.push("cargo audit не установлен — пакеты Rust не проверены (установить: cargo install cargo-audit --locked)");
  else {
    const r = sh("cargo audit", path("desktop/src-tauri"));
    if (r.status !== 0) fails.push(`cargo audit нашёл уязвимости\n${tail(r.stdout, 20)}`);
    else console.log("  ✔ уязвимостей нет");
  }
}

for (const w of warns) console.log(`\n⚠ ${w}`);
if (fails.length) {
  console.error(`\n✖ Выпуск остановлен — проверки не прошли:\n\n${fails.map((f) => `  • ${f}`).join("\n\n")}\n`);
  process.exit(1);
}
console.log("\n✔ Проверки перед выпуском пройдены\n");
