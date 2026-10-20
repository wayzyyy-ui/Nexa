// Колокольчик уведомлений и часы в верхней строке
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { LEAVE_MS } from "../lib/hooks.js";
import { btnReset } from "./base.jsx";
import { NOTE_CATS, noteTime } from "../lib/notes.js";

// Значок события: по категории, у старых записей — по словам в заголовке
export function noteIcon(n) {
  const cat = NOTE_CATS.find((c) => c.id === n.cat);
  if (cat) return cat.icon;
  const t = `${n.kind || ""} ${n.title || ""}`.toLowerCase();
  if (/theme|тем/.test(t)) return Icon.sparkle;
  if (/файл|папк|ссылк/.test(t)) return Icon.folder;
  if (/дел|расписан|schedule/.test(t)) return Icon.calendar;
  if (/device|устройств|подключ|отключ|сигнал|отправлено/.test(t)) return Icon.phone;
  return Icon.bell;
}

export function NotificationBell({ notes, onSeen, onClear, onOpen, onSettings }) {
  const [open, setOpenNow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Закрытие — с короткой анимацией ухода (как у поиска и быстрых действий)
  const setOpen = (v) => {
    if (v) { setLeaving(false); setOpenNow(true); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setOpenNow(false); return; }
    setLeaving(true);
    setTimeout(() => { setOpenNow(false); setLeaving(false); }, LEAVE_MS);
  };
  const [seenBefore, setSeenBefore] = useState(0); // что было новым в момент открытия
  const ref = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, right: 0 }); // где показать панель (под колокольчиком)
  const unread = notes.items.filter((n) => n.at > notes.seenAt).length;

  // Закрываем по клику мимо и по Esc
  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      const inside = ref.current?.contains(e.target) || panelRef.current?.contains(e.target);
      if (!inside) setOpen(false);
    };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", down);
    window.addEventListener("touchstart", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setSeenBefore(notes.seenAt);
      onSeen(); // открыли — всё прочитано
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="nx-icon-btn nx-tb-bell" onClick={toggle} aria-label={unread ? `Уведомления: новых ${unread}` : "Уведомления"}
        aria-expanded={open} style={{
          ...btnReset, width: 34, height: 34, borderRadius: 10, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {Icon.bell({ c: C.text, s: 18 })}
        {/* Счётчик новых: при каждом новом событии мягко «выпрыгивает» */}
        {unread > 0 && (
          <span key={unread} className="nx-pop" style={{
            position: "absolute", top: 2, right: 1, minWidth: 15, height: 15, padding: "0 4px", boxSizing: "border-box",
            borderRadius: 14, background: C.mint, color: C.onAccent, fontSize: 9.5, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Панель выносим в корень страницы (portal): так она точно поверх
          всплывающих тостов, а не внутри слоя верхней строки */}
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Уведомления" className={`nx-pop nx-notes${leaving ? " nx-leaving" : ""}`} style={{
          position: "fixed", top: pos.top, right: pos.right, width: 340, zIndex: 600, textAlign: "left",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14, overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 14 }}>Уведомления</span>
            <span style={{ display: "flex", gap: 14 }}>
              {onSettings && (
                <button type="button" className="nx-link-btn" onClick={() => { setOpen(false); onSettings(); }} style={{ ...btnReset, fontSize: 12, color: C.muted }}>
                  Настроить
                </button>
              )}
              <button type="button" className="nx-link-btn" onClick={onClear} disabled={!notes.items.length}
                style={{ ...btnReset, fontSize: 12, color: C.muted }}>
                Очистить
              </button>
            </span>
          </div>
          {notes.items.length === 0 ? (
            <div style={{ padding: "26px 16px", textAlign: "center", fontSize: 13, color: C.mutedSoft, lineHeight: 1.5 }}>
              Пока тихо. Здесь появятся события:<br />файлы, устройства, синхронизация, расписание.
            </div>
          ) : (
            <div className="nx-scroll nx-stagger" style={{ maxHeight: 380, overflowY: "auto" }}>
              {notes.items.map((n) => (
                // Есть куда перейти — вся строка ведёт туда (раздел, устройство, окно)
                <div key={n.id} role={n.target ? "button" : undefined} tabIndex={n.target ? 0 : undefined} className={n.target ? "nx-row-btn" : undefined}
                  onClick={n.target ? () => { setOpen(false); onOpen?.(n.target); } : undefined}
                  onKeyDown={n.target ? (e) => { if (e.key === "Enter") { setOpen(false); onOpen?.(n.target); } } : undefined}
                  title={new Date(n.at).toLocaleString("ru-RU")}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, cursor: n.target ? "pointer" : "default" }}>
                  <span style={{
                    width: 28, height: 28, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {noteIcon(n)({ c: C.mint, s: 14 })}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      {/* Мятная точка — событие появилось после прошлого открытия */}
                      {n.at > seenBefore && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.mint, flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                    </div>
                    {n.text && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.text}</div>}
                    {/* Откуда событие и когда оно случилось */}
                    <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[n.source, noteTime(n.at)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {n.target && <span style={{ marginTop: 6, flexShrink: 0, display: "flex" }}>{Icon.chevron({ c: C.mutedSoft, s: 12 })}</span>}
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function TimeDate() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000); // минуты без секунд — раз в 10 с достаточно

    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now).replace(/^./, (c) => c.toUpperCase()); // «Пт, 12 сент.» (макет 2026-10)

 return (
  <div className="ng-timedate" style={{ textAlign: "right" }}>
    <div
      style={{
        fontSize: 20,
        fontWeight: 400,
        color: C.text,
      }}
    >
      {time}
    </div>

    <div
      style={{
        fontSize: 17,
        color: C.text,
      }}
    >
      {date}
    </div>
  </div>
  );
}
