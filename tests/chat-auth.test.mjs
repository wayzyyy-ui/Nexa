// Вход для ассистента (api/_lib/user.js): выключено — пускаем всех, включено — только с верным ключом
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chatAllowed, __setUserTest } from "../api/_lib/user.js";

const req = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
afterEach(() => { delete process.env.CHAT_REQUIRE_AUTH; __setUserTest(null); });

test("без CHAT_REQUIRE_AUTH пускаем всех и Supabase не спрашиваем", async () => {
  let calls = 0;
  __setUserTest(async () => { calls++; return { data: { user: null } }; });
  assert.equal(await chatAllowed(req()), true);
  assert.equal(calls, 0);
});

test("с CHAT_REQUIRE_AUTH: без ключа и с чужим — нет, с верным — да, верный запоминается", async () => {
  process.env.CHAT_REQUIRE_AUTH = "1";
  let calls = 0;
  __setUserTest(async (t) => { calls++; return t === "good" ? { data: { user: { id: "u1" } } } : { data: { user: null }, error: { status: 401 } }; });
  assert.equal(await chatAllowed(req()), false);
  assert.equal(await chatAllowed(req("bad")), false);
  assert.equal(await chatAllowed(req("good")), true);
  assert.equal(await chatAllowed(req("good")), true);
  assert.equal(calls, 2); // второй «good» — из памяти
  assert.equal(await chatAllowed(req("x".repeat(5000))), false);
});

test("сбой проверки — не пускаем", async () => {
  process.env.CHAT_REQUIRE_AUTH = "1";
  __setUserTest(async () => { throw new Error("down"); });
  assert.equal(await chatAllowed(req("good")), false);
});
