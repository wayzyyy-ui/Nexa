/* npm run copy:apk — положить собранный APK на сайт и записать public/version.json.

   Версию берём не из package.json, а из того, что собрал Gradle: рядом с APK лежит
   output-metadata.json с versionCode и versionName (их считает android/app/build.gradle).
   Так номер в version.json всегда совпадает с номером внутри APK.

   Какой APK: подписанный release (android/app/build/outputs/apk/release/app-release.apk,
   есть, если настроен android/keystore.properties) или debug — берём более свежий.
   Флаги: --release / --debug — взять именно этот; --hard / --soft — см. minVersionCode ниже;
   --new-key — разрешить смену ключа подписи (иначе выпуск останавливается).

   Проверки перед публикацией (не прошли — public/nexa.apk и version.json не трогаются):
   подпись APK проверена apksigner; release подписан не debug-ключом и не «debuggable»;
   версия внутри APK совпадает с output-metadata.json и не старше опубликованной;
   ключ тот же, что у прошлого выпуска (смена — только с --new-key).

   version.json:
   - version, versionCode — версия APK;
   - apkUrl — ссылка с номером версии (/nexa.apk?v=908), чтобы телефон не взял старый файл из кэша;
   - url — то же без номера: так её читают приложения до 0.9.9;
   - size, sha256 — приложение сверяет скачанный файл;
   - signer — отпечаток ключа подписи (SHA-256 сертификата): приложение заранее видит,
     что обновление поверх не встанет (другой ключ), и объясняет, что делать;
   - minVersionCode — версии старше закрываются экраном «Обновите приложение»;
   - notes — «что нового», по пунктам: строки «- …» из release-notes.md. */
import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readNotes } from "./web-bundle.mjs";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const arg = (a) => process.argv.includes(a);

// 1) Какой APK
const outputs = {
  release: path("android/app/build/outputs/apk/release/"),
  debug: path("android/app/build/outputs/apk/debug/"),
};
const pick = (kind) => {
  const dir = outputs[kind];
  const file = join(dir, kind === "release" ? "app-release.apk" : "app-debug.apk");
  return existsSync(file) ? { kind, dir, file, time: statSync(file).mtimeMs } : null;
};
let apk = arg("--release") ? pick("release") : arg("--debug") ? pick("debug")
  : [pick("release"), pick("debug")].filter(Boolean).sort((a, b) => b.time - a.time)[0];
if (!apk) {
  const unsigned = existsSync(join(outputs.release, "app-release-unsigned.apk"));
  console.error(unsigned
    ? "✖ Release-APK собран без подписи: нет android/keystore.properties (образец — keystore.properties.example)."
    : "✖ Нет собранного APK. Сначала соберите: npm run release:android (или Build APK в Android Studio).");
  process.exit(1);
}

// 2) Версия — из output-metadata.json, который пишет Gradle
const meta = JSON.parse(readFileSync(join(apk.dir, "output-metadata.json"), "utf8"));
const el = meta.elements?.[0] || {};
const versionCode = Number(el.versionCode), version = String(el.versionName || "");
if (!versionCode || !version) { console.error("✖ В output-metadata.json нет versionCode / versionName."); process.exit(1); }

