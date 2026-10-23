// Общие стили и мелочи экрана «Заметки» (список — ../Notes.jsx, редактор — NoteEditor.jsx)
import { C } from "../../ui/theme.js";
import { useEffect, useState } from "react";
import { btnReset } from "../../ui/base.jsx";

export const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap" };
export const primary = { ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, border: "1px solid transparent", fontWeight: 500 };
export const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
export const round = { ...btnReset, width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
export const linkBtn = { ...btnReset, fontSize: 12, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3, flexShrink: 0 };
export const chip = (on) => ({
  ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap", fontSize: 13,
  border: `1px solid ${on ? C.mint : C.lineBright}`, color: on ? C.mint : C.text, background: on ? `color-mix(in srgb, ${C.mint} 8%, transparent)` : "transparent",
});

export const OPEN_KEY = "nexa-notes-open"; // какая заметка была открыта (перезагрузка вкладки откроет её снова)
export const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY); } catch { return null; } };
export const writeOpen = (id) => { try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* без памяти вкладки — просто не откроем снова */ } };

// Подсказки при наборе (Настройки → «ИИ — Ассистент», а также меню ✨ в редакторе): по умолчанию включены
export const SUGGEST_KEY = "nexa-note-suggest";
export const loadSuggestOn = () => { try { return localStorage.getItem(SUGGEST_KEY) !== "off"; } catch { return true; } };
export function useSuggestOn() {
  const [on, setOn] = useState(loadSuggestOn);
  useEffect(() => {
    const f = () => setOn(loadSuggestOn());
    window.addEventListener("nexa-note-suggest", f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener("nexa-note-suggest", f); window.removeEventListener("storage", f); };
  }, []);
  const set = (v) => { try { localStorage.setItem(SUGGEST_KEY, v ? "on" : "off"); } catch { /* без памяти — до перезапуска */ } setOn(!!v); window.dispatchEvent(new Event("nexa-note-suggest")); };
  return [on, set];
}
