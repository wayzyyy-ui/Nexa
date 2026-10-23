import test from "node:test";
import assert from "node:assert/strict";
import { leftText, nearbyFailText, NEARBY_RECV_MS } from "../src/lib/nearbyText.js";

test("сколько осталось видимым", () => {
  assert.equal(leftText(NEARBY_RECV_MS), "10 мин");
  assert.equal(leftText(61000), "2 мин");
  assert.equal(leftText(59000), "59 с");
  assert.equal(leftText(0), "0 с");
});
test("причины — человеческим языком, неизвестная — общая", () => {
  assert.match(nearbyFailText("rejected"), /отказались/);
  assert.match(nearbyFailText("permission"), /Устройства поблизости/);
  assert.equal(nearbyFailText("что-то новое"), nearbyFailText("send"));
});
