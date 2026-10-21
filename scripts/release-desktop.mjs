/* npm run release:desktop — выпуск приложения NEXA для ПК (Windows).
   1. Сборка установщика: npx tauri build (+ tauri.release.conf.json — подпись обновления).
      Нужен закрытый ключ подписи обновлений (создаётся один раз командой
      npx tauri signer generate -w "%USERPROFILE%\.tauri\nexa-updater.key"; в проект не попадает):
      по умолчанию берётся этот файл, иначе — переменная TAURI_SIGNING_PRIVATE_KEY (путь к файлу
      ключа или сам ключ; TAURI_SIGNING_PRIVATE_KEY_PATH сборка Tauri 2.12 не понимает — скрипт
      переложит её сам); пароль — переменная TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
      Ключ и пароль скрипт никуда не выводит и не пишет.
   2. Проверки (не прошли — public/ не трогается): версия не старше опубликованной; открытый ключ
      вписан в tauri.conf.json; подпись установщика сходится с ним и в ней записана эта версия
      (иначе приложения откажутся ставить); в сборке интерфейса нет секретов и тестовых адресов.
   3. Публикация: public/nexa-setup.exe, public/desktop/latest.json (для модуля обновлений),
      блок desktop в public/version.json (сайт и приложение). Блоки APK и web не меняются.
   Флаги: --hard — закрыть все старые версии (минимальная = эта), --soft — оставить прежнюю
   минимальную, --dry-run — собрать и проверить, но ничего не публиковать.
   Подписи кодом (сертификата) у установщика нет: при первом запуске система покажет
   предупреждение — «Подробнее» → «Выполнить в любом случае». */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readNotes, readVersionJson, VERSION_FILE, path, checkZip, cmpVersion } from "./web-bundle.mjs";
import { filesOf, makeZip } from "./lib/zip.mjs";
import { verifyFile } from "./lib/minisign.mjs";
import { apiBase, desktopBlock, desktopMinVersion, latestJson } from "./desktop-release.mjs";

const args = process.argv.slice(2);
const mode = args.includes("--hard") ? "hard" : args.includes("--soft") ? "soft" : "";
const dry = args.includes("--dry-run");
const stop = (msg) => { console.error(`\n✖ ${msg}\n  public/nexa-setup.exe, public/desktop/latest.json и public/version.json не изменены.\n`); process.exit(1); };

const CONF = path("desktop/src-tauri/tauri.conf.json");
const RELEASE_CONF = path("desktop/src-tauri/tauri.release.conf.json");
const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;
const conf = JSON.parse(readFileSync(CONF, "utf8"));
const pubkey = conf.plugins?.updater?.pubkey?.trim();
const api = apiBase(existsSync(path(".env.desktop")) ? readFileSync(path(".env.desktop"), "utf8") : "");

// ── До сборки: то, что можно проверить сразу ──
if (!/^\d+\.\d+\.\d+$/.test(version)) stop(`Версия в package.json «${version}» — не вида 0.14.0.`);
if (!pubkey) stop("В desktop/src-tauri/tauri.conf.json нет открытого ключа обновлений (plugins.updater.pubkey).\n  Создайте ключ (см. начало этого файла) и вставьте содержимое файла .key.pub в pubkey.");
if (!api) stop("В .env.desktop нет адреса сервера VITE_API_BASE=https://…");
if (conf.plugins.updater.endpoints?.[0] !== `${api}/desktop/latest.json`) stop(`Адрес обновлений в tauri.conf.json (${conf.plugins.updater.endpoints?.[0]}) не совпадает с ${api}/desktop/latest.json.`);
const prev = readVersionJson();
if (prev.desktop?.version && cmpVersion(version, prev.desktop.version) < 0) stop(`На сайте уже NEXA для ПК ${prev.desktop.version} — ${version} старше. Поднимите версию в package.json.`);
if (prev.desktop?.version === version) console.warn(`⚠ Версия ${version} для ПК уже выпускалась. Установленные приложения её не получат — для обновления поднимите версию.`);

// Закрытый ключ: переменные окружения или файл по умолчанию. Сборке передаём ПУТЬ к файлу
// в TAURI_SIGNING_PRIVATE_KEY (она принимает и путь, и сам ключ); сам ключ скрипт не читает
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const def = env.TAURI_SIGNING_PRIVATE_KEY_PATH || join(homedir(), ".tauri", "nexa-updater.key");
  if (!existsSync(def)) stop(`Нет закрытого ключа подписи обновлений: ни переменной TAURI_SIGNING_PRIVATE_KEY, ни файла ${def}.`);
  env.TAURI_SIGNING_PRIVATE_KEY = def;
}
delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
  console.warn("⚠ Пароль ключа не задан (TAURI_SIGNING_PRIVATE_KEY_PASSWORD). Если ключ с паролем — задайте его в этом окне терминала:\n  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = \"…\"   (PowerShell)");
}

