// Обновление веб-части (OTA): правила (src/lib/otaPlan.js) и архив выпуска (scripts/lib/zip.mjs, web-bundle.mjs).
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpVersion, parseWeb, planOta } from "../src/lib/otaPlan.js";
import { makeZip, readZip } from "../scripts/lib/zip.mjs";
import { checkZip } from "../scripts/web-bundle.mjs";

const BASE = "https://nexa-link.ru";
const SHA = "a".repeat(64);
const HOUR = 3600e3, EVERY = 6 * HOUR;
const web = (v, more = {}) => parseWeb({ version: v, url: `/ota/web-${v}.zip`, sha256: SHA, size: 100, nativeMin: 1206, notes: ["x"], ...more }, BASE);

test("сравнение версий по числам", () => {
  assert.equal(cmpVersion("0.12.10", "0.12.9"), 1);
  assert.equal(cmpVersion("0.12.6", "0.12.6"), 0);
  assert.equal(cmpVersion("0.9.9", "0.12.0"), -1);
});

test("архив — только наш сервер и только https", () => {
  assert.equal(web("0.12.7").url, "https://nexa-link.ru/ota/web-0.12.7.zip");
  assert.equal(web("0.12.7", { url: "https://evil.example/ota/web-0.12.7.zip" }), null, "чужой домен");
  assert.equal(web("0.12.7", { url: "http://nexa-link.ru/ota/web-0.12.7.zip" }), null, "без https");
  assert.equal(web("0.12.7", { url: "/nexa.apk" }), null, "не архив обновления");
  assert.equal(parseWeb({ version: "0.12.7", url: "/ota/web-0.12.7.zip", sha256: "bad" }, BASE), null, "нет SHA-256");
  assert.equal(parseWeb({ version: "latest", url: "/ota/web-1.zip", sha256: SHA }, BASE), null, "странная версия");
  assert.equal(parseWeb(null, BASE), null);
});

test("новая версия и подходящий APK — качаем", () => {
  assert.equal(planOta({ web: web("0.12.7"), current: "0.12.6", build: 1206, every: EVERY }).act, "download");
});

test("та же или старая версия — ничего не делаем", () => {
  assert.equal(planOta({ web: web("0.12.6"), current: "0.12.6", build: 1206, every: EVERY }).act, "current");
  assert.equal(planOta({ web: web("0.12.5"), current: "0.12.6", build: 1206, every: EVERY }).act, "current");
  assert.equal(planOta({ web: null, current: "0.12.6", build: 1206, every: EVERY }).act, "none");
});

test("nativeMin выше установленного APK — не ставим, нужен новый APK", () => {
  assert.equal(planOta({ web: web("0.12.7", { nativeMin: 1207 }), current: "0.12.6", build: 1206, every: EVERY }).act, "needApk");
});

test("версия, что не запустилась (откат), — больше не качаем", () => {
  assert.equal(planOta({ web: web("0.12.7"), current: "0.12.6", build: 1206, bad: ["0.12.7"], every: EVERY }).act, "bad");
  assert.equal(planOta({ web: web("0.12.8"), current: "0.12.6", build: 1206, bad: ["0.12.7"], every: EVERY }).act, "download", "исправленная — качаем");
});

test("неудача (неверный SHA, нет сети) — повтор не раньше интервала, «Проверить» — сразу", () => {
  const fail = { version: "0.12.7", at: 0 };
  assert.equal(planOta({ web: web("0.12.7"), current: "0.12.6", build: 1206, fail, now: HOUR, every: EVERY }).act, "wait");
  assert.equal(planOta({ web: web("0.12.7"), current: "0.12.6", build: 1206, fail, now: 7 * HOUR, every: EVERY }).act, "download");
  assert.equal(planOta({ web: web("0.12.7"), current: "0.12.6", build: 1206, fail, now: HOUR, every: EVERY, force: true }).act, "download");
});

const files = (extra = []) => [
  { name: "index.html", data: Buffer.from("<!doctype html><script src=/assets/i.js></script>") },
  { name: "assets/i.js", data: Buffer.from("console.log('NEXA'.repeat(50))") },
  ...extra,
];

test("архив: собирается и читается, пути с «/», содержимое цело", () => {
  const zip = makeZip(files());
  const out = readZip(zip);
  assert.deepEqual(out.map((e) => e.name), ["index.html", "assets/i.js"]);
  assert.equal(out[1].data.toString(), "console.log('NEXA'.repeat(50))");
  assert.deepEqual(checkZip(zip), []);
});

test("архив без index.html в корне — не выпускаем", () => {
  const zip = makeZip([{ name: "dist/index.html", data: Buffer.from("x") }, { name: "assets/i.js", data: Buffer.from("x") }]);
  assert.ok(checkZip(zip).some((p) => /index\.html/.test(p)));
});

test("секреты и тестовые адреса в архиве — не выпускаем", () => {
  const jwt = (o) => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(o)).toString("base64url"), "c2lnbmF0dXJlLXNpZ25hdHVyZQ"].join(".");
  for (const bad of ["const k='sb_secret_abcdefghijklmno'", `const k='${jwt({ role: "service_role", iss: "supabase" })}'`, "fetch('http://localhost:8126/rest')", "const t=process.env.GISMETEO_TOKEN"]) {
    assert.ok(checkZip(makeZip(files([{ name: "assets/x.js", data: Buffer.from(bad) }]))).length > 0, bad.slice(0, 30));
  }
  // Публичный ключ и обычный JWT anon — можно
  assert.deepEqual(checkZip(makeZip(files([{ name: "assets/x.js", data: Buffer.from(`const k='sb_publishable_abc';const a='${jwt({ role: "anon" })}'`) }]))), []);
});

test("повреждённый архив и лишние файлы — не выпускаем", () => {
  const zip = makeZip(files());
  const broken = Buffer.from(zip); broken[40] ^= 0xff; // испортили сжатые данные
  assert.ok(checkZip(broken).length > 0);
  assert.ok(checkZip(makeZip(files([{ name: "nexa.apk", data: Buffer.from("x") }]))).some((p) => /лишний/.test(p)));
  assert.ok(checkZip(makeZip(files([{ name: "a\\b.js", data: Buffer.from("x") }]))).some((p) => /путь/.test(p)));
});
