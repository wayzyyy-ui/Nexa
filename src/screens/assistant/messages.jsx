// Сообщения ассистента: пузырь, разметка ответа, кнопки, заготовка
import { useLayoutEffect, useState } from "react";
import { formatBytes } from "../../lib/deviceInfo.js";
import { formatLabel } from "../../lib/attach.js";
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { useVoiceOutput, speak, stopSpeaking } from "../../lib/voiceOutput.js";
import { enterAction, readEnterSends } from "../../lib/composer.js";
import { useLiveText } from "../../lib/live.js";
import { Spinner, btnReset, SkeletonLine } from "../../ui/base.jsx";

// Пузырь печатающегося ответа: пока текста нет — «Печатает», потом сам ответ.
// onGrow — текст подрос (прокрутить вниз, передвинуть ауру)
export function LiveAnswer({ onGrow }) {
  const text = useLiveText();
  useLayoutEffect(() => { onGrow?.(); }, [text]);
  if (!text) return <AssistantSkeleton />;
  return <MessageBubble role="ai" text={text} isLastAi disabled onRegenerate={() => {}} onEdit={() => {}} />;
}

/* Вложение у поля ввода: формат, имя, размер и что с ним сейчас.
   onToFiles — для большого PDF с устройства: положить его в «Файлы» обычной загрузкой */
export function AttachChip({ att, onRemove, onToFiles }) {
  const p = att.payload;
  const meta = `${formatLabel(att.name)} · ${formatBytes(att.size)}`;
  const status = att.status === "preparing" ? "Готовим файл…"
    : att.status === "error" ? att.error
    : [att.sent ? "В диалоге — уйдёт и со следующим вопросом" : "Готово — уйдёт ассистенту вместе с вопросом",
       p?.truncated ? "прочитана первая часть (100 тыс. знаков)" : null, p?.resized ? "картинка уменьшена" : null].filter(Boolean).join(" · ");
  return (
    <div className="nx-attach nx-pop" role="status" style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 10px", boxSizing: "border-box",
      border: `1px solid ${att.status === "error" ? C.red : C.borderStrong}`, borderRadius: 16, background: C.panel, textAlign: "left",
    }}>
      <span style={{
        width: 38, height: 38, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 10, letterSpacing: "0.04em", color: C.mint, fontWeight: 600,
      }}>
        {att.status === "preparing" ? <Spinner s={14} /> : formatLabel(att.name).slice(0, 4)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 12, lineHeight: 1.4, color: att.status === "error" ? C.red : C.mutedSoft }}>
          {att.status === "error" ? status : `${meta} · ${status}`}
        </span>
      </span>
      {onToFiles && (
        <button type="button" className="nx-ghost-btn" onClick={onToFiles} style={{ ...btnReset, flexShrink: 0, padding: "6px 12px", fontSize: 13, border: `1px solid ${C.borderStrong}`, color: C.text }}>
          В «Файлы»
        </button>
      )}
      <button type="button" className="nx-icon-btn" onClick={onRemove}
        aria-label={att.status === "preparing" ? "Отменить" : "Убрать файл"} title={att.status === "preparing" ? "Отменить" : "Убрать файл"}
        style={{ ...btnReset, width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon.close({ c: C.muted, s: 15 })}
      </button>
    </div>
  );
}

// Мини-парсер выделений: **жирный**, *курсив*, `код`.
export function renderRich(text) {
  if (typeof text !== 'string') return text;
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Обычный текст до совпадения
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: C.textStrong }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} style={{
          fontFamily: "'Space Grotesk', monospace",
          background: "color-mix(in srgb, var(--mint) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--mint) 25%, transparent)",
          borderRadius: 12,
          padding: "1px 6px",
          fontSize: "0.92em",
          color: C.mint,
        }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++} style={{ fontStyle: "italic", color: C.textSoft }}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Обёртка — просто вызывает парсер и вставляет результат.
export function RichText({ children }) {
  return <>{renderRich(children)}</>;
}

// Маленькая кнопка под сообщением (копировать, повторить, править)
// active — кнопка «включена» (идёт озвучка): мятная обводка и цвет, видна без наведения
export function ActionBtn({ title, onClick, disabled, active, children }) {
  return (
    <button
      className={active ? "nx-action nx-action-on" : "nx-action"}
      title={title}
      aria-label={title}
      aria-pressed={active ? true : undefined}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 10,
        border: `1px solid ${active ? C.mint : "transparent"}`, background: "transparent",
        color: active ? C.mint : C.muted, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
        transition: "color 140ms ease, background 140ms ease, border-color 140ms ease",
      }}
    >
      {children}
    </button>
  );
}

