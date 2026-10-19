// Навигация: разделы (NAV), боковое меню, нижняя панель телефона, верхняя строка и свайпы между разделами
import { useState, useRef, useEffect } from "react";
import { C, NAV_W, PHONE_MQ } from "./theme.js";
import { Icon } from "./icons.jsx";

// Список разделов бокового меню: id (внутреннее имя), label (подпись для title),
// icon (функция-иконка из объекта Icon выше).
// Чтобы поменять порядок разделов в навигации — просто поменяй порядок строк тут.
export const NAV = [
  { id: "home", label: "Главная", icon: Icon.home },
  { id: "today", label: "Сегодня", icon: Icon.list },
  { id: "media", label: "Медиа", icon: Icon.image },
  { id: "files", label: "Файлы", icon: Icon.folder },
  { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
  { id: "settings", label: "Настройки", icon: Icon.gear },
];

export function MobileTabBar({ active, onChange }) {
  // Главная — по центру (главный раздел), остальные по бокам
  const mobileNav = [
    { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
    { id: "today",     label: "Сегодня",   icon: Icon.calendar },
    { id: "home",      label: "Главная",   icon: Icon.home, main: true },
    { id: "media",     label: "Медиа",     icon: Icon.image },
    { id: "files",     label: "Файлы",     icon: Icon.folder },
  ];
  const homeIndex = mobileNav.findIndex((i) => i.main);

  // Ширина одной ячейки в процентах (при пяти вкладках это 20%)
  const slotWidth = 100 / mobileNav.length;

  // pos: где сейчас стоит подсветка (номер вкладки, -1 если раздела нет в панели).
  // Храним отдельно от active, чтобы подсветка стартовала сразу при нажатии,
  // а не ждала, пока приложение перерисует новый экран.
  const [pos, setPos] = useState(() => mobileNav.findIndex((i) => i.id === active));

  // Запоминаем последнюю вкладку из панели, чтобы подсветка не прыгала в начало,
  // когда открыт раздел вне панели
  const lastPos = useRef(pos >= 0 ? pos : homeIndex);
  useEffect(() => { if (pos >= 0) lastPos.current = pos; }, [pos]);

  // Если раздел сменился не нажатием на панель (например, через карточку
  // ассистента на главной), подтягиваем подсветку к нему
  useEffect(() => {
    setPos(mobileNav.findIndex((i) => i.id === active));
  }, [active]);

  const handleClick = (item, index) => {
    if (item.id === active) return;
    setPos(index); // подсветка поехала сразу
    // Экран меняем со следующего кадра: подсветка успевает поехать,
    // а смену экрана плавно показывает navTransition в NexaApp
    requestAnimationFrame(() => onChange(item.id));
  };

  const shownIndex = pos >= 0 ? pos : lastPos.current;

  return (
    <div
      className="ng-mobile-tabbar"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200, display: "none", padding: "0 16px calc(var(--sab) + 10px)", pointerEvents: "none" }}
    >
      {/* Сама панель (макет 2026-10): плавающая «таблетка» с отступами от краёв экрана,
          над системной полоской телефона */}
      <div style={{
        background: `color-mix(in srgb, ${C.panel} 92%, transparent)`,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: 999,
        padding: "0 8px",
        display: "flex",
        pointerEvents: "auto",
        WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)",
      }}>
        <div style={{ position: "relative", flex: 1, display: "flex", height: 62 }}>

          {/* Движущаяся подсветка: один элемент, который едет к нужной ячейке */}
          <div className="nx-tab-move" style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${slotWidth}%`,
            transform: `translateX(${shownIndex * 100}%)`,
            opacity: pos === -1 ? 0 : 1,
            // Плавное движение без отскока, поэтому за край панели не вылезает
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
            willChange: "transform",   // просит браузер анимировать на видеокарте, без рывков
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              width: 52,
              height: 44,
              boxSizing: "border-box",
              borderRadius: 999,
              background: C.chip,
              // На Главной рамка подсветки мятная
              border: `1px solid ${shownIndex === homeIndex ? `color-mix(in srgb, ${C.mint} 55%, transparent)` : C.borderStrong}`,
              transition: "border-color 300ms ease",
            }} />
          </div>

          {mobileNav.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleClick(item, index)}
              aria-label={item.label}
              aria-current={index === pos ? "page" : undefined}
              style={{
                flex: 1,
                height: "100%",
                position: "relative",
                zIndex: 1,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.text,
              }}
            >
              {/* Главная чуть заметнее: мятный значок крупнее остальных */}
              {item.main ? item.icon({ c: C.mint, s: 25 }) : item.icon({ c: "currentColor", s: 22 })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Значки бокового меню (компьютер) — из макета NEXA, рамка 56×56.
   Рисуются тонкой линией цвета текста; у активного раздела — тёмные на мятном */
export const NAV_ICON_PATHS = {
  home: ["M45.69 25.92 31.14 14.42a5.6 5.6 0 0 0-6.78 0L9.73 26.02", "M13.75 34.78v5.26a3.64 3.64 0 0 0 3.64 3.64h20.64a3.64 3.64 0 0 0 3.64-3.64v-5.26", "M22.8 39.23v-8.3a4.91 4.91 0 0 1 9.82 0v8.3"],
  today: ["M17.57 12.66h20.27a3.36 3.36 0 0 1 3.36 3.36v23.37a3.36 3.36 0 0 1-3.36 3.36H17.57a3.36 3.36 0 0 1-3.36-3.36V16.02a3.36 3.36 0 0 1 3.36-3.36Z", "M22.23 21.8h10.96", "M22.23 27.65h10.96", "M22.23 33.62h10.96"],
  media: ["M16.54 13.21h22.5a3.26 3.26 0 0 1 3.26 3.26v22.49a3.26 3.26 0 0 1-3.26 3.26h-22.5a3.26 3.26 0 0 1-3.26-3.26V16.47a3.26 3.26 0 0 1 3.26-3.26Z", "M13.74 33.94h7.12a3.95 3.95 0 0 0 3.17-1.62l4.44-6.17c1.69-2.35 5.4-1.15 5.4 1.75a2.98 2.98 0 0 0 2.98 2.98h5.18", "M23.1 21.8a2.16 2.16 0 1 1-4.32 0 2.16 2.16 0 0 1 4.32 0Z"],
  files: ["M13.85 18.73a3.95 3.95 0 0 1 3.95-3.95h4.72a2.05 2.05 0 0 1 2.05 2.05 2.05 2.05 0 0 0 2.06 2.05h10.98a3.95 3.95 0 0 1 3.95 3.95v1.66H13.85v-5.76Z", "M14.46 24.53h26.51a.6.6 0 0 1 .6.6v11.56a3.3 3.3 0 0 1-3.3 3.3H17.15a3.3 3.3 0 0 1-3.3-3.3V25.14a.61.61 0 0 1 .61-.61Z"],
  assistant: ["M30.83 22.55a3.06 3.06 0 0 0 1.97 1.98l8.44 3.14-8.44 3.15a3.06 3.06 0 0 0-1.97 1.98l-3.12 8.49-3.12-8.49a3.06 3.06 0 0 0-1.97-1.98l-8.44-3.15 8.44-3.14a3.06 3.06 0 0 0 1.97-1.98l3.12-8.5 3.12 8.5Z"],
  settings: ["M26.48 14.95a1.67 1.67 0 0 1 2.46 0l2.84 3.47c.49.6 1.18.99 1.94 1.12l4.42.73a1.67 1.67 0 0 1 1.23 2.13l-1.58 4.19a3.18 3.18 0 0 0 0 2.24l1.58 4.2a1.67 1.67 0 0 1-1.23 2.13l-4.42.73a3.18 3.18 0 0 0-1.94 1.12l-2.84 3.46a1.67 1.67 0 0 1-2.46 0l-2.85-3.46a3.18 3.18 0 0 0-1.94-1.12l-4.42-.73a1.67 1.67 0 0 1-1.23-2.13l1.58-4.2a3.18 3.18 0 0 0 0-2.24l-1.58-4.19a1.67 1.67 0 0 1 1.23-2.13l4.42-.73a3.18 3.18 0 0 0 1.94-1.12l2.85-3.47Z", "M31.5 27.71a3.79 3.79 0 1 1-7.58 0 3.79 3.79 0 0 1 7.58 0Z"],
};

export const NavIcon = ({ id, c, s = 48 }) => (
  <svg viewBox="0 0 56 56" width={s} height={s} fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(NAV_ICON_PATHS[id] || []).map((d) => <path key={d} d={d} />)}
  </svg>
);

// Боковая навигация слева (компьютер), как в макете: значки в скруглённых
// квадратах с лёгкой подложкой, активный — мятная плитка с тёмным значком,
// напротив него на разделительной линии — мятная отметка.
// active — id текущего раздела, onChange — переключить раздел
export function Sidebar({ active, onChange }) {
  return (
    <nav
      aria-label="Разделы"
      className="ng-sidebar" style={{
      width: NAV_W, minWidth: NAV_W, boxSizing: "border-box", background: C.bg, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 0",
    }}>
      {NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <div key={item.id} style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              className="nx-nav-btn"
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onChange(item.id)}
              style={{
                width: 48, height: 48, borderRadius: 14, cursor: "pointer", border: "none", padding: 0,
                background: isActive ? C.mint : `color-mix(in srgb, ${C.text} 7%, transparent)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 160ms ease",
              }}
            >
              <NavIcon id={item.id} c={isActive ? C.onAccent : C.text} s={48} />
            </button>
            {/* Отметка активного раздела на разделительной линии */}
            {isActive && <span aria-hidden="true" style={{ position: "absolute", right: -1, top: 0, bottom: 0, width: 2, background: C.mint }} />}
          </div>
        );
      })}
    </nav>
  );
}

