// Экран «Заметки» (открывается из «Сегодня», адрес /notes). Логика и хранение — src/lib/userNotes.js,
// запись и синхронизация — notesApi в NexaApp. Здесь — список, поиск, теги и архив, редактор с автосохранением.
// Компьютер: список слева, редактор справа. Телефон: список; редактор — на весь экран поверх.
// Редактор — role="dialog": «Назад» браузера / Android и Esc закрывают его, а не весь экран.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, T, fontDisplay, PHONE_MQ } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { btnReset, EmptyState } from "../ui/base.jsx";
import { Crumb } from "../ui/layout.jsx";
import { useMediaQuery } from "../lib/hooks.js";
import { newId } from "../lib/sync.js";
import { dayKey } from "../lib/schedule.js";
import {
  sortNotes, searchNotes, filterNotes, allTags, cleanTag, cleanTags, sameTags, noteTitle, notePreview, noteWhen, isBlank, saveState,
  mergeVersions, checklistStats, toggleCheckAt, continueChecklist, toggleChecklistLines,
  NOTE_TITLE_MAX, NOTE_TEXT_MAX, NOTE_TAGS_MAX, NOTE_TAG_LEN,
} from "../lib/userNotes.js";
import { ScheduleForm } from "./Today.jsx";

const SAVE_DELAY_MS = 600; // пауза в наборе — и записываем
const OPEN_KEY = "nexa-notes-open"; // какая заметка была открыта (перезагрузка вкладки откроет её снова)

const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap" };
const primary = { ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, border: "1px solid transparent", fontWeight: 500 };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const round = { ...btnReset, width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const chip = (on) => ({
  ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap", fontSize: 13,
  border: `1px solid ${on ? C.mint : C.lineBright}`, color: on ? C.mint : C.text, background: on ? `color-mix(in srgb, ${C.mint} 8%, transparent)` : "transparent",
});
const linkBtn = { ...btnReset, fontSize: 12, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3, flexShrink: 0 };

const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY); } catch { return null; } };
const writeOpen = (id) => { try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* без памяти вкладки — просто не откроем снова */ } };

/* request — открыть редактор сразу: { create: true, n } (быстрые действия) или { id, n } (глобальный поиск);
   n — метка нажатия, чтобы та же просьба второй раз тоже сработала */
