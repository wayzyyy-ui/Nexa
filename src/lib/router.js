/* Адреса экранов и история браузера (History API, без библиотек).

   Экран — { tab, sub, dev }:
   - tab — раздел: home | today | assistant | media | files | settings;
   - sub — экран поверх раздела: activity | about | security | devices (или null);
   - dev — id открытого экрана устройства (или null).

   Правила истории:
   - с Главной в раздел — новая запись (Назад вернёт на Главную);
   - между разделами (кроме Главной) — запись заменяется: Назад с любого раздела → Главная;
   - экран устройства, «Активность», «О системе»… — своя запись поверх раздела;
   - открытое окно / меню / шторка — своя запись с тем же адресом (Назад закрывает окно);
   - с Главной Назад уходит с сайта (в приложении — сворачивает NEXA).

   Источник правды — состояние NexaApp. Модуль держит «копию» стопки записей (stack)
   и сам решает, что сделать с историей браузера. Шаги назад (history.go) идут
   по очереди: следующий шаг ждёт, пока браузер закончит предыдущий. */

// Приложение или сайт — прямо у Capacitor (без native.js: модуль проверяется тестами в Node)
import { Capacitor } from "@capacitor/core";
const isNative = Capacitor.isNativePlatform();

export const TAB_PATHS = { home: "/", today: "/today", assistant: "/assistant", media: "/media", files: "/files", settings: "/settings" };
export const SUB_PATHS = { activity: "/activity", about: "/about", security: "/security", devices: "/devices" };
const TITLES = { home: "NEXA", today: "Сегодня", assistant: "ИИ — Ассистент", media: "Медиа", files: "Файлы", settings: "Настройки",
  activity: "Активность", about: "О системе", security: "Безопасность", devices: "Все устройства" };

export const HOME = { tab: "home", sub: null, dev: null };
const DEV_ID_RE = /^[\w-]{1,80}$/;

const norm = (s) => ({ tab: TAB_PATHS[s?.tab] ? s.tab : "home", sub: SUB_PATHS[s?.sub] ? s.sub : null, dev: s?.dev || null });
export const sameScreen = (a, b) => !!a && !!b && a.tab === b.tab && (a.sub || null) === (b.sub || null) && (a.dev || null) === (b.dev || null);
export const isPlain = (s) => !s.sub && !s.dev;
const isHome = (s) => isPlain(s) && s.tab === "home";

// Адрес → экран (неизвестный адрес → null)
export function screenFromPath(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  for (const [tab, path] of Object.entries(TAB_PATHS)) if (path === p) return { tab, sub: null, dev: null };
  for (const [sub, path] of Object.entries(SUB_PATHS)) if (path === p) return { tab: "home", sub, dev: null };
  const m = p.match(/^\/device\/([^/]+)$/);
  if (m) {
    let id = "";
    try { id = decodeURIComponent(m[1]); } catch { return null; }
    if (DEV_ID_RE.test(id)) return { tab: "home", sub: null, dev: id };
  }
  return null;
}
// Экран → адрес
export const pathOf = (s) => s.dev ? `/device/${encodeURIComponent(s.dev)}` : s.sub ? SUB_PATHS[s.sub] : TAB_PATHS[s.tab] || "/";
// Заголовок вкладки браузера
export const titleOf = (s, devName) => {
  const t = s.dev ? (devName || "Устройство") : s.sub ? TITLES[s.sub] : TITLES[s.tab];
  return !t || t === "NEXA" ? "NEXA Hub — смартфон, ноутбук и часы в одной системе" : `${t} · NEXA`;
};

// «Глубина» экрана: Главная 0, раздел 1, экран поверх раздела 2, устройство из «Все устройства» 3
const level = (s) => isHome(s) ? 0 : isPlain(s) ? 1 : s.dev && s.sub === "devices" ? 3 : 2;

/* Что сделать с историей, чтобы перейти на экран s. Ничего не трогает — только план.
   stack — записи [{ s, l }] (l — сколько окон открыто поверх экрана в этой записи), idx — текущая.
   Шаги: { t: "go", n } | { t: "push", s } | { t: "replace", s } */
