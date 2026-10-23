// Графика установщика NEXA для компьютера (NSIS, desktop/src-tauri/installer/) по макету автора.
// NSIS умеет показывать только BMP, поэтому шапку, заголовки, пункты и кнопки рисует Chrome
// (тот же шрифт Manrope и тот же логотип, что в приложении), а скрипт режет снимок на картинки.
//   npm run installer:art — нарисовать заново (нужен Chrome; путь — переменная CHROME, если он не в обычном месте):
//     desktop/src-tauri/installer/art/*.png (5 масштабов экрана) и art/metrics.nsh — размеры для NSIS. Это в git.
//     Меняете тексты или макет — запустите и закоммитьте папку art.
//   node scripts/installer-art.mjs --bmp — PNG → BMP в art/bmp (не в git; Chrome не нужен).
//     Делает build:desktop перед каждой сборкой, NSIS берёт картинки оттуда.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePng, encodeBmp, encodePng } from "./lib/bitmap.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "desktop/src-tauri/installer/art");

if (process.argv.includes("--bmp")) {
  const dir = path.join(OUT, "bmp");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const pngs = fs.readdirSync(OUT).filter((f) => f.endsWith(".png"));
  if (!pngs.length) { console.error("Нет картинок установщика — запустите npm run installer:art"); process.exit(1); }
  for (const f of pngs) fs.writeFileSync(path.join(dir, f.replace(/\.png$/, ".bmp")), encodeBmp(decodePng(fs.readFileSync(path.join(OUT, f)))));
  console.log(`Картинки установщика: ${pngs.length} BMP → ${path.relative(ROOT, dir)}`);
  process.exit(0);
}
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SCALES = [100, 125, 150, 175, 200]; // масштаб экрана Windows, %

/* ── Макет (1341 × 703) → окно установщика: всё × 0,7 ── */
const K = 0.7;
const m = (v) => Math.round(v * K);
export const L = {
  W: 940, H: 492, // 1341 × 703 × 0,7 (ширина — до кратного 4)
  panelTop: m(193), radius: m(59),
  textX: m(91),
  titleY: m(250), titleH: m(52),       // заголовок экрана
  subY: m(314), subH: m(36),           // строка под ним
  rowIconX: m(90), rowIcon: m(31),     // пункты: значок-галочка
  rowTextX: m(141), rowH: m(40),       //          и подпись
  rowY: [m(370), m(441), m(512)],      // верх каждой строки пунктов
  lineX: m(91), lineW: m(1191), lineY: m(573), lineH: 3, // полоса прогресса
  btnY: m(612), btnH: m(44), btnRight: m(1282), btnGap: m(25),
  hdrRight: m(1281), hdrY: m(92), hdrH: m(36), // «Установка» справа в шапке
};
/* Шапка-картинка: чёрный верх с логотипом и верх панели со скруглёнными углами. Обрезана на 168:
   ниже — экран установщика (он залит цветом панели); у краёв скругление там уже меньше пикселя */
L.headerH = 168;

const C = { bg: "#000000", panel: "#1D1D1D", text: "#FFFFFF", muted: "#92A2AF", green: "#40C977", off: "#5E5E5E",
  track: "#737373", mint: "#00FFDF", ghostText: "#818181", ghostLine: "#4A4A4A", blue: "#236AFC", cyan: "#24BEEA" };

/* ── Что рисуем: тексты экранов (Manrope, размеры подогнаны по ширине надписей на макете) ── */
const TITLE_PX = 34 * K, SUB_PX = 20 * K, ROW_PX = 24 * K;
const TEXTS = {
  // заголовок + описание каждого экрана; описание null — его пишет установщик сам (версия, причина ошибки)
  welcome: ["Всё необходимое — в одном месте", "Установите NEXA на компьютер и объедините свои устройства, файлы, расписание и ИИ-ассистента."],
  reinstall: ["NEXA уже установлена", null],
  install: ["Устанавливаем NEXA", "Копируем файлы. Ваши данные и настройки останутся на месте."],
  update: ["Обновляем NEXA", "Ставим новую версию поверх. Ваши данные и настройки останутся на месте."],
  finish: ["NEXA установлена", "Найдёте её в меню «Пуск». Запустите и войдите в аккаунт — устройства и файлы появятся сами."],
  updated: ["NEXA обновлена", "Новая версия на месте, ваши данные и настройки — тоже."],
  error: ["Не удалось установить NEXA", null],
};
const ROWS = { folder: "Выбор папки установки", desktop: "Ярлык на рабочем столе", autostart: "Запуск вместе с компьютером",
  keep: "Установить поверх — данные и настройки останутся", remove: "Сначала удалить прежнюю версию" };
