/* Проверка правил доступа в SQL-файлах supabase/*.sql без базы (тесты — tests/sql-check.test.mjs,
   запуск при выпуске — scripts/release-check.mjs). Ловит то, из-за чего данные становятся видны чужим:
   - таблица в схеме public без RLS;
   - таблица без единого правила (policy), которой нет в списке «только для сервера»;
   - правило для anon / всех (нет «to …» — значит всем), правило «using (true)» / «with check (true)»;
   - правило для вошедших, которое не сверяет auth.uid() (то есть пускает к чужим строкам);
   - функция security definer без set search_path (её можно обмануть подменой схемы);
   - grant … to anon (кроме execute на функции, где без входа так и задумано — их список ниже).
   Это не замена тестам на настоящем Postgres (supabase/tests), а быстрый первый фильтр. */

// Таблицы без правил — доступ только у сервера (ключ service role). Новая такая таблица — дописать сюда сознательно
export const SERVER_ONLY = new Set([
  "qr_logins", "api_rate_limits", "locate_requests", "mini_phrases", "web_push_subs", "web_push_state",
  "auth_logins", "auth_identities", "error_reports",
]);
// Функции, которые сознательно можно вызывать без входа (пока таких нет)
export const ANON_FUNCTIONS = new Set([]);

const strip = (sql) => sql
  .replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/;/g, " ")) // тела функций: «;» внутри не делят команды
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const name = (s) => String(s).replace(/"/g, "").toLowerCase().replace(/^public\./, "");

/* files — { "имя.sql": текст }. Ответ — список замечаний { file, rule, what, text } */
export function checkSql(files) {
  const out = [];
  const tables = new Map(), rls = new Set(), policies = [];
  for (const [file, raw] of Object.entries(files)) {
    const sql = strip(raw);
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.)?("?[\w]+"?)/gi)) {
      if (!m[1] && /\./.test(m[2])) continue;
      tables.set(name(m[2]), file);
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?("?\w+"?)\s+enable\s+row\s+level\s+security/gi)) rls.add(name(m[1]));
    // Правила: create policy "…" on <таблица> … ;
    for (const m of sql.matchAll(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+([\w."]+)([\s\S]*?);/gi)) {
      policies.push({ file, title: m[1].replace(/"/g, ""), table: name(m[2]), body: m[3].replace(/\s+/g, " ").trim().toLowerCase() });
    }
    // Функции security definer — без set search_path нельзя
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([\s\S]*?)\bas\s+\$\$/gi)) {
      const head = m[2].toLowerCase();
      if (/security\s+definer/.test(head) && !/set\s+search_path/.test(head)) out.push({ file, rule: "definer", what: m[1], text: "security definer без set search_path" });
    }
    for (const m of sql.matchAll(/\bgrant\s+([\w\s,]+?)\s+on\s+([\s\S]*?)\s+to\s+([\w\s,]+?);/gi)) {
      const roles = m[3].toLowerCase().split(/[\s,]+/);
      if (!roles.includes("anon") && !roles.includes("public")) continue;
      const fn = m[2].match(/function\s+([\w.]+)/i);
      if (fn && /^execute$/i.test(m[1].trim()) && ANON_FUNCTIONS.has(name(fn[1]))) continue;
      out.push({ file, rule: "grant", what: m[2].trim().slice(0, 60), text: `grant ${m[1].trim()} для ${m[3].trim()}` });
    }
  }
  for (const [t, file] of tables) {
    if (!rls.has(t)) out.push({ file, rule: "rls", what: t, text: "у таблицы не включена RLS" });
    const own = policies.filter((p) => p.table === t);
    if (!own.length && !SERVER_ONLY.has(t)) out.push({ file, rule: "no-policy", what: t, text: "нет ни одного правила, и таблица не в списке «только для сервера» (SERVER_ONLY)" });
    if (own.length && SERVER_ONLY.has(t)) out.push({ file, rule: "server-policy", what: t, text: "таблица «только для сервера», но у неё есть правила" });
  }
  for (const p of policies) {
    const roles = (p.body.match(/\bto\s+([\w\s,]+?)(?=\s+(?:using|with)\b|$)/) || [])[1];
    const list = roles ? roles.split(/[\s,]+/).filter(Boolean) : ["public"];
    const deny = /as\s+restrictive/.test(p.body) || /using\s*\(\s*false\s*\)/.test(p.body);
    if (deny) continue;
    if (list.includes("anon") || list.includes("public")) out.push({ file: p.file, rule: "anon", what: `${p.table}: ${p.title}`, text: roles ? `правило для ${roles}` : "правило без «to …» — для всех, в том числе без входа" });
    if (/(using|check)\s*\(\s*true\s*\)/.test(p.body)) out.push({ file: p.file, rule: "true", what: `${p.table}: ${p.title}`, text: "правило пускает ко всем строкам (true)" });
    else if (!/auth\.uid\(\)/.test(p.body)) out.push({ file: p.file, rule: "uid", what: `${p.table}: ${p.title}`, text: "правило не сверяет auth.uid() — пустит к чужим строкам" });
  }
  return out;
}
