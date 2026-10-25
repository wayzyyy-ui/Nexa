// Редактор заметки (экран «Заметки» — ../Notes.jsx).
/* Набранное живёт здесь (черновик) и записывается через паузу SAVE_DELAY_MS, при закрытии, при уходе со страницы
   и в фон — всегда последней версией (без гонок: запись синхронная, в облако уходит весь список через useCloudList).
   Новая пустая заметка не создаётся. Никаких постоянных подписей «сохраняется / сохранено»: автосохранение работает
   молча; на экране остаётся только ошибка, если запись правда не удалась (иначе человек потерял бы текст незаметно).
   Конфликт: пока здесь печатали, заметку изменили на другом устройстве — молча не перезаписываем, а спрашиваем;
   закрыли, не выбрав, — сохраняются обе версии (mergeVersions).
   Телефон: компактная шапка (назад · заголовок · ИИ · меню) и нижняя панель инструментов; смахнуть вправо — выйти.
   ИИ: меню ✨ (сократить / переписать / исправить / продолжить — с проверкой результата) и серая подсказка в строке
   (Enter — принять, Backspace сразу после — вернуть). Картинки — полоса над текстом (images.jsx). */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { C, fontDisplay } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset } from "../../ui/base.jsx";
import { dayKey } from "../../lib/schedule.js";
import { isSensitive } from "../../lib/textcheck.js";
import {
  noteTitle, noteWhen, isBlank, cleanTag, cleanTags, sameTags, sameImages, mergeVersions, toggleCheckAt, continueChecklist, toggleChecklistLines,
  NOTE_TITLE_MAX, NOTE_TEXT_MAX, NOTE_TAGS_MAX, NOTE_TAG_LEN, NOTE_IMAGES_MAX,
} from "../../lib/userNotes.js";
import { runNoteTask, fetchSuggestion, suggestionWanted, joinSuggestion, replaceRange, appendContinuation, NOTE_AI_TEXT_MAX, SUGGEST_PAUSE_MS, SUGGEST_GAP_MS } from "../../lib/noteAi.js";
import { storeNoteImage, uploadNoteImage, purgeNoteImages, readClipboardImage } from "../../lib/noteImages.js";
import { PhotoFullscreen } from "../../ui/FileViewer.jsx";
import { ScheduleForm } from "../Today.jsx";
import { ghost, round, linkBtn, useSuggestOn } from "./shared.js";
import { NoteImages } from "./images.jsx";
import { AiMenu, AiPanel, GhostLayer } from "./ai.jsx";

const SAVE_DELAY_MS = 600; // пауза в наборе — и записываем
const EDGE_PX = 24;        // у самого края экрана жест «Назад» принадлежит системе

const sameDraft = (a, b) => a.title === b.title && a.text === b.text && sameTags(a.tags, b.tags) && sameImages(a.images, b.images);
const versionOf = (n) => ({ title: n?.title || "", text: n?.text || "", tags: n?.tags || [], images: n?.images || [] });
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Какие картинки уже отправлены в облако (только на этом устройстве): чтобы не отправлять их снова при каждом открытии
const upKey = (uid) => `nexa-note-img-up@${uid}`;
const readUp = (uid) => { try { return new Set(JSON.parse(localStorage.getItem(upKey(uid))) || []); } catch { return new Set(); } };
const writeUp = (uid, set) => { try { localStorage.setItem(upKey(uid), JSON.stringify([...set].slice(-500))); } catch { /* без памяти — отправим ещё раз, ничего страшного */ } };

