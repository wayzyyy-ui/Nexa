// Экран «Заметки» (открывается из «Сегодня», адрес /notes). Логика и хранение — src/lib/userNotes.js,
// запись и синхронизация — notesApi в NexaApp. Здесь — список, поиск, теги и архив, редактор с автосохранением.
// Компьютер: список слева, редактор справа. Телефон: список; редактор — на весь экран поверх.
// Редактор — role="dialog": «Назад» браузера / Android и Esc закрывают его, а не весь экран.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, T, fontDisplay, PHONE_MQ } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { btnReset, EmptyState } from "../ui/base.jsx";
import { Crumb } from "../ui/layout.jsx";
import { FoldArt } from "../ui/backdrop.jsx";
import { useMediaQuery } from "../lib/hooks.js";
import { newId } from "../lib/sync.js";
import {
  sortNotes, searchNotes, filterNotes, allTags, noteTitle, notePreview, noteWhen, checklistStats,
} from "../lib/userNotes.js";
import { purgeNoteImages } from "../lib/noteImages.js";
import { NoteEditor } from "./notes/NoteEditor.jsx";
import { ghost, primary, chip, readOpen, writeOpen } from "./notes/shared.js";

/* request — открыть редактор сразу: { create: true, n } (быстрые действия) или { id, n } (глобальный поиск);
   n — метка нажатия, чтобы та же просьба второй раз тоже сработала */