export function planNavigate(stack, idx, s) {
  const ops = [];
  let i = idx;
  // Окна поверх экрана при смене экрана уходят вместе с ним
  while (i > 0 && stack[i]?.l > 0) i--;
  if (stack[i] && sameScreen(stack[i].s, s)) { if (i < idx) ops.push({ t: "go", n: i - idx }); return ops; }
  if (i < idx) ops.push({ t: "go", n: i - idx });
  const cur = stack[i]?.s || HOME;
  if (isPlain(s)) {
    // Ближайшая снизу запись Главной (без окон)
    let h = -1;
    for (let j = i; j >= 0; j--) if (stack[j] && stack[j].l === 0 && isHome(stack[j].s)) { h = j; break; }
    if (isHome(s)) {
      if (h >= 0 && h < i) ops.push({ t: "go", n: h - i });
      else ops.push({ t: "replace", s });
    } else if (h === i) ops.push({ t: "push", s });
    else {
      if (h >= 0 && h + 1 < i) ops.push({ t: "go", n: h + 1 - i });
      ops.push({ t: "replace", s });
    }
  } else if (i > 0 && stack[i - 1]?.l === 0 && sameScreen(stack[i - 1].s, s)) {
    ops.push({ t: "go", n: -1 }); // закрыли верхний экран и вернулись на тот, что под ним
  } else if (level(s) > level(cur)) ops.push({ t: "push", s });
  else ops.push({ t: "replace", s });
  // go подряд складываем в один шаг
  return ops.reduce((a, op) => {
    const last = a[a.length - 1];
    if (op.t === "go" && last?.t === "go") last.n += op.n; else a.push({ ...op });
    return a;
  }, []).filter((op) => op.t !== "go" || op.n !== 0);
}

/* ── Связка с браузером ── */

const STORE = "nexa-nav"; // копия стопки — переживает перезагрузку страницы (только эта вкладка)
let stack = [], idx = 0, booted = false;
let queue = [], busy = false, waitTimer = null;
let listener = null;

const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify({ stack: stack.slice(0, 60) })); } catch {} };

function run() {
  if (busy) return;
  const op = queue.shift();
  if (!op) return;
  if (op.t === "go") {
    busy = true;
    // Ждём popstate; не пришёл (например, шаг за край истории) — идём дальше сами
    waitTimer = setTimeout(() => { busy = false; run(); }, 600);
    window.history.go(op.n);
    return;
  }
  const url = pathOf(op.e.s) + (op.keep || "");
  const st = { nx: { i: op.i, s: op.e.s, l: op.e.l } };
  try {
    if (op.t === "push") window.history.pushState(st, "", url);
    else window.history.replaceState(st, "", url);
  } catch {}
  run();
}
const enqueue = (op) => { queue.push(op); run(); };

// Шаги плана → копия стопки сразу, браузер — по очереди
function apply(ops) {
  for (const op of ops) {
    if (op.t === "go") { idx = Math.max(0, Math.min(stack.length - 1, idx + op.n)); enqueue({ t: "go", n: op.n }); }
    else if (op.t === "push") { stack.length = idx + 1; stack.push({ s: op.s, l: 0 }); idx++; enqueue({ t: "push", e: stack[idx], i: idx }); }
    else { stack[idx] = { s: op.s, l: 0 }; enqueue({ t: "replace", e: stack[idx], i: idx }); }
  }
  save();
}

// Окна, меню и шторки, которые закрывает «Назад». Не считаем: экран входа, карточки,
// пришедшие сами (продолжить здесь, устройство ищут), блокировку и уходящие окна
const LAYER_SEL = '[role="dialog"], [role="menu"], .nx-notes';
const LAYER_SKIP = ".nx-auth-gate, .nx-cont-offer, .nx-find-overlay, [data-nx-noback], .nx-leaving, .nx-fade-leaving";
export const layerCount = () => {
  let n = 0;
  document.querySelectorAll(LAYER_SEL).forEach((el) => { if (!el.closest(LAYER_SKIP)) n++; });
  return n;
};
// Закрыть верхнее окно — у всех окон закрытие уже работает по Esc
export const pressEscape = () => {
  const a = document.activeElement;
  const target = a && a !== document.body && document.contains(a) ? a : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
};

function syncLayers() {
  if (!booted) return;
  const n = layerCount(), cur = stack[idx];
  if (!cur || n === cur.l) return;
  if (n > cur.l) {
    for (let k = cur.l + 1; k <= n; k++) {
      stack.length = idx + 1; stack.push({ s: cur.s, l: k }); idx++;
      enqueue({ t: "push", e: stack[idx], i: idx });
    }
  } else {
    // Окно закрыли крестиком / мимо — убираем его запись (Вперёд она останется, см. onPop)
    const back = Math.min(cur.l - n, idx);
    idx -= back; enqueue({ t: "go", n: -back });
  }
  save();
}

