/* Что должно быть в облачной базе — по самим файлам supabase/*.sql (тесты — tests/db-check.test.mjs).
   Зачем: миграции вставляются в SQL Editor руками, и забытый файл молча выключает функцию
   (теги заметок, «Где устройство?», отчёты о сбоях…). Список не ведётся руками — он берётся из SQL,
   поэтому новая таблица или колонка попадает в проверку сама.

   expectFromSql(files) → { tables, functions, buckets }:
     tables    — Map имя → { file, columns: Map колонка → файл, где она появилась };
     functions — Map имя → { file, trigger } (trigger — функции триггеров, снаружи их не видно);
     buckets   — Map id корзины Storage → файл.
   compareWithSpec(expect, spec, used) — сравнить с описанием API базы (OpenAPI PostgREST):
     spec.definitions[таблица].properties — колонки, spec.paths["/rpc/имя"] — функции.
     used — имена функций, которые вызывает код (проверяем только их: остальные — служебные). */

const strip = (sql) => sql
  .replace(/\$\$[\s\S]*?\$\$/g, " ") // тела функций — не наши команды
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const bare = (s) => String(s).replace(/"/g, "").toLowerCase().replace(/^public\./, "");
// Слова, с которых в create table начинаются не колонки, а ограничения
const NOT_COLUMN = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);

// Разделить текст по запятым верхнего уровня (внутри скобок и кавычек запятые не считаются)
function splitTop(s) {
  const out = [];
  let depth = 0, quote = false, cur = "";
  for (const ch of s) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Тело create table (…) — с учётом вложенных скобок
function tableBody(sql, start) {
  let depth = 0;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")" && --depth === 0) return sql.slice(start + 1, i);
  }
  return "";
}

export function expectFromSql(files) {
  const tables = new Map(), functions = new Map(), buckets = new Map();
  for (const [file, raw] of Object.entries(files)) {
    const sql = strip(raw);
    // create table [if not exists] [public.]имя ( … ) — только схема public
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi)) {
      const full = m[1].replace(/"/g, "").toLowerCase();
      if (full.includes(".") && !full.startsWith("public.")) continue;
      const name = bare(full);
      const t = tables.get(name) || { file, columns: new Map() };
      t.file = file; // таблица — из файла, который её создаёт (alter из другого файла мог попасться раньше)
      for (const part of splitTop(tableBody(sql, m.index + m[0].length - 1))) {
        const word = (part.trim().match(/^"?(\w+)"?/) || [])[1]?.toLowerCase();
        if (word && !NOT_COLUMN.has(word) && !t.columns.has(word)) t.columns.set(word, file);
      }
      tables.set(name, t);
    }
    // alter table [public.]имя … add column [if not exists] колонка (может быть на следующей строке)
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)([\s\S]*?);/gi)) {
      const full = m[1].replace(/"/g, "").toLowerCase();
      if (full.includes(".") && !full.startsWith("public.")) continue;
      for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
        const t = tables.get(bare(full)) || { file, columns: new Map() };
        if (!t.columns.has(c[1].toLowerCase())) t.columns.set(c[1].toLowerCase(), file);
        tables.set(bare(full), t);
      }
    }
    // Функции схемы public (тело уже вырезано — смотрим только заголовок)
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\bas\s/gi)) {
      const full = m[1].replace(/"/g, "").toLowerCase();
      if (full.includes(".") && !full.startsWith("public.")) continue;
      const name = bare(full);
      if (!functions.has(name)) functions.set(name, { file, trigger: /returns\s+trigger/i.test(m[2]) });
    }
    // Корзины Storage: insert into storage.buckets (…) values ('id', …)
    for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'([\w-]+)'/gi)) buckets.set(m[1], file);
  }
  return { tables, functions, buckets };
}

// Какие функции базы вызывает код: имя встречается в кавычках в src/ или api/ (sources — тексты файлов)
export function usedFunctions(expect, sources) {
  const text = sources.join("\n");
  return [...expect.functions.entries()]
    .filter(([name, f]) => !f.trigger && new RegExp(`["'\`]${name}["'\`]`).test(text))
    .map(([name]) => name);
}

/* Сравнение. Ответ — список { kind: table | column | function, what, file, text } */
export function compareWithSpec(expect, spec, used) {
  const out = [];
  const defs = spec?.definitions || {};
  const paths = spec?.paths || {};
  for (const [name, t] of expect.tables) {
    const d = defs[name];
    if (!d) { out.push({ kind: "table", what: name, file: t.file, text: `нет таблицы ${name}` }); continue; }
    const have = new Set(Object.keys(d.properties || {}).map((k) => k.toLowerCase()));
    for (const [col, file] of t.columns) {
      if (!have.has(col)) out.push({ kind: "column", what: `${name}.${col}`, file, text: `в таблице ${name} нет колонки ${col}` });
    }
  }
  for (const name of used) {
    if (!paths[`/rpc/${name}`]) out.push({ kind: "function", what: name, file: expect.functions.get(name)?.file, text: `нет функции ${name}` });
  }
  return out;
}

// Понятный итог: какие файлы запустить в SQL Editor (без повторов, в порядке находок)
export function filesToRun(problems) {
  return [...new Set(problems.map((p) => p.file).filter(Boolean))];
}
