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
    { id: "settings",  label: "Профиль",   icon: Icon.user },
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

  // Нажатие на уже выбранный раздел тоже передаём: поверх него может быть открыт экран
  // («Активность», «О системе», устройство…) — NexaApp закроет его; иначе navTo ничего не делает
  const handleClick = (item, index) => {
    setPos(index); // подсветка поехала сразу
    // Экран меняем со следующего кадра: подсветка успевает поехать,
    // а смену экрана плавно показывает navTransition в NexaApp
    requestAnimationFrame(() => onChange(item.id));
  };

  const shownIndex = pos >= 0 ? pos : lastPos.current;

  return (
    <div
      className="ng-mobile-tabbar"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200, display: "none", padding: "0 22px calc(var(--sab) + 14px)", pointerEvents: "none" }}
    >
      {/* Сама панель (макет 2026-10): плавающая «таблетка» с отступами от краёв экрана,
          над системной полоской телефона */}
      {/* «Жидкое стекло» (nx-glass в appStyles.js): заливка, размытие фона, свет на краях */}
      <div className="nx-tabbar-pill nx-glass" style={{
        border: "1px solid transparent",
        borderRadius: 999,
        padding: "0 8px",
        display: "flex",
        pointerEvents: "auto",
      }}>
        <div style={{ position: "relative", flex: 1, display: "flex", height: 56 }}>

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
              height: 42,
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
// Закреплена (fixed): при прокрутке остаётся на месте. Страницу прокрутили — у самой строки
// (и у шапки телефонной Главной) класс nx-scrolled, и под ней проявляется фон (иначе карточки ехали бы
// прямо под кнопками). Класс — на этих двух полосах, а не на html: смена класса у html заставляла браузер
// пересчитать стили всей страницы (~100 мс на медленном телефоне в «Заметках» — рывок при прокрутке)
const SCROLL_BARS = ".ng-topbar, .nx-home-top";
export function TopBar({ children, tab }) {
  useEffect(() => {
    let was = null;
    const onScroll = () => {
      const s = window.scrollY > 4;
      if (s === was) return;
      was = s;
      document.querySelectorAll(SCROLL_BARS).forEach((el) => el.classList.toggle("nx-scrolled", s));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); document.querySelectorAll(SCROLL_BARS).forEach((el) => el.classList.remove("nx-scrolled")); };
  }, []);
  // Разделы меняются без прокрутки (шапка Главной появилась заново) — отметку ставим и ей
  useEffect(() => {
    const s = window.scrollY > 4;
    document.querySelectorAll(SCROLL_BARS).forEach((el) => el.classList.toggle("nx-scrolled", s));
  }, [tab]);
  return (
    <div className="ng-topbar nx-tb-row" data-tab={tab} style={{
      position: "fixed", top: 0, right: 0, zIndex: 50,
      display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, padding: "24px 40px 0",
    }}>
      {children}
    </div>
  );
}

/* ---------- Свайпы между разделами (только телефон) ----------
   Порядок как в нижней панели: Ассистент → Сегодня → Главная → Медиа (Профиль — только нажатием),
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
// Как в нижней панели: Ассистент → Сегодня → Главная → Медиа → Профиль (Настройки)
export const SWIPE_ORDER = ["assistant", "today", "home", "media", "settings"];

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

/* ── Интерактивный свайп ──
   Разделы стоят «в ряд»: пока палец ведёт по горизонтали, текущий экран и соседний (его заранее
   монтирует NexaApp по onPeek, рядом, за краем) двигаются вместе ровно за пальцем — 1:1.
   Отпустили: дальше трети ширины или быстрый флик в ту же сторону — оба доезжают до конца с той
   скоростью, с какой шёл палец (без скачка), и NexaApp делает соседний экран текущим (onCommit) —
   тот же уже собранный экран, без пересоздания и без второй анимации. Иначе оба возвращаются, а
   соседний убирается. Двигаем только transform (GPU), React во время жеста не перерисовывается.
   Ассистент закреплён на всё окно (position: fixed) — у него двигаем саму .ng-assistant-wrapper:
   transform у родителя сломал бы fixed. */
export const panelOf = (tab) => document.querySelector(`[data-panel="${tab}"]`);
// Что двигать у раздела: у ассистента — его закреплённую обёртку, у остальных — сам блок раздела
const moverOf = (panel) => panel && (panel.querySelector(".ng-assistant-wrapper") || panel);
// Видна ли общая верхняя строка в этом разделе (на телефонной Главной своя шапка)
// На телефоне верхняя строка со значками есть только у ассистента (у Главной своя шапка; на остальных
// разделах её убрали по просьбе автора 2026-10-25) — при свайпе она проявляется / гаснет вместе с ходом
const topbarShown = (tab) => tab === "assistant" || tab === "settings"; // Настройки — по макету 2026-10-26
const EASE = "cubic-bezier(0.2, 0.9, 0.3, 1)"; // быстро стартует (как палец) и мягко останавливается
// Глубина при свайпе: уходящий экран слегка гаснет, приходящий проявляется (только opacity — это дёшево
// для видеокарты; размытие целого экрана на каждом кадре на телефоне давало бы рывки)
const SWIPE_FADE = 0.4;

