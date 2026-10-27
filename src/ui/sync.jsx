// Строка синхронизации SyncStatus и окно «Связь и синхронизация» (SyncDetails)
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { changesWord, waitWord, plural } from "../lib/format.js";
import { useCountdown } from "../lib/hooks.js";
import { Dot, Spinner, btnReset, StateButton } from "./base.jsx";

/* Компактный индикатор связи и синхронизации (внизу слева, на телефоне — над панелью).
   Что показывает — только правду:
   - нет сети: «Нет сети» и сколько изменений ждёт отправки (у гостя — что всё на устройстве);
   - идёт сводка / отправка: «Синхронизируем…», «Отправляем 3 изменения…»;
   - сбой: «Не отправилось · повтор через 8 с» или, когда повторы кончились, «Повторить»;
   - «Сохранено в облаке» — коротко и только после ответа облака, что всё принято.
   Нажатие открывает подробности (SyncDetails) */
export function SyncStatus({ online, uid, loading, pending, queued, text, nextAt, gaveUp, onRetry, onOpen }) {
  const left = useCountdown(nextAt);
  const total = pending + queued;
  // Строка показывается редко (просьба автора 2026-10-27): нет сети, ошибка — сразу; «Синхронизируем» и
  // «Отправляем» — только если затянулись дольше 10 с (обычно проходят незаметно); «Сохранено в облаке» — больше нет
  const busy = online && !!uid && !text && (loading || total > 0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
  }, [busy]);

  let dot = null, label = null, retry = false;
  if (!online) {
    dot = <Dot color={C.red} />;
    label = uid ? (total ? `Нет сети · ${changesWord(total)} ${waitWord(total)} отправки` : "Нет сети · данные на этом устройстве") : "Нет сети · всё сохраняется на этом устройстве";
  } else if (!uid) return null;
  else if (loading && slow) { dot = <Spinner s={12} />; label = total ? `Синхронизируем · ждут: ${total}` : "Синхронизируем…"; }
  else if (text) {
    dot = <Dot color={C.red} />;
    label = [text, total ? `не отправлено: ${total}` : null, left != null ? `повтор через ${left} с` : null].filter(Boolean).join(" · ");
    retry = gaveUp || left == null;
  } else if (total && !loading && slow) { dot = <Spinner s={12} />; label = `Отправляем ${changesWord(total)}…`; }
  else return null;

  return (
    <div className="nx-sync-status nx-pop" role="status" style={{
      position: "fixed", zIndex: 60, display: "flex", alignItems: "center", gap: 8,
      padding: "4px 6px 4px 12px", border: `1px solid ${C.borderStrong}`, borderRadius: 999, background: C.panel,
      fontSize: 13, color: C.muted, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
    }}>
      {dot}
      <button type="button" onClick={onOpen} aria-haspopup="dialog" title="Подробнее о синхронизации" style={{
        ...btnReset, fontSize: 13, color: C.muted, padding: "4px 0", minWidth: 0, textAlign: "left",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{label}</button>
      {retry && online && (
        <button type="button" onClick={onRetry} style={{ ...btnReset, color: C.mint, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3, flexShrink: 0 }}>
          Повторить
        </button>
      )}
      <button type="button" className="nx-icon-btn" onClick={onOpen} aria-label="Подробнее о синхронизации" style={{ ...btnReset, width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon.chevron({ c: C.mutedSoft, s: 13 })}
      </button>
    </div>
  );
}

/* Подробности: что с каждой частью данных, очередь загрузок, удаления из облака.
   Только то, что знаем точно; «сохранено» — по подтверждению облака */
export const SYNC_PARTS = [["devices", "Устройства"], ["chats", "Диалоги ассистента"], ["schedule", "Расписание"], ["memory", "Память ассистента"], ["notes", "Заметки"], ["files", "Сведения о файлах"], ["folders", "Папки"]];

export function SyncDetails({ online, uid, syncState, uploads, trash, onRetry, onUploadAction, onLogin, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const queue = uploads.filter((u) => u.queued);
  const partState = (st) => {
    if (!st) return ["Ещё не проверяли", C.mutedSoft];
    if (st.localOnly) return ["Только на этом устройстве — облако для расписания не настроено", C.mutedSoft];
    if (st.loading) return ["Синхронизируем…", C.muted];
    if (st.text) return [`${st.text}${st.pending ? ` · ждут: ${st.pending}` : ""}${st.nextAt ? " · повторим сами" : st.gaveUp ? " · повторы кончились" : ""}`, C.red];
    if (st.pending) return [`${changesWord(st.pending)} ${waitWord(st.pending)} отправки`, C.muted];
    return [`Сохранено в облаке${st.at ? ` · ${new Date(st.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}`, C.green];
  };
  const authLost = uid && Object.values(syncState).some((st) => st?.kind === "auth");
  return createPortal(
    <div className="nx-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-sync-title" onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" style={{
        width: "min(480px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, padding: 20, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div id="nx-sync-title" className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>Связь и синхронизация</div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.close({ c: C.muted, s: 16 })}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 14, color: C.text }}>
          <Dot color={online ? C.green : C.red} /> {online ? "Сеть есть" : "Нет сети — работаем с данными на этом устройстве"}
        </div>
        {!uid ? (
          <div style={{ fontSize: 13, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
            Вы без аккаунта: всё хранится только в этом браузере, в облако ничего не отправляется.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 14 }}>
              {SYNC_PARTS.map(([key, title], i) => {
                const [txt, col] = partState(syncState[key]);
                return (
                  <div key={key} style={{ padding: "10px 14px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ fontSize: 14, color: C.text }}>{title}</div>
                    <div style={{ fontSize: 13, color: col, marginTop: 2, lineHeight: 1.4 }}>{txt}</div>
                  </div>
                );
              })}
            </div>
            {queue.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, color: C.mutedSoft, marginBottom: 6 }}>Файлы ждут загрузки: {queue.length}</div>
                {queue.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                    {u.status === "error" ? Icon.alert({ c: C.red, s: 14 }) : u.status === "uploading" ? <Spinner s={12} /> : Icon.refresh({ c: C.muted, s: 14 })}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{u.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: u.status === "error" ? C.red : C.mutedSoft }}>
                        {u.status === "error" ? u.error : u.status === "uploading" ? `Загружаем — ${Math.round((u.progress || 0) * 100)}%` : online ? "Ждёт повтора" : "Ждёт сети"}
                      </span>
                    </span>
                    {u.status === "error" && online && <button type="button" className="nx-ghost-btn" onClick={() => onUploadAction(u.id, "retry")} style={{ ...btnReset, fontSize: 13, padding: "4px 10px", border: `1px solid ${C.borderStrong}`, color: C.text }}>Повторить</button>}
                    <button type="button" className="nx-icon-btn" onClick={() => onUploadAction(u.id, "dismiss")} aria-label={`Убрать «${u.name}» из очереди`} style={{ ...btnReset, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {Icon.close({ c: C.muted, s: 13 })}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {trash > 0 && (
              <div style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>
                Удаление из облака ждёт связи: {trash} {plural(trash, ["файл", "файла", "файлов"])}
              </div>
            )}
            {authLost && (
              <div style={{ fontSize: 13, color: C.red, marginTop: 12, lineHeight: 1.45 }}>
                Сессия закончилась — изменения сохранены на устройстве и уйдут после входа.{" "}
                <button type="button" onClick={onLogin} style={{ ...btnReset, color: C.mint, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>Войти</button>
              </div>
            )}
          </>
        )}
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 14, lineHeight: 1.5 }}>
          Отправка идёт, пока NEXA открыта. Закрыли — ничего не потеряется: отправим при следующем запуске с интернетом.
          В фоне браузер и система этого не гарантируют. «Найти», блокировка, передача на устройство и NEXA Flow
          без сети не копятся — их нужно повторить, когда связь вернётся.
        </div>
        {uid && (
          <StateButton variant="primary" disabled={!online} onClick={onRetry} icon={Icon.refresh({ c: C.onFold, s: 14 })}
            style={{ width: "100%", marginTop: 16, borderRadius: 999, padding: "11px 16px" }}>
            {online ? "Повторить сейчас" : "Повторим, когда появится сеть"}
          </StateButton>
        )}
      </div>
    </div>,
    document.body,
  );
}
