// Вход через Яндекс ID (api/auth-yandex.js, api/_lib/extauth.js, src/lib/extAuthPlan.js):
// решения «чей аккаунт», state одноразовый и с коротким сроком, пропуск — один раз, лимиты
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decide, canUnlink, sameHash, tgEmail, isServiceEmail, __setAdminTest } from "../api/_lib/extauth.js";
import { pollOutcome, readPending, canUnlinkHere, linkedOf, openMode } from "../src/lib/extAuthPlan.js";

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

test("решение: вход, привязка, чужой аккаунт не склеиваем", () => {
  assert.deepEqual(decide({ purpose: "login", owner: "u1" }), { act: "use", user: "u1" });
  assert.deepEqual(decide({ purpose: "login", owner: null, byEmail: "u2" }), { act: "attach", user: "u2" });
  assert.deepEqual(decide({ purpose: "login", owner: null, byEmail: null }), { act: "create" });
  assert.deepEqual(decide({ purpose: "login", owner: null, emailOk: false }), { act: "fail", reason: "domain" });
  assert.deepEqual(decide({ purpose: "link", owner: "u9", linkUser: "u1" }), { act: "fail", reason: "taken" });
  assert.deepEqual(decide({ purpose: "link", owner: "u1", linkUser: "u1" }), { act: "linked" });
  assert.deepEqual(decide({ purpose: "link", owner: null, linkUser: "u1", mine: "other" }), { act: "fail", reason: "has_other" });
  assert.equal(decide({ purpose: "link", owner: null, linkUser: "u1" }).act, "attach");
  assert.deepEqual(decide({ purpose: "link", owner: null, linkUser: null }), { act: "fail", reason: "auth" });
});

test("отвязать нельзя последний способ входа", () => {
  assert.equal(canUnlink({ provider: "yandex", email: "a@ya.ru", linked: ["yandex"] }).ok, true);
  assert.equal(canUnlink({ provider: "telegram", email: tgEmail(5), linked: ["telegram"] }).reason, "last");
  assert.equal(canUnlink({ provider: "telegram", email: tgEmail(5), linked: ["telegram", "yandex"] }).ok, true);
  assert.equal(canUnlink({ provider: "yandex", email: "a@ya.ru", linked: [] }).reason, "not_linked");
  assert.equal(isServiceEmail(tgEmail(77)), true);
  assert.equal(isServiceEmail("tg77@tg.nexa.invalid.ru"), false);
  const u = { email: tgEmail(1), app_metadata: { nexa_providers: ["telegram"] } };
  assert.equal(canUnlinkHere(u, "telegram"), false);
  assert.deepEqual(linkedOf({ app_metadata: { nexa_providers: ["yandex", "evil"] } }), ["yandex"]);
  assert.deepEqual(linkedOf({ user_metadata: { nexa_providers: ["yandex"] } }), [], "user_metadata не считается");
});

test("сравнение хэшей и разбор ответов опроса", () => {
  assert.equal(sameHash("ab", "ab"), true);
  assert.equal(sameHash("ab", "ac"), false);
  assert.equal(sameHash("", ""), false);
  assert.equal(sameHash("ab", "abc"), false);
  assert.deepEqual(pollOutcome(200, { status: "ready", token_hash: "t" }), { next: "signin", tokenHash: "t" });
  assert.equal(pollOutcome(200, { status: "pending" }).next, "wait");
  assert.equal(pollOutcome(429, {}).next, "wait");
  assert.equal(pollOutcome(404, { status: "not_found" }).next, "fail");
  assert.equal(pollOutcome(200, { status: "error", text: "X" }).text, "X");
  assert.equal(pollOutcome(200, { status: "linked" }).next, "linked");
  assert.equal(openMode("web"), "same-tab");
  assert.equal(openMode("android"), "external");
  const ok = JSON.stringify({ provider: "yandex", id: "i", secret: "a".repeat(64), at: 1000 });
  assert.equal(readPending(ok, 2000).provider, "yandex");
  assert.equal(readPending(ok, 1000 + 11 * 60 * 1000), null, "старше 10 минут");
  assert.equal(readPending(JSON.stringify({ provider: "evil", id: "i", secret: "a".repeat(64), at: 1 }), 2), null);
  assert.equal(readPending("{", 1), null);
});

