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
/* Объёмная складка — SVG автора из Figma (Group 66.svg), перенесённая в код один в один:
   три грани с градиентами и прозрачностью 40 %, мягкое синее свечение влево-вверх
   (четыре слоя тени, как в Figma) и лёгкая тень под мятной и синей гранями.
   Цвета граней — токены --fold-hf-* (те же, что в файле), свечения — --hf-glow, тени — --hf-shade.
   viewBox — область граней с запасом под свечение; справа складка уходит за край экрана */
const HF = {
  bottom: "M502.269 561.291L435.974 357.619L270.346 519.785L502.269 561.291Z",
  mint: "M494.686 214.986L537.137 498.722L270.189 393.618L494.686 214.986Z",
  blue: "M202.567 311.552L371.692 144.172L439.849 353.566L270.359 519.826L202.567 311.552Z",
};
// Свечение из Figma: [сдвиг, размытие, непрозрачность]
const HF_GLOW = [[-7.99, 12.71, 0.1], [-31.95, 22.87, 0.09], [-72.6, 30.86, 0.05], [-129.24, 36.67, 0.01]];
export function FoldArt({ className, style }) {
  const id = useId().replace(/:/g, "");
  const g = (n) => `${id}-${n}`;
  const stop = (o, v) => <stop offset={o} style={{ stopColor: `var(${v})` }} />;
  const lift = (n) => (
    <filter id={g(n)} x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="2.9" stdDeviation="1.45" style={{ floodColor: "var(--hf-shade)" }} floodOpacity="0.25" />
    </filter>
  );
  return (
    <svg className={className} style={style} viewBox="130 80 430 500" aria-hidden="true" focusable="false">
      <defs>
        <filter id={g("glow")} x="-60%" y="-60%" width="180%" height="180%">
          {/* Каждый слой — своя тень от формы граней; потом все слои и сами грани сверху */}
          {HF_GLOW.map(([d, b, o], i) => [
            <feOffset key={"o" + i} in="SourceAlpha" dx={d} dy={d} result={"o" + i} />,
            <feGaussianBlur key={"b" + i} in={"o" + i} stdDeviation={b} result={"b" + i} />,
            <feFlood key={"f" + i} style={{ floodColor: "var(--hf-glow)" }} floodOpacity={o} result={"f" + i} />,
            <feComposite key={"c" + i} in={"f" + i} in2={"b" + i} operator="in" result={"s" + i} />,
          ])}
          <feMerge>
            {HF_GLOW.map((_, i) => <feMergeNode key={i} in={"s" + (HF_GLOW.length - 1 - i)} />)}
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {lift("lift-m")}
        {lift("lift-b")}
        <linearGradient id={g("bottom")} x1="360.658" y1="436.049" x2="502.269" y2="561.291" gradientUnits="userSpaceOnUse">{stop(0, "--fold-hf-a1")}{stop(1, "--fold-hf-a2")}</linearGradient>
        <linearGradient id={g("mint")} x1="494.686" y1="214.986" x2="442.426" y2="461.047" gradientUnits="userSpaceOnUse">{stop(0, "--fold-hf-b1")}{stop(1, "--fold-hf-b2")}</linearGradient>
        <linearGradient id={g("blue")} x1="372.892" y1="147.858" x2="269.135" y2="516.066" gradientUnits="userSpaceOnUse">{stop(0, "--fold-hf-c1")}{stop(1, "--fold-hf-c2")}</linearGradient>
      </defs>
      <g filter={`url(#${g("glow")})`}>
        <path d={HF.bottom} fill={`url(#${g("bottom")})`} fillOpacity="0.4" />
        <g filter={`url(#${g("lift-m")})`}><path d={HF.mint} fill={`url(#${g("mint")})`} fillOpacity="0.39" /></g>
        <g filter={`url(#${g("lift-b")})`}><path d={HF.blue} fill={`url(#${g("blue")})`} fillOpacity="0.4" /></g>
      </g>
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
