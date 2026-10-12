/* Спектральный фон экрана ассистента.

   Несколько мягких цветных пятен из палитры NEXA (синий, мятный, голубой
   между ними) медленно плывут и перетекают друг в друга.

   Почему Canvas 2D, а не WebGL: пятна рисуются в крошечный холст (~120 точек
   по ширине), а браузер растягивает его на весь экран — растяжение само даёт
   мягкость, без фильтров размытия. Это несколько радиальных градиентов на кадр:
   нагрузка ничтожная, работает везде (включая старые Android WebView), а WebGL
   для такой задачи — лишняя сложность и риск несовместимости.

   Состояния (getState каждый кадр, без перерисовки React):
   - ожидание — медленное движение;
   - думает (ответ ещё не начался) — быстрее и насыщеннее;
   - отвечает — мягкая «пульсация» на каждую новую порцию текста.

   Бережём ресурсы: не чаще 30 кадров в секунду (при экономии заряда — 15),
   вкладка скрыта — стоим, при «уменьшении движения» — один неподвижный кадр. */

const BASE_W = 120;          // ширина внутреннего холста в точках
const FPS = 30;
const FPS_LOW = 15;          // экономия заряда / слабое устройство

// Пятна: где «живут» (доли экрана), размах движения, размер, цвет, фаза.
// Больше по краям и внизу — центр, где читают текст, остаётся спокойнее
const BLOBS = [
  { x: 0.12, y: 0.18, ax: 0.10, ay: 0.08, r: 0.62, c: "blue",  p: 0.0, s: 0.9 },
  { x: 0.88, y: 0.22, ax: 0.08, ay: 0.10, r: 0.55, c: "mint",  p: 1.7, s: 1.1 },
  { x: 0.78, y: 0.86, ax: 0.12, ay: 0.06, r: 0.66, c: "cyan",  p: 3.1, s: 0.8 },
  { x: 0.18, y: 0.90, ax: 0.09, ay: 0.07, r: 0.58, c: "deep",  p: 4.4, s: 1.0 },
  { x: 0.50, y: 0.55, ax: 0.18, ay: 0.12, r: 0.42, c: "light", p: 2.2, s: 1.3 },
];

// Цвета берём из CSS-переменных темы — в коде нет своих hex-цветов
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  return {
    blue: v("--blue", "rgb(74,111,255)"),
    mint: v("--mint", "rgb(0,255,223)"),
    cyan: v("--fold-cyan", "rgb(34,199,232)"),
    deep: v("--fold-deep", "rgb(11,31,122)"),
    light: v("--blue-light", "rgb(124,151,255)"),
    light_theme: document.documentElement.dataset.theme === "light",
  };
}
// «#4A6FFF» или «rgb(…)» → [r, g, b]
function toRgb(color) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const nums = color.match(/\d+(\.\d+)?/g);
  return nums ? nums.slice(0, 3).map(Number) : [128, 128, 160];
}

/* Запуск на холсте. getState() → { busy, len } (думает ли и сколько текста).
   Возвращает функцию остановки */
export function runSpectrum(canvas, getState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let lowPower = !!navigator.connection?.saveData || (navigator.hardwareConcurrency || 8) <= 2;
  // Мало заряда и нет зарядки — реже кадры
  navigator.getBattery?.().then((b) => {
    const check = () => { lowPower = lowPower || (!b.charging && b.level < 0.2); };
    check(); b.addEventListener?.("levelchange", check); b.addEventListener?.("chargingchange", check);
  }).catch(() => {});

  let pal = null, rgb = {};
  const loadPalette = () => {
    pal = readPalette();
    rgb = Object.fromEntries(["blue", "mint", "cyan", "deep", "light"].map((k) => [k, toRgb(pal[k])]));
  };
  loadPalette();
  const onTheme = () => { loadPalette(); if (reduced) draw(0); };
  window.addEventListener("nexa-theme-change", onTheme);
  const themeObs = new MutationObserver(onTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Размер внутреннего холста — по пропорциям экрана, ширина ~120 точек
  let W = BASE_W, H = BASE_W;
  const fit = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    W = BASE_W; H = Math.max(24, Math.round((BASE_W * h) / w));
    canvas.width = W; canvas.height = H;
  };
  fit();
  const ro = window.ResizeObserver ? new ResizeObserver(() => { fit(); if (reduced) draw(0); }) : null;
  ro?.observe(canvas);

  // Плавные «ручки»: скорость, насыщенность и импульс от нового текста
  let t = 0, speed = 1, power = 1, energy = 0, lastLen = 0;
  function draw(dt) {
    const st = getState ? getState() : { busy: false, len: 0 };
    const answering = st.len > 0;
    // Новый текст → импульс (тем больше, чем больше пришло), потом затухает
    if (st.len > lastLen) energy = Math.min(1, energy + 0.12 + (st.len - lastLen) / 600);
    lastLen = st.len;
    energy *= 0.9;
    const light = pal.light_theme;
    const targetSpeed = (st.busy && !answering ? 2.2 : answering ? 1.4 : 1) * (light ? 0.6 : 1);
    const targetPower = st.busy && !answering ? 1.3 : answering ? 1.12 : 1;
    speed += (targetSpeed - speed) * 0.05;
    power += (targetPower - power) * 0.05;
    t += dt * 0.00012 * speed;

    ctx.clearRect(0, 0, W, H);
    // Тёмная тема: цвета складываются (светятся), светлая — просто лежат слоями
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    const base = (light ? 0.11 : 0.17) * power;
    const pulse = 1 + energy * 0.35;
    for (const b of BLOBS) {
      const x = (b.x + Math.sin(t * b.s * 6.28 + b.p) * b.ax) * W;
      const y = (b.y + Math.cos(t * b.s * 5.1 + b.p) * b.ay) * H;
      const r = b.r * Math.max(W, H) * (0.92 + Math.sin(t * 3.7 + b.p) * 0.08) * pulse;
      const [cr, cg, cb] = rgb[b.c];
      const a = Math.min(1, base * (b.c === "light" ? 0.8 : 1));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${a * 0.35})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // В середине, где читают сообщения, поле слабее: «стираем» часть цвета
    // прямо в маленьком холсте (дешевле, чем CSS-маска на весь экран)
    ctx.globalCompositeOperation = "destination-out";
    const c = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.42);
    c.addColorStop(0, "rgba(0,0,0,0.5)");
    c.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  }

  // Уменьшение движения — один неподвижный кадр, без цикла
  if (reduced) { draw(0); return () => { window.removeEventListener("nexa-theme-change", onTheme); themeObs.disconnect(); ro?.disconnect(); }; }

  let raf = 0, prev = 0, acc = 0, stopped = false;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = prev ? Math.min(100, now - prev) : 16;
    prev = now;
    acc += dt;
    const step = 1000 / (lowPower ? FPS_LOW : FPS);
    if (acc < step) return; // не чаще 30 (15) кадров в секунду
    draw(acc);
    acc = 0;
  };
  const start = () => { if (!raf && !stopped && document.visibilityState !== "hidden") { prev = 0; raf = requestAnimationFrame(frame); } };
  const pause = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => (document.visibilityState === "hidden" ? pause() : start());
  document.addEventListener("visibilitychange", onVis);
  draw(16);
  start();
  return () => {
    stopped = true;
    pause();
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("nexa-theme-change", onTheme);
    themeObs.disconnect();
    ro?.disconnect();
  };
}
