// Экран «Заметки» (открывается из «Сегодня», адрес /notes). Логика и хранение — src/lib/userNotes.js,
// запись и синхронизация — notesApi в NexaApp. Здесь — список, поиск, редактор с автосохранением.
// Компьютер: список слева, редактор справа. Телефон: список; редактор — на весь экран поверх.
// Редактор — role="dialog": «Назад» браузера / Android и Esc закрывают его, а не весь экран.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, T, fontDisplay, PHONE_MQ } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { btnReset, EmptyState } from "../ui/base.jsx";
import { Crumb } from "../ui/layout.jsx";
import { useMediaQuery } from "../lib/hooks.js";
import { newId } from "../lib/sync.js";
import { sortNotes, searchNotes, noteTitle, notePreview, noteWhen, isBlank, saveState, NOTE_TITLE_MAX, NOTE_TEXT_MAX } from "../lib/userNotes.js";

const SAVE_DELAY_MS = 600; // пауза в наборе — и записываем

const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap" };
const primary = { ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, border: "1px solid transparent", fontWeight: 500 };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const round = { ...btnReset, width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export function ScreenNotes({ notes, api, uid, online, sync, onBack }) {
  const phone = useMediaQuery(PHONE_MQ);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null); // { id, isNew } — открытая заметка
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const found = useMemo(() => searchNotes(sorted, query), [sorted, query]);
  const pinned = found.filter((n) => n.pinned), rest = found.filter((n) => !n.pinned);
  const openNote = open && notes.find((n) => n.id === open.id);

  useEffect(() => { window.scrollTo(0, 0); }, []);
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

  const create = () => setOpen({ id: newId(), isNew: true });
  const empty = !notes.length;

  const list = (
    <div className="nx-notepad-list" style={{ display: "grid", gap: 10, alignContent: "start" }}>
      {pinned.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "2px 4px 0" }}>Закреплённые</div>}
      {pinned.map((n) => <NoteCard key={n.id} note={n} active={open?.id === n.id} onOpen={() => setOpen({ id: n.id })} onPin={() => api.save(n.id, { pinned: false })} />)}
      {pinned.length > 0 && rest.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "8px 4px 0" }}>Остальные</div>}
      {rest.map((n) => <NoteCard key={n.id} note={n} active={open?.id === n.id} onOpen={() => setOpen({ id: n.id })} onPin={() => api.save(n.id, { pinned: true })} />)}
    </div>
  );

  const editor = open && (
    <NoteEditor key={open.id} id={open.id} note={openNote} isNew={open.isNew && !openNote} phone={phone}
      api={api} uid={uid} online={online} sync={sync} onClose={() => setOpen(null)} />
  );

  return (
    <div className="ng-screen nx-notepad" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 1240 }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Сегодня</Crumb>

      <div className="nx-notepad-head" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: "24px 0 20px" }}>
        <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1, flex: "1 1 auto" }}>Заметки</div>
        <button type="button" className="nx-primary" onClick={create} style={primary}>
          {Icon.plus({ c: C.onFold, s: 16 })} Новая заметка
        </button>
      </div>

      {!empty && (
        <label className="nx-notepad-search" style={{
          display: "flex", alignItems: "center", gap: 10, maxWidth: 560, padding: "0 16px", height: 44, boxSizing: "border-box",
          border: `1px solid ${C.lineBright}`, borderRadius: 999, marginBottom: 20,
        }}>
          {Icon.search({ c: C.muted, s: 16 })}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по заметкам"
            aria-label="Поиск по заметкам" className="nx-notepad-search-input"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontFamily: "inherit" }} />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Сбросить поиск" style={{ ...btnReset, display: "flex" }}>
              {Icon.close({ c: C.muted, s: 14 })}
            </button>
          )}
        </label>
      )}

      {empty && !open ? (
        <div style={{ border: `1px solid ${C.lineBright}`, borderRadius: 32, maxWidth: 640 }}>
          <EmptyState title="Заметок пока нет"
            text={uid ? "Списки, мысли и планы — сохранятся в аккаунте и будут на всех ваших устройствах" : "Списки, мысли и планы — сохранятся в этом браузере. Войдите в аккаунт, чтобы они были на всех устройствах"}
            action={<button type="button" className="nx-primary" onClick={create} style={primary}>{Icon.plus({ c: C.onFold, s: 16 })} Создать первую заметку</button>} />
        </div>
      ) : (
        <div className="nx-notepad-body" style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(260px, 380px) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
          <div>
            {found.length ? list : (
              <div style={{ border: `1px solid ${C.lineBright}`, borderRadius: 24 }}>
                <EmptyState compact title={`Ничего не нашлось по «${query.trim()}»`} text="Поиск идёт по заголовкам и тексту заметок"
                  action={<button type="button" className="nx-ghost-btn" onClick={() => setQuery("")} style={ghost}>Сбросить поиск</button>} />
              </div>
            )}
          </div>
          {!phone && (editor || (
            <div className="nx-notepad-placeholder" style={{
              border: `1px dashed ${C.borderStrong}`, borderRadius: 32, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.mutedSoft, fontSize: 14, textAlign: "center", padding: 24,
            }}>Выберите заметку слева или создайте новую</div>
          ))}
        </div>
      )}
      {/* На телефоне редактор — поверх всего (и нижней панели), в body: у экрана есть анимация с transform */}
      {phone && editor && createPortal(editor, document.body)}
    </div>
  );
}

