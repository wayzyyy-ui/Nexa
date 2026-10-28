// Ускорение ассистента (api/chat.js): тёплая функция помнит подходящую настройку обдумывания
// и несколько минут пропускает отказавшую модель. Google подменён (fetch), к нему не ходим
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.GOOGLE_API_KEY = "test-key";
const { default: handler, __resetChatMemory } = await import("../api/chat.js");

// Подменённый Google: что отвечает каждая модель в зависимости от настройки обдумывания
function fakeGoogle(rules) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (!u.includes("generativelanguage.googleapis.com")) return real(url, opt);
    const model = (u.match(/models\/([^:]+):/) || [])[1];
    const body = JSON.parse(opt.body || "{}");
    const think = body.generationConfig?.thinkingConfig || {};
    const kind = think.thinkingLevel ? "level" : "thinkingBudget" in think ? "budget" : "none";
    calls.push(`${model}:${kind}`);
    const status = rules(model, kind);
    if (status !== 200) {
      return new Response(JSON.stringify({ error: { code: status, message: "x", status: "ERR" } }), { status, headers: { "content-type": "application/json" } });
    }
    const sse = `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Привет" }] } }] })}\n\n`;
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

let ip = 0;
async function ask() {
  let out = "", code = 200;
  const res = {
    headersSent: false, writableEnded: false,
    status(c) { code = c; return this; }, json(b) { out = JSON.stringify(b); this.writableEnded = true; return this; },
    setHeader() {}, write(t) { this.headersSent = true; out += t; }, end() { this.writableEnded = true; return this; }, on() {},
  };
  await handler({ method: "POST", headers: { "x-forwarded-for": `10.50.0.${++ip}` }, body: { message: "Привет", history: [] } }, res);
  return { code, out };
}

test("вторая просьба сразу берёт подошедшую настройку и пропускает отказавшую модель", async () => {
  __resetChatMemory();
  // Основная модель перегружена (503), запасная понимает только thinkingBudget
  const g = fakeGoogle((model, kind) => (model === "gemini-3.6-flash" ? 503 : kind === "level" ? 400 : 200));
  try {
    const a = await ask();
    assert.equal(a.out, "Привет");
    assert.deepEqual(g.calls, ["gemini-3.6-flash:level", "gemini-3.1-flash-lite:level", "gemini-3.1-flash-lite:budget"]);
    g.calls.length = 0;
    const b = await ask();
    assert.equal(b.out, "Привет");
    assert.deepEqual(g.calls, ["gemini-3.1-flash-lite:budget"], "перегруженная модель пропущена, сразу нужная настройка");
  } finally { g.restore(); }
});

test("последняя модель не пропускается никогда, «разбудить» отвечает сразу", async () => {
  __resetChatMemory();
  const g = fakeGoogle((model) => (model === "gemini-flash-lite-latest" ? 200 : 429));
  try {
    assert.equal((await ask()).out, "Привет");
    g.calls.length = 0;
    assert.equal((await ask()).out, "Привет");
    assert.deepEqual(g.calls, ["gemini-flash-lite-latest:level"]);
  } finally { g.restore(); }
  let code = 0;
  await handler({ method: "GET", query: { warm: "1" }, headers: {} }, { status(c) { code = c; return this; }, end() {}, setHeader() {} });
  assert.equal(code, 204);
});
