// Два экземпляра настоящей логики передачи; WebRTC и React подменены локальным каналом.
// Проверяем согласие, содержимое, отмену и обрыв, но не ICE браузера и маршрутизатор Wi-Fi.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const react = `
export const useState = (value) => { const h=globalThis.__directHooks, i=h.values.length; h.values.push(value); return [value, next => h.values[i]=typeof next==='function'?next(h.values[i]):next]; };
export const useRef = value => ({current:value});
export const useCallback = fn => fn;
export const useEffect = fn => {const clean=fn(); if(clean)globalThis.__directHooks.cleanups.push(clean);};`;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/src/lib/direct.js")) {
    const source = specifier === "react" ? react : specifier === "./sync.js" ? "export const newId=()=>crypto.randomUUID();" : null;
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { useDirect: createDirectHarness } = await import("../src/lib/direct.js");

class Channel extends EventTarget {
  readyState = "connecting";
  bufferedAmount = 0;
  binarySent = 0;
  send(data) {
    if (this.readyState !== "open") throw Error("closed");
    const copy = typeof data === "string" ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (typeof data !== "string") this.binarySent += data.byteLength;
    queueMicrotask(() => { if (this.other.readyState === "open") this.other.onmessage?.({ data: copy }); });
  }
}
class Peer {
  static peers = new Map();
  id = crypto.randomUUID();
  iceGatheringState = "complete";
  connectionState = "new";
  constructor() { Peer.peers.set(this.id, this); }
  createDataChannel() { this.dc = new Channel(); return this.dc; }
  async createOffer() { return { type: "offer", sdp: this.id }; }
  async createAnswer() { return { type: "answer", sdp: this.id }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) {
    if (d.type === "offer") {
      const sender = Peer.peers.get(d.sdp);
      this.dc = new Channel(); this.dc.other = sender.dc; sender.dc.other = this.dc;
      this.ondatachannel({ channel: this.dc });
    } else {
      this.dc.readyState = this.dc.other.readyState = "open";
      queueMicrotask(() => { this.dc.other.onopen?.(); this.dc.onopen?.(); });
    }
  }
  close() {
    if (!this.dc || this.dc.readyState === "closed") return;
    this.dc.readyState = "closed"; this.dc.onclose?.();
    if (this.dc.other) { this.dc.other.readyState = "closed"; this.dc.other.onclose?.(); }
  }
}
const tick = () => new Promise((r) => setImmediate(r));
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await tick(); } assert.fail("state did not settle"); }
function pair(t) {
  globalThis.RTCPeerConnection = Peer;
  const a = { values: [], cleanups: [] }, b = { values: [], cleanups: [] };
  const wire = (from, target) => ({ self: { device_id: from }, async emit(event, payload) { queueMicrotask(() => target().handle(event, { ...payload, from_device: from, from_name: from })); return true; } });
  let sender, receiver;
  globalThis.__directHooks = a; sender = createDirectHarness(wire("sender", () => receiver), true);
  globalThis.__directHooks = b; receiver = createDirectHarness(wire("receiver", () => sender), true);
  t.after(() => { a.cleanups.forEach((f) => f()); b.cleanups.forEach((f) => f()); Peer.peers.clear(); delete globalThis.RTCPeerConnection; });
  return { sender, receiver, a, b, target: { device_id: "receiver", name: "ПК" } };
}

test("до согласия байты не идут; после него пакет приходит точно и подтверждается", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  await sender.send(target, [new File(["Привет"], "one.txt"), new File([new Uint8Array([0, 1, 255])], "two.bin"), new File([], "zero")]);
  await until(() => b.values[2]);
  assert.equal(a.values[0].phase, "asking");
  assert.equal([...Peer.peers.values()][0].dc.binarySent, 0);
  await receiver.accept();
  await until(() => a.values[0]?.phase === "done" && b.values[1]?.phase === "done");
  assert.equal(await b.values[1].files[0].blob.text(), "Привет");
  assert.deepEqual(new Uint8Array(await b.values[1].files[1].blob.arrayBuffer()), new Uint8Array([0, 1, 255]));
  assert.equal(b.values[1].files[2].blob.size, 0);
  assert.equal(a.values[0].bytes, b.values[1].bytes);
});

test("отклонение не открывает канал и не передаёт файл", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  await sender.send(target, new File(["private"], "x")); await until(() => b.values[2]);
  receiver.reject(); await tick();
  assert.equal(a.values[0].reason, "declined");
  assert.equal([...Peer.peers.values()][0].dc.binarySent, 0);
});

test("пустой файл успешно приходит без искусственного прогресса", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  await sender.send(target, new File([], "empty.txt")); await until(() => b.values[2]); await receiver.accept();
  await until(() => a.values[0]?.phase === "done");
  assert.equal(b.values[1].files[0].blob.size, 0);
  assert.equal(a.values[0].bytes, 0);
});

test("третье устройство аккаунта не получает чужой запрос", (t) => {
  const { receiver, b } = pair(t);
  receiver.handle("p2p.offer", { id: "other", from_device: "sender", to_device: "another-device", name: "x", size: 1, mime: "", sdp: "offer" });
  assert.equal(b.values[2], null);
});

test("отмена во время чтения файла останавливает оба устройства", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  let release;
  const slow = { name: "x", type: "", size: 10, slice: () => ({ arrayBuffer: () => new Promise((r) => { release = r; }) }) };
  await sender.send(target, slow); await until(() => b.values[2]); await receiver.accept(); await until(() => release);
  sender.cancelOut(); release(new ArrayBuffer(10)); await tick(); await tick();
  assert.equal(a.values[0].reason, "cancel");
  assert.equal(b.values[1].phase, "failed");
  assert.equal(b.values[1].reason, "cancel");
  assert.equal([...Peer.peers.values()][0].dc.binarySent, 0);
  assert.ok(!b.values[1].blob);
});

test("потеря соединения не выдаётся за успешное получение", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  let release;
  const slow = { name: "x", type: "", size: 1, slice: () => ({ arrayBuffer: () => new Promise((r) => { release = r; }) }) };
  await sender.send(target, slow); await until(() => b.values[2]); await receiver.accept(); await until(() => release);
  const pc = [...Peer.peers.values()][0]; pc.connectionState = "disconnected"; pc.onconnectionstatechange();
  release(new ArrayBuffer(1)); await tick();
  assert.equal(a.values[0].reason, "stall"); assert.equal(b.values[1].reason, "stall"); assert.equal(b.values[1].phase, "failed"); assert.ok(!b.values[1].blob);
});

test("отмена освобождает ожидание очереди канала", async (t) => {
  const { sender, receiver, a, b, target } = pair(t);
  await sender.send(target, new File(["queued"], "x")); await until(() => b.values[2]);
  [...Peer.peers.values()][0].dc.bufferedAmount = 8 * 1024 * 1024;
  await receiver.accept(); await until(() => a.values[0].phase === "sending");
  receiver.cancelInc(); await tick();
  assert.equal(b.values[1].reason, "cancel"); assert.equal(a.values[0].phase, "failed");
});