/* Крошечная база в памяти: auth_logins, auth_identities, пользователи */
function fakeSb() {
  const t = { auth_logins: [], auth_identities: [] };
  const users = new Map();
  let n = 0;
  const query = (table) => {
    const f = [];
    let op = "select", patch = null, single = false;
    const rows = () => t[table].filter((r) => f.every((x) => x(r)));
    const api = {
      eq(k, v) { f.push((r) => r[k] === v); return api; },
      gt(k, v) { f.push((r) => String(r[k]) > String(v)); return api; },
      lt(k, v) { f.push((r) => String(r[k]) < String(v)); return api; },
      limit() { return api; }, order() { return api; },
      select() { return api; },
      maybeSingle() { single = true; return api; },
      single() { single = true; return api; },
      update(p) { op = "update"; patch = p; return api; },
      delete() { op = "delete"; return api; },
      then(res, rej) {
        let out;
        if (op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); out = { data: hit.map((r) => ({ ...r })), error: null }; }
        else if (op === "delete") { t[table] = t[table].filter((r) => !f.every((x) => x(r))); out = { error: null }; }
        else { const d = rows().map((r) => ({ ...r })); out = { data: single ? d[0] || null : d, error: null }; }
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  };
  const sb = {
    t, users,
    from: (table) => ({
      ...query(table),
      select: () => query(table),
      update: (p) => query(table).update(p),
      delete: () => query(table).delete(),
      insert: (row) => {
        if (table === "auth_identities" && t.auth_identities.some((r) => (r.provider === row.provider && r.subject === row.subject) || (r.provider === row.provider && r.user_id === row.user_id))) {
          return Promise.resolve({ error: { code: "23505" } });
        }
        const r = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, status: "pending", ...row };
        t[table].push(r);
        const done = { error: null, data: { id: r.id } };
        return { select: () => ({ single: async () => done }), then: (res) => Promise.resolve(done).then(res) };
      },
    }),
    rpc: async (name, args) => ({ data: [...users.values()].find((u) => u.email === args.p_email)?.id || null, error: null }),
    auth: {
      getUser: async (jwt) => (users.has(jwt) ? { data: { user: users.get(jwt) }, error: null } : { data: null, error: true }),
      admin: {
        getUserById: async (id) => ({ data: { user: users.get(id) || null } }),
        createUser: async ({ email, user_metadata, app_metadata }) => {
          const id = `user-${users.size + 1}`;
          users.set(id, { id, email, user_metadata, app_metadata: { provider: "email", ...app_metadata } });
          return { data: { user: users.get(id) }, error: null };
        },
        updateUserById: async (id, { app_metadata }) => { users.get(id).app_metadata = app_metadata; return { error: null }; },
        generateLink: async ({ email }) => ({ data: { properties: { hashed_token: `tok-${email}-${++n}` } }, error: null }),
      },
    },
  };
  return sb;
}

// Подменённый Яндекс: код → ключ → сведения о человеке
function fakeYandex(people) {
  return async (url, opt = {}) => {
    const u = String(url);
    if (u === "https://oauth.yandex.ru/token") {
      const code = new URLSearchParams(opt.body).get("code");
      assert.ok(new URLSearchParams(opt.body).get("client_secret"), "секрет только в запросе сервера");
      return people[code] ? { ok: true, status: 200, json: async () => ({ access_token: `at-${code}` }) } : { ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) };
    }
    if (u.startsWith("https://login.yandex.ru/info")) {
      const code = String(opt.headers.Authorization).replace("OAuth at-", "");
      return { ok: true, status: 200, json: async () => people[code] };
    }
    return { ok: false, status: 404, headers: { get: () => "" } };
  };
}

