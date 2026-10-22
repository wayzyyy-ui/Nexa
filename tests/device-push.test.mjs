// Сигнал «обновись» после отправки устройств: только при заметных правках (src/lib/devicePush.js)
import test from "node:test";
import assert from "node:assert/strict";
import { needsSignal, deviceSignature } from "../src/lib/devicePush.js";

const dev = (state = {}, name = "Телефон") => ({ id: "a", name, type: "phone", state: { real: true, device_id: "x", ...state } });

test("новая запись (ещё не сообщали) — сигнал нужен", () => {
  assert.equal(needsSignal({ ids: ["a"] }, [dev()], new Map()), true);
});

test("изменились только «был в сети» и сведения — без сигнала", () => {
  const last = new Map();
  needsSignal({ ids: ["a"] }, [dev({ seenAt: 1 })], last);
  assert.equal(needsSignal({ ids: ["a"] }, [dev({ seenAt: 2, sys: { battery: 50 } })], last), false);
});

test("переименовали — сигнал нужен, и повтор той же версии — уже нет", () => {
  const last = new Map();
  needsSignal({ ids: ["a"] }, [dev()], last);
  assert.equal(needsSignal({ ids: ["a"] }, [dev({}, "Мой телефон")], last), true);
  assert.equal(needsSignal({ ids: ["a"] }, [dev({ seenAt: 5 }, "Мой телефон")], last), false);
});

test("заметное поле состояния (Bluetooth подключено) — сигнал нужен", () => {
  const last = new Map();
  needsSignal({ ids: ["a"] }, [dev({ connected: false })], last);
  assert.equal(needsSignal({ ids: ["a"] }, [dev({ connected: true })], last), true);
});

test("удаление и старый вызов без сведений — сигнал нужен", () => {
  assert.equal(needsSignal({ ids: [], deletes: 1 }, [], new Map()), true);
  assert.equal(needsSignal(undefined, [], new Map()), true);
});

test("отпечаток не зависит от порядка полей и служебных полей", () => {
  assert.equal(deviceSignature(dev({ a: 1, b: 2, seenAt: 3 })), deviceSignature({ ...dev(), state: { b: 2, seenAt: 9, device_id: "x", a: 1, real: true } }));
});
