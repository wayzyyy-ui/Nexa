// Разовые объявления: только вошедшему, один раз, старые не повторяются
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANNOUNCEMENTS, announceKey, unseenAnnouncements, loadSeen, saveSeen } from "../src/lib/announce.js";

test("гостю и без аккаунта объявлений нет", () => {
  assert.deepEqual(unseenAnnouncements(null, []), []);
  assert.deepEqual(unseenAnnouncements("", []), []);
});

test("новый аккаунт видит все объявления, показанные — больше нет", () => {
  const all = unseenAnnouncements("u1", []);
  assert.equal(all.length, ANNOUNCEMENTS.length);
  assert.equal(unseenAnnouncements("u1", ANNOUNCEMENTS.map((a) => a.id)).length, 0);
});

test("новое объявление показывается, а старые не повторяются", () => {
  const list = [...ANNOUNCEMENTS, { id: "next-1", title: "t", text: "x", target: { tab: "home" } }];
  const left = unseenAnnouncements("u1", ANNOUNCEMENTS.map((a) => a.id), list);
  assert.deepEqual(left.map((a) => a.id), ["next-1"]);
});

test("у каждого объявления есть id, заголовок, текст и переход; id не повторяются", () => {
  const ids = new Set();
  for (const a of ANNOUNCEMENTS) {
    assert.ok(a.id && a.title && a.text && a.target);
    assert.ok(!ids.has(a.id)); ids.add(a.id);
  }
  assert.equal(announceKey("abc"), "nexa-announce@abc");
});

test("показанные хранятся на устройстве отдельно для каждого аккаунта", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  saveSeen("a", ["mini-1"]);
  assert.deepEqual(loadSeen("a"), ["mini-1"]);
  assert.deepEqual(loadSeen("b"), []);
  store.set(announceKey("c"), "не json");
  assert.deepEqual(loadSeen("c"), []);
  delete globalThis.localStorage;
});

test("сервер: рассылка объявления только с секретом, один раз, устаревшие адреса убираются", async () => {
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const SECRET = "s".repeat(32);
  process.env.NEXA_ADMIN_SECRET = SECRET;
  const { default: handler, __setPushTest } = await import("../api/push.js");
  const tokens = ["token-aaaaaaaaaa", "token-bbbbbbbbbb", "token-aaaaaaaaaa", "token-dead000000"]; // один повтор, один устаревший
  const deleted = [];
  const sb = { from: () => ({
    select: () => ({ order: () => ({ range: async () => ({ data: tokens.map((token) => ({ token })), error: null }) }) }),
    delete: () => ({ eq: async (k, v) => { deleted.push(v); return { error: null }; } }),
  }) };
  __setPushTest({ admin: sb, sa: { project_id: "p", client_email: "e", private_key: "k" } });
  const sentBodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body); sentBodies.push(body);
    if (body.message.token === "token-dead000000") return new Response(JSON.stringify({ error: { details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    return new Response("{}", { status: 200 });
  };
  let ip = 0;
  const call = async (body, headers = {}) => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} };
    await handler({ method: "POST", headers: { "x-forwarded-for": `10.1.0.${++ip}`, ...headers }, body }, res);
    return res;
  };
  const ann = { action: "announce", id: "mini-1", title: "Встречайте NEXA mini-1", text: "Текст объявления" };
  try {
    assert.equal((await call(ann)).code, 403, "без секрета — нет доступа");
    assert.equal((await call(ann, { "x-nexa-admin": "неверный" })).code, 403, "неверный секрет");
    assert.equal((await call({ ...ann, id: "Плохой id!" }, { "x-nexa-admin": SECRET })).code, 400);
    let r = await call({ ...ann, dry: true }, { "x-nexa-admin": SECRET });
    assert.deepEqual(r.body, { devices: 3, dry: true }, "проверка: телефоны без повторов, ничего не отправлено");
    assert.equal(sentBodies.length, 0);
    r = await call(ann, { "x-nexa-admin": SECRET });
    assert.deepEqual(r.body, { devices: 3, sent: 2, stale: 1, failed: 0 });
    assert.deepEqual(deleted, ["token-dead000000"], "устаревший адрес убран");
    const m = sentBodies[0].message;
    assert.deepEqual(m.notification, { title: "Встречайте NEXA mini-1", body: "Текст объявления" });
    assert.equal(m.android.notification.channel_id, "nexa-updates");
    assert.deepEqual(m.data, { type: "announce", id: "mini-1" });
    assert.equal(JSON.stringify(m).includes("user"), false, "в push нет аккаунта");
    assert.equal((await call(ann, { "x-nexa-admin": SECRET })).code, 409, "второй раз то же объявление — нет");
    // Перебор секрета с одного адреса: 10 попыток в час
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await call(ann, { "x-nexa-admin": "x" + i, "x-forwarded-for": "10.7.7.7" })).code);
    assert.equal(codes[10], 429);
    // Короткий секрет на сервере — рассылка выключена совсем
    process.env.NEXA_ADMIN_SECRET = "short";
    assert.equal((await call({ ...ann, id: "other" }, { "x-nexa-admin": "short" })).code, 403);
  } finally {
    globalThis.fetch = realFetch; __setPushTest({}); delete process.env.NEXA_ADMIN_SECRET;
  }
});
