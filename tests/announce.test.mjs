// Разовые объявления: только вошедшему, один раз, старые не повторяются
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANNOUNCEMENTS, announceKey, unseenAnnouncements, loadSeen, saveSeen } from "../src/lib/announce.js";

test("гостю и без аккаунта объявлений нет", () => {
  assert.deepEqual(unseenAnnouncements(null, []), []);
  assert.deepEqual(unseenAnnouncements("", []), []);
});

test("новый аккаунт видит все объявления, показанные — больше нет", () => {
  const all = unseenAnnouncements("u1", []);
  assert.equal(all.length, ANNOUNCEMENTS.length);
  assert.equal(unseenAnnouncements("u1", ANNOUNCEMENTS.map((a) => a.id)).length, 0);
});

test("новое объявление показывается, а старые не повторяются", () => {
  const list = [...ANNOUNCEMENTS, { id: "next-1", title: "t", text: "x", target: { tab: "home" } }];
  const left = unseenAnnouncements("u1", ANNOUNCEMENTS.map((a) => a.id), list);
  assert.deepEqual(left.map((a) => a.id), ["next-1"]);
});

test("у каждого объявления есть id, заголовок, текст и переход; id не повторяются", () => {
  const ids = new Set();
  for (const a of ANNOUNCEMENTS) {
    assert.ok(a.id && a.title && a.text && a.target);
    assert.ok(!ids.has(a.id)); ids.add(a.id);
  }
  assert.equal(announceKey("abc"), "nexa-announce@abc");
});

test("показанные хранятся на устройстве отдельно для каждого аккаунта", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  saveSeen("a", ["mini-1"]);
  assert.deepEqual(loadSeen("a"), ["mini-1"]);
  assert.deepEqual(loadSeen("b"), []);
  store.set(announceKey("c"), "не json");
  assert.deepEqual(loadSeen("c"), []);
  delete globalThis.localStorage;
});
