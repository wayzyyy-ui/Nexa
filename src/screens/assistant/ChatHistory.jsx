// История диалогов: колонка (компьютер) и шторка (телефон)
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { readTheme, C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset, Spinner, Dot } from "../../ui/base.jsx";

// Подсказки на пустом экране: нажатие отправляет текст как сообщение
export const assistantSuggestions = () => [
  { text: readTheme() === "light" ? "Включи тёмную тему" : "Включи светлую тему", icon: Icon.sparkle },
  { text: "Что у меня сегодня?", icon: Icon.calendar },
  { text: "Какие устройства онлайн?", icon: Icon.phone },
  { text: "Открой файлы", icon: Icon.folder },
];

// tab / setTab — текущий раздел и переход (из NexaApp), devices — устройства,
// onAddDevice — открыть окно добавления устройства, onUploadFiles — выбор файлов
// bell — колокольчик уведомлений (у ассистента своя верхняя строка)
// chats / setChats — диалоги из App: там они сохраняются в браузере и в облаке аккаунта
/* ---------- История диалогов ассистента ----------
   Компьютер — постоянная колонка слева. Телефон — шторка слева на 85% ширины
   с затемнением: закрывается нажатием мимо, крестиком, свайпом влево, Esc и «Назад». */

// Когда в диалоге последний раз писали (мс). У сообщений есть время at;
// у старых диалогов (до появления at) — время последнего изменения
export function chatLastAt(c) {
  const msgs = c.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]?.at) return msgs[i].at;
  return c.updatedAt || c.createdAt || 0;
}

// Закрепление и переименование меняют updatedAt. Чтобы старый диалог без
// времени у сообщений не переехал от этого в «Сегодня», запоминаем прежнее
// время в последнем сообщении
export function keepLastAt(c) {
  const msgs = c.messages || [];
  if (!msgs.length || msgs.some((m) => m?.at)) return c;
  const at = chatLastAt(c);
  return { ...c, messages: msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, at } : m)) };
}

export const HISTORY_GROUPS = [
  ["pinned", "Закреплено"], ["today", "Сегодня"], ["yesterday", "Вчера"],
  ["week", "За 7 дней"], ["month", "За 30 дней"], ["older", "Раньше"],
];

// Раздел по календарным дням (полночь по времени телефона), а не по «24 часам назад»
export function historyGroup(c, now) {
  if (c.pinned) return "pinned";
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(chatLastAt(c))) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "older";
}

