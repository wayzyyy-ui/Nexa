/* Выпуск новой версии Android-приложения одной командой:
     npm run release:android

   Что делает по шагам:
   1) собирает сайт для приложения и копирует его в android/ (build:android);
   2) собирает APK через Gradle: есть android/keystore.properties — подписанный
      release (assembleRelease), нет — debug, как раньше (ключ ~/.android/debug.keystore);
   3) npm run copy:apk — кладёт APK на сайт (public/nexa.apk) и пишет public/version.json
      (версия из Gradle, размер, SHA-256, ключ подписи, «что нового» из release-notes.md).

   Перед выпуском поднимите "version" в package.json (0.9.8 → 0.9.9):
   build.gradle считает из неё versionCode (908 → 909). Флаги --hard / --soft
   передаются в copy:apk (см. там про minVersionCode).
   Обновление ставится поверх, только если APK подписан тем же ключом, что установленный. */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: path("."), ...opts });

const release = existsSync(path("android/keystore.properties"));
console.log(`\n▶ Выпуск NEXA: ${release ? "подписанный release (android/keystore.properties)" : "debug-сборка (keystore.properties нет)"}\n`);

// 1) Сайт для приложения → android/
run("npm run build:android");

// 2) APK. Gradle нужна Java: берём ту, что встроена в Android Studio
const env = { ...process.env };
const studioJava = "C:\\Program Files\\Android\\Android Studio\\jbr";
if (!env.JAVA_HOME && existsSync(studioJava)) env.JAVA_HOME = studioJava;
// Явный путь .\gradlew.bat: Windows может не искать программы в текущей папке
const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
run(`${gradlew} ${release ? "assembleRelease" : "assembleDebug"}`, { cwd: path("android"), env });

// 3) APK и version.json → сайт
const pass = ["--hard", "--soft"].filter((f) => process.argv.includes(f)).join(" ");
run(`node scripts/copy-apk.mjs ${release ? "--release" : "--debug"} ${pass}`);
