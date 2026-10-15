// Фон и «аура» ассистента
import { useRef, useEffect } from "react";
import { runSpectrum } from "../../lib/spectrum.js";
import { C } from "../../ui/theme.js";
import { live } from "../../lib/live.js";
import { useBackdropMotion } from "../../lib/hooks.js";
import { BACKDROP_EASE } from "../../ui/backdrop.jsx";

/* «Аура» нового диалога — крупная полупрозрачная складка за приветствием
   и полем ввода (наш ответ «цветному полю» у других ассистентов, но из граней,
   без свечения и размытия: края растворяются маской).
   Движение только по событию:
   • при открытии грани по очереди разворачиваются из центра складки;
   • грани на разной «глубине» чуть следуют за курсором / наклоном телефона;
   • active (поле в фокусе или в нём есть текст) — складка приближается и ярче.
   Точки граней — в % от размера ауры; центр складки — 47% 56% */
export const AURA_C = "47% 56%";

export const AURA_FACETS = [
  { clip: `polygon(6% 32%, 44% 6%, ${AURA_C})`,  from: C.foldBlue, to: C.foldDeep, depth: 1.2, delay: 0 },
  { clip: `polygon(44% 6%, 95% 30%, ${AURA_C})`, from: C.foldDeep, to: C.foldBlue, depth: 0.7, delay: 90 },
  { clip: `polygon(95% 30%, 76% 92%, ${AURA_C})`, from: C.foldCyan, to: C.foldBlue, depth: 1.0, delay: 180 },
  { clip: `polygon(76% 92%, 28% 96%, ${AURA_C})`, from: C.foldMint, to: C.foldCyan, depth: 1.4, delay: 270 },
  { clip: `polygon(28% 96%, 6% 32%, ${AURA_C})`,  from: C.foldDeep, to: C.foldMint, depth: 0.9, delay: 360 },
];

/* Спектральный фон экрана ассистента (src/lib/spectrum.js): мягкое цветное
   поле на холсте под всем экраном. Состояние читает сам, каждый кадр:
   думает — пока нет текста ответа, отвечает — пока текст растёт.
   React ради этого не перерисовывается */
export function AssistantSpectrum({ busyRef }) {
  const ref = useRef(null);
  useEffect(() => runSpectrum(ref.current, () => ({
    busy: live.chatId !== null || !!busyRef.current,
    len: live.text.length,
  })), []);
  return <canvas ref={ref} className="nx-spectrum" aria-hidden="true" />;
}

export function AssistantAura({ active }) {
  const ref = useRef(null);
  useBackdropMotion(ref); // --px / --py от курсора (на телефоне — от наклона)
  return (
    <div ref={ref} aria-hidden="true" className={`nx-aura${active ? " is-active" : ""}`}>
      {/* Грани размыты одним слоем — получается мягкое цветное поле */}
      <div className="nx-aura-blur" style={{ position: "absolute", inset: 0 }}>
      {AURA_FACETS.map((f, i) => (
        // Внешний слой — сдвиг за курсором (у каждой грани своя глубина),
        // внутренний — разворачивание при появлении
        <div key={i} style={{
          position: "absolute", inset: 0, transition: BACKDROP_EASE,
          transform: `translate(calc(var(--px, 0) * ${f.depth * 16}px), calc(var(--py, 0) * ${f.depth * 11}px))`,
        }}>
          <div className="nx-aura-facet" style={{
            position: "absolute", inset: 0, clipPath: f.clip, transformOrigin: AURA_C,
            background: `linear-gradient(135deg, color-mix(in srgb, ${f.from} 70%, transparent), color-mix(in srgb, ${f.to} 22%, transparent))`,
            animationDelay: `${f.delay}ms`,
          }} />
        </div>
      ))}
      </div>
    </div>
  );
}

/* Аура за ответом: пока ассистент думает и печатает, за новым ответом
   (слева внизу списка) проявляется маленькое размытое поле из тех же граней.
   Через пару секунд после ответа оно «испаряется»: разрастается, сильнее
   размывается и тает. fading — идёт исчезновение.
   posRef — внешний слой: ScreenAssistant ставит его в точку за последним
   ответом (left/top), сама аура центрируется вокруг этой точки */
export function ReplyAura({ fading, posRef }) {
  return (
    <div ref={posRef} aria-hidden="true" className="nx-reply-aura-pos">
    <div className={`nx-reply-aura${fading ? " is-fading" : ""}`}>
      <div className="nx-reply-aura-in" style={{ position: "absolute", inset: 0 }}>
        {AURA_FACETS.map((f, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, clipPath: f.clip,
            background: `linear-gradient(135deg, color-mix(in srgb, ${f.from} 75%, transparent), color-mix(in srgb, ${f.to} 25%, transparent))`,
          }} />
        ))}
      </div>
    </div>
    </div>
  );
}

export const REPLY_AURA_HOLD = 1800; // сколько аура держится после ответа

export const REPLY_AURA_FADE = 1000; // сколько «испаряется»