// Верхняя строка справа (время/дата, поиск, профиль). children — то, что
// передаём внутрь при вызове компонента (см. использование в App).
// Лежит поверх экрана в правом верхнем углу и не занимает свою полосу,
// поэтому заголовки всех экранов стоят на одной высоте с часами.
export function TopBar({ children, tab }) {
  return (
    <div className="ng-topbar" data-tab={tab} style={{
      position: "absolute", top: 0, right: 0, zIndex: 50,
      display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, padding: "24px 40px 0",
    }}>
      {children}
    </div>
  );
}

/* ---------- Свайпы между разделами (только телефон) ----------
   Порядок как в нижней панели: Сегодня → Ассистент → Главная → Медиа → Файлы,
   без зацикливания. Жест только наблюдаем (passive) — вертикальная прокрутка
   и системные жесты не блокируются. На компьютере касаний нет — мышь и
   колёсико не затронуты.
   Свайп засчитываем, если по горизонтали палец прошёл явно больше, чем по
   вертикали (в 1,5 раза), и либо не меньше 60 px, либо это быстрый флик
   (от 30 px со скоростью от 0,5 px/мс за до 300 мс).
   Не реагируем, если жест начался: в поле ввода, на ползунке, в QR-коде,
   в горизонтально прокручиваемом блоке, в открытом окне / меню / шторке,
   в 24 px от края экрана (там системный «Назад»), при открытой клавиатуре.
   getCtx() → { tab, sub } (sub — открыт экран устройства или «Активность»);
   onSwipe(dir) — dir: "next" (палец влево) | "prev" (палец вправо) */
