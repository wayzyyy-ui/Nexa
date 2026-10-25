// «Помогать улучшать подсказки ассистента»: переключатель в Настройках и одноразовая карточка-вопрос
// в переписке. Логика — src/lib/mini/collect.js и collectHook.js
import { useEffect, useRef } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Toggle, btnReset } from "./base.jsx";

// Что именно уходит — одни и те же слова в Настройках и в карточке
export const MINI_HELP_TEXT = "Когда ассистент не понял короткую просьбу, он отправит только её текст — без имени, почты, аккаунта и устройства. Ссылки, номера, пароли и «Запомни…» не уходят никогда. Хранится не дольше 90 дней, к вашему аккаунту не привязано — поэтому «Удалить мои данные» эти фразы не затрагивает. Выключить можно в любой момент, работа ассистента от этого не меняется.";

export function MiniHelpSettings({ on, setOn }) {
  return (
    <div id="nx-mini-help" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>Улучшение ассистента</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.sparkle({ c: on ? C.mint : C.muted, s: 18 })} title="Помогать улучшать подсказки ассистента"
          subtitle={on ? "Включено на этом устройстве" : "Выключено — ничего не собирается и не отправляется"}
          right={<Toggle on={on} onClick={() => setOn(!on)} label="Помогать улучшать подсказки ассистента" />} />
      </SettingsGroup>
      <div style={{ fontSize: 12, color: C.mutedSoft, margin: "-4px 4px 10px", lineHeight: 1.5, textAlign: "left" }}>{MINI_HELP_TEXT}</div>
    </div>
  );
}

const pill = { ...btnReset, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" };

/* Карточка «Помочь улучшить ассистента?» — не окно поверх: стоит в конце переписки, ничего не блокирует.
   role="dialog" и Esc (кнопка «Назад» Android закроет её тоже) — закрыли так, больше не спрашиваем */
export function MiniAskCard({ onYes, onNo, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && ref.current) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label="Помочь улучшить ассистента?" className="nx-pop nx-mini-ask nx-glass nx-glass-subtle" style={{
      alignSelf: "stretch", maxWidth: 620, margin: "0 auto", width: "100%", boxSizing: "border-box",
      border: `1px solid ${C.lineBright}`, borderRadius: 24, padding: "16px 18px", position: "relative", textAlign: "left",
    }}>
      <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть"
        style={{ ...btnReset, position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon.close({ c: C.muted, s: 12 })}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 30 }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
        <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>Помочь улучшить ассистента?</span>
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 8 }}>{MINI_HELP_TEXT}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="nx-primary" onClick={onYes}
          style={{ ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Да, помогу</button>
        <button type="button" className="nx-ghost-btn" onClick={onNo}
          style={{ ...pill, color: C.text, border: `1px solid ${C.borderStrong}` }}>Нет, спасибо</button>
      </div>
      <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 8 }}>Передумаете — Настройки → «Улучшение ассистента»</div>
    </div>
  );
}