export function NoteEditor({ id, note, isNew, phone, api, uid, knownTags, schedule, onAddSchedule, onArchive, onClose, onAskAi, toast }) {
  const scope = uid || "guest";
  const [title, setTitle] = useState(note?.title || "");
  const [text, setText] = useState(note?.text || "");
  const [tags, setTags] = useState(note?.tags || []);
  const [images, setImages] = useState(note?.images || []);
  const [tagInput, setTagInput] = useState("");
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(null); // null | "local" | "full"
  const [confirmDel, setConfirmDel] = useState(false);
  const [conflict, setConflict] = useState(null); // версия с другого устройства { title, text, tags, images }
  const [sched, setSched] = useState(false);      // форма «В расписание»
  const [schedDone, setSchedDone] = useState(null);
  const [imgError, setImgError] = useState("");
  const [viewImg, setViewImg] = useState(null);   // id картинки на весь экран
  const [menu, setMenu] = useState(null);         // null | "ai" | "more"
  const [ai, setAi] = useState(null);             // результат ИИ (ai.jsx)
  const [ghostTip, setGhostTip] = useState(null); // серая подсказка { base, tail }
  const [suggestOn, setSuggestOn] = useSuggestOn();
  const draft = useRef(versionOf(note));
  const saved = useRef(versionOf(note));
  const timer = useRef(null);
  const rootRef = useRef(null);
  const textRef = useRef(null);
  const titleRef = useRef(null);
  const aiBtnRef = useRef(null);
  const moreBtnRef = useRef(null);
  const fileRef = useRef(null);
  const caret = useRef(null);      // куда поставить курсор после программной правки текста
  const removed = useRef(false);   // удалили — больше ничего не записываем (иначе заметка вернулась бы)
  const mounted = useRef(true);
  const conflictRef = useRef(null); conflictRef.current = conflict;
  const confirmDelRef = useRef(false); confirmDelRef.current = confirmDel;
  const schedRef = useRef(false); schedRef.current = sched;
  const layers = useRef({}); layers.current = { menu, ai, viewImg };
  const noteRef = useRef(note); noteRef.current = note;

  const show = (d) => { setTitle(d.title); setText(d.text); setTags(d.tags); setImages(d.images); };

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
    if (sameDraft(d, saved.current)) { if (mounted.current) setDirty(false); return true; }
    if (isNew && !noteRef.current && isBlank(d)) { if (mounted.current) setDirty(false); return true; } // пустую новую не создаём
    const r = api.save(id, { title: d.title, text: d.text, tags: d.tags, images: d.images });
    if (r.ok) { saved.current = { ...d }; if (mounted.current) { setDirty(false); setFailed(null); } return true; }
    if (mounted.current) setFailed(r.full ? "full" : "local");
    return false;
  };
  const commitRef = useRef(commit); commitRef.current = commit;

  const change = (patch) => {
    draft.current = { ...draft.current, ...patch };
    if ("title" in patch) setTitle(patch.title);
    if ("text" in patch) setText(patch.text);
    if ("tags" in patch) setTags(patch.tags);
    if ("images" in patch) setImages(patch.images);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current({ auto: true }), SAVE_DELAY_MS);
  };

  // Уход со страницы, сворачивание, закрытие редактора — записываем сразу
  useEffect(() => {
    mounted.current = true;
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
      mounted.current = false;
      aiCtl.current?.abort(); sugCtl.current?.abort(); clearTimeout(sugTimer.current);
    };
  }, []);

  /* Заметку изменили на другом устройстве (пришло из облака).
     Здесь ничего не набрано — просто показываем новую версию; набрано — спрашиваем, что оставить */
  const tagsKey = (note?.tags || []).join("\n");
  const imagesKey = (note?.images || []).map((i) => i.id).join("\n");
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
  }, [note?.title, note?.text, tagsKey, imagesKey]);

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
  useEffect(() => { if (isNew) titleRef.current?.focus(); }, []);
  // Курсор после правки текста кнопкой / Enter / нажатием на пункт / принятием подсказки
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
      const L = layers.current;
      if (L.viewImg) return; // фото на весь экран закрывается само (слушает Esc первым)
      if (L.menu) { setMenu(null); return; }
      if (L.ai) { cancelAi(); return; }
      if (confirmDelRef.current) { setConfirmDel(false); return; }
      if (schedRef.current) { setSched(false); return; }
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── Смахнуть вправо — выйти из заметки (телефон) ──
     Слушатели только наблюдают (passive): прокрутку текста и выделение не блокируем. Решаем по направлению:
     заметно больше вправо, чем по вертикали, — жест; вертикаль — обычная прокрутка. Начало у самого края —
     системный «Назад», его не трогаем. Выделен текст или идёт жест в полосе картинок — не считается */
  useEffect(() => {
    const el = rootRef.current;
    if (!phone || !el) return;
    let g = null;
    const width = () => el.getBoundingClientRect().width || window.innerWidth;
    const reset = (anim) => {
      el.style.transition = anim ? "transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease" : "none";
      el.style.transform = ""; el.style.opacity = "";
    };
    const onStart = (e) => {
      g = null;
      if (e.touches.length !== 1 || e.target.closest?.("[data-no-note-swipe], [role=menu], input[type=file]")) return;
      const t = e.touches[0];
      if (t.clientX < EDGE_PX) return;
      g = { x: t.clientX, y: t.clientY, at: performance.now(), mode: null, dx: 0 };
    };
    const onMove = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (g.mode === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        const ta = textRef.current;
        const selecting = ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart;
        g.mode = dx > 0 && dx > Math.abs(dy) * 1.6 && !selecting ? "h" : "v";
      }
      if (g.mode !== "h") return;
      g.dx = Math.max(0, dx);
      el.style.transition = "none";
      el.style.transform = `translateX(${g.dx}px)`;
      el.style.opacity = String(1 - Math.min(0.5, g.dx / width() / 1.5));
    };
    const onEnd = () => {
      const s = g; g = null;
      if (!s || s.mode !== "h") return;
      const w = width(), dt = Math.max(1, performance.now() - s.at);
      const fast = s.dx > 50 && s.dx / dt > 0.5;
      if (s.dx > Math.min(110, w * 0.3) || fast) {
        if (!commitRef.current()) { reset(true); return; } // не записалось — остаёмся
        if (reduced()) { onClose(); return; }
        el.style.transition = "transform 200ms cubic-bezier(0.4, 0, 1, 1), opacity 200ms ease";
        el.style.transform = `translateX(${w}px)`; el.style.opacity = "0";
        setTimeout(() => { if (mounted.current) onClose(); }, 190);
      } else reset(true);
    };
    const onCancel = () => { if (g?.mode === "h") reset(true); g = null; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); el.removeEventListener("touchcancel", onCancel); };
  }, [phone]);

  // ── Чек-листы (значки ☐ / ☑ в тексте) ──
  const setTextAt = (next, pos) => { caret.current = pos; change({ text: next.slice(0, NOTE_TEXT_MAX) }); };
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

  // ── Картинки ──
  const [uploading, setUploading] = useState(0);
  const uploadOne = async (img) => {
    if (!uid) return;
    const up = readUp(uid);
    if (up.has(img.id)) return;
    if (await uploadNoteImage(uid, img, scope)) { const s = readUp(uid); s.add(img.id); writeUp(uid, s); }
  };
  const addImages = async (files) => {
    const list = [...files].filter(Boolean);
    if (!list.length) return;
    setImgError("");
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        if (draft.current.images.length >= NOTE_IMAGES_MAX) { setImgError(`В заметке может быть не больше ${NOTE_IMAGES_MAX} картинок`); break; }
        const meta = await storeNoteImage(f, scope);
        if (!mounted.current || removed.current) { purgeNoteImages(uid, scope, [meta]); break; }
        change({ images: [...draft.current.images, meta] });
        commit(); // картинка сразу в заметке — не ждём паузу
        uploadOne(meta).catch(() => {});
      } catch (e) { setImgError(e?.message || "Не получилось добавить картинку"); }
      finally { setUploading((n) => Math.max(0, n - 1)); }
    }
  };
  const removeImage = (img) => {
    change({ images: draft.current.images.filter((i) => i.id !== img.id) });
    if (commit()) purgeNoteImages(uid, scope, [img]);
    setViewImg(null);
  };
  // Картинки, которые остались только здесь (не было сети) — отправляем при открытии заметки
  useEffect(() => {
    if (!uid || !navigator.onLine) return;
    (note?.images || []).forEach((img) => { uploadOne(img).catch(() => {}); });
  }, [id]);
  // Фото из буфера обмена — кнопкой (на телефоне вставить картинку в поле текста получается не всегда)
  const pasteImage = async () => {
    const r = await readClipboardImage();
    if (r.file) addImages([r.file]);
    else toast?.({ title: "Картинки в буфере нет", text: r.error });
  };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    addImages(files);
  };

  const exists = !!note;
  const canAct = exists || !isBlank(draft.current) || !!text.trim() || !!title.trim() || images.length > 0;
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
    const imgs = [...(noteRef.current?.images || []), ...draft.current.images].filter((i, k, a) => a.findIndex((x) => x.id === i.id) === k);
    if (!exists) { purgeNoteImages(uid, scope, imgs); onClose(); return; }
    const r = api.remove(id);
    if (r.ok) { purgeNoteImages(uid, scope, imgs); onClose(); } else { removed.current = false; setFailed("local"); }
  };
  const addToSchedule = (it) => {
    onAddSchedule?.(it);
    setSched(false);
    const day = it.date === dayKey() ? "сегодня" : new Date(`${it.date}T00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    setSchedDone(`Добавлено в расписание: ${day}, ${it.time}`);
  };

  /* ── ИИ: действия над текстом ──
     Выделен фрагмент — работаем с ним, иначе со всей заметкой. Результат сначала показываем (AiPanel);
     «Применить» вставляет его на место, «Отменить» ничего не меняет. Запрос отменяется при закрытии заметки */
  const aiCtl = useRef(null);
  const cancelAi = () => { aiCtl.current?.abort(); aiCtl.current = null; setAi(null); };
  const runAi = async (task, prompt = "") => {
    setMenu(null);
    const ta = textRef.current;
    const t = draft.current.text;
    let from = ta?.selectionStart ?? 0, to = ta?.selectionEnd ?? 0;
    const sel = to > from && !!t.slice(from, to).trim();
    if (!sel) { from = 0; to = t.length; }
    const orig = t.slice(from, to);
    if (!orig.trim() && task !== "custom") { setAi({ task, phase: "error", sel, error: "Сначала напишите текст — ИИ нечего обрабатывать" }); return; }
    if (task !== "continue" && orig.length > NOTE_AI_TEXT_MAX) { setAi({ task, phase: "error", sel, error: "Текст слишком длинный — выделите часть заметки" }); return; }
    aiCtl.current?.abort();
    const ctl = new AbortController(); aiCtl.current = ctl;
    const ctx = { task, sel, from, to, orig, prompt };
    setAi({ ...ctx, phase: "loading" });
    try {
      const body = task === "continue" ? t.slice(0, to).slice(-NOTE_AI_TEXT_MAX) : orig;
      const out = await runNoteTask({ task, text: body, prompt, signal: ctl.signal });
      if (aiCtl.current !== ctl) return;
      if (!out.trim()) throw Object.assign(new Error("empty"), { userMessage: "ИИ ничего не предложил — попробуйте ещё раз" });
      setAi({ ...ctx, phase: "result", result: out });
    } catch (e) {
      if (e?.name === "AbortError" || aiCtl.current !== ctl) return;
      setAi({ ...ctx, phase: "error", error: e?.userMessage || "Не получилось — попробуйте ещё раз" });
    }
  };
  const applyAi = () => {
    const a = ai;
    if (!a || a.phase !== "result") return;
    const t = draft.current.text;
    let r;
    if (a.task === "continue") {
      const upto = Math.min(a.sel ? a.to : t.length, t.length);
      const head = appendContinuation(t.slice(0, upto), a.result);
      r = head && { text: head.text + t.slice(upto), caret: head.caret };
    } else r = replaceRange(t, a.from, a.to, a.orig, a.result);
    if (!r) { setAi({ ...a, phase: "error", error: "Текст за это время изменился — результат не вставлен. Запустите действие ещё раз" }); return; }
    setAi(null); aiCtl.current = null;
    setTextAt(r.text, r.caret);
    textRef.current?.focus();
  };

  // «Обсудить с AI» / «Проанализировать»: заметка (или выделенное) уходит в ассистент только по этому действию
  const askAi = (intent) => {
    setMenu(null);
    const ta = textRef.current;
    const t = draft.current.text;
    const from = ta?.selectionStart ?? 0, to = ta?.selectionEnd ?? 0;
    const sel = to > from && !!t.slice(from, to).trim();
    const body = sel ? t.slice(from, to) : t;
    const head = draft.current.title.trim();
    if (!body.trim() && !head) { toast?.({ title: "Заметка пустая", text: "Напишите что-нибудь, чтобы обсудить это с ассистентом" }); return; }
    if (!commit()) return;
    onAskAi?.({ noteId: id, title: head || noteTitle(draft.current), text: head && !sel ? `${head}\n\n${body}` : body, selection: sel, intent });
  };

  /* ── Серая подсказка при наборе ──
     Показывается только когда курсор стоит в самом конце текста (иначе серый хвост сдвинул бы строки ниже курсора).
     Запрос — после паузы SUGGEST_PAUSE_MS и не чаще раза в SUGGEST_GAP_MS; прежний запрос отменяется,
     запоздавший ответ отбрасывается. Подсказка не входит в текст, пока её не приняли */
  const sugTimer = useRef(null);
  const sugCtl = useRef(null);
  const sugSeq = useRef(0);
  const lastReq = useRef(0);
  const blockedUntil = useRef(0);
  const quiet = useRef(true);      // true — человек ещё не печатал после принятия / отката: подсказок не будет
  const undoTip = useRef(null);    // { before, after } — принятая подсказка, которую Backspace вернёт
  const tipRef = useRef(null); tipRef.current = ghostTip;
  const drop = () => { clearTimeout(sugTimer.current); sugCtl.current?.abort(); sugSeq.current++; setGhostTip(null); };
  const canSuggest = () => {
    const ta = textRef.current;
    return suggestOn && !quiet.current && navigator.onLine !== false && Date.now() > blockedUntil.current && !!ta && document.activeElement === ta && !conflictRef.current && !layers.current.ai;
  };
  const fire = async () => {
    const ta = textRef.current;
    const base = draft.current.text;
    if (!canSuggest() || ta.value !== base || !suggestionWanted(base, ta.selectionStart, ta.selectionEnd)) return;
    if (base.length > NOTE_TEXT_MAX - 200 || isSensitive(base.slice(-300))) return; // пароли и ключи на сервер не отправляем
    lastReq.current = Date.now();
    const ctl = new AbortController(); sugCtl.current = ctl;
    const mine = ++sugSeq.current;
    try {
      const raw = await fetchSuggestion({ before: base, signal: ctl.signal });
      if (mine !== sugSeq.current) return; // пока ждали — человек продолжил печатать
      const cur = textRef.current;
      if (!cur || cur.value !== base || cur.selectionStart !== base.length || cur.selectionEnd !== base.length || document.activeElement !== cur) return;
      const tail = joinSuggestion(base, raw);
      if (tail) setGhostTip({ base, tail });
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (e?.status === 429) blockedUntil.current = Date.now() + 60000; // лимит — тихо отдыхаем минуту
    }
  };
  const scheduleSuggest = () => {
    clearTimeout(sugTimer.current);
    if (!canSuggest()) return;
    const wait = Math.max(SUGGEST_PAUSE_MS, SUGGEST_GAP_MS - (Date.now() - lastReq.current));
    sugTimer.current = setTimeout(fire, wait);
  };
  const acceptTip = () => {
    const g = tipRef.current, ta = textRef.current;
    if (!g || !ta || draft.current.text !== g.base || ta.value !== g.base || ta.selectionStart !== g.base.length || ta.selectionEnd !== g.base.length) return false;
    const next = (g.base + g.tail).slice(0, NOTE_TEXT_MAX);
    drop();
    undoTip.current = { before: g.base, after: next };
    quiet.current = true; // следующий Enter — обычный перенос строки
    setTextAt(next, next.length);
    return true;
  };
  const undoAccept = () => {
    const u = undoTip.current, ta = textRef.current;
    if (!u || !ta || draft.current.text !== u.after || ta.selectionStart !== u.after.length || ta.selectionEnd !== u.after.length) return false;
    undoTip.current = null;
    quiet.current = true; // после возврата подсказка не появляется снова, Enter — перенос строки
    drop();
    setTextAt(u.before, u.before.length);
    return true;
  };
  // Настройку выключили — подсказку убираем
  useEffect(() => { if (!suggestOn) drop(); }, [suggestOn]);
  // Курсор ушёл с конца текста или выделили — подсказка и «вернуть» больше не нужны
  const onSelectionMove = () => {
    const ta = textRef.current;
    if (!ta) return;
    const atEnd = ta.selectionStart === ta.selectionEnd && ta.selectionEnd === ta.value.length;
    if (!atEnd) { undoTip.current = null; if (tipRef.current) drop(); }
  };
  // Мобильные клавиатуры не всегда шлют keydown для Enter / Backspace — ловим ввод до вставки
  useEffect(() => {
    const ta = textRef.current;
    if (!ta) return;
    const onBefore = (e) => {
      if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") { if (tipRef.current && acceptTip()) e.preventDefault(); }
      else if (e.inputType === "deleteContentBackward") { if (undoTip.current && undoAccept()) e.preventDefault(); }
    };
    ta.addEventListener("beforeinput", onBefore);
    return () => ta.removeEventListener("beforeinput", onBefore);
  }, []);
  const onTextChange = (e) => {
    quiet.current = false; undoTip.current = null;
    if (tipRef.current) setGhostTip(null);
    sugCtl.current?.abort(); sugSeq.current++;
    change({ text: e.target.value });
    scheduleSuggest();
  };
  const onTextKey = (e) => {
    const plain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (!composing && plain) {
      if (e.key === "Enter" && tipRef.current && acceptTip()) { e.preventDefault(); return; }
      if (e.key === "Backspace" && undoTip.current && undoAccept()) { e.preventDefault(); return; }
    }
    if (e.key !== "Enter" || !plain || composing) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const r = continueChecklist(el.value, el.selectionStart);
    if (!r) return;
    e.preventDefault();
    quiet.current = false;
    setTextAt(r.text, r.pos);
    scheduleSuggest(); // новый пункт списка — подскажем следующее дело
  };
  const onTextClick = (e) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const next = toggleCheckAt(el.value, el.selectionStart);
    if (next != null) setTextAt(next, el.selectionStart);
  };

  // ── Вид ──
  const hasSel = (() => { const ta = textRef.current; return !!ta && ta.selectionEnd > ta.selectionStart; })();
  const canDiscuss = !!(text.trim() || title.trim());
  const photos = images.map((i) => ({ id: i.id, name: i.name, path: uid ? `${uid}/${i.id}` : null }));
  const pop = (k) => () => setMenu((m) => (m === k ? null : k));
  const keep = { onPointerDown: (e) => e.preventDefault() }; // кнопки инструментов не забирают фокус у текста (иначе пропадает выделение и прячется клавиатура)

  const aiButton = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button ref={aiBtnRef} type="button" className="nx-icon-btn" {...keep} onClick={pop("ai")} aria-haspopup="menu" aria-expanded={menu === "ai"}
        aria-label="ИИ в заметке" title="ИИ" style={{ ...round, width: phone ? 38 : 38, height: 38, borderColor: menu === "ai" || ai ? C.mint : C.borderStrong }}>
        {Icon.sparkle({ c: menu === "ai" || ai ? C.mint : C.text, s: 16 })}
      </button>
      {menu === "ai" && (
        <AiMenu anchorRef={aiBtnRef} onClose={() => setMenu(null)} onPick={runAi} onDiscuss={() => askAi("discuss")} onAnalyze={() => askAi("analyze")}
          canDiscuss={canDiscuss} suggestOn={suggestOn} setSuggestOn={setSuggestOn} hasSelection={hasSel} />
      )}
    </div>
  );
  const attachBtn = (
    <button type="button" className="nx-icon-btn" {...keep} onClick={() => fileRef.current?.click()} disabled={uploading > 0 || images.length >= NOTE_IMAGES_MAX}
      aria-label="Добавить картинку" title="Картинка" style={{ ...round, opacity: images.length >= NOTE_IMAGES_MAX ? 0.4 : 1 }}>
      {uploading > 0 ? <span aria-hidden="true" className="nx-spin" style={{ width: 14, height: 14, borderRadius: 999, border: `2px solid ${C.border}`, borderTopColor: C.mint }} /> : Icon.image({ c: C.text, s: 16 })}
    </button>
  );
  const clipBtn = (
    <button type="button" className="nx-icon-btn" {...keep} onClick={pasteImage} disabled={uploading > 0 || images.length >= NOTE_IMAGES_MAX}
      aria-label="Вставить фото из буфера обмена" title="Фото из буфера" style={{ ...round, opacity: images.length >= NOTE_IMAGES_MAX ? 0.4 : 1 }}>
      {Icon.copy({ c: C.text, s: 15 })}
    </button>
  );
  const checkBtn = (
    <button type="button" className="nx-icon-btn" {...keep} onClick={toggleList} aria-label="Чек-лист: сделать строки пунктами" title="Чек-лист" style={round}>
      {Icon.check({ c: C.text, s: 15 })}
    </button>
  );
  const schedBtn = (
    <button type="button" className="nx-icon-btn" onClick={() => setSched((v) => !v)} disabled={!canAct} aria-expanded={sched}
      aria-label="Добавить в расписание" title="В расписание" style={{ ...round, borderColor: sched ? C.mint : C.borderStrong, opacity: canAct ? 1 : 0.4 }}>
      {Icon.calendar({ c: sched ? C.mint : C.text, s: 15 })}
    </button>
  );
  const archBtn = (
    <button type="button" className="nx-icon-btn" onClick={toggleArchive} disabled={!canAct} aria-label={note?.archived ? "Вернуть из архива" : "Убрать в архив"} title={note?.archived ? "Вернуть из архива" : "В архив"}
      style={{ ...round, borderColor: note?.archived ? C.mint : C.borderStrong, opacity: canAct ? 1 : 0.4 }}>
      {Icon.archive({ c: note?.archived ? C.mint : C.text, s: 15 })}
    </button>
  );
  const delBtn = (
    <button type="button" className="nx-icon-btn" onClick={() => setConfirmDel(true)} aria-label="Удалить заметку" title="Удалить" style={round}>
      {Icon.trash({ c: C.text, s: 15 })}
    </button>
  );
  // Телефон: остальное — в меню «⋯»
  const moreMenu = menu === "more" && (
    <MoreMenu anchorRef={moreBtnRef} onClose={() => setMenu(null)} items={[
      { label: "В расписание", icon: Icon.calendar({ c: C.muted, s: 15 }), disabled: !canAct, run: () => setSched(true) },
      ...(note?.archived ? [] : [{ label: note?.pinned ? "Открепить" : "Закрепить", icon: Icon.pin({ c: note?.pinned ? C.mint : C.muted, s: 15 }), disabled: !exists, run: togglePin }]),
      { label: note?.archived ? "Вернуть из архива" : "В архив", icon: Icon.archive({ c: C.muted, s: 15 }), disabled: !canAct, run: toggleArchive },
      { label: "Удалить", icon: Icon.trash({ c: C.red, s: 15 }), danger: true, run: () => setConfirmDel(true) },
    ]} />
  );

  const errorLine = failed && (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.red, margin: "0 0 10px", lineHeight: 1.4 }}>
      <span style={{ minWidth: 0 }}>{failed === "full" ? "Больше 1000 заметок не помещается — удалите ненужные" : "Не сохранилось на этом устройстве — в браузере нет места. Скопируйте текст, чтобы не потерять"}</span>
      {failed !== "full" && <button type="button" className="nx-link-btn" onClick={() => commit()} style={linkBtn}>Повторить</button>}
    </div>
  );
  const notices = (
    <>
      {errorLine}
      {imgError && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.red, margin: "0 0 10px", lineHeight: 1.4 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{imgError}</span>
          <button type="button" onClick={() => setImgError("")} aria-label="Закрыть" style={{ ...btnReset, display: "flex", padding: 4 }}>{Icon.close({ c: C.muted, s: 12 })}</button>
        </div>
      )}
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
    </>
  );
  const tagsRow = (
    <div className="nx-notepad-in nx-notepad-tags" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: phone ? 8 : 12 }}>
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
  );
  const titleInput = (
    <input ref={titleRef} className={phone ? "nx-note-htitle" : "nx-notepad-in nx-notepad-etitle"} value={title} maxLength={NOTE_TITLE_MAX} placeholder="Заголовок" aria-label="Заголовок заметки"
      onChange={(e) => change({ title: e.target.value })}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); textRef.current?.focus(); } }}
      style={phone
        ? { flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: fontDisplay, fontSize: 20, fontWeight: 500, padding: "6px 4px", textOverflow: "ellipsis" }
        : { background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: fontDisplay, fontSize: 26, fontWeight: 500, padding: "4px 0 8px", width: "100%", textOverflow: "ellipsis" }} />
  );
  const showTip = ghostTip && ghostTip.base === text;
  const body = (
    <div style={{ position: "relative", flex: 1, minHeight: phone ? 0 : 120, display: "flex" }}>
      <textarea ref={textRef} value={text} maxLength={NOTE_TEXT_MAX} placeholder={phone ? "Текст заметки. Для списка дел — кнопка ☑ внизу" : "Текст"} aria-label="Текст заметки"
        onChange={onTextChange} onKeyDown={onTextKey} onClick={onTextClick} onPaste={onPaste}
        onSelect={onSelectionMove} onBlur={drop}
        className="nx-scroll nx-notepad-in nx-notepad-etext nx-note-text"
        style={{ flex: 1, minHeight: 0, resize: "none", background: "transparent", border: "none", outline: "none", color: C.text, position: "relative", zIndex: 1,
          fontFamily: "inherit", fontSize: 16, lineHeight: 1.65, padding: 0, width: "100%", overscrollBehavior: "contain" }} />
      {showTip && <GhostLayer taRef={textRef} text={text} tail={ghostTip.tail} />}
    </div>
  );
  const common = (
    <>
      <div className="nx-notepad-in">{notices}</div>
      {tagsRow}
      <div className="nx-notepad-in"><NoteImages images={images} uid={uid} scope={scope} phone={phone} onOpen={setViewImg} onRemove={removeImage} /></div>
      <div className="nx-notepad-in"><AiPanel ai={ai} onApply={applyAi} onCancel={cancelAi} onRetry={() => runAi(ai.task, ai.prompt)} /></div>
      {body}
    </>
  );
  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
  );
  const viewer = viewImg && <PhotoFullscreen photos={photos} startId={viewImg} onClose={() => setViewImg(null)} />;

  if (phone) {
    return (
      <div ref={rootRef} role="dialog" aria-modal="true" aria-label={exists ? `Заметка «${title.trim() || "Без названия"}»` : "Новая заметка"}
        className="nx-notepad-editor is-phone nx-note-in" data-no-swipe
        style={{ position: "fixed", inset: 0, zIndex: 250, background: C.bg, display: "flex", flexDirection: "column", boxSizing: "border-box", touchAction: "pan-y",
          padding: "calc(var(--sat) + 6px) 14px calc(var(--sab) + 6px)" }}>
        <div className="nx-note-bar" style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 46, marginBottom: 4, flexShrink: 0 }}>
          <button type="button" className="nx-icon-btn" onClick={close} aria-label="К списку заметок" style={round}>{Icon.arrowLeft({ c: C.text, s: 16 })}</button>
          {titleInput}
          {aiButton}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button ref={moreBtnRef} type="button" className="nx-icon-btn" onClick={pop("more")} aria-haspopup="menu" aria-expanded={menu === "more"} aria-label="Ещё" title="Ещё" style={round}>
              {Icon.dots({ c: C.text, s: 16 })}
            </button>
            {moreMenu}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{common}</div>
        <div className="nx-note-tools" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, flexShrink: 0 }}>
          {checkBtn}
          {attachBtn}
          {clipBtn}
          <span style={{ flex: 1 }} />
          {exists && <span style={{ fontSize: 12, color: C.mutedSoft }}>Изменено {noteWhen(note.updatedAt)}</span>}
        </div>
        {fileInput}
        {viewer}
      </div>
    );
  }

  return (
    <div ref={rootRef} role="dialog" aria-label={exists ? `Заметка «${title.trim() || "Без названия"}»` : "Новая заметка"}
      className="nx-notepad-editor nx-notepad-panel nx-glass nx-glass-subtle" data-no-swipe
      style={{ border: `1px solid ${C.lineBright}`, borderRadius: 32, display: "flex", flexDirection: "column", boxSizing: "border-box", position: "sticky", top: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button type="button" className="nx-icon-btn" onClick={close} aria-label="Закрыть заметку" style={round}>{Icon.close({ c: C.text, s: 15 })}</button>
        <div style={{ flex: 1 }} />
        {checkBtn}
        {attachBtn}
        {clipBtn}
        {schedBtn}
        {archBtn}
        {delBtn}
        {aiButton}
      </div>
      <div style={{ marginTop: 26 }}>{titleInput}</div>
      {common}
      {exists && <div className="nx-notepad-in" style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Изменено {noteWhen(note.updatedAt)}</div>}
      {fileInput}
      {viewer}
    </div>
  );
}

// Меню «⋯» на телефоне: остальные действия с заметкой
function MoreMenu({ items, onClose, anchorRef }) {
  const box = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e) => { if (!box.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose(); };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown); };
  }, [onClose, anchorRef]);
  return (
    <div ref={box} role="menu" aria-label="Действия с заметкой" className="nx-pop" style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, minWidth: 220, padding: 6, boxSizing: "border-box",
      background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, boxShadow: `0 14px 36px color-mix(in srgb, ${C.bg} 65%, transparent)`,
    }}>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" className="nx-row-btn" disabled={it.disabled}
          onClick={() => { onClose(); it.run(); }}
          style={{ ...btnReset, display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", borderRadius: 12, fontSize: 14, textAlign: "left", color: it.danger ? C.red : C.text, opacity: it.disabled ? 0.4 : 1 }}>
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}
