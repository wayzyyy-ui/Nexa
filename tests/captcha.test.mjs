// Проверка «не робот» (hCaptcha): страница проверки отдаёт пропуск только окнам NEXA, сообщения проверяются,
// страницу можно встроить только в NEXA, окно ПК её пропускает
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAPTCHA_PARENTS, captchaSrc, captchaOrigin, readCaptchaMessage } from "../src/lib/captcha.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("список окон NEXA одинаковый в приложении и на странице проверки", () => {
  const m = read("public/captcha.js").match(/var PARENTS = (\[[^\]]*\]);/);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]), CAPTCHA_PARENTS);
});

test("адрес страницы проверки и разбор её сообщений", () => {
  const src = captchaSrc({ base: "https://nexa-link.ru", sitekey: "10000000-ffff-ffff-ffff-000000000001", theme: "light", origin: "https://localhost" });
  const u = new URL(src);
  assert.equal(u.pathname, "/captcha.html");
  assert.equal(u.searchParams.get("o"), "https://localhost");
  assert.equal(u.searchParams.get("t"), "light");
  const origin = captchaOrigin(src), source = {};
  const ok = { origin, source, data: { nx: "captcha", type: "token", token: "P1_" + "x".repeat(40) } };
  assert.deepEqual(readCaptchaMessage(ok, { origin, source }), { type: "token", token: ok.data.token });
  assert.equal(readCaptchaMessage({ ...ok, origin: "https://evil.example" }, { origin, source }), null, "чужой адрес");
  assert.equal(readCaptchaMessage({ ...ok, source: {} }, { origin, source }), null, "чужое окно");
  assert.equal(readCaptchaMessage({ ...ok, data: { nx: "captcha", type: "token", token: "" } }, { origin, source }), null);
  assert.equal(readCaptchaMessage({ ...ok, data: { type: "token", token: "x".repeat(20) } }, { origin, source }), null, "без метки nx");
  assert.equal(readCaptchaMessage({ ...ok, data: { nx: "captcha", type: "closed" } }, { origin, source }).type, "closed");
  assert.equal(readCaptchaMessage({ ...ok, data: { nx: "captcha", type: "run-code" } }, { origin, source }), null);
});

test("страницу проверки встраивают только окна NEXA; остальной сайт по-прежнему нельзя встроить", () => {
  const v = JSON.parse(read("vercel.json"));
  const cap = v.headers.find((h) => h.source === "/captcha.html");
  const csp = cap.headers.find((h) => h.key === "Content-Security-Policy").value;
  const anc = csp.match(/frame-ancestors ([^;]+)/)[1].split(" ");
  for (const o of CAPTCHA_PARENTS) assert.ok(anc.includes(o), `нет ${o}`);
  assert.ok(!anc.includes("*"));
  assert.ok(!cap.headers.some((h) => h.key === "X-Frame-Options"));
  const main = v.headers.find((h) => h.headers.some((x) => x.key === "X-Frame-Options"));
  const re = new RegExp(`^${main.source}$`);
  assert.ok(re.test("/index.html") && re.test("/") && re.test("/files"), "остальные адреса под запретом встраивания");
  assert.ok(!re.test("/captcha.html"), "страница проверки — под своим правилом");
  const tauri = JSON.parse(read("desktop/src-tauri/tauri.conf.json")).app.security.csp;
  assert.match(tauri["frame-src"], /https:\/\/nexa-link\.ru/);
});
