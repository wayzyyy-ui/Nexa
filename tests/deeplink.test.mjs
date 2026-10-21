// Ссылки nexa:// (src/lib/deeplink.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNexaLink, targetToLink } from "../src/lib/deeplink.js";

const uuid = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

test("диалог, файл, устройство", () => {
  assert.deepEqual(parseNexaLink(`nexa://chat/${uuid}`), { chat: uuid });
  assert.deepEqual(parseNexaLink(`nexa://file/${uuid}/`), { file: uuid });
  assert.deepEqual(parseNexaLink(`NEXA://device/${uuid}?from=browser`), { device: uuid });
});

test("разделы и служебные экраны", () => {
  assert.deepEqual(parseNexaLink("nexa://tab/today"), { tab: "today" });
  assert.deepEqual(parseNexaLink("nexa://activity"), { activity: true });
  assert.deepEqual(parseNexaLink("nexa://sync/"), { sync: true });
  assert.deepEqual(parseNexaLink("nexa://update"), { update: true });
  assert.deepEqual(parseNexaLink("nexa://clip"), { clip: true });
});

test("неизвестное и подозрительное — null", () => {
  for (const bad of [
    "https://nexa-link.ru/chat/1", "nexa://", "nexa://tab/admin", "nexa://chat/", "nexa://chat/../../x",
    "nexa://chat/a b", "nexa://chat/%2e%2e%2fx", "nexa://delete/all", "nexa://activity/1", "javascript:alert(1)",
    `nexa://chat/${"a".repeat(65)}`, `nexa://tab/${"x".repeat(600)}`, null, 42,
  ]) assert.equal(parseNexaLink(bad), null, String(bad));
});

test("уведомление → ссылка → тот же переход", () => {
  for (const t of [{ tab: "today" }, { device: uuid }, { chat: uuid }, { file: uuid }, { sync: true }, { activity: true }, { update: true }, { clip: true }]) {
    assert.deepEqual(parseNexaLink(targetToLink(t)), t);
  }
  assert.equal(targetToLink(null), null);
  assert.equal(targetToLink({ tab: "admin" }), null);
  assert.equal(targetToLink({ device: "../x" }), null);
});
