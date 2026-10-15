// Всплывающие уведомления (showToast → ToastHost)
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset } from "./base.jsx";

/* ─── СИСТЕМНЫЕ УВЕДОМЛЕНИЯ (ТОСТЫ) ────────────────────────
   Короткая обратная связь поверх приложения: файл отправлен,
   ссылка скопирована, диалог удалён и т.п. Показываются стеком
   справа сверху, автоматически исчезают через несколько секунд.
   Вызов: onToast({ title, text }), где onToast = showToast из NexaApp. */
export function ToastHost({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="nx-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

export function ToastItem({ toast, onClose }) {
  return (
    <div className="nx-toast" role="status">
      <div className="nx-toast-icon">
        {Icon.sparkle({ c: C.mint, s: 16 })}
      </div>
      <div className="nx-toast-body">
        <div className="nx-toast-title">{toast.title}</div>
        {toast.text && <div className="nx-toast-text">{toast.text}</div>}
        {toast.action && (
          <button type="button" className="nx-ghost-btn" onClick={() => { toast.action.onClick(); onClose(); }} style={{
            ...btnReset, marginTop: 8, padding: "5px 12px", fontSize: 13, borderRadius: 999,
            border: `1px solid ${C.borderStrong}`, color: C.text,
          }}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="nx-toast-close" onClick={onClose} aria-label="Закрыть">
        {Icon.close({ c: C.muted, s: 14 })}
      </button>
    </div>
  );
}
