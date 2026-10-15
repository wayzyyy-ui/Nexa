// Общие React-хуки: размеры и медиазапросы, сеть, окна (useLeave, useModalLock), клавиатура, прокрутка (Lenis),
// наклон и курсор для фона, «потяните, чтобы обновить»
import { useEffect, useState, useRef } from "react";
import { isNative } from "../native.js";
import Lenis from "lenis";

export const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- ФОН ЭКРАНОВ ----------
   Тонкая геометрия за содержимым, низкий контраст в обеих темах.
   BackdropFolds — грани складки в углах (все экраны),
   BackdropGrid — техническая сетка с метками (экран «Настройки»).
   Двигается только в ответ на курсор (компьютер), наклон телефона
   и прокрутку: курсор или наклон задают CSS-переменные --px/--py
   (от -1 до 1), прокрутка — --sy (от 0 до 1). React при этом не
   перерисовывается, меняется только transform.
   При «уменьшении движения» фон неподвижный. */
/* ПЛАВНАЯ ПРОКРУТКА. Колёсико мыши на компьютере прокручивает страницу
   рывками; Lenis сглаживает это — страница мягко «доезжает».
   Только на компьютере с мышью/тачпадом: на телефоне палец и так плавный.
   Не трогаем: экран ассистента (у чата своя прокрутка), открытые окна
   (страница под ними заблокирована) и внутренние списки — они крутятся
   как обычно. При «уменьшении движения» выключено */
// Внутри этих элементов колёсико работает по-обычному
export const NATIVE_SCROLL = '.nx-scroll, .nx-viewer, [role="dialog"], [role="menu"], .nx-notes, textarea';

// Сразу наверх — без плавной прокрутки (новый раздел начинается сверху, без прыжка посреди анимации)
export function scrollTopNow() {
  try { window.__nxLenis?.scrollTo(0, { immediate: true, force: true }); } catch {}
  window.scrollTo(0, 0);
}

export function useSmoothScroll(enabled) {
  useEffect(() => {
    const mq = window.matchMedia;
    if (!enabled || !mq || !mq("(pointer: fine)").matches || mq("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12, // насколько быстро догоняет: меньше — мягче
      prevent: (node) => document.body.style.overflow === "hidden" || !!node.closest?.(NATIVE_SCROLL),
    });
    window.__nxLenis = lenis; // scrollTopNow сбрасывает и его, иначе он «доехал» бы до старого места
    return () => { if (window.__nxLenis === lenis) window.__nxLenis = null; lenis.destroy(); };
  }, [enabled]);
}

/* Наклон телефона (гироскоп). На iPhone датчик доступен только после
   разрешения, которое можно спросить лишь по нажатию — поэтому там
   по умолчанию выключено и включается в «Настройках». На Android — сразу. */
export const TILT_KEY = "nexa-tilt"; // "on" | "off" в localStorage

// Разрешение нужно только на iPhone/iPad. Свежий Chrome тоже знает
// requestPermission, но сам ничего не спрашивает — поэтому проверяем именно iOS
// (iPad в режиме «как компьютер» выдаёт себя за Mac с сенсорным экраном)
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* Где открыт сайт — от этого зависит, как предлагать установку:
   "installed" — уже внутри приложения или на экране «Домой» (ничего не предлагаем),
   "ios" — телефон или планшет Apple, "android" — телефон с Android, "desktop" — компьютер */
export function installPlatform() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  if (isNative || standalone) return "installed";
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export const tiltNeedsPermission = () =>
  isIOS() && typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

export function readTilt() {
  try { const v = localStorage.getItem(TILT_KEY); if (v) return v === "on"; } catch {}
  return !tiltNeedsPermission();
}