function onPop(e) {
  if (busy) { clearTimeout(waitTimer); busy = false; run(); return; } // это наш шаг
  const st = e.state?.nx;
  if (!st || typeof st.i !== "number") {
    // Чужая запись (не наша) — считаем её новым началом
    const s = screenFromPath(location.pathname) || HOME;
    stack = [{ s, l: 0 }]; idx = 0;
    enqueue({ t: "replace", e: stack[0], i: 0 });
    save(); listener?.(s);
    return;
  }
  idx = st.i;
  stack[idx] = { s: norm(st.s), l: st.l || 0 };
  const dom = layerCount();
  if (stack[idx].l < dom) {
    for (let k = 0; k < dom - stack[idx].l; k++) pressEscape();
  } else if (stack[idx].l > dom) {
    // Вперёд в запись окна, которое уже закрыто, — открыть его заново нельзя, возвращаемся
    const back = Math.min(stack[idx].l - dom, idx);
    idx -= back; enqueue({ t: "go", n: -back });
  }
  save();
  listener?.(stack[idx].s);
}

/* Запуск: один раз, до первого кадра NexaApp. Возвращает экран, с которого начинаем.
   Приложение (Android) всегда начинает с Главной. Прямой адрес на сайте — свой экран,
   а под ним запись Главной, чтобы Назад вела на Главную. ?pair= и ?login= остаются
   в адресе — их забирает NexaApp. */
export function bootRoute() {
  if (booted) return stack[idx].s;
  booted = true;
  try { window.history.scrollRestoration = "manual"; } catch {}
  const keep = location.search + location.hash;
  const fromPath = isNative ? HOME : screenFromPath(location.pathname);
  let s = fromPath || HOME;
  const st = window.history.state?.nx;
  let restored = false;
  // Запись истории знает больше адреса (из какого раздела открыто устройство, «Все устройства» под ним) —
  // если её адрес совпадает с нынешним, берём экран из неё
  if (!isNative && st && typeof st.i === "number" && st.s && pathOf(norm(st.s)) === pathOf(s)) {
    s = norm(st.s);
    // Перезагрузка страницы: берём сохранённую стопку этой вкладки
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
      if (saved?.stack?.[st.i] && sameScreen(norm(saved.stack[st.i].s), s)) {
        stack = saved.stack.map((e) => ({ s: norm(e.s), l: e.l || 0 }));
        idx = st.i; restored = true;
      }
    } catch {}
    if (!restored) { stack = Array.from({ length: st.i + 1 }, () => null); stack[st.i] = { s, l: 0 }; idx = st.i; restored = true; }
    // Перезагрузили с открытым окном — окна больше нет, встаём на запись экрана
    if (stack[idx].l > 0) {
      let j = idx; while (j > 0 && stack[j]?.l > 0) j--;
      if (stack[j] && sameScreen(stack[j].s, s)) { const n = j - idx; idx = j; enqueue({ t: "go", n }); }
      else { stack[idx] = { s, l: 0 }; enqueue({ t: "replace", e: stack[idx], i: idx, keep }); }
    }
  }
  if (!restored) {
    if (isHome(s)) {
      stack = [{ s, l: 0 }]; idx = 0;
      enqueue({ t: "replace", e: stack[0], i: 0, keep });
    } else {
      stack = [{ s: HOME, l: 0 }, { s, l: 0 }]; idx = 1;
      enqueue({ t: "replace", e: stack[0], i: 0 });
      enqueue({ t: "push", e: stack[1], i: 1, keep });
    }
  }
  save();
  window.addEventListener("popstate", onPop);
  // Окна появляются и исчезают — следим за разметкой (не чаще раза за кадр)
  let raf = 0;
  new MutationObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; syncLayers(); });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["role", "class"] });
  return s;
}

// NexaApp сменил экран (нажатие, свайп, «Назад» на экране…) — подстраиваем историю
export function navigate(s) {
  if (!booted) return;
  apply(planNavigate(stack, idx, norm(s)));
}
// Назад / Вперёд браузера сменили экран — NexaApp должен показать его
export function onRoute(fn) { listener = fn; return () => { if (listener === fn) listener = null; }; }
// Есть ли куда вернуться внутри NEXA (для кнопки «Назад» Android)
export const canGoBack = () => booted && idx > 0;
// Пока идёт наш шаг по истории, второй не начинаем (иначе их не различить)
export const goBack = () => { if (canGoBack() && !busy) window.history.back(); };
