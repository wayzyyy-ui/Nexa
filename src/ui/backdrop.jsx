// Фон экранов: грани складки в углах, сетка-чертёж (Настройки), складка Главной (HomeFold)
import { useRef, useId, useState, useEffect } from "react";
import foldSvg from "../assets/fold.svg";
import { NAV_W, C } from "./theme.js";
import { useBackdropMotion, reducedMotion } from "../lib/hooks.js";

/* ---------- 3. СКЛАДКА — фирменный визуал (FoldHero) ----------
   Три треугольные грани (polygon), каждая со своим градиентом.
   Это векторная картинка (svg), а не растровое изображение, поэтому
   она чёткая на любом размере экрана.
   size — задаёт ширину картинки в пикселях, высота считается сама
   пропорционально (чтобы форма не искажалась). */
/* Объёмная складка из макета 2026-10 — векторная (SVG) вместо картинки: чёткая на любом экране
   и в обеих темах (цвета — токены --f3-*). Три стеклянные грани: большая синяя, мятная справа
   и глубокая нижняя; полупрозрачны, на стыке — светлый блик; позади мягкое свечение.
   Справа складка уходит за край — рисуем с запасом под свечение (viewBox шире граней) */
const F3 = {
  a: "M155 8 L10 205 L68 332 L213 195 Z",
  b: "M261 70 L298 312 L150 252 Z",
  c: "M68 332 L267 366 L232 262 L150 252 Z",
};
export function FoldArt({ className, style }) {
  const id = useId().replace(/:/g, "");
  const g = (n) => `${id}-${n}`;
  const stop = (o, v, a = 1) => <stop offset={o} style={{ stopColor: `var(${v})`, stopOpacity: a }} />;
  return (
    <svg className={className} style={style} viewBox="-50 -50 400 470" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g("a")} x1="0.2" y1="0" x2="0.6" y2="1">{stop(0, "--f3-a1", 0.95)}{stop(0.55, "--f3-a2", 0.92)}{stop(1, "--f3-a3", 0.95)}</linearGradient>
        <linearGradient id={g("b")} x1="0.9" y1="0" x2="0.2" y2="1">{stop(0, "--f3-b1", 0.95)}{stop(1, "--f3-b2", 0.9)}</linearGradient>
        <linearGradient id={g("c")} x1="0" y1="0.2" x2="1" y2="0.8">{stop(0, "--f3-c1", 0.95)}{stop(1, "--f3-c2", 0.9)}</linearGradient>
        <linearGradient id={g("hi")} x1="0" y1="0" x2="1" y2="1">{stop(0, "--f3-hi", 1)}{stop(0.5, "--f3-hi", 0)}</linearGradient>
        {/* Светлая мятная полоса внутри синей грани — свет мятной грани сквозь стекло */}
        <linearGradient id={g("streak")} x1="0.1" y1="0.78" x2="0.95" y2="0.42">{stop(0.3, "--f3-b1", 0)}{stop(0.68, "--f3-b1", 0.5)}{stop(0.9, "--f3-b1", 0)}</linearGradient>
        <filter id={g("blur")} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="22" /></filter>
      </defs>
      {/* Свечение позади граней */}
      <g filter={`url(#${g("blur")})`} style={{ opacity: 0.5 }}>
        <path d={F3.a} style={{ fill: "var(--f3-glow)" }} />
        <path d={F3.b} style={{ fill: "var(--f3-b1)", opacity: 0.6 }} />
      </g>
      {/* Грани: сначала нижняя и мятная, поверх — большая синяя (как в рендере) */}
      <path d={F3.c} fill={`url(#${g("c")})`} />
      <path d={F3.b} fill={`url(#${g("b")})`} />
      <path d={F3.a} fill={`url(#${g("a")})`} />
      <path d={F3.a} fill={`url(#${g("hi")})`} />
      <path d={F3.a} fill={`url(#${g("streak")})`} />
      {/* Тонкие светлые рёбра — граница стекла */}
      {[F3.a, F3.b].map((d) => (
        <path key={d} d={d} fill="none" strokeWidth="1" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--f3-edge)" }} />
      ))}
    </svg>
  );
}

