// Google Календарь: разбор дел, шифрование ключа, одноразовый state, отзыв (Google и база подменены)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import handler, { parseEvents, sealToken, openToken, authorizeUrl, __setFetchTest } from "../api/calendar-google.js";
import { __setAdminTest } from "../api/_lib/extauth.js";
import { mergeSchedule, readCache } from "../src/lib/gcalPlan.js";

process.env.GOOGLE_CLIENT_ID = "id";
process.env.GOOGLE_CLIENT_SECRET = "secret";
process.env.GOOGLE_TOKEN_KEY = "k".repeat(32);

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const STATE = "a".repeat(64);

// Маленькая подмена базы: хватает ровно тех вызовов, что делает функция
function fakeDb() {
  const t = { google_calendar: [], google_calendar_states: [] };
  const from = (name) => {
    const f = []; let op = "select", row = null;
    const q = {
      select() { return q; }, insert(r) { t[name].push(r); return Promise.resolve({ error: null }); },
      upsert(r) { t[name] = t[name].filter((x) => x.user_id !== r.user_id); t[name].push(r); return Promise.resolve({ error: null }); },
      delete() { op = "delete"; return q; },
      eq(k, v) { f.push((x) => x[k] === v); return q; }, gt(k, v) { f.push((x) => x[k] > v); return q; }, lt(k, v) { f.push((x) => x[k] < v); return q; },
      maybeSingle() { row = t[name].find((x) => f.every((p) => p(x))) || null; return Promise.resolve({ data: row, error: null }); },
      then(ok) {
        const hit = t[name].filter((x) => f.every((p) => p(x)));
        if (op === "delete") t[name] = t[name].filter((x) => !hit.includes(x));
        return Promise.resolve({ data: hit, error: null }).then(ok);
      },
    };
    return q;
  };
  return { t, from, auth: { getUser: async (tok) => (tok === "good" ? { data: { user: { id: "u1" } } } : { error: {}, data: {} }) } };
}
function call({ method = "POST", body, query, auth = "good" }) {
  return new Promise((done) => {
    const out = { code: 200, headers: {} };
    const res = {
      setHeader(k, v) { out.headers[k] = v; }, status(c) { out.code = c; return res; },
      json(d) { out.body = d; done(out); }, send(d) { out.body = d; done(out); }, end() { done(out); },
    };
    handler({ method, body, query, headers: { host: "nexa-link.ru", authorization: `Bearer ${auth}`, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, socket: {} }, res);
  });
}
const json = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });

test("дела Google → дела NEXA: время, весь день, отказ, отмена", () => {
  const out = parseEvents([
    { id: "a", summary: " Встреча ", location: "Офис", start: { dateTime: "2026-11-06T14:30:00+03:00" } },
    { id: "b", summary: "Отпуск", start: { date: "2026-11-07" }, end: { date: "2026-11-09" } },
    { id: "c", status: "cancelled", start: { dateTime: "2026-11-06T10:00:00+03:00" } },
    { id: "d", summary: "Отказался", attendees: [{ self: true, responseStatus: "declined" }], start: { dateTime: "2026-11-06T11:00:00+03:00" } },
    { id: "e", start: { dateTime: "2026-11-06T12:00:00+03:00" } },
    { id: "f", summary: "Без даты" }, null,
  ]);
  assert.deepEqual(out[0], { id: "gcal:a:2026-11-06", date: "2026-11-06", time: "14:30", title: "Встреча", place: "Офис" });
  assert.deepEqual(out.filter((x) => x.allDay).map((x) => x.date), ["2026-11-07", "2026-11-08"]);
  assert.equal(out.find((x) => x.id.startsWith("gcal:e")).title, "Занято");
  assert.equal(out.length, 4);
});

test("ключ в базе зашифрован, чужим ключом не открыть", () => {
  const s = sealToken("refresh-1");
  assert.ok(!s.includes("refresh-1"));
  assert.equal(openToken(s), "refresh-1");
  assert.notEqual(sealToken("refresh-1"), s);
  assert.equal(openToken(s.slice(0, -2) + "xx"), null);
  const keep = process.env.GOOGLE_TOKEN_KEY;
  process.env.GOOGLE_TOKEN_KEY = "z".repeat(32);
  assert.equal(openToken(s), null);
  process.env.GOOGLE_TOKEN_KEY = keep;
});

test("адрес согласия: только чтение событий, длинный ключ, свой redirect", () => {
  const u = new URL(authorizeUrl({ clientId: "id", state: STATE, host: "evil.example" }));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events.readonly");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("redirect_uri"), "https://nexa-link.ru/api/calendar-google");
});

