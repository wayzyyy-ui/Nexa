// Прямая передача файла: правила (src/lib/directPlan.js)
import test from "node:test";
import assert from "node:assert/strict";
import { directProblem, lanOnlySdp, parseCtl, metaMsg, DIRECT_MAX, directBatch, directName, splitDirectFiles, validManifest } from "../src/lib/directPlan.js";

test("в описании соединения остаются только адреса своей сети", () => {
  const sdp = ["v=0", "a=candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host generation 0",
    "a=candidate:2 1 udp 1686052607 85.1.2.3 50000 typ srflx raddr 192.168.1.5 rport 50000",
    "a=candidate:3 1 udp 41885439 10.0.0.1 3478 typ relay", "a=end-of-candidates"].join("\r\n");
  const out = lanOnlySdp(sdp);
  assert.ok(out.includes("typ host"));
  assert.ok(!out.includes("srflx") && !out.includes("relay"));
  assert.ok(out.startsWith("v=0") && out.includes("a=end-of-candidates"));
});

test("несколько файлов: точные границы, пустой файл, совпавшие имена и безопасные пути", async () => {
  const files = [new File([new Uint8Array([0, 255, 1])], "../фото.bin"), new File([], "пусто.txt"), new File(["текст"], "фото.bin")];
  const { file, manifest } = directBatch(files);
  assert.ok(validManifest(manifest, file.size));
  const received = splitDirectFiles(file, manifest);
  assert.deepEqual(received.map((f) => f.name), ["фото.bin", "пусто.txt", "фото (1).bin"]);
  assert.deepEqual(new Uint8Array(await received[0].blob.arrayBuffer()), new Uint8Array([0, 255, 1]));
  assert.equal(received[1].blob.size, 0);
  assert.equal(await received[2].blob.text(), "текст");
  assert.equal(directName("C:\\secret\\CON.txt"), "_CON.txt");
  assert.equal(directName("../\u202eevil\u0000.txt"), "_evil_.txt");
  assert.throws(() => splitDirectFiles(new Blob(["short"]), manifest));
  assert.ok(!validManifest([{ name: "x", size: -1, mime: "" }], -1));
  assert.throws(() => directBatch([]));
  assert.throws(() => directBatch(Array.from({ length: 51 }, () => new File([], "x"))));
});

test("пакет файлов не отправляется в старую версию без поддержки пакетов", () => {
  globalThis.RTCPeerConnection = function () {};
  const files = [new File([], "a"), new File([], "b")];
  assert.match(directProblem(files, { online: true, p2p: true }), /обновите/);
  assert.equal(directProblem(files, { online: true, p2p: true, p2pBatch: true }), null);
  delete globalThis.RTCPeerConnection;
});

test("служебные сообщения канала: только знакомые и короткие", () => {
  assert.deepEqual(parseCtl('{"t":"end"}'), { t: "end" });
  assert.equal(parseCtl('{"t":"hack"}'), null);
  assert.equal(parseCtl("не json"), null);
  assert.equal(parseCtl(new ArrayBuffer(4)), null, "куски файла — не служебные");
  assert.equal(parseCtl("x".repeat(3000)), null);
  const m = JSON.parse(metaMsg({ name: "фото.jpg", size: 10, type: "image/jpeg" }));
  assert.deepEqual(m, { t: "meta", name: "фото.jpg", size: 10, mime: "image/jpeg" });
});

test("когда напрямую нельзя — честная причина", () => {
  globalThis.RTCPeerConnection = function () {};
  const dev = { online: true, p2p: true };
  assert.equal(directProblem({ size: 5 }, dev), null);
  assert.match(directProblem({ size: DIRECT_MAX + 1 }, dev), /1 ГБ/);
  assert.match(directProblem({ size: 5 }, { online: false }), /не в сети/);
  assert.match(directProblem({ size: 5 }, { online: true }), /старая версия/);
  delete globalThis.RTCPeerConnection;
  assert.match(directProblem({ size: 5 }, dev), /браузер/);
});
