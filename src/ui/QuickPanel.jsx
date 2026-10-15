// Панель быстрых действий (Ctrl/⌘ + K, молния)
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { C, PHONE_MQ } from "./theme.js";
import { Icon } from "./icons.jsx";
import { useMediaQuery, useLeave } from "../lib/hooks.js";
import { btnReset } from "./base.jsx";

/* ═══ ПАНЕЛЬ БЫСТРЫХ ДЕЙСТВИЙ ══════════════════════════════════
   Открывается кнопкой-молнией в верхней строке, сочетанием Ctrl/⌘ + K
   и событием QUICK_EVENT (так её откроет любой компонент, а в будущей
   EXE-версии — глобальное сочетание через onDesktopQuickPanel в native.js).
   Своих действий у панели нет: команды собирает NexaApp (quickCommands)
   из уже существующих обработчиков. Команда — { id, title, sub, icon,
   keywords, run } или вместо run — pick { title, placeholder, empty, items }:
   выбор устройства или файла открывается тут же, внутри панели.
   В панель попадают только команды, которые сейчас можно выполнить */
export const QUICK_EVENT = "nexa-quick-panel";

export const openQuickPanel = () => window.dispatchEvent(new Event(QUICK_EVENT));

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export const QUICK_KEYS = IS_MAC ? "⌘ K" : "Ctrl K";

// Совпадает, если каждое слово запроса есть в названии, подписи или ключевых словах
export const quickNorm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");

export const quickMatch = (item, q) => {
  const words = quickNorm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = quickNorm([item.title, item.sub, ...(item.keywords || [])].join(" "));
  return words.every((w) => hay.includes(w));
};