// Включить/выключить. На iPhone при включении спрашиваем разрешение.
// Возвращает, что в итоге получилось
export async function saveTilt(on) {
  if (on && tiltNeedsPermission()) {
    try { on = (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { on = false; }
  }
  try { localStorage.setItem(TILT_KEY, on ? "on" : "off"); } catch {}
  window.dispatchEvent(new Event("nexa-tilt")); // фон подхватит новое значение
  return on;
}

export function useBackdropMotion(ref) {
  // Меняется, когда в «Настройках» переключили наклон — тогда переподключаемся
  const [tiltTick, setTiltTick] = useState(0);
  useEffect(() => {
    const bump = () => setTiltTick((t) => t + 1);
    window.addEventListener("nexa-tilt", bump);
    return () => window.removeEventListener("nexa-tilt", bump);
  }, []);
  useEffect(() => {
    const el = ref.current;
    const mq = window.matchMedia;
    if (!el || !mq || mq("(prefers-reduced-motion: reduce)").matches) return;
    const fine = mq("(min-width: 769px) and (pointer: fine)").matches;
    let frame = 0, px = 0, py = 0;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // Не чаще одного раза за кадр, даже если события приходят чаще
    const apply = () => {
      frame = 0;
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      el.style.setProperty("--sy", Math.min(1, window.scrollY / 800).toFixed(3));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(apply); };
    // Компьютер: за курсором
    const move = (e) => {
      if (document.documentElement.classList.contains("nx-modal-open")) return;
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      queue();
    };
    // Телефон: наклон влево-вправо (gamma) и от себя-к себе (beta).
    // Наклон считаем от положения, в котором держали телефон в начале
    let base = null;
    const tilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      if (document.documentElement.classList.contains("nx-modal-open")) return; // под окном фон стоит
      if (base === null) base = e.beta;
      px = clamp(e.gamma / 25);
      py = clamp((e.beta - base) / 25);
      queue();
    };
    const tiltOn = !fine && readTilt();
    if (fine) window.addEventListener("pointermove", move, { passive: true });
    if (tiltOn) window.addEventListener("deviceorientation", tilt);
    // iPhone: если наклон уже включали, разрешение после перезагрузки
    // спрашиваем по первому нажатию на экран
    const ask = () => DeviceOrientationEvent.requestPermission().catch(() => {});
    const askNeeded = tiltOn && tiltNeedsPermission();
    if (askNeeded) window.addEventListener("click", ask, { once: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("deviceorientation", tilt);
      if (askNeeded) window.removeEventListener("click", ask);
      window.removeEventListener("scroll", queue);
      cancelAnimationFrame(frame);
    };
  }, [ref, tiltTick]);
}

// Текущее время для превью — обновляем раз в 15 секунд (это не анимация)
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ─── ГЛОБАЛЬНЫЙ ПОИСК ──────────────────────────────────────
   Оверлей поверх любого экрана. Ищет по разделам, устройствам,
   файлам, папкам, диалогам ассистента и строкам настроек.
   Открывается по иконке поиска в верхней строке (или кнопке
   в настройках), закрывается по Esc или клику по затемнению. */
/* Плавное закрытие окна: сначала короткая анимация ухода (класс nx-leaving), потом onClose.
   При «уменьшении движения» — сразу. Повторные вызовы во время ухода игнорируются */
export const LEAVE_MS = 160;

export function useLeave(onClose) {
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  const cb = useRef(onClose); cb.current = onClose;
  const close = (...args) => {
    if (busy.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { cb.current(...args); return; }
    busy.current = true;
    setLeaving(true);
    setTimeout(() => cb.current(...args), LEAVE_MS);
  };
  return [leaving, close];
}

// Подходит ли экран под условие (например, телефонная ширина) — и следим за поворотом
export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/* ═══ ПОТЯНИТЕ, ЧТОБЫ ОБНОВИТЬ (только в приложении) ════════════
   В браузере телефона это уже есть, а в приложении — нет. Тянем страницу
   вниз, когда она прокручена до самого верха: появляется значок, отпустили
   после порога — onRefresh (облако, погода, проверка обновления).
   Внутри окон, полей ввода и прокручиваемых блоков жест не срабатывает */
export const PULL_THRESHOLD = 64; // столько пикселей нужно протянуть

export function usePullToRefresh(enabled, onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const busyRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let startY = null, dist = 0;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    // Не мешаем: окна, поля ввода, ассистент — и внутренние блоки, которые сейчас
    // прокручены вниз по вертикали (тянуть надо их). Полоса дней листается вбок — не мешает
    const blocked = (t) => {
      if (t?.closest?.('[role="dialog"], .ng-assistant-wrapper, textarea, input, select, .nx-auth-gate')) return true;
      const sc = t?.closest?.(".nx-scroll");
      return !!sc && sc.scrollHeight > sc.clientHeight + 2 && sc.scrollTop > 0;
    };
    const onStart = (e) => {
      startY = null; dist = 0;
      if (busyRef.current || e.touches.length !== 1 || !atTop() || blocked(e.target)) return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || !atTop()) { if (dist) { dist = 0; setPull(0); } if (dy < 0) startY = null; return; }
      dist = Math.min(110, dy * 0.5); // тянется «туго» — вдвое медленнее пальца
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // страница не дёргается вместе с жестом
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      const go = dist >= PULL_THRESHOLD;
      dist = 0;
      if (!go) { setPull(0); return; }
      busyRef.current = true; setBusy(true); setPull(PULL_THRESHOLD);
      // Крутим значок хотя бы 0,9 с — чтобы было видно, что обновили
      try { await Promise.all([refresh.current?.(), new Promise((r) => setTimeout(r, 900))]); } catch {}
      busyRef.current = false; setBusy(false); setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);
  return { pull, busy };
}

/* Есть ли сеть — по мнению браузера (события online / offline).
   Браузер может считать, что сеть есть, когда её нет, — тогда о сбое скажет сама синхронизация */
export function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

// «через 8 с» до следующего повтора (перерисовывается раз в секунду, только пока есть повтор)
export function useCountdown(at) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!at || at === Infinity) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [at]);
  return at && at !== Infinity ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null;
}