test("без входа дел не отдаём, state одноразовый, ключ не попадает в ответ", async () => {
  const db = fakeDb(); __setAdminTest(db);
  assert.equal((await call({ body: { action: "events" }, auth: "bad" })).code, 401);
  db.t.google_calendar_states.push({ state_hash: sha(STATE), user_id: "u1", client: "web", expires_at: new Date(Date.now() + 60000).toISOString() });
  __setFetchTest(async () => json({ refresh_token: "r-secret", scope: "openid https://www.googleapis.com/auth/calendar.events.readonly" }));
  const first = await call({ method: "GET", query: { state: STATE, code: "c" } });
  assert.equal(first.code, 302);
  assert.equal(first.headers.Location, "https://nexa-link.ru/?gcal=ok");
  assert.ok(!db.t.google_calendar[0].token_enc.includes("r-secret"));
  assert.equal((await call({ method: "GET", query: { state: STATE, code: "c" } })).code, 400); // второй раз тот же state
});

test("сняли галочку календаря — ключ не сохраняем", async () => {
  const db = fakeDb(); __setAdminTest(db);
  db.t.google_calendar_states.push({ state_hash: sha(STATE), user_id: "u1", client: "web", expires_at: new Date(Date.now() + 60000).toISOString() });
  __setFetchTest(async () => json({ refresh_token: "r", scope: "openid" }));
  const r = await call({ method: "GET", query: { state: STATE, code: "c" } });
  assert.equal(r.headers.Location, "https://nexa-link.ru/?gcal=denied");
  assert.equal(db.t.google_calendar.length, 0);
});

test("дела, отозванный доступ и отключение", async () => {
  const db = fakeDb(); __setAdminTest(db);
  assert.deepEqual((await call({ body: { action: "events" } })).body, { connected: false, items: [] });
  db.t.google_calendar.push({ user_id: "u1", token_enc: sealToken("r1") });
  const asked = [];
  __setFetchTest(async (url) => {
    asked.push(String(url));
    if (String(url).includes("/token")) return json({ access_token: "a1" });
    return json({ items: [{ id: "x", summary: "Дело", start: { dateTime: "2026-11-06T09:00:00+03:00" } }] });
  });
  const ok = await call({ body: { action: "events", tz: "Europe/Moscow" } });
  assert.equal(ok.body.connected, true);
  assert.equal(ok.body.items[0].time, "09:00");
  assert.ok(asked[1].includes("timeZone=Europe%2FMoscow"));
  // Google отозвал доступ — ключ стираем, просим подключить заново
  __setFetchTest(async () => json({ error: "invalid_grant" }, 400));
  const gone = await call({ body: { action: "events" } });
  assert.deepEqual(gone.body, { connected: false, items: [], reason: "reconnect" });
  assert.equal(db.t.google_calendar.length, 0);
  // Отключение отзывает ключ у Google, даже если он не ответил — у нас ключа нет
  db.t.google_calendar.push({ user_id: "u1", token_enc: sealToken("r2") });
  const revoked = [];
  __setFetchTest(async (url, o) => { revoked.push(String(o.body)); throw new Error("нет связи"); });
  assert.equal((await call({ body: { action: "disconnect" } })).body.ok, true);
  assert.equal(db.t.google_calendar.length, 0);
  assert.ok(revoked[0].includes("token=r2"));
});

test("без настроек — честный ответ", async () => {
  const keep = process.env.GOOGLE_TOKEN_KEY;
  process.env.GOOGLE_TOKEN_KEY = "short";
  __setAdminTest(fakeDb());
  const r = await call({ body: { action: "events" } });
  assert.equal(r.code, 503);
  assert.equal(r.body.reason, "not_configured");
  process.env.GOOGLE_TOKEN_KEY = keep;
  __setAdminTest(null);
});

test("в расписании: свои дела отдельно, чужие помечены и по порядку", () => {
  const own = [{ id: "1", date: "2026-11-06", time: "12:00", title: "Своё" }];
  assert.equal(mergeSchedule(own, []), own);
  const m = mergeSchedule(own, [{ id: "gcal:a", date: "2026-11-06", time: "09:00", title: "Google" }]);
  assert.deepEqual(m.map((x) => [x.title, !!x.external]), [["Google", true], ["Своё", false]]);
  assert.equal(own.length, 1);
});

test("кеш: мусор не показываем", () => {
  assert.equal(readCache("не json"), null);
  assert.equal(readCache(JSON.stringify({ connected: false, items: [] })), null);
  const c = readCache(JSON.stringify({ connected: true, at: 5, items: [{ id: "a", title: "т", date: "2026-11-06", time: "09:00" }, { id: 1 }, { id: "b", title: "т", date: "вчера", time: "09:00" }] }));
  assert.equal(c.items.length, 1);
});