// Кнопка-молния в верхней строке
export function QuickBtn() {
  return (
    <button type="button" className="nx-icon-btn" onClick={openQuickPanel}
      aria-label="Быстрые действия" title={`Быстрые действия · ${QUICK_KEYS}`} aria-haspopup="dialog"
      style={{ ...btnReset, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {Icon.quick({ c: C.text, s: 18 })}
    </button>
  );
}

/* Та же панель служит выбором файла для ассистента: label — название окна,
   placeholder — подсказка в поле, onSearch не передан — строки «Искать везде» нет,
   keys — подсказка справа внизу. Строка с disabled видна, но не выбирается (в sub — почему) */
export function QuickPanel({ commands, note, onClose: closeNow, onSearch, label = "Быстрые действия", placeholder, icon = Icon.quick, keys = `${QUICK_KEYS} — открыть панель`, closeRef }) {
  const mobile = useMediaQuery(PHONE_MQ);
  // Закрытие с анимацией; closeRef — чтобы NexaApp мог закрыть так же (повторный Ctrl+K)
  const [leaving, onClose] = useLeave(closeNow);
  if (closeRef) closeRef.current = onClose;
  const [query, setQuery] = useState("");
  const [path, setPath] = useState([]); // выбранные шаги: [id команды, id устройства, …]
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Где мы сейчас: проходим по выбранным шагам. Список живой — устройство ушло
  // из сети, пока панель открыта, — шаг пропадает, а не остаётся «призраком»
  let items = commands, step = null, crumbs = [];
  for (const id of path) {
    const it = items.find((x) => x.id === id);
    if (!it?.pick) break;
    step = it.pick; crumbs.push(it.title); items = step.items;
  }
  const depth = crumbs.length;
  const shown = items.filter((it) => quickMatch(it, query));
  // В корне по любому запросу последней строкой — глобальный поиск с этим запросом
  const q = query.trim();
  const rows = !step && q && onSearch ? [...shown, { id: "__search", title: `Искать «${q}» по всему NEXA`, sub: "Файлы, папки, диалоги, устройства, настройки", icon: Icon.search, run: () => onSearch(q) }] : shown;
  const cur = Math.min(sel, Math.max(0, rows.length - 1));

  // Фокус в поле сразу (на телефоне — нет: иначе выскочит клавиатура).
  // Закрылись — фокус возвращается туда, где был
  useEffect(() => {
    const before = document.activeElement;
    if (!mobile) inputRef.current?.focus();
    return () => {
      const a = document.activeElement;
      if ((!a || a === document.body) && before?.isConnected) before.focus?.();
    };
  }, []);
  useEffect(() => { setSel(0); }, [query, depth]);
  // Выбранная строка всегда видна
  useEffect(() => { document.getElementById(`nx-quick-opt-${cur}`)?.scrollIntoView({ block: "nearest" }); }, [cur, depth]);

  const back = () => { setPath((p) => p.slice(0, depth - 1)); setQuery(""); };
  // Esc (и «Назад» Android, который нажимает Esc): из шага — на шаг назад, из списка — закрыть
  const stateRef = useRef(); stateRef.current = { depth, back, onClose };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const s = stateRef.current;
      if (s.depth) s.back(); else s.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (it) => {
    if (!it || it.disabled) return;
    if (it.pick) { setPath([...path.slice(0, depth), it.id]); setQuery(""); if (!mobile) inputRef.current?.focus(); return; }
    it.run();
    onClose();
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(rows.length ? (cur + 1) % rows.length : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(rows.length ? (cur - 1 + rows.length) % rows.length : 0); }
    else if (e.key === "Home") { e.preventDefault(); setSel(0); }
    else if (e.key === "End") { e.preventDefault(); setSel(Math.max(0, rows.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(rows[cur]); }
    else if (e.key === "Backspace" && !query && depth) { e.preventDefault(); back(); }
  };

  return createPortal(
    <div className={`nx-quick-overlay nx-fade-in${leaving ? " nx-fade-leaving" : ""}`} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} className={`nx-quick-panel nx-pop${leaving ? " nx-leaving" : ""}`} onClick={(e) => e.stopPropagation()}>
        {/* Шаг выбора: назад и где мы */}
        {depth > 0 && (
          <div className="nx-quick-step">
            <button type="button" className="nx-icon-btn" onClick={back} aria-label="Назад"
              style={{ ...btnReset, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {Icon.arrowLeft({ c: C.muted, s: 15 })}
            </button>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {crumbs.join(" → ")}{step?.title ? <span style={{ color: C.text }}> · {step.title}</span> : null}
            </span>
          </div>
        )}
        {/* Поле поиска команд */}
        <div className="nx-quick-search">
          {icon({ c: C.mint, s: 18 })}
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder={step?.placeholder || placeholder || (mobile ? "Что сделать?" : "Что сделать? Например: файл, найти, диалог")}
            role="combobox" aria-expanded="true" aria-controls="nx-quick-list" aria-autocomplete="list"
            aria-activedescendant={rows.length ? `nx-quick-opt-${cur}` : undefined} aria-label={step?.placeholder || placeholder || "Найти действие"}
            enterKeyHint="go" autoComplete="off" spellCheck={false} />
          {mobile ? (
            <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть"
              style={{ ...btnReset, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {Icon.close({ c: C.muted, s: 16 })}
            </button>
          ) : <kbd className="nx-quick-kbd">Esc</kbd>}
        </div>
        {/* Команды */}
        <div ref={listRef} id="nx-quick-list" role="listbox" aria-label={step?.title || label} className="nx-quick-list nx-scroll">
          {rows.map((it, i) => (
            <div key={it.id} id={`nx-quick-opt-${i}`} role="option" aria-selected={i === cur}
              className={`nx-quick-row${i === cur ? " is-sel" : ""}${it.disabled ? " is-off" : ""}`} aria-disabled={it.disabled || undefined}
              onMouseMove={() => { if (i !== cur) setSel(i); }} onClick={() => choose(it)}>
              <span className="nx-quick-ico">{it.thumb || it.icon?.({ c: i === cur ? C.mint : C.muted, s: 16 })}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="nx-quick-title">{it.title}</span>
                {it.sub && <span className="nx-quick-sub">{it.sub}</span>}
              </span>
              {it.pick && Icon.chevron({ c: C.mutedSoft, s: 14 })}
            </div>
          ))}
          {!rows.length && (
            <div style={{ padding: "18px", fontSize: 13, color: C.mutedSoft, lineHeight: 1.5 }}>
              {q ? `Нет действий по запросу «${q}»` : step?.empty || "Сейчас здесь пусто"}
            </div>
          )}
          {!step && !q && note && <div className="nx-quick-note">{note}</div>}
        </div>
        {/* Подсказка по клавишам — только там, где есть клавиатура */}
        {!mobile && (
          <div className="nx-quick-foot">
            <span>↑ ↓ выбрать · Enter выполнить · Esc {depth ? "назад" : "закрыть"}</span>
            {keys && <span>{keys}</span>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
