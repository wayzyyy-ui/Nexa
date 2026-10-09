/* Выпуск новой версии Android-приложения одной командой:
     npm run release:android

   Что делает по шагам:
   1) собирает сайт для приложения и копирует его в android/ (build:android);
   2) собирает APK через Gradle (то же, что Build APK в Android Studio);
   3) кладёт APK на сайт: public/nexa.apk;
   4) записывает public/version.json — номер версии этого APK.
      По нему установленные приложения узнают, что вышло обновление.

   Перед выпуском поднимите "version" в package.json (например 0.5.1 → 0.5.2),
   иначе приложения не увидят обновления. Собирать нужно на этом компьютере:
   APK подписывается ключом из ~/.android/debug.keystore, и обновление ставится
   поверх старого приложения, только если ключ тот же. */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: path("."), ...opts });

const { version } = JSON.parse(readFileSync(path("package.json"), "utf8"));
const parts = version.split(".").map((x) => parseInt(x, 10) || 0);
const versionCode = parts[0] * 10000 + parts[1] * 100 + parts[2]; // как в android/app/build.gradle

console.log(`\n▶ Выпуск NEXA ${version} (код версии ${versionCode})\n`);

// Если сохранённая на сайте версия не меньше — предупреждаем: обновление никто не увидит
const versionFile = path("public/version.json");
if (existsSync(versionFile)) {
  const prev = JSON.parse(readFileSync(versionFile, "utf8"));
  if (prev.versionCode >= versionCode) {
    console.warn(`⚠ На сайте уже версия ${prev.version}. Поднимите "version" в package.json, иначе приложения не увидят обновления.\n`);
  }
}

// 1) Сайт для приложения → android/
run("npm run build:android");

// 2) APK. Gradle нужна Java: берём ту, что встроена в Android Studio
const env = { ...process.env };
const studioJava = "C:\\Program Files\\Android\\Android Studio\\jbr";
if (!env.JAVA_HOME && existsSync(studioJava)) env.JAVA_HOME = studioJava;
// Явный путь .\gradlew.bat: Windows может не искать программы в текущей папке
const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
run(`${gradlew} assembleDebug`, { cwd: path("android"), env });

// 3) APK → сайт
const apk = path("android/app/build/outputs/apk/debug/app-debug.apk");
copyFileSync(apk, path("public/nexa.apk"));

// 4) Номер версии рядом с APK
const size = statSync(apk).size;
writeFileSync(versionFile, JSON.stringify({ version, versionCode, url: "/nexa.apk", size }, null, 2) + "\n");

console.log(`\n✔ Готово: public/nexa.apk (${(size / 1e6).toFixed(1)} МБ) и public/version.json — версия ${version}.`);
console.log("  Сделайте коммит и выложите сайт — установленные приложения предложат обновиться.\n");
