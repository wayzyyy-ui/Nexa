// Профиль аккаунта: имя и фото (src/lib/profile.js)
import test from "node:test";
import assert from "node:assert/strict";
import { profileName, profileAvatar, cleanName, NAME_MAX } from "../src/lib/profile.js";

test("имя: своё, иначе из профиля, иначе из почты", () => {
  assert.equal(profileName({ email: "anna@mail.ru", user_metadata: { nexa_name: "Аня" } }), "Аня");
  assert.equal(profileName({ email: "anna@mail.ru", user_metadata: { full_name: "Анна П." } }), "Анна П.");
  assert.equal(profileName({ email: "anna@mail.ru", user_metadata: {} }), "Anna");
  assert.equal(profileName(null), "");
});

test("чистка имени: переводы строк, пробелы, длина", () => {
  assert.equal(cleanName("  Аня \n Петрова  "), "Аня Петрова");
  assert.equal(cleanName("я".repeat(80)).length, NAME_MAX);
  assert.equal(cleanName("   "), "");
});

test("фото: только своя картинка data:image, чужие адреса не показываем", () => {
  const ok = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
  assert.equal(profileAvatar({ user_metadata: { nexa_avatar: ok } }), ok);
  assert.equal(profileAvatar({ user_metadata: { nexa_avatar: "https://evil.example/a.png" } }), null);
  assert.equal(profileAvatar({ user_metadata: { nexa_avatar: "data:image/svg+xml;base64,PHN2Zz4=" } }), null, "svg не берём");
  assert.equal(profileAvatar({ user_metadata: { nexa_avatar: "data:image/jpeg;base64," + "A".repeat(10000) } }), null, "слишком большое");
});