// ── Сборка ──
console.log(`\n▶ Сборка NEXA ${version} для ПК (несколько минут)…\n`);
const built = spawnSync(`npx tauri build --config "${CONF}" --config "${RELEASE_CONF}"`, { stdio: "inherit", shell: true, env });
if (built.status !== 0) stop("Сборка не удалась (подробности выше). Частая причина — неверный пароль ключа.");

const outDir = path(`desktop/src-tauri/target/release/bundle/nsis/`);
const exeName = `${conf.productName}_${version}_x64-setup.exe`;
const exe = outDir + exeName;
if (!existsSync(exe)) stop(`Нет ${exeName} в ${outDir} — сборка положила файл не туда или с другой версией.`);
if (!existsSync(exe + ".sig")) stop(`Нет подписи ${exeName}.sig — сборка без ключа? (createUpdaterArtifacts в tauri.release.conf.json)`);

// ── Проверки результата ──
const data = readFileSync(exe);
const sig = readFileSync(exe + ".sig", "utf8").trim();
const check = verifyFile(data, sig, pubkey);
if (!check.ok) stop(`Подпись установщика не прошла проверку: ${check.why}.\n  Приложения откажутся ставить такое обновление.`);
if (check.fields.version !== version) stop(`В подписи записана версия «${check.fields.version || "нет"}», а выпускаем ${version} — приложения откажутся ставить (защита от отката).`);
const problems = checkZip(makeZip(filesOf(path("dist-desktop"))));
if (problems.length) stop("Сборка интерфейса для ПК не прошла проверку:\n  - " + problems.join("\n  - "));
const sha256 = createHash("sha256").update(data).digest("hex");
const notes = readNotes();
const minVersion = desktopMinVersion({ prev: prev.desktop, version, mode });
const block = desktopBlock({ version, size: data.length, sha256, notes, minVersion });
const latest = latestJson({ version, notes, signature: sig, url: `${api}${block.exeUrl}`, pubDate: new Date().toISOString() });

if (dry) {
  console.log(`\n✔ Проверка без публикации: NEXA ${version}, ${(data.length / 1e6).toFixed(2)} МБ, SHA-256 ${sha256.slice(0, 16)}…, ключ ${check.keyId}, минимальная ${minVersion || "нет"}, что нового: ${notes.length} п.\n`);
  process.exit(0);
}

// ── Публикация: сначала во временные файлы, потом заменяем разом ──
const PUB_EXE = path("public/nexa-setup.exe"), LATEST = path("public/desktop/latest.json");
mkdirSync(path("public/desktop"), { recursive: true });
const apkBefore = JSON.stringify({ ...prev, desktop: undefined });
copyFileSync(exe, PUB_EXE + ".tmp");
if (createHash("sha256").update(readFileSync(PUB_EXE + ".tmp")).digest("hex") !== sha256) { rmSync(PUB_EXE + ".tmp", { force: true }); stop("SHA-256 скопированного установщика не совпал — диск? Повторите выпуск."); }
writeFileSync(LATEST + ".tmp", JSON.stringify(latest, null, 2) + "\n");
writeFileSync(VERSION_FILE + ".tmp", JSON.stringify({ ...prev, desktop: block }, null, 2) + "\n");
renameSync(PUB_EXE + ".tmp", PUB_EXE);
renameSync(LATEST + ".tmp", LATEST);
renameSync(VERSION_FILE + ".tmp", VERSION_FILE);
// Блоки APK и веб-части — как были
if (JSON.stringify({ ...readVersionJson(), desktop: undefined }) !== apkBefore) console.error("✖ Блок APK / web в version.json изменился — так быть не должно, проверьте git diff public/version.json");

console.log(`
✔ NEXA ${version} для ПК опубликована:
  public/nexa-setup.exe — ${(data.length / 1e6).toFixed(2)} МБ, SHA-256 ${sha256.slice(0, 16)}…
  подпись — ключ ${check.keyId} (сверено с tauri.conf.json), версия в подписи ${check.fields.version}
  public/desktop/latest.json и блок desktop в public/version.json
  минимальная версия: ${minVersion || "нет"} · что нового: ${notes.length} п.
  Дальше: коммит и пуш (делает автор) → Vercel → приложения увидят обновление при следующей проверке.
  Напоминание: у установщика нет подписи кодом — при первой установке система предупредит
  («Подробнее» → «Выполнить в любом случае»). Обновления изнутри NEXA ставятся без этого вопроса.
`);
