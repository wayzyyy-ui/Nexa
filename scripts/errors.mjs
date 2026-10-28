/* Сбои у людей за последние дни — для автора: npm run errors [-- --days=7]
   Нужен секрет NEXA_ADMIN_SECRET (тот же, что в Vercel) — только в переменной окружения, в файлы не писать:
   PowerShell: $env:NEXA_ADMIN_SECRET="…"; npm run errors      Git Bash: NEXA_ADMIN_SECRET=… npm run errors
   Адрес сервера — NEXA_API (по умолчанию https://nexa-link.ru). Отчёты без личных данных (api/errors.js). */
const secret = process.env.NEXA_ADMIN_SECRET || "";
if (secret.length < 24) { console.error("✖ Нет NEXA_ADMIN_SECRET (не короче 24 знаков) в переменных окружения."); process.exit(1); }
const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 7;
const api = (process.env.NEXA_API || "https://nexa-link.ru").replace(/\/+$/, "");

const res = await fetch(`${api}/api/errors`, { method: "POST", headers: { "Content-Type": "application/json", "x-nexa-admin": secret }, body: JSON.stringify({ action: "export", days }) });
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`✖ Сервер ответил ${res.status}${data.error ? `: ${data.error}` : ""}${data.error === "not_configured" ? " (нет ключей Supabase в Vercel)" : ""}`); process.exit(1); }
const rows = data.rows || [];
if (!rows.length) { console.log(`За ${days} дн. сбоев нет.`); process.exit(0); }

const top = (m) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
const when = (t) => new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
rows.sort((a, b) => b.count - a.count);
const total = rows.reduce((n, r) => n + r.count, 0);
console.log(`\nСбои за ${days} дн.: ${rows.length} разных, всего ${total}\n`);
for (const r of rows.slice(0, 30)) {
  const f = r.frames?.[0];
  console.log(`${String(r.count).padStart(5)} × ${r.name}: ${r.message || "(без текста)"}`);
  console.log(`        NEXA ${r.version} · ${r.kind} · ${f ? `${f.fn || "?"} ${f.file}:${f.line}:${f.col}` : "без строки"} · последний ${when(r.last_seen)}`);
  console.log(`        ${top(r.platforms)} | ${top(r.browsers)} | разделы: ${top(r.screens) || "—"}\n`);
}
