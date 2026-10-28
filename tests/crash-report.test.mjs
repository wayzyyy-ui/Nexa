// Отчёты о сбоях без личных данных (src/lib/crashReport.js, api/errors.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubText, parseStack, browserLabel, makeReport, cleanReport, allowSend, CRASH_PER_RUN } from "../src/lib/crashReport.js";

const ctx = { kind: "error", version: "0.18.0", platform: "android", screen: "files", ua: "Mozilla/5.0 (Linux; Android 15; K; wv) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36" };

test("из текста ошибки убирается личное", () => {
  const s = scrubText(`Не найдено ivan.petrov@yandex.ru по https://nexa-link.ru/files/123?token=abc eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdEFGH id 3f2a1b4c-1111-4222-8333-444455556666 тел +7 (912) 345-67-89 сумма 1234567 ключ fixture_secret_0123456789abcdef "${"мой длинный текст заметки про врача и встречу".repeat(1)}"`);
  for (const bad of ["ivan", "yandex.ru", "/files/123", "token=abc", "eyJ", "3f2a1b4c", "912", "1234567", "fixture_secret", "врача"]) assert.ok(!s.includes(bad), `осталось «${bad}»: ${s}`);
  assert.ok(s.includes("<nexa-link.ru>"), "адрес сайта без пути — можно");
  assert.ok(scrubText("x".repeat(1000)).length <= 300);
  assert.equal(scrubText("Cannot read properties of undefined (reading 'name')"), "Cannot read properties of undefined (reading 'name')", "обычный текст ошибки не портится");
});

test("строки «где упало»: только имя файла сборки, строка и столбец", () => {
  const chrome = `TypeError: x is undefined
    at openFile (https://nexa-link.ru/assets/index-3f2a.js?v=1:12:345)
    at https://nexa-link.ru/assets/vendor-aa.js:1:20
    at async HTMLButtonElement.<anonymous> (https://localhost/assets/index-3f2a.js:99:1)`;
  const { frames } = parseStack(chrome);
  assert.deepEqual(frames[0], { fn: "openFile", file: "index-3f2a.js", line: 12, col: 345 });
  assert.equal(frames[1].file, "vendor-aa.js");
  assert.equal(frames.length, 3);
  const ff = parseStack("openFile@https://nexa-link.ru/assets/index-3f2a.js:12:345\n@tauri://localhost/assets/x.js:1:2").frames;
  assert.equal(ff[0].fn, "openFile");
  assert.equal(ff[1].file, "x.js");
  assert.ok(!JSON.stringify(frames).includes("nexa-link.ru"), "адресов в строках нет");
});

test("отчёт: шум и чужие расширения не шлём; отпечаток одинаковый для одинаковых сбоев", () => {
  assert.equal(makeReport({ name: "Error", message: "Script error." }, ctx), null);
  assert.equal(makeReport({ name: "Error", message: "ResizeObserver loop completed with undelivered notifications." }, ctx), null);
  assert.equal(makeReport({ name: "AbortError", message: "aborted" }, ctx), null);
  assert.equal(makeReport({ name: "TypeError", message: "boom", stack: "at x (chrome-extension://abc/content.js:1:1)" }, ctx), null);
  const a = makeReport({ name: "TypeError", message: "Item 123 failed", stack: "at f (https://nexa-link.ru/assets/i.js:5:6)" }, ctx);
  const b = makeReport({ name: "TypeError", message: "Item 987 failed", stack: "at f (https://nexa-link.ru/assets/i.js:5:6)" }, ctx);
  assert.equal(a.fp, b.fp);
  assert.match(a.fp, /^[0-9a-f]{8}$/);
  assert.equal(a.browser, "WebView 140");
  assert.equal(a.screen, "files");
  assert.deepEqual(Object.keys(a).sort(), ["browser", "fp", "frames", "kind", "message", "name", "platform", "screen", "version"], "лишних полей нет");
  assert.equal(browserLabel("Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/18.1 Safari/605"), "Safari 18");
});

test("сервер не верит присланному: чистит заново и отбрасывает мусор", () => {
  const r = cleanReport({ kind: "hack", name: "Type<script>Error", message: "почта a@b.ru", frames: [{ fn: "x", file: "../../etc/passwd", line: 1 }, { fn: "y", file: "i.js", line: 2, col: 3 }], version: "1", platform: "ios", screen: "../x", browser: "Netscape", extra: "лишнее" });
  assert.equal(r.kind, "error");
  assert.equal(r.name, "TypescriptError");
  assert.ok(!r.message.includes("a@b.ru"));
  assert.deepEqual(r.frames, [{ fn: "y", file: "i.js", line: 2, col: 3 }]);
  assert.equal(r.version, "0.0.0");
  assert.equal(r.platform, "web");
  assert.equal(r.screen, "");
  assert.equal(r.browser, "Другой");
  assert.ok(!("extra" in r));
  assert.equal(cleanReport(null), null);
});

test("не больше: один отпечаток раз за запуск, 10 за запуск, 30 за день", () => {
  const seen = new Set();
  let day = null;
  for (let i = 0; i < CRASH_PER_RUN; i++) { const a = allowSend(`fp${i}`, seen, day, "2026-10-28"); assert.ok(a.ok); seen.add(`fp${i}`); day = a.day; }
  assert.equal(allowSend("new", seen, day, "2026-10-28").ok, false, "за запуск хватит");
  assert.equal(allowSend("fp1", new Set(["fp1"]), null, "2026-10-28").ok, false, "повтор");
  assert.equal(allowSend("x", new Set(), { day: "2026-10-28", n: 30 }, "2026-10-28").ok, false, "за день хватит");
  assert.equal(allowSend("x", new Set(), { day: "2026-10-27", n: 30 }, "2026-10-28").ok, true, "новый день");
});

test("api/errors.js: пишет очищенное, лимит с адреса, выгрузка только по секрету", async () => {
  const { default: handler, __setErrorsTest } = await import("../api/errors.js");
  const hits = [];
  __setErrorsTest({ rpc: async (name, args) => { hits.push([name, args.p]); return { error: null }; }, from: () => { throw new Error("no"); } });
  const call = async (body, headers = {}, ip = "10.30.0.1") => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} };
    await handler({ method: "POST", headers: { "x-forwarded-for": ip, ...headers }, body }, res);
    return res;
  };
  const rep = makeReport({ name: "TypeError", message: "x of a@b.ru", stack: "at f (https://nexa-link.ru/assets/i.js:5:6)" }, ctx);
  const r = await call(JSON.stringify({ reports: [{ ...rep, message: "почта c@d.ru" }] }));
  assert.equal(r.code, 202);
  assert.equal(hits.length, 1);
  assert.equal(hits[0][0], "nexa_error_hit");
  assert.ok(!JSON.stringify(hits[0][1]).includes("c@d.ru"), "сервер очистил сам");
  assert.equal((await call("{bad json")).code, 400);
  assert.equal((await call("x".repeat(30000))).code, 413);
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call({ reports: [rep] }, {}, "10.30.0.2")).code);
  assert.equal(codes[10], 429, "11-я пачка за 10 минут с адреса");
  process.env.NEXA_ADMIN_SECRET = "s".repeat(30);
  assert.equal((await call({ action: "export" }, { "x-nexa-admin": "wrong".repeat(6) }, "10.30.0.3")).code, 403);
  delete process.env.NEXA_ADMIN_SECRET;
});