export function ScreenNotes({ notes, api, uid, online, sync, onBack, request, schedule = [], onAddSchedule, toast }) {
  const phone = useMediaQuery(PHONE_MQ);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("active"); // "active" | "archive"
  const [tag, setTag] = useState(null);       // фильтр по тегу
  const [open, setOpen] = useState(() => {    // { id, isNew } — открытая заметка
    if (request?.create) return { id: newId(), isNew: true };
    const id = request?.id || readOpen();
    return id && notes.some((n) => n.id === id) ? { id } : null;
  });
  const sorted = useMemo(() => sortNotes(notes), [notes]);
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
      onPin={() => api.save(n.id, { pinned: !n.pinned })} onTag={(t) => { setView("active"); setTag(t); }} />
  );
  const list = (
    <div className="nx-notepad-list" style={{ display: "grid", gap: 10, alignContent: "start" }}>
      {pinned.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "2px 4px 0" }}>Закреплённые</div>}
      {pinned.map(card)}
      {pinned.length > 0 && rest.length > 0 && <div className="nx-notepad-group" style={{ fontSize: 13, color: C.mutedSoft, margin: "8px 4px 0" }}>Остальные</div>}
      {rest.map(card)}
    </div>
  );

  const editor = open && (
    <NoteEditor key={open.id} id={open.id} note={openNote} isNew={open.isNew && !openNote} phone={phone}
      api={api} uid={uid} online={online} sync={sync} knownTags={tags} schedule={schedule} onAddSchedule={onAddSchedule}
      onArchive={archive} onClose={() => setOpen(null)} />
  );

  // Пусто после фильтров и поиска — почему и как вернуть
  const nothing = query.trim()
    ? { title: `Ничего не нашлось по «${query.trim()}»`, text: "Поиск идёт по заголовкам, тексту и тегам", label: "Сбросить поиск", reset: () => setQuery("") }
    : view === "archive" ? { title: "В архиве пусто", text: "Сюда попадают заметки, которые убрали из списка, но не удалили", label: "К заметкам", reset: () => setView("active") }
    : tag ? { title: `Нет заметок с тегом «${tag}»`, text: "Тег могли убрать или заметки ушли в архив", label: "Все заметки", reset: () => setTag(null) }
    : { title: "Все заметки в архиве", text: "Откройте архив, чтобы вернуть нужные, или создайте новую", label: "Открыть архив", reset: () => setView("archive") };

  return (
    <div className="ng-screen nx-notepad" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 1240 }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Сегодня</Crumb>

      <div className="nx-notepad-head" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: "24px 0 20px" }}>
        <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1, flex: "1 1 auto" }}>Заметки</div>
        {!phone && (
          <button type="button" className="nx-primary" onClick={create} style={primary}>
            {Icon.plus({ c: C.onFold, s: 16 })} Новая заметка
          </button>
        )}
      </div>

      {!empty && (
        <label className="nx-notepad-search" style={{
          display: "flex", alignItems: "center", gap: 10, maxWidth: 560, padding: "0 16px", height: 44, boxSizing: "border-box",
          border: `1px solid ${C.lineBright}`, borderRadius: 999, marginBottom: 12,
        }}>
          {Icon.search({ c: C.muted, s: 16 })}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по заметкам и тегам"
            aria-label="Поиск по заметкам" className="nx-notepad-search-input"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontFamily: "inherit" }} />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Сбросить поиск" style={{ ...btnReset, display: "flex" }}>
              {Icon.close({ c: C.muted, s: 14 })}
            </button>
          )}
        </label>
      )}

      {/* Фильтры: все / по тегу / архив. Ряд листается вбок (свайп разделов здесь не срабатывает) */}
      {!empty && (tags.length > 0 || archivedCount > 0) && (
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
          {!phone && (editor || (
            <div className="nx-notepad-placeholder" style={{
              border: `1px dashed ${C.borderStrong}`, borderRadius: 32, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.mutedSoft, fontSize: 14, textAlign: "center", padding: 24,
            }}>Выберите заметку слева или создайте новую</div>
          ))}
        </div>
      )}
      {/* Телефон: создать — круглая кнопка над нижней панелью (заголовок не тесним, панель не трогаем) */}
      {phone && !empty && !open && (
        <button type="button" className="nx-primary nx-notepad-fab" onClick={create} aria-label="Новая заметка" style={{
          ...btnReset, position: "fixed", right: 16, bottom: "calc(var(--sab) + 88px)", zIndex: 30, width: 56, height: 56, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid transparent",
          background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        }}>{Icon.plus({ c: C.onFold, s: 22 })}</button>
      )}
      {/* На телефоне редактор — поверх всего (и нижней панели), в body: у экрана есть анимация с transform */}
      {phone && editor && createPortal(editor, document.body)}
    </div>
  );
}