/* Любое открытое окно (role="dialog" aria-modal="true") — у html класс nx-modal-open:
   страница под окном не прокручивается, жест «потяните, чтобы обновить» и фон
   (наклон, курсор) замирают. Окна сами класс не ставят — следим за страницей */
export function useModalLock() {
  useEffect(() => {
    const root = document.documentElement;
    const check = () => root.classList.toggle("nx-modal-open", !!document.querySelector('[aria-modal="true"]'));
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { mo.disconnect(); root.classList.remove("nx-modal-open"); };
  }, []);
}

/* Экранная клавиатура — для всего приложения сразу.
   Размер видимой области кладём в CSS-переменные --vvh (высота) и --vvt
   (сдвиг сверху), а пока клавиатура открыта, у body есть класс kb-open:
   по нему прячется нижняя панель и убирается отступ под неё.
   Всё ставится в тот же момент, когда меняется размер экрана, — без задержки.
   Раньше признак ставился через 150 мс: экран уже сжался, а панель ещё
   стояла на клавиатуре и поджимала поле ввода, потом всё прыгало вниз.
   Клавиатура открыта = в фокусе поле ввода И экран заметно ниже обычного.
   «Обычная» высота — самая большая для текущей ширины экрана
   (после поворота телефона считается заново). */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const NOT_TEXT = ["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"];
    const isField = (a) => !!a && (a.tagName === "TEXTAREA" || a.isContentEditable ||
      (a.tagName === "INPUT" && !NOT_TEXT.includes(a.type)));
    let baseW = 0, baseH = 0;
    const sync = () => {
      const h = vv ? vv.height : window.innerHeight;
      const field = isField(document.activeElement);
      if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = 0; }
      // Без поля в фокусе клавиатуры нет — эта высота и есть обычная
      baseH = field ? Math.max(baseH, h) : h;
      root.style.setProperty("--vvh", `${h}px`);
      root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
      document.body.classList.toggle("kb-open", field && baseH - h > 120);
    };
    // Фокус уходит — activeElement меняется чуть позже, проверяем в следующем кадре
    const syncSoon = () => requestAnimationFrame(sync);
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", syncSoon);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", syncSoon);
      document.body.classList.remove("kb-open");
    };
  }, []);
}