let ip = 0;
async function run(handler, { method = "POST", body, query, auth, host = "nexa-link.ru", sameIp } = {}) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; } };
  await handler({ method, query, body, headers: { host, "x-forwarded-for": sameIp || `10.20.${Math.floor(++ip / 200)}.${ip % 200}`, ...(auth ? { authorization: `Bearer ${auth}` } : {}) } }, res);
  return res;
}

test("Яндекс: вход создаёт аккаунт, state одноразовый, пропуск отдаётся один раз", async () => {
  process.env.YANDEX_CLIENT_ID = "cid"; process.env.YANDEX_CLIENT_SECRET = "csecret";
  const { default: handler, __setFetchTest } = await import("../api/auth-yandex.js");
  const sb = fakeSb(); __setAdminTest(sb);
  __setFetchTest(fakeYandex({ c1: { id: 111, default_email: "ivan@yandex.ru", real_name: "Иван", is_avatar_empty: true } }));

  const s = await run(handler, { body: { action: "start", client: "android" } });
  assert.equal(s.code, 200);
  const url = new URL(s.body.url);
  assert.equal(url.host, "oauth.yandex.ru");
  assert.equal(url.searchParams.get("redirect_uri"), "https://nexa-link.ru/api/auth-yandex");
  assert.equal(url.searchParams.get("client_secret"), null, "секрет в адрес не попадает");
  const state = url.searchParams.get("state");
  assert.match(state, /^[0-9a-f]{64}$/);
  const row = sb.t.auth_logins[0];
  assert.equal(row.state_hash, sha(state), "хранится только хэш state");
  assert.equal(row.secret_hash, sha(s.body.secret));
  assert.ok(!JSON.stringify(row).includes(state) && !JSON.stringify(row).includes(s.body.secret));

  // Пока человек на странице Яндекса — ждём
  assert.equal((await run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } })).body.status, "pending");
  // Чужой секрет — «не найдено»
  assert.equal((await run(handler, { body: { action: "poll", id: s.body.id, secret: "b".repeat(64) } })).code, 404);

  const cb = await run(handler, { method: "GET", query: { code: "c1", state } });
  assert.equal(cb.code, 200);
  assert.match(cb.body, /Вы вошли/);
  // Повтор того же state — отказ (одноразовый)
  assert.equal((await run(handler, { method: "GET", query: { code: "c1", state } })).code, 400);

  const user = [...sb.users.values()][0];
  assert.equal(user.email, "ivan@yandex.ru");
  assert.equal(user.user_metadata.nexa_name, "Иван");
  assert.deepEqual(user.app_metadata.nexa_providers, ["yandex"]);
  assert.equal(user.app_metadata.nexa_yandex, "111");
  const p1 = await run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } });
  assert.equal(p1.body.status, "ready");
  assert.match(p1.body.token_hash, /^tok-/);
  const p2 = await run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } });
  assert.notEqual(p2.body.status, "ready", "пропуск второй раз не отдаётся");

  // Второй вход тем же Яндексом — тот же аккаунт, нового не создаём
  __setFetchTest(fakeYandex({ c2: { id: 111, default_email: "ivan@yandex.ru" } }));
  const s2 = await run(handler, { body: { action: "start", client: "web" } });
  const st2 = new URL(s2.body.url).searchParams.get("state");
  const cb2 = await run(handler, { method: "GET", query: { code: "c2", state: st2 } });
  assert.equal(cb2.code, 302, "сайт — обратно на сайт");
  assert.equal(cb2.headers.location, "https://nexa-link.ru/?ext_auth=yandex");
  assert.equal(sb.users.size, 1);
});