export function FoldHero({ size = 340 }) {
  return (
    <img
      src={foldSvg}
      alt="NEXA"
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

/* Складка Главной: раскрывается при первом открытии Главной за сессию
   (~1,2 с), при подключении нового устройства коротко «вздыхает» гранями,
   слегка смещается за курсором / наклоном и при прокрутке.
   Анимируются только transform и opacity граней — без размытия и фильтров.
   Как устроено: в покое — та же картинка fold.svg (с тенями). На время
   движения поверх неё — те же три грани отдельными SVG-путями без теней;
   в конце они плавно уступают место картинке.
   При «уменьшении движения» — сразу неподвижная картинка.
   count — сколько устройств (выросло — значит подключили новое) */
export const FOLD_INTRO_KEY = "nexa-fold-intro"; // в sessionStorage: раскрытие уже было

export const HOME_FACETS = [
  { cls: "f-c", d: "M279 376.606L511.939 146.071L605.813 434.474L372.371 663.466L279 376.606Z", g: 2, o: 0.4 },
  { cls: "f-b", d: "M681.341 243.604L739.811 634.399L372.137 489.638L681.341 243.604Z", g: 1, o: 0.39 },
  { cls: "f-a", d: "M691.785 720.578L600.477 440.055L372.353 663.411L691.785 720.578Z", g: 0, o: 0.4 },
];

// Градиенты граней — как в fold.svg (картинка-источник складки)
export const HOME_FACET_GRADS = [
  { x1: 496.742, y1: 548.079, x2: 691.785, y2: 720.578, from: "var(--fold-hf-a1)", to: "var(--fold-hf-a2)" },
  { x1: 681.341, y1: 243.604, x2: 609.363, y2: 582.509, from: "var(--fold-hf-b1)", to: "var(--fold-hf-b2)" },
  { x1: 513.592, y1: 151.148, x2: 370.686, y2: 658.289, from: "var(--fold-hf-c1)", to: "var(--fold-hf-c2)" },
];

export function HomeFold({ size, count = 0 }) {
  const ref = useRef(null);
  useBackdropMotion(ref); // --px / --py (курсор, наклон) и --sy (прокрутка)
  const uid = useId().replace(/:/g, "");
  // "intro" — раскрытие, "pulse" — «вздох», "settle" — грани уступают картинке, null — покой
  const [phase, setPhase] = useState(() => {
    try { return !reducedMotion() && !sessionStorage.getItem(FOLD_INTRO_KEY) ? "intro" : null; } catch { return null; }
  });
  useEffect(() => { if (phase === "intro") try { sessionStorage.setItem(FOLD_INTRO_KEY, "1"); } catch {} }, []);
  // Подключили новое устройство — короткое движение граней
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current && !reducedMotion()) setPhase((p) => (p === "intro" ? p : "pulse"));
    prevCount.current = count;
  }, [count]);
  // Смена фаз — по таймеру длительности, а не по концу CSS-анимации:
  // у скрытой складки (вторая раскладка Главной) анимация не идёт и конца не сообщает
  useEffect(() => {
    if (!phase) return;
    const next = phase === "settle" ? null : "settle";
    const t = setTimeout(() => setPhase(next), { intro: 1200, pulse: 760, settle: 320 }[phase]);
    return () => clearTimeout(t);
  }, [phase]);
  const moving = phase === "intro" || phase === "pulse";
  return (
    <div ref={ref} style={{ width: size, height: size, position: "relative" }}>
      {/* Лёгкий параллакс: за курсором / наклоном и чуть вверх при прокрутке */}
      <div style={{
        position: "absolute", inset: 0, transition: BACKDROP_EASE,
        transform: "translate(calc(var(--px, 0) * 6px), calc(var(--py, 0) * 5px - var(--sy, 0) * 12px))",
      }}>
        <img src={foldSvg} alt="NEXA" style={{
          width: size, height: size, display: "block",
          opacity: moving ? 0 : 1, transition: moving ? "none" : "opacity 300ms ease",
        }} />
        {phase && (
          <svg viewBox="0 0 829 861" preserveAspectRatio="none" aria-hidden="true"
            className={`nx-homefold is-${phase}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              {HOME_FACET_GRADS.map((g, i) => (
                <linearGradient key={i} id={`${uid}g${i}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">
                  <stop style={{ stopColor: g.from }} />
                  <stop offset="1" style={{ stopColor: g.to }} />
                </linearGradient>
              ))}
            </defs>
            <g style={{ mixBlendMode: "screen" }}>
              {HOME_FACETS.map((f) => (
                <path key={f.cls} className={f.cls} d={f.d} fill={`url(#${uid}g${f.g})`} fillOpacity={f.o} />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

export const backdropLayer = {
  position: "fixed", top: 0, right: 0, bottom: 0, left: NAV_W,
  zIndex: 0, pointerEvents: "none", overflow: "hidden",
};

// Мягко догоняет курсор, без рывков
export const BACKDROP_EASE = "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";

// Линии граней: продолжают наклоны фирменной складки.
// mint — линия сгиба, остальные — края граней
export function FoldCornerLines() {
  // Бледные линии: видны как геометрия, но не спорят с текстом поверх
  const edge = { stroke: `color-mix(in srgb, ${C.blue} 20%, transparent)` };
  const crease = { stroke: `color-mix(in srgb, ${C.mint} 18%, transparent)` };
  return (
    <svg viewBox="0 0 380 340" width={300} height={268} fill="none" strokeWidth="1" style={{ display: "block", overflow: "visible" }}>
      <path d="M0 236 L238 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M0 340 L98 170 L380 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M98 170 L238 0" style={crease} vectorEffect="non-scaling-stroke" />
      <path d="M0 124 L124 0" style={edge} vectorEffect="non-scaling-stroke" />
      <path d="M0 236 L98 170" style={crease} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BackdropFolds() {
  const ref = useRef(null);
  useBackdropMotion(ref);
  return (
    <div ref={ref} className="nx-backdrop" aria-hidden="true" style={backdropLayer}>
      {/* Левый верхний угол: поворачивается вокруг своего угла */}
      <div className="nx-bd-tl" style={{
        position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transition: BACKDROP_EASE,
        transform: "rotate(calc(var(--px, 0) * 1.4deg + var(--sy, 0) * 2deg)) translate(calc(var(--px, 0) * 5px), calc(var(--py, 0) * 5px))",
      }}>
        <FoldCornerLines />
      </div>
      {/* Правый нижний угол: те же грани, развёрнутые на 180°, двигаются навстречу */}
      <div className="nx-bd-br" style={{
        position: "absolute", bottom: 0, right: 0, transformOrigin: "100% 100%", transition: BACKDROP_EASE,
        transform: "rotate(calc(var(--px, 0) * -1.4deg - var(--sy, 0) * 2deg)) translate(calc(var(--px, 0) * -5px), calc(var(--py, 0) * -5px))",
      }}>
        <div style={{ transform: "rotate(180deg)" }}><FoldCornerLines /></div>
      </div>
    </div>
  );
}

// Сетка как на чертеже: мелкий шаг 32px, крупный 128px, по краям метки
export const GRID_STEP = 32, GRID_MAJOR = 128;

export function BackdropGrid() {
  const ref = useRef(null);
  useBackdropMotion(ref);
  const minor = `color-mix(in srgb, ${C.text} 3.5%, transparent)`;
  const major = `color-mix(in srgb, ${C.text} 7%, transparent)`;
  const label = { position: "absolute", fontSize: 9, fontFamily: "monospace", color: C.mutedSoft, opacity: 0.7, letterSpacing: "0.08em" };
  // Сетка на 24px шире экрана со всех сторон — при сдвиге за курсором края не оголяются
  const PAD = 24;
  return (
    <div ref={ref} className="nx-backdrop" aria-hidden="true" style={backdropLayer}>
      <div style={{
        position: "absolute", inset: -PAD, transition: BACKDROP_EASE,
        transform: "translate(calc(var(--px, 0) * -6px), calc(var(--py, 0) * -6px))",
        backgroundImage:
          `linear-gradient(${major} 1px, transparent 1px), linear-gradient(90deg, ${major} 1px, transparent 1px),` +
          `linear-gradient(${minor} 1px, transparent 1px), linear-gradient(90deg, ${minor} 1px, transparent 1px)`,
        backgroundSize: `${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_STEP}px ${GRID_STEP}px, ${GRID_STEP}px ${GRID_STEP}px`,
      }}>
        {/* Метки-координаты: буквы сверху, номера слева — у каждой крупной линии */}
        {Array.from({ length: 20 }, (_, i) => (
          <span key={`c${i}`} className="nx-bd-label" style={{ ...label, top: PAD + 6, left: i * GRID_MAJOR + 5 }}>
            {String.fromCharCode(65 + i)}
          </span>
        ))}
        {Array.from({ length: 12 }, (_, i) => i > 0 && (
          <span key={`r${i}`} className="nx-bd-label nx-bd-row" style={{ ...label, left: PAD + 6, top: i * GRID_MAJOR + 4 }}>
            {String(i).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}
