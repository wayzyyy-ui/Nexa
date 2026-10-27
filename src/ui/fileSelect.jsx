// «Файлы»: меню файла по долгому нажатию (на ПК — правой кнопкой) и выделение нескольких файлов
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { useFileActions } from "./FileViewer.jsx";
import { btnReset } from "./base.jsx";
import { plural } from "../lib/format.js";

export const LONG_PRESS_MS = 480;

/* Долгое нажатие: палец (или мышь) держат на месте LONG_PRESS_MS — onLong(x, y).
   Сдвинули больше чем на 10 px (прокрутка) или отпустили раньше — обычное нажатие.
   wasLong() — «это нажатие было долгим»: обычный onClick после него не нужен */
export function useLongPress(onLong) {
  const st = useRef({ t: 0, x: 0, y: 0, fired: false });
  const clear = () => { clearTimeout(st.current.t); st.current.t = 0; };
  useEffect(() => clear, []);
  const handlers = {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const { clientX: x, clientY: y } = e;
      st.current = { x, y, fired: false, t: setTimeout(() => { st.current.fired = true; onLong(x, y); }, LONG_PRESS_MS) };
    },
    onPointerMove: (e) => { if (st.current.t && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) clear(); },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // Правая кнопка мыши — то же меню (на ПК без долгого удержания); общее меню быстрых действий не открываем
    onContextMenu: (e) => { e.preventDefault(); clear(); if (!st.current.fired) onLong(e.clientX, e.clientY); },
  };
  const wasLong = () => { const f = st.current.fired; st.current.fired = false; return f; };
  return { handlers, wasLong };
}

/* Меню одного файла: у точки нажатия, не выходит за край окна. Esc, нажатие мимо и «Назад» закрывают */
// «Скачать» и «Копировать» (фото) — тот же ход, что в окне файла (useFileActions); у файла без содержимого их нет
export function FileMenu({ at, file, onClose, onOpen, onSelect, onTransfer, onDelete, onToast }) {
  const acts = useFileActions(file, onToast);
  const has = !!file.uploaded;
  const ref = useRef(null);
  const [confirm, setConfirm] = useState(false);
  const [pos, setPos] = useState({ left: at.x, top: at.y, ready: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 12;
    // Снизу на телефоне — нижняя панель: меню над ней
    const tabbar = document.querySelector(".nx-tabbar-pill")?.getBoundingClientRect();
    const bottom = tabbar && tabbar.height ? tabbar.top - 8 : window.innerHeight - pad;
    setPos({
      left: Math.max(pad, Math.min(at.x, window.innerWidth - r.width - pad)),
      top: Math.max(pad, Math.min(at.y, bottom - r.height)),
      ready: true,
    });
  }, [at.x, at.y, confirm]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); if (confirm) setConfirm(false); else onClose(); } };
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); };
  }, [confirm, onClose]);
  const item = (label, icon, onClick, danger) => (
    <button type="button" role="menuitem" className="nx-file-menu-item" onClick={onClick} style={{ ...btnReset, color: danger ? C.red : C.text }}>
      {icon({ c: danger ? C.red : C.muted, s: 18 })}<span>{label}</span>
    </button>
  );
  return createPortal(
    <div ref={ref} role="menu" aria-label={file.name} className="nx-file-menu nx-glass" data-no-swipe
      style={{ left: pos.left, top: pos.top, opacity: pos.ready ? 1 : 0 }}>
      <div className="nx-file-menu-title">{file.name}</div>
      {confirm ? (
        <>
          <div style={{ fontSize: 13, color: C.muted, padding: "4px 12px 8px" }}>Удалить файл? Вернуть нельзя</div>
          {item("Удалить", Icon.trash, () => { onDelete(); onClose(); }, true)}
          {item("Отмена", Icon.close, () => setConfirm(false))}
        </>
      ) : (
        <>
          {item("Открыть", Icon.expand, () => { onOpen(); onClose(); })}
          {has && item("Скачать", Icon.download, () => { acts.go(true); onClose(); })}
          {has && file.cat === "photo" && item("Копировать", Icon.copy, () => { acts.copy(); onClose(); })}
          {item("Выделить", Icon.check, () => { onSelect(); onClose(); })}
          {onTransfer && item("Передать на устройство", Icon.send, () => { onTransfer(); onClose(); })}
          {item("Удалить", Icon.trash, () => setConfirm(true), true)}
        </>
      )}
    </div>,
    document.body
  );
}

/* Панель выделения снизу: «Выбрано N», «Выбрать все», «Удалить» (с подтверждением), «Отмена».
   role="dialog" — «Назад» Android и Esc выходят из выделения */
export function SelectBar({ count, total, onAll, onNone, onDelete, onExit }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [count]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".nx-file-menu")) return;
      e.preventDefault();
      if (confirm) setConfirm(false); else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, onExit]);
  const pill = { ...btnReset, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap", cursor: "pointer" };
  return createPortal(
    <div role="dialog" aria-label="Выбор файлов" className="nx-select-bar nx-glass" data-no-swipe>
      {confirm ? (
        <>
          <span className="nx-select-count">Удалить {count} {plural(count, ["файл", "файла", "файлов"])}? Вернуть нельзя</span>
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text }}>Отмена</button>
          <button type="button" className="nx-primary" onClick={() => { onDelete(); setConfirm(false); }} style={{ ...pill, background: C.red, color: C.onFold, border: "1px solid transparent", fontWeight: 600 }}>Удалить</button>
        </>
      ) : (
        <>
          <button type="button" className="nx-icon-btn" onClick={onExit} aria-label="Выйти из выделения" style={{ ...btnReset, width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {Icon.close({ c: C.text, s: 16 })}
          </button>
          <span className="nx-select-count">Выбрано {count}</span>
          <button type="button" className="nx-ghost-btn" onClick={count < total ? onAll : onNone} style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text }}>
            {count < total ? "Все" : "Снять"}
          </button>
          <button type="button" className="nx-ghost-btn" disabled={!count} onClick={() => setConfirm(true)}
            style={{ ...pill, border: `1px solid ${count ? C.red : C.border}`, color: count ? C.red : C.mutedSoft, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {Icon.trash({ c: count ? C.red : C.mutedSoft, s: 15 })} Удалить
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