const HEADS = { install: "Установка", update: "Обновление" };
const BUTTONS = { next: ["Дальше", 1], install: ["Установить", 1], launch: ["Запустить NEXA", 1], retry: ["Повторить", 1], done: ["Готово", 0],
  cancel: ["Отмена", 0], close: ["Закрыть", 0], later: ["Не запускать", 0] };

const font = fs.readFileSync(path.join(ROOT, "public/fonts/Manrope-Variable.ttf")).toString("base64");
const markSvg = `<svg viewBox="0 0 46 45" width="${m(57)}" height="${m(54)}" fill="none"><path d="M20.5114 23.6624V28.7977L1.5 41.0349V13.3554L20.5114 2.57495V8.25654M20.5114 28.7977L1.5 13.3554M20.5114 8.25654L28.0739 13.9814M20.5114 8.25654V18.5271M43.8934 25.9569V5.05154L28.0739 13.9814M43.8934 25.9569L28.0739 13.9814M43.8934 25.9569V41.0349L20.5114 23.6624M28.0739 13.9814L20.5114 18.5271M20.5114 18.5271V23.6624" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const wordSvg = `<svg viewBox="0 0 149 25" width="${m(194)}" height="${m(194) * 25 / 149}" fill="#fff"><rect y="0.128967" width="2.89847" height="23.7675"/><rect x="25.521" y="0.143463" width="2.89847" height="23.7675"/><path d="M129.539 0.151154H132.437L118.687 23.9031H115.789L129.539 0.151154Z"/><path d="M134.201 0.151154H131.302L145.113 23.9031H148.011L134.201 0.151154Z"/><rect x="40.2455" y="0.143463" width="2.89847" height="23.7675"/><rect x="43.144" y="2.66751" width="2.52403" height="23.624" transform="rotate(-90 43.144 2.66751)"/><rect x="43.144" y="23.8965" width="2.5248" height="23.624" transform="rotate(-90 43.144 23.8965)"/><rect x="49.5683" y="13.2896" width="2.5248" height="13.2019" transform="rotate(-90 49.5683 13.2896)"/><path d="M0.966423 2.29059L2.89298 0.125062L27.4566 21.754L25.5301 23.9195L0.966423 2.29059Z"/><path fill-rule="evenodd" d="M78.689 0H82.5192L89.789 9.25263H85.9467L78.689 0Z"/><path fill-rule="evenodd" d="M89.7889 14.5148H85.9587L78.6889 23.7675H82.5312L89.7889 14.5148Z"/><path fill-rule="evenodd" d="M103.963 0H100.133L92.8628 9.25263H96.705L103.963 0Z"/><path fill-rule="evenodd" d="M92.8628 14.5148H96.693L103.963 23.7675H100.121L92.8628 14.5148Z"/></svg>`;
const icon = (on) => `<svg viewBox="0 0 31 31" width="${L.rowIcon}" height="${L.rowIcon}"><circle cx="15.5" cy="15.5" r="14" fill="none" stroke="${on ? C.green : C.off}" stroke-width="2"/>${on ? `<path d="M9.5 15.8l4.2 4.2 7.8-8.3" fill="none" stroke="${C.green}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}</svg>`;

// Блоки: имя → { w, h, bg, html }. Каждый — отдельная картинка
const blocks = [];
const add = (name, w, h, bg, html) => blocks.push({ name, w, h, bg, html });
// Шапка в двух вариантах: «Установка» и «Обновление» справа
for (const [k, t] of Object.entries(HEADS)) add(`header_${k}`, L.W, L.headerH, C.bg, `
  <div style="position:absolute;left:${m(89)}px;top:${m(58)}px">${markSvg}</div>
  <div style="position:absolute;left:${m(188)}px;top:${m(69)}px">${wordSvg}</div>
  <div class="fitls" data-w="${m(294)}" style="position:absolute;left:${m(91)}px;top:${m(141)}px;font-size:${20 * K}px;color:${C.muted};text-transform:uppercase;white-space:nowrap">Ваша экосистема</div>
  <div class="${k === "install" ? "fit" : "fit"}" data-w="${k === "install" ? m(123) : 0}" style="position:absolute;right:${L.W - L.hdrRight}px;top:${L.hdrY + m(4)}px;font-size:${24 * K}px;color:${C.muted};white-space:nowrap">${t}</div>
  <div style="position:absolute;left:0;right:0;top:${L.panelTop}px;height:${L.radius * 2}px;background:${C.panel};border-radius:${L.radius}px ${L.radius}px 0 0"></div>`);
for (const [k, [title, sub]] of Object.entries(TEXTS)) {
  add(`title_${k}`, L.W - L.textX * 2, L.titleH, C.panel,
    `<div class="fit" data-w="${k === "welcome" ? m(613) : 0}" style="position:absolute;left:0;top:${m(6)}px;font-size:${TITLE_PX}px;font-weight:500;color:${C.text};white-space:nowrap">${title}</div>`);
  if (sub) add(`sub_${k}`, L.W - L.textX * 2, L.subH, C.panel,
    `<div class="fit" data-w="${k === "welcome" ? m(1073) : 0}" style="position:absolute;left:0;top:${m(4)}px;font-size:${SUB_PX}px;color:${C.muted};white-space:nowrap">${sub}</div>`);
}
// Строка с папкой — узкая: правее неё установщик пишет сам путь (ui.nsh, ROWTEXTX + 222)
for (const [k, t] of Object.entries(ROWS)) add(`row_${k}`, k === "folder" ? 216 : m(780), L.rowH, C.panel,
  `<div class="fit" data-w="${k === "folder" ? m(277) : 0}" style="position:absolute;left:0;top:${m(6)}px;font-size:${ROW_PX}px;color:${C.text};white-space:nowrap">${t}</div>`);
add("check_on", L.rowIcon, L.rowIcon, C.panel, icon(true));
add("check_off", L.rowIcon, L.rowIcon, C.panel, icon(false));
for (const [k, [t, primary]] of Object.entries(BUTTONS)) add(`btn_${k}`, 0, L.btnH, C.panel, primary
  ? `<div class="btn" style="height:${L.btnH}px;min-width:${m(136)}px;padding:0 ${m(30)}px;border-radius:999px;background:linear-gradient(90deg,${C.blue},${C.cyan});color:#fff;font-size:${24 * K}px">${t}</div>`
  : `<div class="btn" style="height:${L.btnH}px;min-width:${m(96)}px;padding:0 ${m(18)}px;border-radius:999px;border:1px solid ${C.ghostLine};color:${C.ghostText};font-size:${15 * K + 1}px">${t}</div>`);

/* ── Страница-лист: блоки друг под другом. После загрузки шрифта подгоняем размеры под макет:
   fit — размер шрифта, чтобы ширина надписи совпала с макетом (data-w; 0 — тот же коэффициент, что у
   соседнего эталона), fitls — разрядка «ВАША ЭКОСИСТЕМА». Ширину кнопок отдаём в <pre id=metrics> */
// Размеры и положение блоков кратны 4: при масштабах 125 / 150 / 175 % края попадают ровно в пиксели
const up4 = (v) => Math.ceil(v / 4) * 4;
function sheet() {
  let y = 0;
  const parts = blocks.map((b) => {
    const top = y, h = up4(b.h); y += h + 8;
    return `<div class="blk" data-name="${b.name}" data-auto="${b.w ? 0 : 1}" style="position:absolute;left:0;top:${top}px;${b.w ? `width:${up4(b.w)}px;` : ""}height:${h}px;background:${b.bg};overflow:hidden">${b.html}</div>`;
  }).join("\n");
  return { height: y, html: `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Manrope; src: url(data:font/ttf;base64,${font}); font-weight: 200 800; }
    * { margin: 0; box-sizing: border-box; } body { background: #808080; font-family: Manrope; font-weight: 400; -webkit-font-smoothing: antialiased; }
    .btn { display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; font-weight: 500; }
  </style><body>${parts}<pre id="metrics"></pre><script>
    document.fonts.ready.then(() => {
      // Коэффициент по эталонам (надписи с data-w): во сколько раз наш Manrope шире/уже шрифта макета
      const ref = [...document.querySelectorAll(".fit[data-w]:not([data-w='0'])")];
      let ratio = 1;
      for (const el of ref) { const k = Number(el.dataset.w) / el.getBoundingClientRect().width; el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * k + "px"; ratio = k; }
      for (const el of document.querySelectorAll(".fit[data-w='0']")) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * ratio + "px";
      for (const el of document.querySelectorAll(".fitls")) { const n = el.textContent.length - 1; const w = el.getBoundingClientRect().width; el.style.letterSpacing = (Number(el.dataset.w) - w) / n + "px"; }
      const out = {};
      for (const b of document.querySelectorAll(".blk")) {
        if (b.dataset.auto === "1") b.style.width = Math.ceil(b.firstElementChild.getBoundingClientRect().width / 4) * 4 + "px";
        const r = b.getBoundingClientRect(); out[b.dataset.name] = [r.left, r.top, Math.round(r.width), Math.round(r.height)];
      }
      document.getElementById("metrics").textContent = JSON.stringify(out);
      document.title = "ready";
    });
  </script>` };
}

function chrome(args) {
  return execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=4000", ...args], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nexa-art-"));
