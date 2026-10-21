// На чём запущена NEXA (src/lib/platform.js): сайт, Android-приложение, приложение для ПК.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform } from "../src/lib/platform.js";

test("обычный браузер — сайт", () => {
  assert.equal(detectPlatform({ win: {} }), "web");
  assert.equal(detectPlatform({}), "web");
});

test("Android-приложение (Capacitor) — android, даже если сборка помечена иначе", () => {
  assert.equal(detectPlatform({ win: {}, capacitorNative: true }), "android");
  assert.equal(detectPlatform({ win: { __TAURI_INTERNALS__: {} }, capacitorNative: true }), "android");
});

test("окно Tauri — приложение для ПК", () => {
  assert.equal(detectPlatform({ win: { __TAURI_INTERNALS__: {} } }), "desktop");
  assert.equal(detectPlatform({ win: { __TAURI__: {} } }), "desktop");
});

test("сборка --mode desktop без Tauri (проверка в браузере) — тоже приложение для ПК", () => {
  assert.equal(detectPlatform({ win: {}, mode: "desktop" }), "desktop");
});

test("сборки сайта и Android (mode production / android) — не ПК", () => {
  assert.equal(detectPlatform({ win: {}, mode: "production" }), "web");
  assert.equal(detectPlatform({ win: {}, mode: "android" }), "web");
});
