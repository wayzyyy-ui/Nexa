// «Где устройство?» при закрытой NEXA (api/push.js): отметка «получил», ответ с местом → последнее место, опрос
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

// Крошечная база в памяти: фильтры eq / is / gt / lt, update / delete / select / upsert / insert
function fakeDb(tables) {
  const q = (table) => {
    const filters = [];
    let op = "select", patch = null, cols = null;
    const rows = () => (tables[table] ||= []).filter((r) => filters.every((f) => f(r)));
    const api = {
      eq(k, v) { filters.push((r) => r[k] === v); return api; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return api; },
      gt(k, v) { filters.push((r) => String(r[k]) > String(v)); return api; },
      lt(k, v) { filters.push((r) => String(r[k]) < String(v)); return api; },
      limit() { return api; },
      select(c) { cols = c; if (op === "select") op = "select"; return api; },
      update(p) { op = "update"; patch = p; return api; },
      delete() { op = "delete"; return api; },
      then(res, rej) {
        let out;
        if (op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); out = { data: hit.map((r) => ({ ...r })), error: null }; }
        else if (op === "delete") { const keep = (tables[table] || []).filter((r) => !filters.every((f) => f(r))); tables[table] = keep; out = { error: null }; }
        else out = { data: rows().map((r) => ({ ...r })), error: null };
        void cols;
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  };
  return {
    from: (table) => ({
      ...q(table),
      select: (c) => q(table).select(c),
      update: (p) => q(table).update(p),
      delete: () => q(table).delete(),
      insert: async (row) => { (tables[table] ||= []).push({ status: "waiting", ...row }); return { error: null }; },
      upsert: (row) => {
        const list = (tables[table] ||= []);
        const i = list.findIndex((r) => r.user_id === row.user_id && r.device_id === row.device_id);
        if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
        return Promise.resolve({ error: null });
      },
    }),
    auth: { getUser: async (jwt) => (jwt === "good" ? { data: { user: { id: "u1" } }, error: null } : { data: null, error: true }) },
  };
}

test("сервер: телефон отмечается «получил», ответ с местом сохраняется как последнее", async () => {
  const { default: handler, __setPushTest } = await import("../api/push.js");
  const id = "11111111-2222-4333-8444-555555555555", key = "k".repeat(32);
  const future = new Date(Date.now() + 300000).toISOString();
  const tables = { locate_requests: [{ id, user_id: "u1", device_id: "phone-1", secret_hash: sha(key), status: "waiting", expires_at: future, received_at: null }] };
  __setPushTest({ admin: fakeDb(tables), sa: { project_id: "p", client_email: "e", private_key: "k" } });
  let ip = 0;
  const call = async (body, auth) => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} };
    await handler({ method: "POST", headers: { "x-forwarded-for": `10.9.0.${++ip}`, ...(auth ? { authorization: "Bearer good" } : {}) }, body }, res);
    return res;
  };
  // До отметки — ждём
  assert.equal((await call({ action: "locate-poll", id }, true)).body.status, "waiting");
  // Чужой ключ — не отмечается
  assert.equal((await call({ action: "locate-ack", id, key: "x".repeat(32) })).body.ok, false);
  // Свой — «получил»
  assert.equal((await call({ action: "locate-ack", id, key })).body.ok, true);
  assert.equal((await call({ action: "locate-ack", id, key })).body.ok, false, "второй раз не нужно");
  assert.equal((await call({ action: "locate-poll", id }, true)).body.status, "received");
  // Новый статус «геолокация выключена» принимается сервером
  assert.equal((await call({ action: "locate-reply", id, key, status: "nogps-x" })).code, 400);
  // Ответ с местом → последнее место телефона
  const r = await call({ action: "locate-reply", id, key, status: "ok", lat: 55.79, lon: 49.12, acc: 30, at: Date.now() });
  assert.equal(r.body.ok, true);
  assert.equal(tables.device_places?.length, 1);
  assert.deepEqual([tables.device_places[0].user_id, tables.device_places[0].device_id, tables.device_places[0].lat], ["u1", "phone-1", 55.79]);
  const poll = await call({ action: "locate-poll", id }, true);
  assert.equal(poll.body.status, "ok");
  assert.equal(poll.body.lat, 55.79);
  assert.equal(tables.locate_requests.length, 0, "забранный ответ удалён");
});
