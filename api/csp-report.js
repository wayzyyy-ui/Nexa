// Приёмник отчётов CSP (2026-10-28). Сайт отдаёт заголовок Content-Security-Policy-Report-Only
// (vercel.json): браузер ничего не блокирует, а только сообщает сюда, что загрузилось бы с чужого адреса
// или выполнилось бы вне правил. Так видно, что поправить, прежде чем включать правила по-настоящему.
// В журнал Vercel — только правило, адрес источника без пути и запроса и раздел сайта:
// без адресов страниц с параметрами, без кусков кода и личных данных.
const seen = new Map();      // одно и то же нарушение пишем один раз на экземпляр функции (не больше 2000 разных)
const MAX_LINES = 300;       // и не больше 300 строк за жизнь экземпляра — защита журнала от засорения
let lines = 0;

const origin = (u) => {
  if (!u || typeof u !== "string") return "";
  if (/^(inline|eval|wasm-eval|data|blob|self)$/i.test(u)) return u.toLowerCase();
  try { const x = new URL(u); return x.protocol === "data:" || x.protocol === "blob:" ? x.protocol.slice(0, -1) : `${x.protocol}//${x.host}`; } catch { return "?"; }
};
const pathOf = (u) => { try { return new URL(u).pathname.split("/").slice(0, 2).join("/") || "/"; } catch { return "?"; } };

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw) {
    for await (const chunk of req) { raw += chunk; if (raw.length > 20000) break; }
  }
  try { return JSON.parse(raw.slice(0, 20000)); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = await readBody(req).catch(() => null);
  // Старый формат: { "csp-report": {…} }; новый (Reporting API): [{ type: "csp-violation", body: {…} }]
  const reports = Array.isArray(body) ? body.map((x) => x?.body).filter(Boolean) : body?.["csp-report"] ? [body["csp-report"]] : [];
  for (const r of reports.slice(0, 10)) {
    const directive = String(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || "?").split(" ")[0].slice(0, 40);
    const blocked = origin(r["blocked-uri"] || r.blockedURL).slice(0, 80);
    const page = pathOf(r["document-uri"] || r.documentURL);
    const key = `${directive}|${blocked}|${page}`;
    if (seen.has(key)) continue;
    if (seen.size > 2000) seen.clear();
    seen.set(key, true);
    if (lines >= MAX_LINES) continue;
    lines++;
    console.warn("csp", directive, blocked || "-", page);
  }
  return res.status(204).end();
}
