// Прямая передача файла: правила (src/lib/directPlan.js)
import test from "node:test";
import assert from "node:assert/strict";
import { directProblem, lanOnlySdp, parseCtl, metaMsg, DIRECT_MAX } from "../src/lib/directPlan.js";

test("в описании соединения остаются только адреса своей сети", () => {
  const sdp = ["v=0", "a=candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host generation 0",
    "a=candidate:2 1 udp 1686052607 85.1.2.3 50000 typ srflx raddr 192.168.1.5 rport 50000",
    "a=candidate:3 1 udp 41885439 10.0.0.1 3478 typ relay", "a=end-of-candidates"].join("\r\n");
  const out = lanOnlySdp(sdp);
  assert.ok(out.includes("typ host"));
  assert.ok(!out.includes("srflx") && !out.includes("relay"));
  assert.ok(out.startsWith("v=0") && out.includes("a=end-of-candidates"));
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