// ─── ПУЗЫРЬ СООБЩЕНИЯ ─────────────────────────────────────
// isLastAi: это последний ответ ИИ (под ним есть кнопка "повторить")
// disabled: пока идёт генерация, кнопки редактирования и повтора неактивны
// error — ответ не получен (нет сети, ошибка сервера): пузырь в цветах ошибки
// actionLabel — ответ на команду: под пузырём плашка с галочкой и названием действия;
// undoable / undone / onUndo — кнопка «Отменить» на плашке и её состояние
// speakId — номер ответа для озвучки (у неготовых и ошибочных ответов — null: кнопки нет)
export function MessageBubble({ role, text, file, error, actionLabel, undoable, undone, onUndo, isLastAi, disabled, onRegenerate, onEdit, speakId }) {
  const isUser = role === 'user';
  const tts = useVoiceOutput();
  const speaking = speakId != null && tts.speakingId === speakId;
  const [copied, setCopied] = useState(false);       // показываем галочку после копирования
  const [isEditing, setIsEditing] = useState(false); // включён ли режим редактирования
  const [draft, setDraft] = useState(text);          // текст в поле редактирования

  // Копируем текст без звёздочек выделения
    const handleCopy = async () => {
    const clean = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(clean);
      } else {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const startEdit = () => { setDraft(text); setIsEditing(true); };
  const cancelEdit = () => setIsEditing(false);
  const saveEdit = () => {
    const clean = draft.trim();
    setIsEditing(false);
    if (clean && clean !== text) onEdit(clean);
  };

  const copyButton = (
    <ActionBtn title={copied ? "Скопировано" : "Копировать"} onClick={handleCopy}>
      {copied ? Icon.check({ c: C.mint, s: 15 }) : Icon.copy({ c: "currentColor", s: 15 })}
    </ActionBtn>
  );

  // ─── СООБЩЕНИЯ ПОЛЬЗОВАТЕЛЯ ────────────────────────────
  if (isUser) {
    return (
      <div className="nx-msg" style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: "100%",
      }}>
        {isEditing ? (
          <div style={{
            width: "72%", display: "flex", flexDirection: "column", gap: 8,
            padding: 12, borderRadius: 20, borderTopRightRadius: 4,
            border: `1px solid ${C.blue}`, background: C.panel, boxSizing: "border-box",
          }}>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter — как в поле ввода (src/lib/composer.js): на телефоне новая строка, сохранить — кнопкой
                if (enterAction(e, readEnterSends()) === "send") { e.preventDefault(); saveEdit(); }
                if (e.key === 'Escape') cancelEdit();
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              style={{
                width: "100%", resize: "none", boxSizing: "border-box",
                background: "transparent", border: "none", outline: "none",
                color: C.text, fontSize: 16, lineHeight: 1.55, fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={cancelEdit} style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
              }}>Отмена</button>
              <button onClick={saveEdit} disabled={!draft.trim()} style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: C.mint, border: "none", color: C.onAccent, fontWeight: 500,
                opacity: draft.trim() ? 1 : 0.4,
              }}>Отправить</button>
            </div>
          </div>
        ) : (
          <>
          {/* Файл, приложенный к вопросу: только имя, формат и размер (содержимое в историю не пишем) */}
          {file && (
            <div className="nx-msg-file" style={{
              display: "flex", alignItems: "center", gap: 8, maxWidth: "72%", padding: "7px 12px", boxSizing: "border-box",
              border: `1px solid ${C.borderStrong}`, borderRadius: 14, background: C.panel, fontSize: 13, color: C.muted,
            }}>
              {Icon.clip({ c: C.mint, s: 14 })}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{file.name}</span>
              <span style={{ flexShrink: 0 }}>{(file.ext || "файл").toUpperCase()} · {formatBytes(file.size || 0)}</span>
            </div>
          )}
          <div className="nx-bubble-text nx-user-bubble" style={{
            maxWidth: "72%", padding: "12px 18px", borderRadius: 20, borderTopRightRadius: 4,
            background: C.blue, color: "#FFFFFF", fontSize: 16, lineHeight: 1.55,
            whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          }}>
            <RichText>{text}</RichText>
          </div>
          </>
        )}

        {!isEditing && (
          <div className="nx-actions" style={{ display: "flex", gap: 4 }}>
            {copyButton}
            <ActionBtn title="Редактировать" onClick={startEdit} disabled={disabled}>
              {Icon.edit({ c: "currentColor", s: 15 })}
            </ActionBtn>
          </div>
        )}
      </div>
    );
  }

  // ─── ОТВЕТЫ AI ─────────────────────────────────────────
  return (
    <div
      className={`nx-msg${isLastAi ? ' nx-last' : ''}`}
      style={{ display: "flex", justifyContent: "flex-start", width: "100%", gap: 12 }}
    >
      {/* Аватарка с иконкой-искрой */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.blueDark}, ${C.mintDark})`,
        border: `1px solid color-mix(in srgb, ${C.mint} 27%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 4,
      }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
      </div>

            <div className="nx-ai-col" style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "72%" }}>
        <div style={{
          fontSize: 12, letterSpacing: "0.12em", color: C.mint, opacity: 0.85,
          paddingLeft: 4, textTransform: "uppercase", fontWeight: 500,
          textAlign: "left", alignSelf: "flex-start",
          ...(error ? { color: C.red, display: "flex", alignItems: "center", gap: 6 } : {}),
        }}>
          {error ? <>{Icon.alert({ c: C.red, s: 14 })} Ответ не получен</> : "Ассистент NEXA"}
        </div>

        <div className="nx-bubble-text" style={{
          padding: "14px 18px", borderRadius: 20, borderTopLeftRadius: 4,
          background: error
            ? `color-mix(in srgb, ${C.red} 7%, ${C.panel})`
            : `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`,
          border: `1px solid ${error ? `color-mix(in srgb, ${C.red} 40%, transparent)` : C.border}`,
          color: C.textSoft, fontSize: 16, lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          position: "relative", overflow: "hidden",
        }}>
          {/* Тонкая цветная полоска слева внутри пузыря (у ошибки — красная) */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: error ? C.red : `linear-gradient(180deg, ${C.blue}, ${C.mint})`, opacity: 0.85,
          }} />
          <div style={{ paddingLeft: 8 }}>
            <RichText>{text}</RichText>
          </div>
        </div>

        {/* Плашка-подтверждение команды: тонкая обводка, галочка, действие */}
        {actionLabel && (
          <div className="nx-pop" style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8,
            border: `1px solid ${undone ? C.border : `color-mix(in srgb, ${C.mint} 45%, transparent)`}`,
            borderRadius: 10, padding: "5px 10px", fontSize: 12, color: undone ? C.mutedSoft : C.text,
          }}>
            {undone ? Icon.refresh({ c: C.mutedSoft, s: 13 }) : Icon.check({ c: C.mint, s: 13 })}
            <span style={{ textDecoration: undone ? "line-through" : "none" }}>{actionLabel}</span>
            {undone && <span>· отменено</span>}
            {undoable && (
              <button type="button" className="nx-link-btn" onClick={onUndo} style={{
                ...btnReset, fontSize: 12, color: C.muted, marginLeft: 4,
                borderLeft: `1px solid ${C.border}`, paddingLeft: 8,
              }}>
                Отменить
              </button>
            )}
          </div>
        )}

        {/* Кнопки под ответом: копировать, озвучить, а у последнего ответа ещё и повторить */}
        <div className="nx-actions" style={{ display: "flex", gap: 4, paddingLeft: 2 }}>
          {copyButton}
          {/* Озвучить — только готовый ответ и только если на устройстве есть русский голос.
              Во время чтения — «Остановить» (подсвечена, видна и без наведения) */}
          {speakId != null && tts.supported && (
            <ActionBtn title={speaking ? "Остановить" : "Озвучить"} active={speaking}
              onClick={() => (speaking ? stopSpeaking() : speak(speakId, text))}>
              {speaking ? Icon.stop({ c: "currentColor", s: 13 }) : Icon.speaker({ c: "currentColor", s: 15 })}
            </ActionBtn>
          )}
          {isLastAi && (
            <ActionBtn title="Повторить ответ" onClick={onRegenerate} disabled={disabled}>
              {Icon.refresh({ c: "currentColor", s: 15 })}
            </ActionBtn>
          )}
        </div>
        {/* Не получилось озвучить — коротко, рядом с этим ответом, гаснет само */}
        {speakId != null && tts.error && tts.errorId === speakId && (
          <div role="status" style={{ fontSize: 12, color: C.muted, paddingLeft: 4 }}>{tts.error}</div>
        )}
      </div>
    </div>
  );
}

