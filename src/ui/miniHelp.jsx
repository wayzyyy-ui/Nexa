// «Помогать улучшать подсказки ассистента»: переключатель в Настройках и одноразовое окно-вопрос
// при входе на Главную. Логика — src/lib/mini/collect.js и collectHook.js
import { IntroDialog } from "./IntroDialog.jsx";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Toggle } from "./base.jsx";

// Что именно уходит — одни и те же слова в Настройках и в окне на Главной (2026-11-03: проще, пунктами)
export const MINI_HELP_INTRO = "Мы развиваем NEXA mini — нейросеть, которая помогает ассистенту понимать команды, например «открой заметки» или «включи светлую тему».";
export const MINI_HELP_POINTS = [
  "С вашего разрешения короткие фразы, которые нейросеть не поняла, будут отправляться команде NEXA. Эти примеры помогут улучшить распознавание ваших просьб.",
  "Участие добровольное. Отправку можно отключить в настройках.",
  "Фразы хранятся до 90 дней без привязки к аккаунту. Поэтому удаление аккаунта не удаляет отправленные примеры. Не включайте в них личные сведения.",
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

// Закрытие окна не включает сбор: согласие даёт только «Да, помогу».
export function MiniAskDialog({ onYes, onNo, onClose }) {
  return <IntroDialog title="Помогите улучшить AI-Ассистента" onClose={onClose} actions={<>
    <button type="button" className="nx-primary" onClick={onYes}>Да, помогу</button>
    <button type="button" className="nx-ghost-btn" data-autofocus onClick={onNo}>Нет, спасибо</button>
  </>}>
    <p>{MINI_HELP_INTRO}</p>
    <p>{MINI_HELP_POINTS[0]}</p>
    <p>{MINI_HELP_POINTS[1]}</p>
    <details><summary>Подробнее</summary><p>{MINI_HELP_POINTS[2]}</p></details>
  </IntroDialog>;
}
