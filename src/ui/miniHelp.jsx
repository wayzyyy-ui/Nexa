// «Помогать улучшать подсказки ассистента»: переключатель в Настройках и одноразовое окно-вопрос
// при входе на Главную. Логика — src/lib/mini/collect.js и collectHook.js
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

/* Окно «Помочь улучшить ассистента?» — один раз при входе на Главную. Перекрывает экран, но закрывается:
   крестиком, Esc / «Назад» Android, нажатием мимо — это такой же отказ, как «Нет, спасибо»: больше не спрашиваем.
   По умолчанию ничего не включено — согласие только по кнопке «Да, помогу» */
export function MiniAskDialog({ onYes, onNo, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && ref.current) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="nx-viewer nx-mini-ask-wrap" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300, background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Помочь улучшить ассистента?" onClick={(e) => e.stopPropagation()}
        className="nx-pop nx-mini-ask nx-scroll" style={{
          width: "min(460px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxSizing: "border-box",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 24, padding: "22px 22px 18px", position: "relative", textAlign: "left",
        }}>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть"
          style={{ ...btnReset, position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon.close({ c: C.muted, s: 12 })}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 34 }}>
          {Icon.sparkle({ c: C.mint, s: 20 })}
          <span style={{ fontSize: 18, fontWeight: 500, color: C.text }}>Помочь улучшить ассистента?</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, marginTop: 10 }}>{MINI_HELP_TEXT}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="nx-primary" onClick={onYes}
            style={{ ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Да, помогу</button>
          <button type="button" className="nx-ghost-btn" onClick={onNo}
            style={{ ...pill, color: C.text, border: `1px solid ${C.borderStrong}` }}>Нет, спасибо</button>
        </div>
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Передумаете — Настройки → «Улучшение ассистента»</div>
      </div>
    </div>
  );
}