// ─── СКЕЛЕТОН ОТВЕТА АССИСТЕНТА ─────────────────────────────
// Показывается, пока не пришёл первый символ ответа.
// Повторяет структуру настоящего ответа (аватарка, подпись, пузырь),
// поэтому при появлении текста ничего не «прыгает» на экране.
export function AssistantSkeleton() {
  return (
    <div className="nx-msg" style={{ display: "flex", justifyContent: "flex-start", width: "100%", gap: 12 }}>
      {/* Аватарка — та же, что у настоящего ответа, чтобы переход был незаметным */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.blueDark}, ${C.mintDark})`,
        border: `1px solid color-mix(in srgb, ${C.mint} 27%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 4,
      }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
      </div>

      <div className="nx-ai-col" style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "72%" }}>
        <div style={{
          fontSize: 12, letterSpacing: "0.12em", color: C.mint, opacity: 0.85,
          paddingLeft: 4, textTransform: "uppercase", fontWeight: 500,
          textAlign: "left", alignSelf: "flex-start",
        }}>
          Ассистент NEXA
        </div>

        {/* Пузырь по форме как настоящий, только вместо текста — серые полоски */}
        <div className="nx-bubble-text" style={{
          padding: "14px 18px", borderRadius: 20, borderTopLeftRadius: 4,
          background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`,
          border: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
          minWidth: 220, boxSizing: "border-box",
        }}>
          {/* Тонкая цветная полоска слева — как в настоящем пузыре */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: `linear-gradient(180deg, ${C.blue}, ${C.mint})`, opacity: 0.85,
          }} />
          <div style={{ paddingLeft: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            <SkeletonLine width="100%" />
            <SkeletonLine width="88%" />
            <SkeletonLine width="58%" />
          </div>
        </div>
      </div>
    </div>
  );
}