// Карточка заметки в списке: заголовок, фрагмент, теги, чек-лист, дата изменения; булавка — закрепить / открепить
function NoteCard({ note, active, archived, onOpen, onPin, onTag }) {
  const preview = notePreview(note);
  const check = checklistStats(note.text);
  const tags = note.tags || [];
  return (
    <div className="nx-notepad-card" data-active={active ? "1" : "0"} style={{
      position: "relative", border: `1px solid ${active ? C.mint : C.lineBright}`, borderRadius: 24,
      background: active ? `color-mix(in srgb, ${C.mint} 6%, transparent)` : "transparent", transition: "border-color 160ms ease",
    }}>
      <button type="button" onClick={onOpen} className="nx-notepad-open" style={{ ...btnReset, display: "block", width: "100%", textAlign: "left", padding: `16px ${archived ? 20 : 56}px ${tags.length ? 8 : 16}px 20px`, boxSizing: "border-box" }}>
        <span style={{ display: "block", fontFamily: fontDisplay, fontSize: 16, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{noteTitle(note)}</span>
        {preview && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13, color: C.muted, lineHeight: 1.45, marginTop: 6 }}>{preview}</span>}
        <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: C.mutedSoft, marginTop: 8 }}>
          <span>Изменено {noteWhen(note.updatedAt)}</span>
          {check.total > 0 && <span style={{ color: check.done === check.total ? C.green : C.mutedSoft }}>☑ {check.done} из {check.total}</span>}
        </span>
      </button>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 20px 14px" }}>
          {tags.slice(0, 5).map((t) => (
            <button key={t} type="button" onClick={() => onTag(t)} title={`Показать заметки с тегом «${t}»`}
              style={{ ...btnReset, fontSize: 12, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px" }}>#{t}</button>
          ))}
          {tags.length > 5 && <span style={{ fontSize: 12, color: C.mutedSoft, alignSelf: "center" }}>+{tags.length - 5}</span>}
        </div>
      )}
      {!archived && (
        <button type="button" className="nx-icon-btn" onClick={onPin} aria-pressed={!!note.pinned}
          aria-label={note.pinned ? "Открепить заметку" : "Закрепить заметку"} title={note.pinned ? "Открепить" : "Закрепить"}
          style={{ ...btnReset, position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${note.pinned ? C.mint : "transparent"}` }}>
          {Icon.pin({ c: note.pinned ? C.mint : C.mutedSoft, s: 15 })}
        </button>
      )}
    </div>
  );
}

const sameDraft = (a, b) => a.title === b.title && a.text === b.text && sameTags(a.tags, b.tags);
const versionOf = (n) => ({ title: n?.title || "", text: n?.text || "", tags: n?.tags || [] });

/* Редактор. Набранное живёт здесь (черновик) и записывается через паузу SAVE_DELAY_MS,
   при закрытии, при уходе со страницы и в фон — всегда последней версией (без гонок:
   запись синхронная, в облако уходит весь список через useCloudList, последним правкам не мешает).
   Новая пустая заметка не создаётся. Подпись состояния — saveState (только то, что правда случилось).
   Конфликт: пока здесь печатали, заметку изменили на другом устройстве — молча не перезаписываем,
   а спрашиваем; закрыли, не выбрав, — сохраняются обе версии (mergeVersions) */
function NoteEditor({ id, note, isNew, phone, api, uid, online, sync, knownTags, schedule, onAddSchedule, onArchive, onClose }) {
  const [title, setTitle] = useState(note?.title || "");
  const [text, setText] = useState(note?.text || "");
  const [tags, setTags] = useState(note?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(null); // null | "local" | "full"
  const [confirmDel, setConfirmDel] = useState(false);
  const [conflict, setConflict] = useState(null); // версия с другого устройства { title, text, tags }
  const [sched, setSched] = useState(false);      // форма «В расписание»
  const [schedDone, setSchedDone] = useState(null); // что добавили в расписание (подпись)
  const draft = useRef(versionOf(note));
  const saved = useRef(versionOf(note));
  const timer = useRef(null);
  const textRef = useRef(null);
  const caret = useRef(null); // куда поставить курсор после программной правки текста
  const removed = useRef(false); // удалили — больше ничего не записываем (иначе заметка вернулась бы)
  const conflictRef = useRef(null); conflictRef.current = conflict;
  const confirmDelRef = useRef(false); confirmDelRef.current = confirmDel;
  const schedRef = useRef(false); schedRef.current = sched;

  const show = (d) => { setTitle(d.title); setText(d.text); setTags(d.tags); };

  /* Записать черновик сейчас. true — записано (или нечего записывать).
     auto — запись по паузе в наборе: при конфликте ждём выбора человека */
  const commit = ({ auto = false } = {}) => {
    clearTimeout(timer.current);
    if (removed.current) return true;
    if (conflictRef.current) {
      if (auto) return false;
      draft.current = { ...draft.current, ...mergeVersions(draft.current, conflictRef.current) };
      show(draft.current);
      conflictRef.current = null; setConflict(null);
    }
    const d = draft.current;
    if (sameDraft(d, saved.current)) { setDirty(false); return true; }
    if (isNew && !note && isBlank(d)) { setDirty(false); return true; } // пустую новую не создаём
    const r = api.save(id, { title: d.title, text: d.text, tags: d.tags });
    if (r.ok) { saved.current = { ...d }; setDirty(false); setFailed(null); return true; }
    setFailed(r.full ? "full" : "local");
    return false;
  };
  const commitRef = useRef(commit); commitRef.current = commit;

  const change = (patch) => {
    draft.current = { ...draft.current, ...patch };
    if ("title" in patch) setTitle(patch.title);
    if ("text" in patch) setText(patch.text);
    if ("tags" in patch) setTags(patch.tags);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current({ auto: true }), SAVE_DELAY_MS);
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

  /* Заметку изменили на другом устройстве (пришло из облака).
     Здесь ничего не набрано — просто показываем новую версию; набрано — спрашиваем, что оставить */
  const tagsKey = (note?.tags || []).join("\n");
  useEffect(() => {
    if (!note) return;
    const remote = versionOf(note);
    if (sameDraft(remote, saved.current)) return;
    if (!dirty && !conflictRef.current) {
      saved.current = remote; draft.current = { ...remote }; show(remote);
    } else {
      clearTimeout(timer.current);
      setConflict(remote);
    }
  }, [note?.title, note?.text, tagsKey]);

  const resolve = (how) => {
    const remote = conflictRef.current;
    if (!remote) return;
    conflictRef.current = null; setConflict(null);
    if (how === "theirs") { // взять ту версию, набранное здесь — отбросить
      clearTimeout(timer.current);
      saved.current = remote; draft.current = { ...remote }; show(remote); setDirty(false);
      return;
    }
    if (how === "mine") saved.current = remote; // своя поверх той
    else { draft.current = { ...draft.current, ...mergeVersions(draft.current, remote) }; show(draft.current); }
    commit();
  };

  // Новая заметка — сразу печатать заголовок (на телефоне без этого не появится клавиатура)
  const titleRef = useRef(null);
  useEffect(() => { if (isNew) titleRef.current?.focus(); }, []);
  // Курсор после правки текста кнопкой / Enter / нажатием на пункт
  useLayoutEffect(() => {
    if (caret.current == null || !textRef.current) return;
    textRef.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  // Закрыть: сначала записать; не записалось — остаёмся, чтобы текст не пропал
  const close = () => { if (commitRef.current()) onClose(); };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (confirmDelRef.current) { setConfirmDel(false); return; }
      if (schedRef.current) { setSched(false); return; }
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ── Чек-листы (значки ☐ / ☑ в тексте) ──
  const setTextAt = (next, pos) => { caret.current = pos; change({ text: next.slice(0, NOTE_TEXT_MAX) }); };
  const onTextKey = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const r = continueChecklist(el.value, el.selectionStart);
    if (!r) return;
    e.preventDefault();
    setTextAt(r.text, r.pos);
  };
  const onTextClick = (e) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const next = toggleCheckAt(el.value, el.selectionStart);
    if (next != null) setTextAt(next, el.selectionStart);
  };
  const toggleList = () => {
    const el = textRef.current;
    if (!el) return;
    const r = toggleChecklistLines(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length);
    el.focus();
    setTextAt(r.text, r.pos);
  };

  // ── Теги ──
  const addTag = (raw) => {
    const t = cleanTag(raw);
    setTagInput("");
    if (!t) return;
    change({ tags: cleanTags([...draft.current.tags, t]) });
  };
  const removeTag = (t) => change({ tags: draft.current.tags.filter((x) => x !== t) });

  const exists = !!note;
  const st = failed === "full"
    ? { kind: "error", text: "Больше 1000 заметок не помещается — удалите ненужные", retry: null }
    : conflict ? { kind: "error", text: "Не сохранено — выберите версию ниже" }
    : saveState({ dirty, localFailed: failed === "local", uid, online, sync });
  const shown = !exists && isBlank({ title, text }) ? { kind: "idle", text: "Начните печатать — заметка сохранится сама" } : st;
  const dotColor = { error: C.red, saving: C.muted, offline: C.muted, local: C.green, cloud: C.green, idle: C.mutedSoft }[shown.kind];
  const canAct = exists || !isBlank({ title, text });

  const togglePin = () => { if (commit() && exists) api.save(id, { pinned: !note.pinned }); };
  const toggleArchive = () => {
    if (!commit()) return;
    const n = notesNow();
    if (!n) return;
    if (onArchive(n, !n.archived) && !n.archived) onClose(); // убрали в архив — к списку
  };
  // Заметка сразу после записи (note в пропсах обновится только со следующей отрисовкой)
  const notesNow = () => (exists ? note : { id, title: draft.current.title, text: draft.current.text });
  const remove = () => {
    clearTimeout(timer.current);
    removed.current = true;
    if (!exists) { onClose(); return; }
    const r = api.remove(id);
    if (r.ok) onClose(); else { removed.current = false; setFailed("local"); }
  };
  const addToSchedule = (it) => {
    onAddSchedule?.(it);
    setSched(false);
    const day = it.date === dayKey() ? "сегодня" : new Date(`${it.date}T00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    setSchedDone(`Добавлено в расписание: ${day}, ${it.time}`);
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button type="button" className="nx-icon-btn" onClick={close} aria-label={phone ? "К списку заметок" : "Закрыть заметку"} style={round}>
          {phone ? Icon.arrowLeft({ c: C.text, s: 16 }) : Icon.close({ c: C.text, s: 15 })}
        </button>
        <div style={{ flex: 1 }} />
        {/* Кнопки не забирают фокус у текста (иначе на телефоне прячется клавиатура и теряется выделение) */}
        <button type="button" className="nx-icon-btn" onPointerDown={(e) => e.preventDefault()} onClick={toggleList}
          aria-label="Чек-лист: сделать строки пунктами" title="Чек-лист" style={round}>
          {Icon.check({ c: C.text, s: 15 })}
        </button>
        <button type="button" className="nx-icon-btn" onClick={() => setSched((v) => !v)} disabled={!canAct} aria-expanded={sched}
          aria-label="Добавить в расписание" title="В расписание" style={{ ...round, borderColor: sched ? C.mint : C.borderStrong, opacity: canAct ? 1 : 0.4 }}>
          {Icon.calendar({ c: sched ? C.mint : C.text, s: 15 })}
        </button>
        {!note?.archived && (
          <button type="button" className="nx-icon-btn" onClick={togglePin} disabled={!exists} aria-pressed={!!note?.pinned}
            aria-label={note?.pinned ? "Открепить заметку" : "Закрепить заметку"} title={note?.pinned ? "Открепить" : "Закрепить"}
            style={{ ...round, borderColor: note?.pinned ? C.mint : C.borderStrong, opacity: exists ? 1 : 0.4 }}>
            {Icon.pin({ c: note?.pinned ? C.mint : C.text, s: 15 })}
          </button>
        )}
        <button type="button" className="nx-icon-btn" onClick={toggleArchive} disabled={!canAct}
          aria-label={note?.archived ? "Вернуть из архива" : "Убрать в архив"} title={note?.archived ? "Вернуть из архива" : "В архив"}
          style={{ ...round, borderColor: note?.archived ? C.mint : C.borderStrong, opacity: canAct ? 1 : 0.4 }}>
          {Icon.archive({ c: note?.archived ? C.mint : C.text, s: 15 })}
        </button>
        <button type="button" className="nx-icon-btn" onClick={() => setConfirmDel(true)} aria-label="Удалить заметку" title="Удалить" style={round}>
          {Icon.trash({ c: C.text, s: 15 })}
        </button>
      </div>

      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: shown.kind === "error" ? C.red : C.muted, minHeight: 18, marginBottom: 12 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>{shown.text}</span>
        {shown.retry && (
          <button type="button" className="nx-link-btn" onClick={() => (shown.retry === "local" ? commit() : api.retry())} style={linkBtn}>Повторить</button>
        )}
      </div>

      {note?.archived && (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
          Заметка в архиве — её нет в общем списке. <button type="button" className="nx-link-btn" onClick={toggleArchive} style={{ ...linkBtn, fontSize: 13 }}>Вернуть</button>
        </div>
      )}

      {conflict && (
        <div role="alert" className="nx-pop" style={{ padding: "12px 14px", marginBottom: 14, border: `1px solid ${C.red}`, borderRadius: 18, fontSize: 14, display: "grid", gap: 10 }}>
          <span style={{ lineHeight: 1.45 }}>Эту заметку изменили на другом устройстве, пока вы печатали. Что сохранить?</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="nx-ghost-btn" onClick={() => resolve("both")} style={{ ...ghost, borderColor: C.mint, color: C.mint }}>Обе версии</button>
            <button type="button" className="nx-ghost-btn" onClick={() => resolve("mine")} style={ghost}>Только мою</button>
            <button type="button" className="nx-ghost-btn" onClick={() => resolve("theirs")} style={ghost}>Ту, что с другого устройства</button>
          </div>
          <span style={{ fontSize: 12, color: C.mutedSoft }}>«Обе версии» — другая допишется ниже под чертой. Закроете, не выбрав, — сохранятся обе</span>
        </div>
      )}

      {confirmDel && (
        <div role="alertdialog" aria-label="Удалить заметку?" className="nx-pop" style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", marginBottom: 14,
          border: `1px solid ${C.red}`, borderRadius: 18, fontSize: 14,
        }}>
          <span style={{ flex: "1 1 200px" }}>{exists ? (uid ? "Удалить заметку? На всех устройствах, вернуть нельзя" : "Удалить заметку? Вернуть нельзя") : "Убрать эту заметку?"}</span>
          <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghost}>Отмена</button>
          <button type="button" className="nx-ghost-btn" onClick={remove} style={{ ...ghost, border: `1px solid ${C.red}`, color: C.red }}>Удалить</button>
        </div>
      )}

      {sched && (
        <ScheduleForm existing={schedule} day={dayKey()} initialTitle={noteTitle({ title, text })} onSave={addToSchedule} onCancel={() => setSched(false)} />
      )}
      {schedDone && !sched && <div style={{ fontSize: 12, color: C.green, marginBottom: 10 }}>{schedDone}</div>}

      <input ref={titleRef} value={title} maxLength={NOTE_TITLE_MAX} placeholder="Заголовок" aria-label="Заголовок заметки"
        onChange={(e) => change({ title: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); textRef.current?.focus(); } }}
        style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: fontDisplay, fontSize: phone ? 22 : 26, fontWeight: 500, padding: "4px 0 8px", width: "100%" }} />

      {/* Теги: Enter или запятая — добавить, Backspace в пустом поле — убрать последний */}
      <div className="nx-notepad-tags" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 12 }}>
        {tags.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "3px 6px 3px 10px" }}>
            #{t}
            <button type="button" onClick={() => removeTag(t)} aria-label={`Убрать тег «${t}»`} style={{ ...btnReset, display: "flex", padding: 3, borderRadius: 999 }}>
              {Icon.close({ c: C.muted, s: 10 })}
            </button>
          </span>
        ))}
        {tags.length < NOTE_TAGS_MAX && (
          <input value={tagInput} maxLength={NOTE_TAG_LEN + 1} list={`nx-note-tags-${id}`} placeholder={tags.length ? "+ тег" : "+ Добавить тег"} aria-label="Новый тег"
            onChange={(e) => { const v = e.target.value; if (v.includes(",")) addTag(v.replace(/,/g, "")); else setTagInput(v); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
              else if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
            }}
            onBlur={() => addTag(tagInput)}
            style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: "inherit", fontSize: 13, padding: "4px 2px", width: 120, minWidth: 0 }} />
        )}
        <datalist id={`nx-note-tags-${id}`}>
          {knownTags.filter((k) => !tags.some((t) => t.toLowerCase() === k.tag.toLowerCase())).slice(0, 20).map((k) => <option key={k.tag} value={k.tag} />)}
        </datalist>
      </div>

      <textarea ref={textRef} value={text} maxLength={NOTE_TEXT_MAX} placeholder="Текст заметки. Для списка дел — кнопка ☑ сверху" aria-label="Текст заметки"
        onChange={(e) => change({ text: e.target.value })} onKeyDown={onTextKey} onClick={onTextClick} className="nx-scroll"
        style={{ flex: 1, minHeight: phone ? 0 : 300, resize: "none", background: "transparent", border: "none", outline: "none", color: C.text,
          fontFamily: "inherit", fontSize: 16, lineHeight: 1.65, padding: 0, width: "100%" }} />
      {exists && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Изменено {noteWhen(note.updatedAt)}</div>}
    </div>
  );
}