/* getCtx() → { tab, sub }; handlers:
   onSwipe(dir) — жест засчитан, но двигать нечего (история ассистента, «уменьшение движения»,
     соседний экран не успел собраться) — NexaApp делает прежнюю смену раздела;
   onPeek(tab, dir) — собрать соседний раздел за краем (null — убрать);
   onCommit(tab) — соседний раздел стал текущим (синхронно, в том же кадре) */
export function useTabSwipe(getCtx, handlers) {
  const ctx = useRef(getCtx); ctx.current = getCtx;
  const h = useRef(handlers); h.current = handlers;
  useEffect(() => {
    const mobile = window.matchMedia?.(PHONE_MQ);
    const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let start = null;  // текущий жест
    let anim = null;   // доезжающая анимация после отпускания: { finish() }
    const clear = (el) => { if (el) { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; el.style.willChange = ""; } };
    // Заранее просим отдельный слой видеокарты — первый кадр жеста без рывка
    const prepare = (el) => { if (el) el.style.willChange = "transform, opacity"; };
    const topbar = () => document.querySelector(".ng-topbar");
    const resetTopbar = () => { const t = topbar(); if (t) { t.classList.remove("nx-tb-fade"); t.style.opacity = ""; t.style.transition = ""; } };

    // Положение обоих экранов: dx — сдвиг от исходного места. Соседний раздел стоит вверху окна
    // (будто его уже открыли и прокрутили к началу): сдвиг вниз на текущую прокрутку страницы
    const place = (s, dx, ms = 0) => {
      const tr = ms ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}` : "none";
      const p = Math.min(1, Math.abs(dx) / s.w); // насколько прошли путь: 0 — в начале, 1 — соседний на месте
      if (s.cur) { s.cur.style.transition = tr; s.cur.style.transform = `translate3d(${dx}px, 0, 0)`; s.cur.style.opacity = String(1 - SWIPE_FADE * p); }
      if (s.peekMover) {
        const base = s.dir === "next" ? s.w : -s.w;
        const y = s.peekPanel === s.peekMover ? window.scrollY : 0;
        prepare(s.peekMover);
        s.peekMover.style.transition = tr;
        s.peekMover.style.transform = `translate3d(${base + dx}px, ${y}px, 0)`;
        s.peekMover.style.opacity = String(1 - SWIPE_FADE * (1 - p));
        s.peekPanel.style.visibility = "visible";
      }
      // Верхняя строка есть только у одного из двух — плавно проявляется / гаснет вместе с ходом
      const tb = topbar();
      if (tb && s.target && topbarShown(s.tab) !== topbarShown(s.target)) {
        const p = Math.min(1, Math.abs(dx) / s.w);
        tb.classList.add("nx-tb-fade");
        tb.style.transition = ms ? `opacity ${ms}ms ${EASE}` : "none";
        tb.style.opacity = String(topbarShown(s.tab) ? 1 - p : p);
      }
    };
    // Найти собранный соседний экран (NexaApp монтирует его по onPeek — через кадр-другой)
    const findPeek = (s) => {
      if (s.peekMover || !s.target) return;
      const panel = panelOf(s.target);
      if (panel && panel !== s.curPanel) { s.peekPanel = panel; s.peekMover = moverOf(panel); }
    };
    // Вернуть текущий экран на место (жест не засчитан или это не смена раздела)
    const settleCur = (s) => {
      if (!s.cur) return;
      s.cur.style.transition = `transform 220ms ${EASE}, opacity 220ms ${EASE}`;
      s.cur.style.transform = "";
      s.cur.style.opacity = "";
      const el = s.cur;
      setTimeout(() => { if (el.style.transform === "") { el.style.transition = ""; el.style.willChange = ""; } }, 240);
    };
    const dropPeek = (s) => {
      if (s.peekMover) { clear(s.peekMover); s.peekPanel.style.visibility = ""; }
      s.peekPanel = s.peekMover = null;
      if (s.target) { s.target = null; h.current.onPeek(null); }
      resetTopbar();
    };

    const down = (e) => {
      if (anim) anim.finish(); // новый жест посреди доезда — сразу закончить прежний
      start = null;
      if (!mobile?.matches || e.touches.length !== 1) return;
      const t = e.touches[0], el = e.target instanceof Element ? e.target : null;
      if (!el || t.clientX < SWIPE_EDGE || t.clientX > window.innerWidth - SWIPE_EDGE) return;
      if (document.body.classList.contains("kb-open")) return;
      // Открыто окно, меню или шторка — жесты у них свои (шторку истории — см. ниже)
      const layer = document.querySelector('[role="dialog"]:not(.nx-hist-drawer):not(.nx-cont-offer), [role="menu"], .nx-notes, .nx-viewer');
      if (layer || el.closest(SWIPE_SKIP) || inHorizontalScroll(el)) return;
      const c = ctx.current();
      if (c.sub || !SWIPE_ORDER.includes(c.tab)) return; // экран устройства, «Активность», «О системе»…
      const now = performance.now();
      start = { x: t.clientX, y: t.clientY, at: now, tab: c.tab, locked: null, w: window.innerWidth,
        lastX: t.clientX, lastAt: now, vx: 0, dir: null, target: null,
        curPanel: null, cur: null, peekPanel: null, peekMover: null };
    };

    // Палец движется: сначала решаем, жест горизонтальный или это прокрутка
    const move = (e) => {
      if (!start) return;
      const t = e.touches[0], now = performance.now();
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      // Скорость — по последнему отрезку пути (для флика и для доезда)
      if (now > start.lastAt) { start.vx = (t.clientX - start.lastX) / (now - start.lastAt); start.lastX = t.clientX; start.lastAt = now; }
      if (start.locked === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        start.locked = Math.abs(dx) > SWIPE_RATIO * Math.abs(dy);
        if (!start.locked) { start = null; return; } // вертикально — это прокрутка, не мешаем
      }
      if (still()) return;
      const dir = dx < 0 ? "next" : "prev";
      const plan = swipePlan(start.tab, dir);
      if (plan === "history" && document.querySelector(".nx-hist-drawer.is-open")) return; // шторку тянет её свой жест
      if (!start.cur) { start.curPanel = panelOf(start.tab); start.cur = moverOf(start.curPanel); prepare(start.cur); }
      if (!start.cur) return;
      if (plan !== "tab") {
        // История или край — экран чуть поддаётся (как пружина) и потом возвращается
        dropPeek(start);
        start.dir = dir;
        start.cur.style.transition = "none";
        start.cur.style.transform = `translate3d(${dx * 0.15}px, 0, 0)`;
        return;
      }
      // Соседний раздел в эту сторону; палец сменил сторону — другой сосед
      const target = SWIPE_ORDER[SWIPE_ORDER.indexOf(start.tab) + (dir === "next" ? 1 : -1)];
      if (target !== start.target) {
        dropPeek(start);
        start.target = target; start.dir = dir;
        h.current.onPeek(target, dir);
      }
      findPeek(start);
      start.dx = dx;
      if (!start.raf) {
        const s = start;
        s.raf = requestAnimationFrame(() => { s.raf = 0; if (start === s) place(s, s.dx); });
      }
    };

    // Довести до конца или вернуть: время — по оставшемуся пути и скорости пальца
    const settleMs = (dist, v) => Math.round(Math.min(320, Math.max(160, dist / Math.max(Math.abs(v), 1.4))));
    const up = (e) => {
      if (!start) return;
      const s = start; start = null;
      if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
      const t = e.changedTouches[0], now = performance.now();
      const dx = t.clientX - s.x, dy = t.clientY - s.y, dt = now - s.at;
      if (now - s.lastAt > 80) s.vx = 0; // палец остановился перед отпусканием — флика нет
      const dir = dx < 0 ? "next" : "prev";
      const plan = swipePlan(s.tab, dir);
      const horizontal = s.locked !== false && Math.abs(dx) >= SWIPE_RATIO * Math.abs(dy);
      const flick = Math.abs(dx) >= SWIPE_FLICK_MIN && Math.sign(s.vx) === Math.sign(dx) &&
        (Math.abs(s.vx) >= SWIPE_FLICK_SPEED || (dt <= SWIPE_FLICK_MS && Math.abs(dx) / dt >= SWIPE_FLICK_SPEED));
      const selecting = !!window.getSelection?.().toString(); // выделяли текст — не свайп

      // Не смена раздела (история, край) или «уменьшение движения» — как раньше
      if (plan !== "tab" || still() || !s.cur) {
        settleCur(s);
        dropPeek(s);
        if (horizontal && !selecting && (Math.abs(dx) >= SWIPE_MIN || flick)) h.current.onSwipe(dir);
        return;
      }
      findPeek(s);
      const go = horizontal && !selecting && !!s.target && dir === s.dir && (Math.abs(dx) >= s.w * 0.33 || flick);
      // Соседний экран не успел собраться (очень быстрый флик) — прежняя смена раздела
      if (go && !s.peekMover) {
        clear(s.cur); dropPeek(s);
        h.current.onSwipe(dir);
        return;
      }
      const to = go ? (dir === "next" ? -s.w : s.w) : 0;
      const ms = settleMs(Math.abs(to - dx), s.vx);
      place(s, to, ms);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true; anim = null;
        clearTimeout(timer);
        if (go) {
          // Соседний становится текущим: NexaApp синхронно меняет раздел, прокрутка — к началу.
          // Стили «соседа» у блока раздела снимает сам React (тот же элемент), здесь — у ассистента
          h.current.onCommit(s.target);
          clear(s.cur); // прежний раздел (если он остался в документе) — без прозрачности и сдвига
          clear(s.peekMover);
          if (s.peekPanel) s.peekPanel.style.visibility = "";
          resetTopbar();
        } else {
          clear(s.cur);
          dropPeek(s);
        }
      };
      const timer = setTimeout(finish, ms + 30);
      anim = { finish };
    };
    const cancel = () => {
      const s = start; start = null;
      if (!s) return;
      if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
      settleCur(s);
      dropPeek(s);
    };
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
