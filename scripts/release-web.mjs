/* npm run release:web — выпустить только веб-часть приложения (OTA), без нового APK.

   Для правок интерфейса, текстов, стилей и логики на JavaScript. Нативное (разрешения,
   плагины Capacitor, виджеты, Firebase, значок, подпись, capacitor.config.json) — только
   полный выпуск: npm run release:android.

   Шаги:
   1) версия веб-части: "version" из package.json, если она новее опубликованной;
      иначе поднимаем последнюю цифру (0.12.6 → 0.12.7) в package.json, package-lock.json
      и src/version.js — по правилам выпуска из CLAUDE.md;
   2) сайт для приложения: vite build --mode android (APK не собирается, подпись не трогается);
   3) архив → public/ota/web-<версия>.zip, version.json → блок web (scripts/web-bundle.mjs);
   4) проверка: блок про APK в version.json и public/nexa.apk не изменились.

   Флаги: --native-min=1206 — с какого versionCode APK ставить (по умолчанию прежний nativeMin,
   а если его нет — versionCode опубликованного APK). */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cmpVersion, path, publishWeb, readVersionJson, VERSION_FILE } from "./web-bundle.mjs";

// Поднятую версию при отказе возвращаем (restore — прежнее содержимое файлов)
let restore = [];
const stop = (msg) => {
  for (const [file, text] of restore) writeFileSync(file, text);
  console.error(`\n✖ ${msg}\n  Веб-часть не выпущена${restore.length ? " (версия возвращена)" : ""}.\n`);
  process.exit(1);
};
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: path(".") });
const shaOf = (f) => (existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex") : "");

// Что сейчас опубликовано про APK — после выпуска должно остаться тем же
const before = readVersionJson();
if (!before.versionCode) stop("В public/version.json нет APK — первый раз выпускайте полный релиз: npm run release:android.");
const { web: prevWeb, ...apkBefore } = before;
const apkSha = shaOf(path("public/nexa.apk"));

// 1) Версия веб-части
const pkgFile = path("package.json"), lockFile = path("package-lock.json"), verFile = path("src/version.js");
const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
const published = prevWeb?.version && cmpVersion(prevWeb.version, before.version) > 0 ? prevWeb.version : before.version;
let version = pkg.version;
if (cmpVersion(version, published) <= 0) {
  const [a, b, c] = published.split(".").map(Number);
  version = `${a}.${b}.${c + 1}`;
  // Сначала готовим все три файла, записываем — только если везде получилось (без половинчатых правок)
  const swap = (file, re, to) => { const s = readFileSync(file, "utf8"); const n = s.replace(re, to); if (n === s) stop(`Не удалось поднять версию в ${file}.`); return n; };
  const pkgText = swap(pkgFile, /("version":\s*")[^"]+(")/, `$1${version}$2`);
  const verText = swap(verFile, /(VERSION = ")[^"]+(")/, `$1${version}$2`);
  // package-lock: версия самого проекта — в двух местах (корень и packages[""])
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  lock.version = version; if (lock.packages?.[""]) lock.packages[""].version = version;
  restore = [pkgFile, lockFile, verFile].map((file) => [file, readFileSync(file, "utf8")]);
  writeFileSync(pkgFile, pkgText);
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n");
  writeFileSync(verFile, verText);
  console.log(`▶ Версия веб-части поднята: ${published} → ${version} (package.json, package-lock.json, src/version.js). Не забудьте ABOUT_UPDATES и release-notes.md.`);
} else console.log(`▶ Версия веб-части: ${version}`);
const verInCode = (readFileSync(verFile, "utf8").match(/VERSION = "([^"]+)"/) || [])[1];
if (verInCode !== version) stop(`src/version.js (${verInCode}) не совпадает с package.json (${version}) — поправьте и повторите.`);

const flag = process.argv.find((a) => a.startsWith("--native-min="));
const nativeMin = flag ? Number(flag.split("=")[1]) : prevWeb?.nativeMin || before.versionCode;

// 2) Сайт для приложения — как в build:android, но без копирования в android/ (APK не собираем)
run("npx vite build --mode android");
rmSync(path("dist/nexa.apk"), { force: true });
rmSync(path("dist/ota"), { recursive: true, force: true });

// 3) Архив и version.json
publishWeb({ version, nativeMin, stop });

// 4) Ветка APK не изменилась
const { web: _web, ...apkAfter } = readVersionJson();
if (JSON.stringify(apkAfter) !== JSON.stringify(apkBefore) || shaOf(path("public/nexa.apk")) !== apkSha) {
  writeFileSync(VERSION_FILE, JSON.stringify(before, null, 2) + "\n");
  stop("Изменился блок про APK в version.json или сам APK — так быть не должно, version.json возвращён.");
}
console.log(`  APK не тронут: ${apkAfter.version} (${apkAfter.versionCode}). Дальше: коммит (package.json, package-lock.json, src/version.js, About.jsx, release-notes.md, public/ota, public/version.json и код) и деплой сайта.\n`);