export const SWIPE_ORDER = ["assistant", "today", "home", "media", "files"]; // как в нижней панели

export const SWIPE_MIN = 60, SWIPE_FLICK_MIN = 30, SWIPE_FLICK_SPEED = 0.5, SWIPE_FLICK_MS = 300, SWIPE_EDGE = 24, SWIPE_RATIO = 1.5;

export const SWIPE_SKIP = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], [role="dialog"], [role="menu"], .nx-notes, .nx-viewer, .nx-hist-drawer';

// Внутри горизонтально прокручиваемого блока свайп — это прокрутка блока
export function inHorizontalScroll(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}

/* Что сделает свайп в эту сторону: "tab" — сменит раздел, "history" —
   откроет / закроет историю ассистента, "edge" — некуда (крайняя вкладка) */
export function swipePlan(tab, dir) {
  if (tab === "assistant") {
    if (document.querySelector(".nx-hist-drawer.is-open")) return "history";
    if (dir === "prev") return "history";
  }
  const i = SWIPE_ORDER.indexOf(tab) + (dir === "next" ? 1 : -1);
  return i < 0 || i >= SWIPE_ORDER.length ? "edge" : "tab";
}

// Текущий экран, который двигаем за пальцем
export const swipeScreen = () => document.querySelector(".ng-assistant-wrapper") || document.querySelector(".ng-screen-anim");