// 3) Размер, SHA-256 и отпечаток ключа подписи
const bytes = readFileSync(apk.file);
const size = bytes.length;
const sha256 = createHash("sha256").update(bytes).digest("hex");
// Инструменты Android SDK (build-tools, самая новая версия): apksigner и aapt2
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const btRoot = join(sdk, "build-tools");
const btDir = existsSync(btRoot) ? join(btRoot, readdirSync(btRoot).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop()) : "";
const sdkTool = (name, winExt) => {
  const t = btDir && join(btDir, process.platform === "win32" ? name + winExt : name);
  return t && existsSync(t) ? t : "";
};
// .bat на Windows запускается только через оболочку — пути берём в кавычки
const runTool = (tool, args) => (process.platform === "win32"
  ? execSync(`"${tool}" ${args.map((a) => `"${a}"`).join(" ")}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  : execFileSync(tool, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
// Подпись: apksigner verify (не прошла — пусто), отпечаток и имя сертификата
function signerOf(file) {
  const tool = sdkTool("apksigner", ".bat");
  if (!tool) return { digest: "", dn: "" };
  try {
    const out = runTool(tool, ["verify", "--print-certs", file]);
    return {
      digest: (out.match(/certificate SHA-256 digest:\s*([0-9a-f]{64})/i) || [])[1]?.toLowerCase() || "",
      dn: (out.match(/certificate DN:\s*(.+)/i) || [])[1]?.trim() || "",
    };
  } catch { return { digest: "", dn: "" }; }
}
// Что записано внутри APK: версия и пометка «отладочный» (debuggable). null — нет aapt2
function badgingOf(file) {
  const tool = sdkTool("aapt2", ".exe");
  if (!tool) return null;
  try {
    const out = runTool(tool, ["dump", "badging", file]);
    return {
      versionCode: Number((out.match(/versionCode='(\d+)'/) || [])[1]),
      versionName: (out.match(/versionName='([^']*)'/) || [])[1] || "",
      debuggable: /^application-debuggable/m.test(out),
    };
  } catch { return null; }
}
const cert = signerOf(apk.file);
const signer = cert.digest;
const debugKey = /CN=Android Debug/i.test(cert.dn);
const badging = badgingOf(apk.file);

// 4) Что нового — строки «- …» из release-notes.md (общая функция с веб-частью)
const notes = readNotes();

// 5) Минимальная версия, которой ещё можно пользоваться (как раньше в release-android.mjs):
//    по умолчанию — предыдущий выпуск; --hard — только новая; --soft — прежняя минимальная
const versionFile = path("public/version.json");
const prev = existsSync(versionFile) ? JSON.parse(readFileSync(versionFile, "utf8")) : {};
if (prev.versionCode >= versionCode) console.warn(`⚠ На сайте уже версия ${prev.version} (${prev.versionCode}). Поднимите "version" в package.json и соберите заново — иначе приложения не увидят обновления.`);
if (prev.signer && signer && prev.signer !== signer) {
  console.warn("\n⚠⚠ ПОДПИСЬ ИЗМЕНИЛАСЬ: этот APK подписан другим ключом, чем прошлый выпуск.");
  console.warn("   Установленные приложения НЕ смогут обновиться поверх — их придётся удалить и поставить заново.");
  console.warn("   Приложение предупредит об этом само (поле signer в version.json).\n");
}
// Повторный запуск на той же версии — минимальная остаётся прежней (не закрываем прошлый выпуск)
let minVersionCode = prev.versionCode === versionCode ? (prev.minVersionCode ?? versionCode)
  : prev.versionCode && prev.versionCode < versionCode ? prev.versionCode : versionCode;
if (arg("--hard")) minVersionCode = versionCode;
else if (arg("--soft")) minVersionCode = prev.minVersionCode || 0;
minVersionCode = Math.min(minVersionCode, versionCode);

// 6) Проверки — до того, как трогаем опубликованный APK
const stop = (msg) => {
  console.error(`\n✖ ${msg}\n  public/nexa.apk и public/version.json не изменены.\n`);
  process.exit(1);
};
if (!signer) stop("Подпись APK не проверена: apksigner verify не прошёл (APK не подписан или повреждён) или нет Android SDK build-tools.");
if (!badging) stop("Не удалось прочитать APK через aapt2 (Android SDK build-tools) — версию внутри APK не проверить.");
if (badging.versionCode !== versionCode || badging.versionName !== version) {
  stop(`Версия внутри APK (${badging.versionName}, ${badging.versionCode}) не совпадает с output-metadata.json (${version}, ${versionCode}).`);
}
if (prev.versionCode > versionCode) stop(`На сайте уже более новая версия ${prev.version} (${prev.versionCode}) — старая её не заменит.`);
if (apk.kind === "release" && debugKey) stop("Release-APK подписан debug-ключом Android Studio — проверьте storeFile в android/keystore.properties.");
if (apk.kind === "release" && badging.debuggable) stop("Release-APK помечен как отладочный (debuggable) — такой раздавать нельзя.");
if (prev.signer && prev.signer !== signer && !arg("--new-key")) {
  stop(`Ключ подписи изменился (был ${prev.signer.slice(0, 16)}…, стал ${signer.slice(0, 16)}…).
  Установленные приложения НЕ смогут обновиться поверх — их придётся удалить и поставить заново
  (приложение предупредит само: поле signer в version.json). Если смена ключа задумана —
  повторите с флагом --new-key (npm run release:android -- --new-key).`);
}

// 7) На сайт
copyFileSync(apk.file, path("public/nexa.apk"));
// Блок web (обновление веб-части, scripts/web-bundle.mjs) не трогаем — его пишет release:android / release:web
const info = { version, versionCode, minVersionCode, apkUrl: `/nexa.apk?v=${versionCode}`, url: "/nexa.apk", size, sha256, signer, notes, ...(prev.web ? { web: prev.web } : {}) };
writeFileSync(versionFile, JSON.stringify(info, null, 2) + "\n");

console.log(`\n✔ public/nexa.apk (${apk.kind}, ${(size / 1e6).toFixed(1)} МБ) и public/version.json — версия ${version} (${versionCode}).`);
if (debugKey || badging.debuggable) {
  console.warn("⚠ Это ТЕСТОВАЯ сборка: подписана debug-ключом Android Studio и помечена как отладочная (debuggable).");
  console.warn("  Раздавать людям — только release: android/keystore.properties и свой ключ (см. keystore.properties.example).");
}
console.log(`  SHA-256: ${sha256.slice(0, 16)}…  ключ: ${signer ? signer.slice(0, 16) + "…" : "не определён (нет apksigner)"}  что нового: ${notes.length ? notes.length + " п." : "пусто — заполните release-notes.md"}`);
console.log("  Дальше: коммит и деплой сайта — установленные приложения предложат обновиться.\n");