export function ChatHistory({ onContinue, chats, setChats, currentChatId, onOpen, onNew, onDelete, mobile, open, onClose, account, sync, onSettings, leaving }) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(null);         // меню диалога: { id, top | bottom, right, confirm }
  const [renaming, setRenaming] = useState(null); // { id, text } — строка превратилась в поле
  const listRef = useRef(null);
  // Свайп влево: насколько панель ушла за пальцем (px, ≤ 0)
  const [dx, setDx] = useState(0);
  const drag = useRef(null);

  // Шторка закрылась — закрываем и меню, и переименование
  useEffect(() => { if (mobile && !open) { setMenu(null); setRenaming(null); } }, [mobile, open]);

  // Esc (и «Назад» на Android): переименование → меню → шторка
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (renaming) return setRenaming(null);
      if (menu) return setMenu(null);
      if (mobile && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renaming, menu, mobile, open]);

  // Меню закрывается нажатием мимо него, прокруткой списка и сменой размера
  useEffect(() => {
    if (!menu) return;
    const off = (e) => { if (!e.target.closest?.(".nx-hist-menu, .nx-hist-more")) setMenu(null); };
    const close = () => setMenu(null);
    const list = listRef.current;
    document.addEventListener("pointerdown", off, true);
    list?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", off, true);
      list?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [menu?.id]);

  // Поиск по названию и по тексту сообщений
  const q = query.trim().toLowerCase();
  const found = !q ? chats : chats.filter((c) =>
    (c.title || "").toLowerCase().includes(q) ||
    (c.messages || []).some((m) => typeof m.text === "string" && m.text.toLowerCase().includes(q)));
  const now = new Date();
  const groups = HISTORY_GROUPS
    .map(([id, label]) => ({
      id, label,
      items: found.filter((c) => historyGroup(c, now) === id).sort((a, b) => chatLastAt(b) - chatLastAt(a)),
    }))
    .filter((g) => g.items.length);

  // Меню рисуется поверх всего (в body), рядом с кнопкой «⋯»; у низа экрана — над ней
  const openMenu = (id, btn) => {
    if (menu?.id === id) return setMenu(null);
    const r = btn.getBoundingClientRect();
    const h = window.visualViewport?.height || window.innerHeight;
    const up = r.bottom + 170 > h;
    setMenu({ id, right: Math.max(8, window.innerWidth - r.right), confirm: false,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };
  const menuChat = menu && chats.find((c) => c.id === menu.id);
  const togglePin = (id) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...keepLastAt(c), pinned: !c.pinned } : c)));
    setMenu(null);
  };
  const startRename = (c) => { setMenu(null); setRenaming({ id: c.id, text: c.title || "" }); };
  const saveRename = () => {
    if (!renaming) return;
    const t = renaming.text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (t) setChats((prev) => prev.map((c) => (c.id === renaming.id && c.title !== t ? { ...keepLastAt(c), title: t } : c)));
    setRenaming(null);
  };

  // Свайп влево по шторке — закрыть. Вертикальное движение — обычная прокрутка списка
  const touch = mobile ? {
    onTouchStart: (e) => { const t = e.touches[0]; drag.current = { x: t.clientX, y: t.clientY, on: null, dx: 0 }; },
    onTouchMove: (e) => {
      const d = drag.current;
      if (!d) return;
      const t = e.touches[0], mx = t.clientX - d.x, my = t.clientY - d.y;
      if (d.on === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        d.on = Math.abs(mx) > Math.abs(my) && mx < 0;
      }
      if (d.on) { d.dx = Math.min(0, mx); setDx(d.dx); }
    },
    onTouchEnd: () => {
      const d = drag.current;
      drag.current = null;
      if (d?.on && d.dx < -60) onClose();
      setDx(0);
    },
  } : {};

  const row = (chat) => {
    const active = chat.id === currentChatId;
    if (renaming?.id === chat.id) {
      return (
        <div key={chat.id} className="nx-hist-row is-active">
          <input
            autoFocus
            className="nx-hist-rename"
            aria-label="Новое название диалога"
            value={renaming.text}
            maxLength={120}
            onChange={(e) => setRenaming({ ...renaming, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveRename(); } }}
            onBlur={saveRename}
            onFocus={(e) => e.target.select()}
          />
        </div>
      );
    }
    return (
      <div key={chat.id} className={`nx-hist-row${active ? " is-active" : ""}`}>
        <button type="button" className="nx-hist-open" aria-current={active ? "true" : undefined}
          onClick={() => onOpen(chat.id)} title={chat.title}>
          {chat.title || "Без названия"}
        </button>
        <button type="button" className="nx-hist-more" aria-label={`Действия с диалогом «${chat.title}»`}
          aria-haspopup="menu" aria-expanded={menu?.id === chat.id}
          onClick={(e) => openMenu(chat.id, e.currentTarget)}>
          {Icon.dots({ c: "currentColor", s: 16 })}
        </button>
      </div>
    );
  };

  const panel = (
    <aside
      className={`nx-hist${mobile ? " nx-hist-drawer" : " nx-hist-col"}${open ? " is-open" : ""}${dx ? " is-dragging" : ""}${leaving ? " is-leaving" : ""}`}
      // На телефоне открытая шторка — окно: «Назад» закроет её через Esc
      role={mobile && open ? "dialog" : undefined}
      aria-modal={mobile && open ? "true" : undefined}
      aria-label="История диалогов"
      aria-hidden={mobile && !open ? "true" : undefined}
      style={mobile && open && dx ? { transform: `translateX(${dx}px)` } : undefined}
      {...touch}
    >
      <div className="nx-hist-head">
        <span className="nx-hist-label">История</span>
        <button type="button" className="nx-hist-close" aria-label={mobile ? "Закрыть историю" : "Скрыть историю"}
          title={mobile ? undefined : "Скрыть историю"} onClick={onClose}>
          {Icon.close({ c: C.text, s: mobile ? 16 : 14 })}
        </button>
      </div>
      <button type="button" className="nx-ghost-btn nx-hist-new" onClick={onNew}>
        {Icon.plus({ c: C.mint, s: 15 })} Новый диалог
      </button>
      <label className="nx-hist-search">
        {Icon.search({ c: C.mutedSoft, s: 14 })}
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по диалогам" aria-label="Поиск по диалогам" enterKeyHint="search" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" style={{ ...btnReset, display: "flex", padding: 2 }}>
            {Icon.close({ c: C.mutedSoft, s: 12 })}
          </button>
        )}
      </label>

      <div ref={listRef} className="nx-scroll nx-hist-list">
        {chats.length === 0 ? (
          <div className="nx-hist-empty">Здесь появятся ваши диалоги</div>
        ) : groups.length === 0 ? (
          <div className="nx-hist-empty">Ничего не нашлось</div>
        ) : groups.map((g) => (
          <section key={g.id} aria-label={g.label} className="nx-hist-section">
            <div className="nx-hist-group">
              {g.id === "pinned" && Icon.pin({ c: C.mint, s: 11 })}
              {g.label}
            </div>
            {g.items.map(row)}
          </section>
        ))}
      </div>

      {/* Синхронизация аккаунта — строкой над аккаунтом, список не перекрывает */}
      {(sync?.loading || sync?.text) && (
        <div className="nx-hist-sync" role="status">
          {sync.loading ? <Spinner s={11} /> : <Dot color={C.red} />}
          <span>{sync.loading ? "Загружаем данные аккаунта…" : sync.text}</span>
          {!sync.loading && sync.onRetry && (
            <button type="button" onClick={sync.onRetry} style={{ ...btnReset, color: C.mint, fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Аккаунт: почта или «Гость» и переход в настройки */}
      <button type="button" className="nx-hist-account" onClick={onSettings} aria-label="Открыть настройки">
        <span className="nx-hist-avatar">{Icon.user({ c: account ? C.mint : C.muted, s: 15 })}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span className="nx-hist-email">{account ? account.email || "Аккаунт" : "Гость"}</span>
          <span className="nx-hist-sub">{account ? "Диалоги в облаке" : "Диалоги только в этом браузере"}</span>
        </span>
        {Icon.gear({ c: C.muted, s: 16 })}
      </button>
    </aside>
  );

  const menuEl = menu && menuChat && createPortal(
    <div className="nx-hist-menu nx-pop" role="menu" aria-label={`Диалог «${menuChat.title}»`}
      style={{ position: "fixed", top: menu.top, bottom: menu.bottom, right: menu.right }}>
      {menu.confirm ? (
        <div style={{ padding: "6px 6px 4px", maxWidth: 220 }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 10 }}>
            Удалить диалог «{menuChat.title}»? Его не получится вернуть.
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" role="menuitem" className="nx-ghost-btn" autoFocus onClick={() => setMenu(null)}
              style={{ ...btnReset, padding: "6px 12px", fontSize: 13, border: `1px solid ${C.borderStrong}`, color: C.text }}>
              Отмена
            </button>
            <button type="button" role="menuitem" className="nx-ghost-btn" onClick={() => { setMenu(null); onDelete(menuChat.id); }}
              style={{ ...btnReset, padding: "6px 12px", fontSize: 13, border: `1px solid color-mix(in srgb, ${C.red} 60%, transparent)`, color: C.red }}>
              Удалить
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" role="menuitem" autoFocus onClick={() => togglePin(menuChat.id)}>
            {Icon.pin({ c: C.mint, s: 14 })} {menuChat.pinned ? "Открепить" : "Закрепить"}
          </button>
          <button type="button" role="menuitem" onClick={() => startRename(menuChat)}>
            {Icon.edit({ c: C.text, s: 14 })} Переименовать
          </button>
          {onContinue && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onContinue(menuChat); }}>
              {Icon.handoff({ c: C.text, s: 14 })} Продолжить на устройстве…
            </button>
          )}
          <button type="button" role="menuitem" className="is-danger" onClick={() => setMenu({ ...menu, confirm: true })}>
            {Icon.trash({ c: C.red, s: 14 })} Удалить
          </button>
        </>
      )}
    </div>,
    document.body,
  );

  // Телефон: шторка и затемнение — в body, поверх нижней панели.
  // Высота — видимая область (над клавиатурой, когда ищем)
  if (mobile) {
    return (
      <>
        {createPortal(
          <>
            <div className={`nx-hist-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
            {panel}
          </>,
          document.body,
        )}
        {menuEl}
      </>
    );
  }
  return <>{panel}{menuEl}</>;
}