test("Яндекс: та же почта — тот же аккаунт; чужой домен и отказ — понятная ошибка; просроченный state", async () => {
  const { default: handler, __setFetchTest } = await import("../api/auth-yandex.js");
  const sb = fakeSb(); __setAdminTest(sb);
  sb.users.set("old", { id: "old", email: "maria@mail.ru", app_metadata: { provider: "email" } });
  __setFetchTest(fakeYandex({
    m: { id: 5, default_email: "maria@mail.ru" },
    g: { id: 6, default_email: "john@gmail.com" },
  }));
  const go = async (code, extra = {}) => {
    const s = await run(handler, { body: { action: "start", client: "desktop" } });
    const state = new URL(s.body.url).searchParams.get("state");
    const cb = await run(handler, { method: "GET", query: { code, state, ...extra } });
    const p = await run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } });
    return { cb, p };
  };
  const m = await go("m");
  assert.equal(m.p.body.status, "ready");
  assert.equal(sb.users.size, 1, "нового аккаунта нет");
  assert.equal(sb.t.auth_identities[0].user_id, "old");
  assert.match(m.cb.body, /nexa:\/\/tab\/home/, "ПК — кнопка «Вернуться в NEXA»");

  const g = await go("g");
  assert.equal(g.p.body.status, "error");
  assert.equal(g.p.body.reason, "domain");
  assert.equal(sb.users.size, 1);

  const d = await go("m", { error: "access_denied", code: undefined });
  assert.equal(d.p.body.reason, "denied");

  // Просроченный state
  const s = await run(handler, { body: { action: "start", client: "web" } });
  const state = new URL(s.body.url).searchParams.get("state");
  sb.t.auth_logins.find((r) => r.id === s.body.id).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await run(handler, { method: "GET", query: { code: "m", state } })).code, 400);
  assert.equal((await run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } })).body.status, "expired");
});

test("Яндекс: привязка — свой, чужой (не склеиваем), отвязка", async () => {
  const { default: handler, __setFetchTest } = await import("../api/auth-yandex.js");
  const sb = fakeSb(); __setAdminTest(sb);
  sb.users.set("a", { id: "a", email: "a@mail.ru", app_metadata: {} });
  sb.users.set("b", { id: "b", email: "b@mail.ru", app_metadata: {} });
  __setFetchTest(fakeYandex({ y: { id: 900, default_email: "x@yandex.ru" } }));
  const link = async (who) => {
    const s = await run(handler, { body: { action: "start", purpose: "link", client: "android" }, auth: who });
    if (s.code !== 200) return s;
    const state = new URL(s.body.url).searchParams.get("state");
    await run(handler, { method: "GET", query: { code: "y", state } });
    return run(handler, { body: { action: "poll", id: s.body.id, secret: s.body.secret } });
  };
  assert.equal((await link(null)).code, 401, "без входа не привязать");
  assert.equal((await link("a")).body.status, "linked");
  assert.deepEqual(sb.users.get("a").app_metadata.nexa_providers, ["yandex"]);
  const taken = await link("b");
  assert.equal(taken.body.reason, "taken");
  assert.equal(sb.t.auth_identities.length, 1);
  assert.equal(sb.t.auth_identities[0].user_id, "a");
  // Отвязать: у «a» настоящая почта — можно
  assert.equal((await run(handler, { body: { action: "unlink" }, auth: "a" })).code, 200);
  assert.equal(sb.t.auth_identities.length, 0);
  assert.deepEqual(sb.users.get("a").app_metadata.nexa_providers, []);
  assert.equal((await run(handler, { body: { action: "unlink" }, auth: "a" })).code, 409);
});

test("Яндекс: лимит новых попыток с одного адреса и неверные запросы", async () => {
  const { default: handler } = await import("../api/auth-yandex.js");
  __setAdminTest(fakeSb());
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await run(handler, { body: { action: "start" }, sameIp: "10.99.99.1" })).code);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
  assert.equal(codes[10], 429);
  assert.equal((await run(handler, { method: "GET", query: { state: "x" } })).code, 400);
  assert.equal((await run(handler, { body: { action: "poll", id: "bad", secret: "x" } })).code, 400);
  delete process.env.YANDEX_CLIENT_SECRET;
  assert.equal((await run(handler, { body: { action: "start" } })).code, 503);
  process.env.YANDEX_CLIENT_SECRET = "csecret";
});
