// «Помогать улучшать подсказки ассистента»: переключатель в Настройках и одноразовое окно-вопрос
// при входе на Главную. Логика — src/lib/mini/collect.js и collectHook.js
import { useEffect, useRef } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Toggle, btnReset } from "./base.jsx";

// Что именно уходит — одни и те же слова в Настройках и в окне на Главной (2026-11-03: проще, пунктами)
export const MINI_HELP_INTRO = "Иногда ассистент не понимает короткие просьбы вроде «открой заметки». Если разрешите, такие фразы будут приходить нам — и мы научим ассистента их понимать.";
export const MINI_HELP_POINTS = [
  "Уходит только текст фразы — без имени, почты и устройства",
  "Пароли, номера, ссылки и то, что вы просите запомнить, не отправляются никогда",
  "Фразы хранятся до 90 дней и не связаны с аккаунтом, поэтому «Удалить мои данные» их не удаляет",
];

// Пункты «что уходит и что нет» — с мятной галочкой
function MiniHelpPoints({ size = 13 }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
      {MINI_HELP_POINTS.map((p) => (
        <li key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: size, lineHeight: 1.45, color: C.text }}>
          <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>{Icon.check({ c: C.mint, s: size + 3 })}</span>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function MiniHelpSettings({ on, setOn }) {
  return (
    <div id="nx-mini-help" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>Улучшение ассистента</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.sparkle({ c: on ? C.mint : C.muted, s: 18 })} title="Помогать улучшать подсказки ассистента"
          subtitle={on ? "Включено на этом устройстве" : "Выключено — ничего не собирается и не отправляется"}
          right={<Toggle on={on} onClick={() => setOn(!on)} label="Помогать улучшать подсказки ассистента" />} />
      </SettingsGroup>
      <div style={{ margin: "-4px 4px 10px", textAlign: "left" }}>
        <div style={{ fontSize: 12, color: C.mutedSoft, lineHeight: 1.5 }}>{MINI_HELP_INTRO}</div>
        <MiniHelpPoints size={12} />
      </div>
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
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Помочь ассистенту стать умнее?" onClick={(e) => e.stopPropagation()}
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
          <span style={{ fontSize: 18, fontWeight: 500, color: C.text }}>Помочь ассистенту стать умнее?</span>
        </div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5, marginTop: 10 }}>{MINI_HELP_INTRO}</div>
        <MiniHelpPoints />
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="nx-primary" onClick={onYes}
            style={{ ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Да, помогу</button>
          <button type="button" className="nx-ghost-btn" onClick={onNo}
            style={{ ...pill, color: C.text, border: `1px solid ${C.borderStrong}` }}>Нет, спасибо</button>
        </div>
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10, lineHeight: 1.45 }}>Ассистент работает одинаково в обоих случаях. Передумаете — Настройки → «Улучшение ассистента»</div>
      </div>
    </div>
  );
}