// Карточка заметки в списке: заголовок, фрагмент, дата изменения; булавка — закрепить / открепить
function NoteCard({ note, active, onOpen, onPin }) {
  const preview = notePreview(note);
  return (
    <div className="nx-notepad-card" data-active={active ? "1" : "0"} style={{
      position: "relative", border: `1px solid ${active ? C.mint : C.lineBright}`, borderRadius: 24,
      background: active ? `color-mix(in srgb, ${C.mint} 6%, transparent)` : "transparent", transition: "border-color 160ms ease",
    }}>
      <button type="button" onClick={onOpen} className="nx-notepad-open" style={{ ...btnReset, display: "block", width: "100%", textAlign: "left", padding: "16px 56px 16px 20px", boxSizing: "border-box" }}>
        <span style={{ display: "block", fontFamily: fontDisplay, fontSize: 16, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{noteTitle(note)}</span>
        {preview && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13, color: C.muted, lineHeight: 1.45, marginTop: 6 }}>{preview}</span>}
        <span style={{ display: "block", fontSize: 12, color: C.mutedSoft, marginTop: 8 }}>Изменено {noteWhen(note.updatedAt)}</span>
      </button>
      <button type="button" className="nx-icon-btn" onClick={onPin} aria-pressed={!!note.pinned}
        aria-label={note.pinned ? "Открепить заметку" : "Закрепить заметку"} title={note.pinned ? "Открепить" : "Закрепить"}
        style={{ ...btnReset, position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${note.pinned ? C.mint : "transparent"}` }}>
        {Icon.pin({ c: note.pinned ? C.mint : C.mutedSoft, s: 15 })}
      </button>
    </div>
  );
}

/* Редактор. Набранное живёт здесь (черновик) и записывается через паузу SAVE_DELAY_MS,
   при закрытии, при уходе со страницы и в фон — всегда последней версией (без гонок:
   запись синхронная, в облако уходит весь список через useCloudList, последним правкам не мешает).
   Новая пустая заметка не создаётся. Подпись состояния — saveState (только то, что правда случилось) */
function NoteEditor({ id, note, isNew, phone, api, uid, online, sync, onClose }) {
  const [title, setTitle] = useState(note?.title || "");
  const [text, setText] = useState(note?.text || "");
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(null); // null | "local" | "full"
  const [confirmDel, setConfirmDel] = useState(false);
  const draft = useRef({ title, text });
  const saved = useRef({ title: note?.title || "", text: note?.text || "" });
  const timer = useRef(null);
  const textRef = useRef(null);
  const removed = useRef(false); // удалили — больше ничего не записываем (иначе заметка вернулась бы)
  const confirmDelRef = useRef(false); confirmDelRef.current = confirmDel;

  // Записать черновик сейчас. true — записано (или нечего записывать)
  const commit = () => {
    clearTimeout(timer.current);
    if (removed.current) return true;
    const d = draft.current;
    if (d.title === saved.current.title && d.text === saved.current.text) { setDirty(false); return true; }
    if (isNew && !note && isBlank(d)) { setDirty(false); return true; } // пустую новую не создаём
    const r = api.save(id, { title: d.title, text: d.text });
    if (r.ok) { saved.current = { ...d }; setDirty(false); setFailed(null); return true; }
    setFailed(r.full ? "full" : "local");
    return false;
  };
  const commitRef = useRef(commit); commitRef.current = commit;

  const change = (patch) => {
    draft.current = { ...draft.current, ...patch };
    if ("title" in patch) setTitle(patch.title);
    if ("text" in patch) setText(patch.text);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current(), SAVE_DELAY_MS);
  };

  // Уход со страницы, сворачивание, закрытие редактора — записываем сразу
  useEffect(() => {
    const flush = () => commitRef.current();
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, []);

  // Заметку изменили на другом устройстве, а здесь ничего не набрано — показываем новую версию
  useEffect(() => {
    if (!note || dirty) return;
    if (note.title !== saved.current.title || note.text !== saved.current.text) {
      saved.current = { title: note.title, text: note.text };
      draft.current = { ...saved.current };
      setTitle(note.title); setText(note.text);
    }
  }, [note?.title, note?.text]);

  // Новая заметка — сразу печатать заголовок (на телефоне без этого не появится клавиатура)
  const titleRef = useRef(null);
  useEffect(() => { if (isNew) titleRef.current?.focus(); }, []);

  // Закрыть: сначала записать; не записалось — остаёмся, чтобы текст не пропал
  const close = () => { if (commitRef.current()) onClose(); };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirmDelRef.current) { setConfirmDel(false); e.stopPropagation(); return; }
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const exists = !!note;
  const st = failed === "full"
    ? { kind: "error", text: "Больше 1000 заметок не помещается — удалите ненужные", retry: null }
    : saveState({ dirty, localFailed: failed === "local", uid, online, sync });
  const shown = !exists && isBlank({ title, text }) ? { kind: "idle", text: "Начните печатать — заметка сохранится сама" } : st;
  const dotColor = { error: C.red, saving: C.muted, offline: C.muted, local: C.green, cloud: C.green, idle: C.mutedSoft }[shown.kind];

  const togglePin = () => { if (commit() && exists) api.save(id, { pinned: !note.pinned }); };
  const remove = () => {
    clearTimeout(timer.current);
    removed.current = true;
    if (!exists) { onClose(); return; }
    const r = api.remove(id);
    if (r.ok) onClose(); else { removed.current = false; setFailed("local"); }
  };

  return (
    <div role="dialog" aria-modal={phone || undefined} aria-label={exists ? `Заметка «${title.trim() || "Без названия"}»` : "Новая заметка"}
      className={`nx-notepad-editor${phone ? " is-phone nx-pop" : ""}`} data-no-swipe
      style={phone ? {
        position: "fixed", inset: 0, zIndex: 250, background: C.bg, display: "flex", flexDirection: "column",
        padding: "calc(var(--sat) + 12px) 16px calc(var(--sab) + 12px)", boxSizing: "border-box",
      } : {
        border: `1px solid ${C.lineBright}`, borderRadius: 32, padding: "18px 24px 22px", display: "flex", flexDirection: "column",
        minHeight: 420, boxSizing: "border-box", position: "sticky", top: 100,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button type="button" className="nx-icon-btn" onClick={close} aria-label={phone ? "К списку заметок" : "Закрыть заметку"} style={round}>
          {phone ? Icon.arrowLeft({ c: C.text, s: 16 }) : Icon.close({ c: C.text, s: 15 })}
        </button>
        <div role="status" aria-live="polite" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: shown.kind === "error" ? C.red : C.muted }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>{shown.text}</span>
          {shown.retry && (
            <button type="button" className="nx-link-btn" onClick={() => (shown.retry === "local" ? commit() : api.retry())}
              style={{ ...btnReset, fontSize: 12, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3, flexShrink: 0 }}>Повторить</button>
          )}
        </div>
        <button type="button" className="nx-icon-btn" onClick={togglePin} disabled={!exists} aria-pressed={!!note?.pinned}
          aria-label={note?.pinned ? "Открепить заметку" : "Закрепить заметку"} title={note?.pinned ? "Открепить" : "Закрепить"}
          style={{ ...round, borderColor: note?.pinned ? C.mint : C.borderStrong, opacity: exists ? 1 : 0.4 }}>
          {Icon.pin({ c: note?.pinned ? C.mint : C.text, s: 15 })}
        </button>
        <button type="button" className="nx-icon-btn" onClick={() => setConfirmDel(true)} aria-label="Удалить заметку" title="Удалить" style={round}>
          {Icon.trash({ c: C.text, s: 15 })}
        </button>
      </div>

      {confirmDel && (
        <div role="alertdialog" aria-label="Удалить заметку?" className="nx-pop" style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", marginBottom: 14,
          border: `1px solid ${C.red}`, borderRadius: 18, fontSize: 14,
        }}>
          <span style={{ flex: "1 1 200px" }}>{exists ? "Удалить заметку? На всех устройствах, вернуть нельзя" : "Убрать эту заметку?"}</span>
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghost}>Отмена</button>
          <button type="button" className="nx-ghost-btn" onClick={remove} style={{ ...ghost, border: `1px solid ${C.red}`, color: C.red }}>Удалить</button>
        </div>
      )}

      <input ref={titleRef} value={title} maxLength={NOTE_TITLE_MAX} placeholder="Заголовок" aria-label="Заголовок заметки"
        onChange={(e) => change({ title: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); textRef.current?.focus(); } }}
        style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: fontDisplay, fontSize: phone ? 22 : 26, fontWeight: 500, padding: "4px 0 10px", width: "100%" }} />
      <textarea ref={textRef} value={text} maxLength={NOTE_TEXT_MAX} placeholder="Текст заметки" aria-label="Текст заметки"
        onChange={(e) => change({ text: e.target.value })} className="nx-scroll"
        style={{ flex: 1, minHeight: phone ? 0 : 300, resize: "none", background: "transparent", border: "none", outline: "none", color: C.text,
          fontFamily: "inherit", fontSize: 15, lineHeight: 1.6, padding: 0, width: "100%" }} />
      {exists && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Изменено {noteWhen(note.updatedAt)}</div>}
    </div>
  );
}