export function ScreenNotes({ notes, api, uid, onBack, request, schedule = [], onAddSchedule, toast, onAskAi }) {
  const phone = useMediaQuery(PHONE_MQ);
  const screenRef = useRef(null);
  const backRef = useRef(onBack); backRef.current = onBack;
  /* Телефон: смахнуть список заметок вправо — назад в «Сегодня» (как «← Сегодня»). Экран едет за пальцем;
     дальше трети ширины или быстрый флик — уезжает, иначе возвращается. Не мешаем: поля ввода, ряды,
     которые листаются вбок (data-no-swipe), меню, 24 px у левого края (там системный «Назад»).
     Открытая заметка — свой экран поверх (у неё своё смахивание), сюда её касания не доходят */
  useEffect(() => {
    const el = screenRef.current;
    if (!phone || !el) return;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    let g = null;
    const reset = () => { el.style.transition = "transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 220ms ease"; el.style.transform = ""; el.style.opacity = ""; };
    const down = (e) => {
      g = null;
      const t = e.touches[0];
      // Жест — по всему экрану (не только по списку: заметок может быть мало, ниже — пустое место),
      // кроме открытой заметки, окон, нижней панели и того, что листается вбок
      if (e.touches.length !== 1 || t.clientX < 24 || document.querySelector(".nx-notepad-editor")
        || e.target.closest?.('input, textarea, select, [data-no-swipe], [role="menu"], [role="dialog"], .nx-viewer, .nx-tabbar-pill, .nx-notepad-fab')) return;
      g = { x: t.clientX, y: t.clientY, at: performance.now(), dx: 0, axis: null };
    };
    const move = (e) => {
      if (!g) return;
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) g.axis = dx > 0 && dx > Math.abs(dy) * 1.5 ? "x" : "y";
      if (g.axis !== "x") return;
      g.dx = Math.max(0, dx);
      if (still()) return;
      el.style.transition = "none";
      el.style.transform = `translateX(${g.dx}px)`;
      el.style.opacity = String(1 - Math.min(0.4, g.dx / el.offsetWidth / 1.5));
    };
    const up = () => {
      const s0 = g; g = null;
      if (!s0 || s0.axis !== "x") return;
      const w = el.offsetWidth || innerWidth, fast = s0.dx > 50 && s0.dx / Math.max(1, performance.now() - s0.at) > 0.5;
      if (s0.dx > w / 3 || fast) {
        if (still()) { backRef.current(); return; }
        el.style.transition = "transform 200ms cubic-bezier(0.4, 0, 1, 1), opacity 200ms ease";
        el.style.transform = `translateX(${w}px)`; el.style.opacity = "0";
        setTimeout(() => backRef.current(), 190);
      } else reset();
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", up, { passive: true });
    return () => { document.removeEventListener("touchstart", down); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", up); document.removeEventListener("touchcancel", up); };
  }, [phone]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("active"); // "active" | "archive"
  const [tag, setTag] = useState(null);       // фильтр по тегу
  const [open, setOpen] = useState(() => {    // { id, isNew } — открытая заметка
    if (request?.create) return { id: newId(), isNew: true };
    const id = request?.id || readOpen();
    return id && notes.some((n) => n.id === id) ? { id } : null;
  });
  /* Порядок списка: свежие сверху. Но пока заметка открыта, он «замораживается»: иначе правка поднимала бы её наверх,
     весь список сдвигался на одну строку и следующее нажатие попадало бы уже в другую заметку.
     Закрыли заметку — список снова расставляется по времени изменения. Новые заметки встают наверх сразу */
  const [frozen, setFrozen] = useState(null);
  const editing = !!open;
  useEffect(() => { setFrozen(editing ? sortNotes(notes).map((n) => n.id) : null); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => {
    const live = sortNotes(notes);
    if (!frozen) return live;
    const at = new Map(frozen.map((id, i) => [id, i]));
    const fresh = live.filter((n) => !at.has(n.id));
    const kept = live.filter((n) => at.has(n.id)).sort((a, b) => (!!b.pinned - !!a.pinned) || at.get(a.id) - at.get(b.id));
    return [...fresh, ...kept];
  }, [notes, frozen]);
  const tags = useMemo(() => allTags(notes), [notes]);
  const archivedCount = useMemo(() => notes.filter((n) => n.archived).length, [notes]);
  const found = useMemo(() => searchNotes(filterNotes(sorted, { view, tag }), query), [sorted, view, tag, query]);
  const pinned = view === "active" ? found.filter((n) => n.pinned) : [];
  const rest = view === "active" ? found.filter((n) => !n.pinned) : found;
  const openNote = open && notes.find((n) => n.id === open.id);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  // Новая просьба открыть (экран уже был открыт)
  const lastReq = useRef(request?.n);
  useEffect(() => {
    if (!request || request.n === lastReq.current) return;
    lastReq.current = request.n;
    if (request.create) setOpen({ id: newId(), isNew: true });
    else if (request.id) setOpen({ id: request.id });
  }, [request]);
  // Открытая из поиска заметка в архиве — показываем архив, чтобы она была видна и в списке
  useEffect(() => { if (openNote) setView(openNote.archived ? "archive" : "active"); }, [open?.id, openNote?.archived]);
  // Запоминаем открытую (только существующую — пустая новая после перезагрузки не нужна)
  // (при уходе с экрана не стираем: экран может собраться заново при запуске — тогда заметка открылась бы не та)
  useEffect(() => { writeOpen(openNote ? openNote.id : null); }, [openNote?.id]);
  // Тег пропал (убрали у всех заметок) — фильтр снимается сам
  useEffect(() => { if (tag && !tags.some((t) => t.tag.toLowerCase() === tag.toLowerCase())) setTag(null); }, [tags, tag]);
  // В архиве пусто — обратно к списку
  useEffect(() => { if (view === "archive" && !archivedCount && !open) setView("active"); }, [view, archivedCount, open]);
  // Esc без открытой заметки — назад в «Сегодня» (заметку закрывает сам редактор)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"], [role="menu"]')) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  // Заметку удалили на другом устройстве, пока она была открыта и не правилась здесь — закрываем
  useEffect(() => { if (open && !open.isNew && !openNote) setOpen(null); }, [open, openNote]);

  const create = () => { setView("active"); setOpen({ id: newId(), isNew: true }); };
  const empty = !notes.length;
  const filtered = view === "archive" || !!tag;

  // В архив / из архива — с «Вернуть» во всплывающем
  const archive = (n, on) => {
    const r = api.save(n.id, on ? { archived: true, pinned: false } : { archived: false });
    if (!r.ok) { toast?.({ title: "Не получилось", text: "Браузер не сохранил изменение — попробуйте ещё раз", kind: "error" }); return false; }
    toast?.({
      title: on ? "Заметка в архиве" : "Заметка вернулась в список", text: noteTitle(n),
      action: { label: on ? "Вернуть" : "В архив", onClick: () => api.save(n.id, on ? { archived: false } : { archived: true, pinned: false }) },
    });
    return true;
  };

  const card = (n) => (
    <NoteCard key={n.id} note={n} active={open?.id === n.id} archived={view === "archive"} onOpen={() => setOpen({ id: n.id })}
      onPin={() => api.save(n.id, { pinned: !n.pinned })} onArchive={() => archive(n, !n.archived)}
      onDelete={() => {
        const r = api.remove(n.id);
        if (!r?.ok) { toast?.({ title: "Не получилось удалить", text: "Браузер не сохранил изменение — попробуйте ещё раз", kind: "error" }); return; }
        purgeNoteImages(uid, uid || "guest", n.images); // картинки удалённой заметки — тоже
        if (open?.id === n.id) setOpen(null);
        toast?.({ title: "Заметка удалена", text: noteTitle(n) });
      }}
      onTag={(t) => { setView("active"); setTag(t); }} />
  );
  const list = (
    <div className={`nx-notepad-list${phone ? "" : " nx-scroll"}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, alignContent: "start" }}>
      {pinned.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "2px 4px 0" }}>Закреплённые</div>}
      {pinned.map(card)}
      {pinned.length > 0 && rest.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "8px 4px 0" }}>Остальные</div>}
      {rest.map(card)}
    </div>
  );

  const editor = open && (
    <NoteEditor key={open.id} id={open.id} note={openNote} isNew={open.isNew && !openNote} phone={phone}
      api={api} uid={uid} knownTags={tags} schedule={schedule} onAddSchedule={onAddSchedule}
      onArchive={archive} onClose={() => setOpen(null)} onAskAi={onAskAi} toast={toast} />
  );

  // Пусто после фильтров и поиска — почему и как вернуть
  const nothing = query.trim()
    ? { title: `Ничего не нашлось по «${query.trim()}»`, text: "Поиск идёт по заголовкам, тексту и тегам", label: "Сбросить поиск", reset: () => setQuery("") }
    : view === "archive" ? { title: "В архиве пусто", text: "Сюда попадают заметки, которые убрали из списка, но не удалили", label: "К заметкам", reset: () => setView("active") }
    : tag ? { title: `Нет заметок с тегом «${tag}»`, text: "Тег могли убрать или заметки ушли в архив", label: "Все заметки", reset: () => setTag(null) }
    : { title: "Все заметки в архиве", text: "Откройте архив, чтобы вернуть нужные, или создайте новую", label: "Открыть архив", reset: () => setView("archive") };

  // Фильтры: все / по тегу / архив. Ряд листается вбок (свайп разделов здесь не срабатывает)
  const filters = (
    <div className="nx-notepad-filters nx-scroll" data-no-swipe role="group" aria-label="Фильтр заметок"
      style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16, scrollbarWidth: "none" }}>
      <button type="button" style={chip(!filtered)} aria-pressed={!filtered} onClick={() => { setView("active"); setTag(null); }}>Все</button>
      {tags.map((t) => {
        const on = view === "active" && tag?.toLowerCase() === t.tag.toLowerCase();
        return (
          <button key={t.tag} type="button" style={chip(on)} aria-pressed={on} onClick={() => { setView("active"); setTag(on ? null : t.tag); }}>
            #{t.tag} <span style={{ color: on ? C.mint : C.mutedSoft }}>{t.count}</span>
          </button>
        );
      })}
      {archivedCount > 0 && (
        <button type="button" style={chip(view === "archive")} aria-pressed={view === "archive"} onClick={() => { setTag(null); setView(view === "archive" ? "active" : "archive"); }}>
          {Icon.archive({ c: view === "archive" ? C.mint : C.muted, s: 14 })} Архив <span style={{ color: view === "archive" ? C.mint : C.mutedSoft }}>{archivedCount}</span>
        </button>
      )}
    </div>
  );

  // Поиск по заметкам. На компьютере — таблетка рядом с «Добавить заметку» (макет 2026-10)
  const search = (
    <label className="nx-notepad-search"
      onMouseDown={(e) => { if (e.target.tagName !== "INPUT" && !e.target.closest("button")) { e.preventDefault(); e.currentTarget.querySelector("input")?.focus(); } }}
      style={phone ? {
      display: "flex", alignItems: "center", gap: 10, maxWidth: 560, padding: "0 16px", height: 44, boxSizing: "border-box",
      border: `1px solid ${C.lineBright}`, borderRadius: 999, marginBottom: 12,
    } : {
      display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, padding: "0 18px", boxSizing: "border-box",
      border: `1px solid ${C.lineBright}`, borderRadius: 999,
    }}>
      {Icon.search({ c: C.muted, s: 16 })}
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={phone ? "Поиск по заметкам и тегам" : "Поиск"}
        aria-label="Поиск по заметкам и тегам" className="nx-notepad-search-input nx-search-word"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontFamily: "inherit" }} />
      {query && (
        <button type="button" onClick={() => setQuery("")} aria-label="Сбросить поиск" style={{ ...btnReset, display: "flex" }}>
          {Icon.close({ c: C.muted, s: 14 })}
        </button>
      )}
    </label>
  );

  return (
    <div ref={screenRef} className="ng-screen nx-notepad" style={phone ? { padding: "28px 40px 40px", textAlign: "left" } : { textAlign: "left" }}>
      {phone ? (
        <>
          <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Сегодня</Crumb>
          <div className="nx-notepad-head" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: "24px 0 20px" }}>
            <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1, flex: "1 1 auto" }}>Заметки</div>
          </div>
          {!empty && search}
        </>
      ) : (
        // Компьютер (макет): «Назад» и заголовок в одну строку с верхней строкой (поиск, часы…)
        <div className="nx-notepad-top">
          <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
          <div className="ng-display nx-page-title nx-notepad-title" style={{ fontWeight: 500, lineHeight: 1.1 }}>Заметки</div>
        </div>
      )}

      {!phone ? (
        /* Компьютер: слева — поиск + «Добавить заметку», фильтры, «Все заметки» и список;
           справа — открытая заметка (или подсказка) от строки поиска до низа окна */
        <div className="nx-notepad-body nx-notepad-desk">
          {/* Складка за «стеклянной» панелью заметки (макет 2026-10): видна сквозь неё синим светом */}
          <div className="nx-notepad-fold" aria-hidden="true"><FoldArt /></div>
          <div className="nx-notepad-side" style={{ minWidth: 0 }}>
            <div className="nx-notepad-tools">
              {search}
              <button type="button" className="nx-primary nx-notepad-add" onClick={create}>Добавить заметку</button>
            </div>
            {!empty && (tags.length > 0 || archivedCount > 0) && filters}
            <div className="ng-display nx-notepad-subtitle">{view === "archive" ? "Архив" : tag ? `#${tag}` : "Все заметки"}</div>
            {empty ? (
              <div className="nx-notepad-card nx-notepad-none" style={{ border: `1px solid ${C.lineBright}` }}>
                <EmptyState compact title="Заметок пока нет"
                  text={uid ? "Списки, мысли и планы — сохранятся в аккаунте и будут на всех ваших устройствах" : "Списки, мысли и планы — сохранятся в этом браузере. Войдите в аккаунт, чтобы они были на всех устройствах"} />
              </div>
            ) : (
              <>
                {view === "archive" && found.length > 0 && (
                  <div style={{ fontSize: 13, color: C.muted, margin: "0 4px 12px", lineHeight: 1.5 }}>Архив: заметок нет в общем списке, но они не удалены — откройте, чтобы вернуть</div>
                )}
                {found.length ? list : (
                  <div className="nx-notepad-card nx-notepad-none" style={{ border: `1px solid ${C.lineBright}` }}>
                    <EmptyState compact title={nothing.title} text={nothing.text}
                      action={<button type="button" className="nx-ghost-btn" onClick={nothing.reset} style={ghost}>{nothing.label}</button>} />
                  </div>
                )}
              </>
            )}
          </div>
          {editor || (
            <div className="nx-notepad-placeholder nx-notepad-panel nx-glass nx-glass-subtle" style={{
              border: `1px solid ${C.lineBright}`, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.mutedSoft, fontSize: 14, textAlign: "center", padding: 24, boxSizing: "border-box",
            }}>{empty ? "Здесь откроется заметка" : "Выберите заметку слева или создайте новую"}</div>
          )}
        </div>
      ) : (<>
      {/* Телефон: фильтры, список (редактор — поверх всего, см. ниже) */}
      {!empty && (tags.length > 0 || archivedCount > 0) && filters}

      {empty && !open ? (
        <div style={{ border: `1px solid ${C.lineBright}`, borderRadius: 32, maxWidth: 640 }}>
          <EmptyState title="Заметок пока нет"
            text={uid ? "Списки, мысли и планы — сохранятся в аккаунте и будут на всех ваших устройствах" : "Списки, мысли и планы — сохранятся в этом браузере. Войдите в аккаунт, чтобы они были на всех устройствах"}
            action={<button type="button" className="nx-primary" onClick={create} style={primary}>{Icon.plus({ c: C.onFold, s: 16 })} Создать первую заметку</button>} />
        </div>
      ) : (
        <div className="nx-notepad-body" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
          <div>
            {view === "archive" && found.length > 0 && (
              <div style={{ fontSize: 13, color: C.muted, margin: "0 4px 12px", lineHeight: 1.5 }}>Архив: заметок нет в общем списке, но они не удалены — откройте, чтобы вернуть</div>
            )}
            {found.length ? list : (
              <div style={{ border: `1px solid ${C.lineBright}`, borderRadius: 24 }}>
                <EmptyState compact title={nothing.title} text={nothing.text}
                  action={<button type="button" className="nx-ghost-btn" onClick={nothing.reset} style={ghost}>{nothing.label}</button>} />
              </div>
            )}
          </div>
        </div>
      )}
      </>)}
      {/* Телефон: создать — круглая кнопка над нижней панелью (заголовок не тесним, панель не трогаем) */}
      {/* В body, а не внутри экрана: у экрана при открытии анимация со сдвигом — «закреплённая»
          кнопка ехала бы вместе с ним и на миг оказывалась выше своего места */}
      {phone && !empty && !open && createPortal(
        <button type="button" className="nx-primary nx-notepad-fab" onClick={create} aria-label="Новая заметка" style={{
          ...btnReset, position: "fixed", right: 16, bottom: "calc(var(--sab) + 88px)", zIndex: 30, width: 56, height: 56, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid transparent",
          background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        }}>{Icon.plus({ c: C.onFold, s: 22 })}</button>,
        document.body,
      )}
      {/* На телефоне редактор — поверх всего (и нижней панели), в body: у экрана есть анимация с transform */}
      {phone && editor && createPortal(editor, document.body)}
    </div>
  );
}

// Карточка заметки в списке: заголовок, фрагмент, теги, чек-лист, дата изменения; булавка — закрепить / открепить
/* Карточка заметки в списке: заголовок (булавка — закреплена), фрагмент, теги, чек-лист, дата изменения.
   Справа «…» — меню (макет 2026-10): закрепить / открепить, в архив / вернуть, удалить (с подтверждением) */
function NoteCard({ note, active, archived, onOpen, onPin, onArchive, onDelete, onTag }) {
  const preview = notePreview(note);
  const check = checklistStats(note.text);
  const tags = note.tags || [];
  const [menu, setMenu] = useState(false);
  const [sure, setSure] = useState(false); // «Удалить?» — второй шаг в меню
  const box = useRef(null);
  // Меню закрывается по Esc и нажатию мимо
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); setSure(false); } };
    const onDown = (e) => { if (!box.current?.contains(e.target)) { setMenu(false); setSure(false); } };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown); };
  }, [menu]);
  const item = { ...btnReset, display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 12, fontSize: 14, color: C.text, textAlign: "left" };
  const pick = (fn) => () => { setMenu(false); setSure(false); fn(); };
  return (
    <div ref={box} className="nx-notepad-card nx-glass nx-glass-subtle" data-active={active ? "1" : "0"} style={{
      position: "relative", border: `1px solid ${active ? C.mint : C.lineBright}`, borderRadius: 24,
      background: active ? `color-mix(in srgb, ${C.mint} 9%, transparent)` : "transparent", transition: "border-color 160ms ease, background-color 160ms ease",
    }}>
      <button type="button" onClick={onOpen} className="nx-notepad-open" style={{ ...btnReset, display: "block", width: "100%", textAlign: "left", padding: `16px 56px ${tags.length ? 8 : 16}px 20px`, boxSizing: "border-box" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {note.pinned && !archived && <span aria-label="Закреплена" title="Закреплена" style={{ display: "flex", flexShrink: 0 }}>{Icon.pin({ c: C.mint, s: 14 })}</span>}
          <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{noteTitle(note)}</span>
        </span>
        {preview && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13, color: C.muted, lineHeight: 1.45, marginTop: 6 }}>{preview}</span>}
        <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: C.mutedSoft, marginTop: 8 }}>
          <span>Изменено {noteWhen(note.updatedAt)}</span>
          {(note.images || []).length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{Icon.image({ c: C.mutedSoft, s: 12 })} {note.images.length}</span>}
          {check.total > 0 && <span style={{ color: check.done === check.total ? C.green : C.mutedSoft }}>☑ {check.done} из {check.total}</span>}
        </span>
      </button>
      {tags.length > 0 && (
        <div className="nx-notepad-ctags" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 20px 14px" }}>
          {tags.slice(0, 5).map((t) => (
            <button key={t} type="button" onClick={() => onTag(t)} title={`Показать заметки с тегом «${t}»`}
              style={{ ...btnReset, fontSize: 12, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px" }}>#{t}</button>
          ))}
          {tags.length > 5 && <span style={{ fontSize: 12, color: C.mutedSoft, alignSelf: "center" }}>+{tags.length - 5}</span>}
        </div>
      )}
      <button type="button" className="nx-icon-btn nx-notepad-more" onClick={() => { setMenu((v) => !v); setSure(false); }} aria-haspopup="menu" aria-expanded={menu}
        aria-label={`Действия с заметкой «${noteTitle(note)}»`} title="Ещё"
        style={{ ...btnReset, position: "absolute", top: "50%", right: 14, transform: "translateY(-50%)", width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          background: `color-mix(in srgb, ${C.text} ${menu ? 14 : 8}%, transparent)` }}>
        {Icon.dots({ c: C.muted, s: 14 })}
      </button>
      {menu && (
        <div role="menu" aria-label={`Заметка «${noteTitle(note)}»`} className="nx-pop" style={{
          position: "absolute", top: "calc(50% + 20px)", right: 10, zIndex: 20, minWidth: 210, padding: 6, boxSizing: "border-box",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18, boxShadow: `0 12px 32px color-mix(in srgb, ${C.bg} 60%, transparent)`,
        }}>
          {sure ? (
            <div style={{ padding: "6px 8px", display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>Удалить заметку? Вернуть нельзя</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" role="menuitem" className="nx-ghost-btn" onClick={() => setSure(false)} style={ghost}>Отмена</button>
                <button type="button" role="menuitem" className="nx-ghost-btn" onClick={pick(onDelete)} style={{ ...ghost, border: `1px solid ${C.red}`, color: C.red }}>Удалить</button>
              </div>
            </div>
          ) : (
            <>
              {!archived && (
                <button type="button" role="menuitem" className="nx-row-btn" onClick={pick(onPin)} style={item}>
                  {Icon.pin({ c: note.pinned ? C.mint : C.muted, s: 15 })} {note.pinned ? "Открепить" : "Закрепить"}
                </button>
              )}
              <button type="button" role="menuitem" className="nx-row-btn" onClick={pick(onArchive)} style={item}>
                {Icon.archive({ c: C.muted, s: 15 })} {archived ? "Вернуть из архива" : "В архив"}
              </button>
              <button type="button" role="menuitem" className="nx-row-btn" onClick={() => setSure(true)} style={{ ...item, color: C.red }}>
                {Icon.trash({ c: C.red, s: 15 })} Удалить
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
