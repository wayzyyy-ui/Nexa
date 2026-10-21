/* Обновление веб-части приложения (OTA): архив из dist (сборка --mode android) → public/ota/
   и блок web в public/version.json. Зовут release:android (вместе с APK) и release:web (без APK).

   web = { version, url (/ota/web-<версия>.zip), sha256, size, notes, nativeMin }
   nativeMin — наименьший versionCode APK, с которым эта веб-часть работает (нативные модули
   те же). Приложение со старым APK веб-часть не ставит, а предлагает обновить приложение.

   Перед выпуском — проверки (не прошли — ничего не пишем):
   index.html в корне архива, пути только с «/» и без «..», размер разумный, нет секретов
   и тестовых адресов, архив читается и его SHA-256 совпадает с записанным файлом.
   В public/ota/ остаются только две последние версии. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { filesOf, makeZip, readZip } from "./lib/zip.mjs";
import { cmpVersion } from "../src/lib/otaPlan.js";

const root = new URL("..", import.meta.url);
export const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Что нового — строки «- …» из release-notes.md (строки с # — пояснения)
export function readNotes() {
  const f = path("release-notes.md");
  return existsSync(f)
    ? readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, "")).slice(0, 12)
    : [];
}

export { cmpVersion };

export const VERSION_FILE = path("public/version.json");
export const readVersionJson = () => (existsSync(VERSION_FILE) ? JSON.parse(readFileSync(VERSION_FILE, "utf8")) : {});
const OTA_DIR = path("public/ota/");
const MAX_ZIP = 25 * 1024 * 1024; // больше — что-то лишнее попало в сборку
const KEEP = 2;

// В архив не кладём: сам APK, прошлые архивы, version.json (у телефона свой — с сайта)
// и приложение для ПК (установщик и latest.json — их берут с сайта)
const SKIP = (name) => name === "nexa.apk" || name === "version.json" || name === "ota" || name.startsWith("ota/")
  || name === "nexa-setup.exe" || name === "desktop" || name.startsWith("desktop/");
// Признаки секретов и тестовой сборки (публичные ключи VITE_* — можно, они и так в APK)
const BAD = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, "секретный ключ Supabase"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40}/, "закрытый ключ"],
  [/GISMETEO_TOKEN|X-Gismeteo-Token|GOOGLE_API_KEY|FIREBASE_SERVICE_ACCOUNT|SUPABASE_SERVICE_ROLE_KEY/, "имя серверного секрета"],
  [/localhost:8126|localhost:8090|10\.0\.2\.2|sb_publishable_test/, "тестовый адрес (сборка для проверок)"],
];
// Ключ Supabase в виде JWT с ролью service_role (полный доступ к базе)
const serviceJwt = (text) => (text.match(/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g) || []).some((t) => {
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).role === "service_role"; } catch { return false; }
});
const TEXT =/\.(js|mjs|html|css|json|txt|svg|webmanifest|map|xml)$/i;

// Проверить архив; вернуть список проблем (пусто — можно выпускать)
export function checkZip(buf) {
  const problems = [];
  let entries;
  try { entries = readZip(buf); } catch (e) { return [`архив не читается: ${e.message}`]; }
  if (!entries.some((e) => e.name === "index.html")) problems.push("нет index.html в корне архива");
  if (!entries.some((e) => /^assets\/.+\.js$/.test(e.name))) problems.push("нет скриптов assets/*.js — сборка неполная");
  for (const e of entries) {
    if (/\\|^\/|(^|\/)\.\.(\/|$)/.test(e.name)) problems.push(`недопустимый путь в архиве: ${e.name}`);
    if (SKIP(e.name)) problems.push(`в архив попал лишний файл: ${e.name}`);
    if (TEXT.test(e.name)) {
      const text = e.data.toString("utf8");
      for (const [re, what] of BAD) if (re.test(text)) problems.push(`${e.name}: ${what}`);
      if (serviceJwt(text)) problems.push(`${e.name}: ключ service_role (JWT)`);
    }
  }
  if (buf.length > MAX_ZIP) problems.push(`архив слишком большой: ${(buf.length / 1e6).toFixed(1)} МБ (предел ${MAX_ZIP / 1e6 | 0} МБ)`);
  return problems;
}

/* Собрать и опубликовать: dist → public/ota/web-<version>.zip, version.json → web.
   Возвращает web. stop(msg) — остановить выпуск */
export function publishWeb({ version, nativeMin, notes = readNotes(), stop }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) stop(`Версия веб-части «${version}» — не вида 0.12.6.`);
  const dist = path("dist");
  if (!existsSync(dist + "/index.html")) stop("Нет dist/index.html — сначала соберите сайт для приложения (vite build --mode android).");
  const prev = readVersionJson();
  if (!prev.versionCode) stop("В public/version.json нет versionCode — сначала выпустите APK (npm run release:android).");
  if (!(nativeMin > 0) || nativeMin > prev.versionCode) stop(`nativeMin ${nativeMin} больше опубликованного APK (${prev.versionCode}) — такую веб-часть некому поставить.`);
  if (prev.web?.version && cmpVersion(version, prev.web.version) < 0) stop(`На сайте уже веб-часть ${prev.web.version} — ${version} старше.`);

  const zip = makeZip(filesOf(dist, SKIP));
  const problems = checkZip(zip);
  if (problems.length) stop("Архив веб-части не прошёл проверку:\n  - " + problems.join("\n  - "));
  const sha256 = createHash("sha256").update(zip).digest("hex");

  mkdirSync(OTA_DIR, { recursive: true });
  const name = `web-${version}.zip`;
  writeFileSync(OTA_DIR + name, zip);
  // Записанный файл — тот же, что проверяли
  const again = createHash("sha256").update(readFileSync(OTA_DIR + name)).digest("hex");
  if (again !== sha256) { rmSync(OTA_DIR + name, { force: true }); stop("SHA-256 записанного архива не совпал — диск? Повторите выпуск."); }
  if (prev.web?.version === version && prev.web.sha256 !== sha256) {
    console.warn(`⚠ Веб-часть ${version} уже выпускалась с другим содержимым. Телефоны, что её уже скачали, изменений не получат — поднимите версию.`);
  }

  const web = { version, url: `/ota/${name}`, sha256, size: zip.length, notes, nativeMin };
  writeFileSync(VERSION_FILE, JSON.stringify({ ...prev, web }, null, 2) + "\n");

  // Только две последние версии архивов
  const zips = readdirSync(OTA_DIR).filter((f) => /^web-\d+\.\d+\.\d+\.zip$/.test(f))
    .sort((a, b) => cmpVersion(b.slice(4, -4), a.slice(4, -4)));
  for (const old of zips.slice(KEEP)) rmSync(OTA_DIR + old, { force: true });

  console.log(`✔ Веб-часть ${version}: public/ota/${name} (${(zip.length / 1e6).toFixed(2)} МБ), SHA-256 ${sha256.slice(0, 16)}…, nativeMin ${nativeMin}, что нового: ${notes.length} п.`);
  if (zips.length > KEEP) console.log(`  Убраны старые архивы: ${zips.slice(KEEP).join(", ")}`);
  return web;
}
