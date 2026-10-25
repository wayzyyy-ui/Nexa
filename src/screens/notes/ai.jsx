// ИИ в редакторе заметки: меню ✨, панель результата («Применить» / «Отменить») и серая подсказка в строке.
// Запросы — src/lib/noteAi.js, правила — src/lib/noteText.js. Здесь только вид.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset } from "../../ui/base.jsx";
import { NOTE_AI_TASKS, NOTE_PROMPT_MAX } from "../../lib/noteAi.js";
import { ghost, primary } from "./shared.js";

const TASK_LABEL = { ...Object.fromEntries(NOTE_AI_TASKS.map((t) => [t.id, t.label])), custom: "Своя задача" };

/* Меню ✨ (role="menu": Esc и «Назад» закрывают). onPick(id) — действие над текстом,
   onDiscuss — «Обсудить с AI», suggestOn / setSuggestOn — подсказки при наборе */
export function AiMenu({ onClose, onPick, onDiscuss, onAnalyze, canDiscuss, suggestOn, setSuggestOn, hasSelection, anchorRef }) {
  const box = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e) => { if (!box.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose(); };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown); };
  }, [onClose, anchorRef]);
  const item = { ...btnReset, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, width: "100%", padding: "9px 12px", borderRadius: 12, textAlign: "left", color: C.text };
  // Своя задача: человек пишет, что сделать, своими словами («составь список покупок», «переведи на английский»…)
  const [prompt, setPrompt] = useState("");
  const sendPrompt = (e) => { e.preventDefault(); const p = prompt.trim(); if (p) onPick("custom", p); };
  return (
    <div ref={box} role="menu" aria-label="ИИ в заметке" className="nx-pop nx-note-menu" style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, width: 262, padding: 6, boxSizing: "border-box",
      background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, boxShadow: `0 14px 36px color-mix(in srgb, ${C.bg} 65%, transparent)`,
    }}>
      <div style={{ fontSize: 12, color: C.mutedSoft, padding: "6px 12px 4px" }}>{hasSelection ? "Для выделенного фрагмента" : "Для всей заметки"}</div>
      <form onSubmit={sendPrompt} style={{ display: "flex", gap: 6, padding: "4px 6px 6px" }}>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, NOTE_PROMPT_MAX))} maxLength={NOTE_PROMPT_MAX}
          placeholder="Своя задача: что сделать?" aria-label="Своя задача для ИИ" enterKeyHint="send"
          style={{ flex: 1, minWidth: 0, background: "transparent", color: C.text, fontSize: 14, fontFamily: "inherit", border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "8px 10px", outline: "none" }} />
        <button type="submit" className="nx-icon-btn" disabled={!prompt.trim()} aria-label="Выполнить свою задачу"
          style={{ ...btnReset, width: 36, height: 36, flexShrink: 0, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${prompt.trim() ? C.mint : C.borderStrong}`, opacity: prompt.trim() ? 1 : 0.5 }}>
          {Icon.send({ c: prompt.trim() ? C.mint : C.muted, s: 14 })}
        </button>
      </form>
      {NOTE_AI_TASKS.map((t) => (
        <button key={t.id} type="button" role="menuitem" className="nx-row-btn" style={item} onClick={() => onPick(t.id)}>
          <span style={{ fontSize: 14 }}>{t.label}</span>
          <span style={{ fontSize: 12, color: C.mutedSoft }}>{t.hint}</span>
        </button>
      ))}
      <div style={{ height: 1, background: C.border, margin: "6px 10px" }} />
      <button type="button" role="menuitem" className="nx-row-btn" style={{ ...item, flexDirection: "row", alignItems: "center", gap: 10, opacity: canDiscuss ? 1 : 0.45 }} disabled={!canDiscuss} onClick={onDiscuss}>
        {Icon.chat({ c: C.mint, s: 15 })} <span style={{ fontSize: 14 }}>Обсудить с AI</span>
      </button>
      <button type="button" role="menuitem" className="nx-row-btn" style={{ ...item, flexDirection: "row", alignItems: "center", gap: 10, opacity: canDiscuss ? 1 : 0.45 }} disabled={!canDiscuss} onClick={onAnalyze}>
        {Icon.search({ c: C.mint, s: 15 })} <span style={{ fontSize: 14 }}>Проанализировать в AI</span>
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={suggestOn} className="nx-row-btn" style={{ ...item, flexDirection: "row", alignItems: "center", gap: 10 }} onClick={() => setSuggestOn(!suggestOn)}>
        {Icon.sparkle({ c: suggestOn ? C.mint : C.muted, s: 15 })}
        <span style={{ fontSize: 14, flex: 1 }}>Подсказки при наборе</span>
        <span style={{ fontSize: 12, color: suggestOn ? C.mint : C.mutedSoft }}>{suggestOn ? "Вкл." : "Выкл."}</span>
      </button>
    </div>
  );
}

/* Панель результата. ai = { task, phase: "loading" | "result" | "error", sel, result, error }.
   Исходный текст не трогаем, пока человек не нажал «Применить» */
export function AiPanel({ ai, onApply, onCancel, onRetry }) {
  const showRef = useRef(null);
  useEffect(() => { if (ai?.phase === "result") showRef.current?.scrollIntoView?.({ block: "nearest" }); }, [ai?.phase]);
  if (!ai) return null;
  const where = ai.task === "continue" ? (ai.sel ? "после выделенного" : "в конец заметки") : ai.sel ? "выделенный фрагмент" : "вся заметка";
  return (
    <div role="region" aria-label="Результат ИИ" aria-live="polite" className="nx-pop nx-note-ai" style={{
      border: `1px solid ${ai.phase === "error" ? C.red : C.borderStrong}`, borderRadius: 18, padding: "10px 12px", marginBottom: 10, flexShrink: 0,
      background: `color-mix(in srgb, ${C.text} 4%, transparent)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
        {Icon.sparkle({ c: C.mint, s: 14 })}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{TASK_LABEL[ai.task]} · {where}</span>
        <button type="button" onClick={onCancel} aria-label="Закрыть" style={{ ...btnReset, display: "flex", padding: 4 }}>{Icon.close({ c: C.muted, s: 13 })}</button>
      </div>
      {ai.phase === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px 6px", fontSize: 14, color: C.muted }}>
          <span aria-hidden="true" className="nx-spin" style={{ width: 14, height: 14, borderRadius: 999, border: `2px solid ${C.border}`, borderTopColor: C.mint, flexShrink: 0 }} />
          Обрабатываю…
          <button type="button" className="nx-link-btn" onClick={onCancel} style={{ ...btnReset, marginLeft: "auto", fontSize: 13, color: C.muted, textDecoration: "underline", textUnderlineOffset: 3 }}>Отмена</button>
        </div>
      )}
      {ai.phase === "error" && (
        <div role="alert" style={{ padding: "10px 2px 2px" }}>
          <div style={{ fontSize: 14, color: C.red, lineHeight: 1.45 }}>{ai.error}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="nx-ghost-btn" style={ghost} onClick={onRetry}>Повторить</button>
            <button type="button" className="nx-ghost-btn" style={ghost} onClick={onCancel}>Закрыть</button>
          </div>
        </div>
      )}
      {ai.phase === "result" && (
        <div ref={showRef}>
          <div className="nx-scroll" tabIndex={0} style={{ maxHeight: "26vh", overflowY: "auto", padding: "10px 2px 2px", fontSize: 15, lineHeight: 1.55, color: C.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere", overscrollBehavior: "contain" }}>{ai.result}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="nx-primary" style={primary} onClick={onApply}>Применить</button>
            <button type="button" className="nx-ghost-btn" style={ghost} onClick={onCancel}>Отменить</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Серая подсказка в строке. Поверх текстового поля лежит его «зеркало»: те же шрифт, отступы и перенос,
   в нём набранный текст невидим, а за ним — подсказка серым. Так она стоит прямо за курсором,
   переносится как обычный текст и не входит в сам текст заметки, пока её не приняли.
   Зеркало не ловит нажатия и прокручивается вместе с полем */
export function GhostLayer({ taRef, text, tail }) {
  const inner = useRef(null);
  const sync = () => {
    const ta = taRef.current, el = inner.current;
    if (!ta || !el) return;
    const cs = getComputedStyle(ta);
    el.style.width = `${ta.clientWidth}px`; // без полосы прокрутки — иначе перенос строк разойдётся с полем
    el.style.font = cs.font;
    el.style.letterSpacing = cs.letterSpacing;
    el.style.lineHeight = cs.lineHeight;
    el.style.padding = cs.padding;
    el.style.tabSize = cs.tabSize;
    el.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  useLayoutEffect(sync);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const ro = new ResizeObserver(sync);
    ro.observe(ta);
    ta.addEventListener("scroll", sync, { passive: true });
    return () => { ro.disconnect(); ta.removeEventListener("scroll", sync); };
  }, [taRef]);
  return (
    <div aria-hidden="true" className="nx-note-ghost" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit" }}>
      <div ref={inner} style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "normal", boxSizing: "border-box", color: "transparent" }}>
        <span>{text}</span><span className="nx-note-ghost-tail" style={{ color: C.mutedSoft }}>{tail}</span>
      </div>
    </div>
  );
}
