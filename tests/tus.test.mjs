// Загрузка с дозагрузкой (src/lib/tus.js) против подменённого сервера TUS:
// обрыв посреди куска — продолжает с места, перезапуск — та же загрузка, отмена, истёкшая загрузка, ошибки
import { test } from "node:test";
import assert from "node:assert/strict";
import { tusUpload, tusMetadata, savedUsable, TUS_CHUNK } from "../src/lib/tus.js";

const MB = 1024 * 1024;
const END = "https://p.supabase.co/storage/v1/upload/resumable";

// Сервер TUS в памяти. drops — сколько раз оборвать связь посреди PATCH (после половины куска)
function fakeServer({ drops = 0, fail5xx = 0, createStatus = 201 } = {}) {
  const ups = new Map();
  const s = { ups, sent: 0, patches: 0, heads: 0, creates: 0, drops, fail5xx, log: [] };
  s.request = async ({ method, url, headers, body, onProgress, signal }) => {
    if (signal?.aborted) throw { abort: true };
    assert.equal(headers["Tus-Resumable"], "1.0.0");
    assert.match(headers.Authorization, /^Bearer /);
    const hdr = (h) => (n) => h[n] ?? null;
    if (method === "POST") {
      s.creates++;
      if (createStatus !== 201) return { status: createStatus, header: hdr({}), text: '{"message":"The resource already exists"}' };
      const id = `u${s.creates}`;
      ups.set(id, { size: Number(headers["Upload-Length"]), offset: 0, meta: headers["Upload-Metadata"] });
      return { status: 201, header: hdr({ Location: `/storage/v1/upload/resumable/${id}` }), text: "" };
    }
    const id = url.split("/").pop();
    const u = ups.get(id);
    if (!u) return { status: 404, header: hdr({}), text: "" };
    if (method === "HEAD") { s.heads++; return { status: 200, header: hdr({ "Upload-Offset": String(u.offset) }), text: "" }; }
    if (method === "PATCH") {
      s.patches++;
      if (Number(headers["Upload-Offset"]) !== u.offset) return { status: 409, header: hdr({}), text: "" };
      if (s.fail5xx > 0) { s.fail5xx--; return { status: 503, header: hdr({}), text: "" }; }
      const n = body.size;
      if (s.drops > 0) { // обрыв: до сервера дошла половина куска
        s.drops--;
        const half = Math.floor(n / 2);
        u.offset += half; s.sent += half; onProgress?.(half);
        throw { network: true };
      }
      u.offset += n; s.sent += n; onProgress?.(n);
      return { status: 204, header: hdr({ "Upload-Offset": String(u.offset) }), text: "" };
    }
    throw new Error("unexpected " + method);
  };
  return s;
}
const memStore = () => { const m = {}; return { m, get: (k) => m[k] || null, set: (k, v) => { m[k] = v; }, del: (k) => { delete m[k]; } }; };
const opts = (srv, file, extra = {}) => ({
  endpoint: END, auth: async () => ({ Authorization: "Bearer t" }), file, key: "f1", store: memStore(),
  request: srv.request, wait: async () => {}, meta: { bucketName: "nexa-files", objectName: "uid/f1", contentType: "video/mp4" }, ...extra,
});

test("метаданные и сохранённая загрузка", () => {
  assert.equal(tusMetadata({ bucketName: "nexa-files", objectName: "Видео.mp4", empty: "" }), `bucketName ${btoa("nexa-files")},objectName ${Buffer.from("Видео.mp4").toString("base64")}`);
  const now = 1e12;
  assert.equal(savedUsable({ url: `${END}/u1`, size: 10, at: now - 1000 }, { size: 10, endpoint: END, now }), true);
  assert.equal(savedUsable({ url: `${END}/u1`, size: 11, at: now }, { size: 10, endpoint: END, now }), false, "другой размер");
  assert.equal(savedUsable({ url: `${END}/u1`, size: 10, at: now - 24 * 3600e3 }, { size: 10, endpoint: END, now }), false, "старше суток");
  assert.equal(savedUsable({ url: "https://evil.example/u1", size: 10, at: now }, { size: 10, endpoint: END, now }), false, "чужой сервер");
});

test("большой файл уходит кусками по 6 МБ, прогресс доходит до 1", async () => {
  const file = new Blob([new Uint8Array(20 * MB)]);
  const srv = fakeServer();
  const progress = [];
  const o = opts(srv, file, { onProgress: (p) => progress.push(p) });
  await tusUpload(o);
  assert.equal(srv.patches, Math.ceil(file.size / TUS_CHUNK));
  assert.equal(srv.sent, file.size);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1] - 1e-9), "прогресс не идёт назад");
  assert.deepEqual(o.store.m, {}, "после успеха адрес забыт");
});

test("обрыв посреди куска: продолжает с места, а не с начала", async () => {
  const file = new Blob([new Uint8Array(20 * MB)]);
  const srv = fakeServer({ drops: 2 });
  await tusUpload(opts(srv, file));
  assert.equal(srv.sent, file.size, "каждый байт отправлен ровно один раз");
  assert.equal(srv.creates, 1, "загрузка та же, новая не создавалась");
  assert.ok(srv.heads >= 2, "после обрыва спросили сервер, сколько дошло");
});

test("связи нет долго: ошибка network, а после перезапуска — продолжение той же загрузки", async () => {
  const file = new Blob([new Uint8Array(20 * MB)]);
  const srv = fakeServer({ drops: 100 });
  const store = memStore();
  await assert.rejects(tusUpload(opts(srv, file, { store, retries: [1, 1] })), (e) => e.kind === "network");
  const sentBefore = srv.sent;
  assert.ok(store.m.f1?.url, "адрес загрузки сохранён");
  srv.drops = 0;
  await tusUpload(opts(srv, file, { store }));
  assert.equal(srv.creates, 1, "после перезапуска не начали заново");
  assert.equal(srv.sent, file.size);
  assert.ok(sentBefore > 0);
});

test("сервер забыл загрузку (истекла) — начинаем новую; 5xx — повтор; 4xx — ошибка", async () => {
  const file = new Blob([new Uint8Array(8 * MB)]);
  const srv = fakeServer();
  const store = memStore();
  store.set("f1", { url: `${END}/gone`, size: file.size, at: Date.now() });
  await tusUpload(opts(srv, file, { store }));
  assert.equal(srv.creates, 1);
  assert.equal(srv.sent, file.size);

  const s2 = fakeServer({ fail5xx: 2 });
  await tusUpload(opts(s2, file));
  assert.equal(s2.sent, file.size);

  const s3 = fakeServer({ createStatus: 409 });
  await assert.rejects(tusUpload(opts(s3, file)), (e) => e.kind === "status" && e.status === 409);
});

test("отмена посреди загрузки", async () => {
  const file = new Blob([new Uint8Array(20 * MB)]);
  const srv = fakeServer();
  const ctrl = new AbortController();
  const inner = srv.request;
  srv.request = async (o) => { if (srv.patches === 1) ctrl.abort(); return inner(o); };
  await assert.rejects(tusUpload(opts(srv, file, { signal: ctrl.signal })), (e) => e.kind === "abort");
  assert.ok(srv.sent < file.size);
});