try {
  const { html, height } = sheet();
  const file = path.join(tmp, "sheet.html");
  fs.writeFileSync(file, html);
  const url = "file:///" + file.replace(/\\/g, "/");
  const dom = chrome(["--window-size=1000," + (height + 20), "--dump-dom", url]);
  const json = /<pre id="metrics">([^<]+)<\/pre>/.exec(dom);
  if (!json) throw new Error("Chrome не вернул размеры — шрифт не загрузился?");
  const rects = JSON.parse(json[1].replace(/&quot;/g, '"'));
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.(bmp|png)$/.test(f)) fs.rmSync(path.join(OUT, f));
  for (const s of SCALES) {
    const png = path.join(tmp, `s${s}.png`);
    chrome([`--force-device-scale-factor=${s / 100}`, `--window-size=1000,${height + 20}`, `--screenshot=${png}`, url]);
    const img = decodePng(fs.readFileSync(png));
    for (const [name, [x, y, w, h]] of Object.entries(rects)) {
      const k = s / 100, px = Math.round(x * k), py = Math.round(y * k), pw = Math.round(w * k), ph = Math.round(h * k);
      fs.writeFileSync(path.join(OUT, `${name}@${s}.png`), encodePng(img, px, py, pw, ph));
    }
  }
  // Размеры для установщика (в точках при 100 %): раскладка и ширина картинок
  const defs = Object.entries(L).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x, i) => [`${k}${i}`, x]) : [[k, v]]));
  // Раскладка — NX_W, NX_ROWY0…; размеры картинок — NX_<имя файла>_W / _H (имя как у файла: NX_btn_next_W)
  const nsh = ["; Создано scripts/installer-art.mjs — не править руками",
    ...defs.map(([k, v]) => `!define NX_${k.toUpperCase()} ${v}`),
    ...Object.entries(rects).flatMap(([name, [, , w, h]]) => [`!define NX_${name}_W ${w}`, `!define NX_${name}_H ${h}`]), ""].join("\r\n");
  fs.writeFileSync(path.join(OUT, "metrics.nsh"), nsh);
  console.log(`Готово: ${Object.keys(rects).length} картинок × ${SCALES.length} масштабов → ${path.relative(ROOT, OUT)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