export const SWIPE_OUT_MS = 140; // старый экран уезжает

export function useTabSwipe(getCtx, onSwipe) {
  const ctx = useRef(getCtx); ctx.current = getCtx;
  const act = useRef(onSwipe); act.current = onSwipe;
  useEffect(() => {
    const mobile = window.matchMedia?.(PHONE_MQ);
    const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let start = null;
    // Вернуть экран на место (свайп не засчитан или это не смена раздела)
    const settle = (el) => {
      if (!el) return;
      el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.transform = "";
      setTimeout(() => { el.style.transition = ""; }, 240);
    };
    const down = (e) => {
      start = null;
      if (!mobile?.matches || e.touches.length !== 1) return;
      const t = e.touches[0], el = e.target instanceof Element ? e.target : null;
      if (!el || t.clientX < SWIPE_EDGE || t.clientX > window.innerWidth - SWIPE_EDGE) return;
      if (document.body.classList.contains("kb-open")) return;
      // Открыто окно, меню или шторка — жесты у них свои (шторку истории — см. ниже)
      const layer = document.querySelector('[role="dialog"]:not(.nx-hist-drawer):not(.nx-cont-offer), [role="menu"], .nx-notes, .nx-viewer');
      if (layer || el.closest(SWIPE_SKIP) || inHorizontalScroll(el)) return;
      const c = ctx.current();
      if (c.sub || !SWIPE_ORDER.includes(c.tab)) return; // экран устройства, «Активность», Настройки
      start = { x: t.clientX, y: t.clientY, at: performance.now(), tab: c.tab, locked: null, el: null };
    };
    // Палец движется: сначала решаем, жест горизонтальный или это прокрутка.
    // Горизонтальный — экран идёт за пальцем (с сопротивлением; если сменить
    // раздел нельзя — только чуть-чуть, как пружина)
    const move = (e) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (start.locked === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        start.locked = Math.abs(dx) > SWIPE_RATIO * Math.abs(dy);
        if (!start.locked) { start = null; return; } // вертикально — это прокрутка, не мешаем
      }
      if (still()) return;
      const plan = swipePlan(start.tab, dx < 0 ? "next" : "prev");
      if (plan === "history" && document.querySelector(".nx-hist-drawer.is-open")) return; // шторку тянет её свой жест
      const el = start.el || (start.el = swipeScreen());
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx * (plan === "tab" ? 0.45 : 0.15)}px)`;
    };
    const up = (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y, dt = performance.now() - start.at;
      const el = start.el, tab = start.tab, locked = start.locked;
      start = null;
      const dir = dx < 0 ? "next" : "prev";
      const ok = locked !== false && Math.abs(dx) >= SWIPE_RATIO * Math.abs(dy) && // больше вертикально — это прокрутка
        (Math.abs(dx) >= SWIPE_MIN || (Math.abs(dx) >= SWIPE_FLICK_MIN && dt <= SWIPE_FLICK_MS && Math.abs(dx) / dt >= SWIPE_FLICK_SPEED)) &&
        !window.getSelection?.().toString(); // выделяли текст — не свайп
      const plan = swipePlan(tab, dir);
      if (!ok || plan !== "tab" || still() || !el) {
        settle(el);
        if (ok) act.current(dir);
        return;
      }
      // Есть View Transitions: снимок экрана (вместе со сдвигом пальца) уедет сам — сразу меняем раздел
      if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        act.current(dir);
        requestAnimationFrame(() => { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; });
        return;
      }
      // Без них: старый экран доезжает в сторону свайпа и тает, потом —
      // новый раздел (он въезжает с той же стороны, см. nx-swipe-*)
      el.style.transition = `transform ${SWIPE_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${SWIPE_OUT_MS}ms linear`;
      el.style.transform = `translateX(${dir === "next" ? -72 : 72}px)`;
      el.style.opacity = "0";
      setTimeout(() => {
        act.current(dir);
        // Если тот же элемент остался на странице (раздел не сменился) — вернуть
        requestAnimationFrame(() => { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; });
      }, SWIPE_OUT_MS);
    };
    const cancel = () => { if (start?.el) settle(start.el); start = null; };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", cancel);
    };
  }, []);
}
