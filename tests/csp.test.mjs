// Охранный заголовок CSP (vercel.json) и приёмник его отчётов (api/csp-report.js)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import handler from "../api/csp-report.js";

const cspOf = () => {
  const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  return v.headers.find((h) => h.headers.some((x) => x.key === "Content-Security-Policy-Report-Only")).headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value || "";
};

test("каждый встроенный скрипт index.html разрешён своим отпечатком в CSP", () => {
  // Поменяли скрипт в index.html (manifest) — пересчитайте отпечаток и впишите в vercel.json
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const csp = cspOf();
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    const hash = `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`;
    assert.ok(csp.includes(hash), `нет ${hash} в CSP`);
  }
  assert.ok(n >= 1);
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "встроенные скрипты — только по отпечаткам");
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.match(csp, /object-src 'none'/);
});

const call = async (body, method = "POST") => {
  const out = { code: 0 };
  const res = { status(c) { out.code = c; return this; }, end() { return this; } };
  await handler({ method, body }, res);
  return out;
};

test("приёмник отчётов: пишет в журнал только правило, источник и раздел", async () => {
  const logs = [];
  const warn = console.warn;
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    assert.equal((await call({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?token=секрет", "document-uri": "https://nexa-link.ru/files?q=личное" } })).code, 204);
    // Повтор того же нарушения в журнал не пишется
    await call({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/y.js", "document-uri": "https://nexa-link.ru/files" } });
    // Новый формат (Reporting API)
    await call([{ type: "csp-violation", body: { effectiveDirective: "connect-src", blockedURL: "https://api.example.com/a", documentURL: "https://nexa-link.ru/" } }]);
    assert.equal((await call("не json")).code, 204);
    assert.equal((await call({}, "GET")).code, 405);
  } finally { console.warn = warn; }
  assert.deepEqual(logs, ["csp script-src-elem https://evil.example /files", "csp connect-src https://api.example.com /"]);
  assert.ok(!logs.join(" ").includes("секрет") && !logs.join(" ").includes("личное"));
});
