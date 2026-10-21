// Режим разговора: полоска над полем ввода — что происходит и кнопки управления (src/lib/conversation.js)
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset } from "../../ui/base.jsx";

const PHASE_TEXT = {
  listening: "Слушаю — говорите",
  thinking: "Думаю над ответом…",
  speaking: "Отвечаю вслух",
  paused: "Микрофон выключен",
};

// Небольшая кнопка-«таблетка» полоски
function ConvBtn({ onClick, icon, children, accent, label }) {
  return (
    <button type="button" className="nx-ghost-btn" onPointerDown={(e) => e.preventDefault()} onClick={onClick} aria-label={label}
      style={{
        ...btnReset, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12.5, whiteSpace: "nowrap",
        borderRadius: 999, border: `1px solid ${accent ? C.mint : C.borderStrong}`, color: C.text,
      }}>
      {icon}{children}
    </button>
  );
}

/* conv — useConversation; heard — голос уже слышен (идёт фраза); speakOn — на устройстве есть голос.
   Разговор закончен, но есть причина (нет связи, нет доступа к микрофону) — только она, красным */
export function ConversationBar({ conv, heard, speakOn }) {
  if (!conv.active) {
    return conv.note ? (
      <div className="ng-disclaimer" role="status" aria-live="polite" style={{ fontSize: 12, color: C.red, textAlign: "center" }}>{conv.note}</div>
    ) : null;
  }
  const text = conv.phase === "paused" && conv.note ? conv.note
    : conv.phase === "listening" && heard ? "Слышу вас…"
    : conv.phase === "speaking" && !speakOn ? "Ответ на экране — голоса на этом устройстве нет"
    : PHASE_TEXT[conv.phase];
  return (
    <div className="nx-conv-bar" role="group" aria-label="Разговор с ассистентом" data-no-swipe style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", maxWidth: "100%",
    }}>
      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: conv.phase === "paused" ? C.muted : C.mint }}>
        {/* Точка: мятная — слушаем или отвечаем, серая — пауза */}
        <span className={conv.phase === "listening" ? "nx-conv-dot is-live" : "nx-conv-dot"} style={{
          width: 8, height: 8, borderRadius: "50%", background: conv.phase === "paused" ? C.muted : C.mint, flexShrink: 0,
        }} />
        {text}
      </div>
      {conv.phase === "speaking" && (
        <ConvBtn onClick={conv.skip} icon={Icon.stop({ c: C.text, s: 11 })} label="Остановить речь">Остановить речь</ConvBtn>
      )}
      <ConvBtn onClick={conv.toggleMute} accent={conv.muted || conv.phase === "paused"}
        icon={(conv.muted || conv.phase === "paused") ? Icon.mic({ c: C.mint, s: 13 }) : Icon.micOff({ c: C.text, s: 13 })}
        label={conv.muted || conv.phase === "paused" ? "Включить микрофон" : "Выключить микрофон"}>
        {conv.muted || conv.phase === "paused" ? "Вкл. микрофон" : "Выкл. микрофон"}
      </ConvBtn>
      <ConvBtn onClick={() => conv.end("")} icon={Icon.close({ c: C.text, s: 11 })} label="Завершить разговор">Завершить</ConvBtn>
    </div>
  );
}
