// Окно файла, фото на весь экран, «Открыть» / «Скачать», меню передачи и анимация отправки
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { isNative, isDesktop, nativeFile, clipboardWriteImage } from "../native.js";
import { desktopOpenFile, desktopSaveFile } from "../lib/desktop.js";
import { formatBytes } from "../lib/deviceInfo.js";
import { fileUrl, fileBlob, forgetUrl, safeFileName } from "../lib/files.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { fileBytes, formatWhen } from "../lib/format.js";
import { useMediaQuery } from "../lib/hooks.js";
import { btnReset, Spinner, StateButton, Dot, StateNote } from "./base.jsx";
import { FILE_SCOPE, FOLDERS, catOf, folderName, fileMeta } from "../lib/fileStore.js";
import { FileThumb } from "./files.jsx";

/* ОКНО ПРОСМОТРА ФАЙЛА — открывается поверх любого экрана.
   Всё работает в демо-режиме: "отправка" и "ссылка" только показывают
   сообщение, а удаление убирает файл из списка до перезагрузки страницы.
   Закрывается крестиком, клавишей Esc или кликом по затемнению. */
// devices — устройства с текущим статусом: отправить можно только на те, что в сети
// folders — все папки (вместе с созданными), onRename(name) — новое имя,
// onSent(устройство) — файл отправлен
/* ПОЛНОЭКРАННЫЙ ПРОСМОТР ФОТО — открывается из окна файла (нажатие на превью).
   photos — загруженные фото в том же порядке, что в списке; startId — с какого начать.
   Листать: стрелки на экране и ← → на клавиатуре, на телефоне — свайп влево/вправо.
   Приблизить: двойное нажатие (или двойной щелчок), щипок двумя пальцами, колёсико мыши;
   приближенное фото двигается пальцем/мышью. Закрыть: крестик, Esc, «Назад» Android,
   на телефоне — свайп вниз. Одиночное нажатие прячет/показывает панели.
   На компьютере ещё есть кнопка «На весь экран» — браузерный полноэкранный режим.
   Содержимое — то же, что у превью: копия в этом браузере или ссылка облака на час */
export const PHOTO_ZOOM = 2.5;   // во сколько раз приближает двойное нажатие

export const PHOTO_MAX = 5;      // больше не приближаем

export function PhotoFullscreen({ photos, startId, onClose }) {
  const [idx, setIdx] = useState(() => Math.max(0, photos.findIndex((p) => p.id === startId)));
  const photo = photos[Math.min(idx, photos.length - 1)];
  const [load, setLoad] = useState({ url: null, state: "loading" }); // loading | ready | error
  const [retry, setRetry] = useState(0);
  const [chrome, setChrome] = useState(true);   // видны ли панели сверху и стрелки
  const [zoomed, setZoomed] = useState(false);
  const [isFull, setIsFull] = useState(false);  // браузерный полноэкранный режим
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canFull = !isNative && typeof document !== "undefined" && !!document.fullscreenEnabled;
  const many = photos.length > 1;
  const go = useCallback((d) => setIdx((i) => Math.min(photos.length - 1, Math.max(0, i + d))), [photos.length]);

  // Положение картинки: масштаб и сдвиг. Меняется на каждый кадр жеста —
  // поэтому в ref и сразу в style, без перерисовки React
  const view = useRef({ s: 1, x: 0, y: 0 });
  const apply = (anim) => {
    const el = imgRef.current;
    if (!el) return;
    const { s, x, y } = view.current;
    el.style.transition = anim && !reduce ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)" : "none";
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  // Сдвиг не больше, чем позволяет увеличение — фото не уезжает за край
  const clamp = () => {
    const st = stageRef.current?.getBoundingClientRect();
    const v = view.current;
    if (!st) return;
    const mx = ((v.s - 1) * st.width) / 2, my = ((v.s - 1) * st.height) / 2;
    v.x = Math.max(-mx, Math.min(mx, v.x));
    v.y = Math.max(-my, Math.min(my, v.y));
  };
  // Приблизить к точке (px, py на экране) до масштаба s
  const zoomTo = (s, px, py, anim = true) => {
    const st = stageRef.current?.getBoundingClientRect();
    const v = view.current;
    s = Math.max(1, Math.min(PHOTO_MAX, s));
    if (st && px != null) {
      // Точка под пальцем остаётся на месте
      const cx = st.left + st.width / 2, cy = st.top + st.height / 2;
      const k = s / v.s;
      v.x = (px - cx) - k * (px - cx - v.x);
      v.y = (py - cy) - k * (py - cy - v.y);
    }
    v.s = s;
    if (s === 1) { v.x = 0; v.y = 0; }
    clamp();
    apply(anim);
    setZoomed(s > 1);
  };
  const resetView = (anim) => { view.current = { s: 1, x: 0, y: 0 }; apply(anim); setZoomed(false); };

  // Новое фото: грузим содержимое, сбрасываем приближение
  useEffect(() => {
    let off = false;
    setLoad({ url: null, state: "loading" });
    view.current = { s: 1, x: 0, y: 0 };
    setZoomed(false);
    fileUrl(photo, FILE_SCOPE)
      .then((url) => { if (!off) setLoad(url ? { url, state: "loading" } : { url: null, state: "error" }); })
      .catch(() => { if (!off) setLoad({ url: null, state: "error" }); });
    return () => { off = true; };
  }, [photo?.id, retry]);
  // Соседние фото заранее — листание без ожидания
  useEffect(() => {
    for (const p of [photos[idx - 1], photos[idx + 1]]) if (p) fileUrl(p, FILE_SCOPE).catch(() => {});
  }, [idx, photos]);

  // Клавиши. Слушаем раньше всех (capture): Esc закрывает только фото, а не окно файла под ним
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeRef.current(); }
      else if (e.key === "ArrowLeft") { e.stopPropagation(); go(-1); }
      else if (e.key === "ArrowRight") { e.stopPropagation(); go(1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go]);
  // Фокус — на окно (клавиатура и экранный диктор сразу внутри); при закрытии — выйти из полноэкранного
  useEffect(() => {
    const prev = document.activeElement;
    rootRef.current?.focus();
    const onFull = () => setIsFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      document.removeEventListener("fullscreenchange", onFull);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      prev?.focus?.();
    };
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  // ── Жесты: один палец/мышь — двигать или листать, два пальца — щипок ──
  const ptrs = useRef(new Map());
  const g = useRef(null);         // текущий жест
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const tapTimer = useRef(0);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const onDown = (e) => {
    // Правая кнопка мыши и кнопки на сцене («Повторить») — не жест
    if (e.button > 0 || e.target.closest?.("button")) return;
    stageRef.current.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      g.current = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: v.s, moved: true };
    } else if (ptrs.current.size === 1) {
      g.current = { x0: e.clientX, y0: e.clientY, t0: Date.now(), vx: v.x, vy: v.y, moved: false };
    }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId) || !g.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current, G = g.current;
    if (G.pinch && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(G.s0 * (d / G.d0), (a.x + b.x) / 2, (a.y + b.y) / 2, false);
      return;
    }
    if (G.pinch) return;
    const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) G.moved = true;
    if (v.s > 1) {             // приближено — двигаем фото
      v.x = G.vx + dx; v.y = G.vy + dy; clamp(); apply(false);
    } else if (G.moved && e.pointerType !== "mouse") {
      // Обычный масштаб: фото идёт за пальцем — влево/вправо (листать) или вниз (закрыть)
      if (Math.abs(dx) > Math.abs(dy)) { v.x = many ? dx : dx * 0.25; v.y = 0; }
      else { v.x = 0; v.y = Math.max(0, dy); }
      apply(false);
      if (rootRef.current) rootRef.current.style.backgroundColor = v.y > 0 ? `color-mix(in srgb, ${C.photoBg} ${Math.max(40, 100 - v.y / 4)}%, transparent)` : "";
    }
  };
  const onUp = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const G = g.current, v = view.current;
    if (!G) return;
    if (G.pinch) {
      if (ptrs.current.size === 0) { g.current = null; if (v.s < 1.05) resetView(true); }
      return;
    }
    g.current = null;
    if (rootRef.current) rootRef.current.style.backgroundColor = "";
    const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
    if (!G.moved) {
      // Нажатие: два подряд — приблизить/отдалить, одно — спрятать/показать панели
      const now = Date.now(), lt = lastTap.current;
      if (now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        clearTimeout(tapTimer.current);
        lastTap.current = { t: 0, x: 0, y: 0 };
        if (v.s > 1) resetView(true); else zoomTo(PHOTO_ZOOM, e.clientX, e.clientY);
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => setChrome((c) => !c), 300);
      }
      return;
    }
    if (v.s > 1 || e.pointerType === "mouse") return;
    const fast = Date.now() - G.t0 < 300;
    if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > 70 || (fast && Math.abs(dx) > 30))) {
      const d = dx < 0 ? 1 : -1;
      if (photos[idx + d]) { view.current = { s: 1, x: 0, y: 0 }; apply(false); go(d); return; }
    } else if (dy > 110 || (fast && dy > 50)) { closeRef.current(); return; }
    resetView(true);   // не засчитано — мягко на место
  };
  const onWheel = (e) => {
    // Колёсико: приблизить/отдалить к курсору
    e.preventDefault();
    zoomTo(view.current.s * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY, false);
    if (view.current.s <= 1.01) resetView(false);
  };

  // Жесты вешаем на сцену напрямую (не через props React): так первое же касание
  // после открытия доходит до обработчика. Свежие функции — через ref
  const gestures = useRef({});
  gestures.current = { onDown, onMove, onUp, onWheel };
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const on = (type, name, opts) => { const fn = (e) => gestures.current[name](e); el.addEventListener(type, fn, opts); return () => el.removeEventListener(type, fn, opts); };
    const offs = [
      on("pointerdown", "onDown"), on("pointermove", "onMove"), on("pointerup", "onUp"), on("pointercancel", "onUp"),
      // Колёсико: preventDefault — чтобы не прокручивалась страница под фото
      on("wheel", "onWheel", { passive: false }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  if (!photo) return null;
  const onFoldC = C.onFold;
  const pill = { ...btnReset, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    background: `color-mix(in srgb, ${C.photoBg} 55%, transparent)`, border: `1px solid color-mix(in srgb, ${onFoldC} 22%, transparent)` };
  const fade = { opacity: chrome ? 1 : 0, pointerEvents: chrome ? "auto" : "none", transition: reduce ? "none" : "opacity 200ms ease" };

  return createPortal(
    <div ref={rootRef} className="nx-photo-full" role="dialog" aria-modal="true" aria-label={`Фото «${photo.name}»`} tabIndex={-1} data-no-swipe
      // Нажатия внутри фото не доходят до окна файла под ним (портал «всплывает» по дереву React)
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 800, background: C.photoBg, color: onFoldC, outline: "none", display: "flex", flexDirection: "column", touchAction: "none" }}>
      {/* Сцена с фото. Жесты ловим здесь */}
      <div ref={stageRef}
        style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: zoomed ? "grab" : "zoom-in" }}>
        {load.url && load.state !== "error" && (
          <img ref={imgRef} key={photo.id} src={load.url} alt={photo.name} draggable={false}
            onLoad={() => { setLoad((l) => ({ ...l, state: "ready" })); apply(false); }}
            onError={() => setLoad({ url: null, state: "error" })}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", userSelect: "none", WebkitUserDrag: "none",
              opacity: load.state === "ready" ? 1 : 0, transition: reduce ? "none" : "opacity 180ms ease", willChange: "transform" }} />
        )}
        {load.state === "loading" && (
          <div role="status" style={{ position: "absolute", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: onFoldC, opacity: 0.8 }}>
            <Spinner s={16} /> Загружаем фото…
          </div>
        )}
        {load.state === "error" && (
          <div role="alert" style={{ position: "absolute", textAlign: "center", padding: 24, maxWidth: 320 }}>
            <div style={{ fontSize: 15, marginBottom: 6 }}>Фото не загрузилось</div>
            <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.45, marginBottom: 14 }}>
              {navigator.onLine === false ? "Нет связи — фото лежит в облаке. Подключитесь к сети и повторите" : "Не удалось получить содержимое файла"}
            </div>
            <button type="button" className="nx-ghost-btn"
              onClick={() => { forgetUrl(FILE_SCOPE, photo.id); setRetry((n) => n + 1); }}
              style={{ ...btnReset, padding: "10px 18px", fontSize: 13, color: onFoldC, border: `1px solid color-mix(in srgb, ${onFoldC} 40%, transparent)` }}>
              Повторить
            </button>
          </div>
        )}
      </div>

      {/* Верхняя панель: имя, номер, полноэкранный режим, закрыть */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "calc(var(--sat) + 12px) 16px 12px",
        background: `linear-gradient(${C.photoBg}, transparent)`, ...fade }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{photo.name}</div>
          {many && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{idx + 1} из {photos.length}</div>}
        </div>
        {zoomed && (
          <button type="button" className="nx-icon-btn" onClick={() => resetView(true)} aria-label="Показать фото целиком" title="Показать целиком" style={pill}>
            {Icon.shrink({ c: onFoldC, s: 18 })}
          </button>
        )}
        {canFull && (
          <button type="button" className="nx-icon-btn" onClick={toggleFull} aria-label={isFull ? "Выйти из полноэкранного режима" : "На весь экран"} title={isFull ? "Выйти из полноэкранного режима" : "На весь экран"} style={pill}>
            {(isFull ? Icon.shrink : Icon.expand)({ c: onFoldC, s: 18 })}
          </button>
        )}
        <button type="button" className="nx-icon-btn" onClick={() => closeRef.current()} aria-label="Закрыть фото" title="Закрыть (Esc)" style={pill}>
          {Icon.close({ c: onFoldC, s: 18 })}
        </button>
      </div>

      {/* Стрелки листания — по краям, по центру высоты */}
      {many && idx > 0 && (
        <button type="button" className="nx-icon-btn nx-photo-arrow" onClick={() => go(-1)} aria-label="Предыдущее фото"
          style={{ ...pill, position: "absolute", left: 16, top: "50%", marginTop: -22, ...fade }}>
          {Icon.arrowLeft({ c: onFoldC, s: 18 })}
        </button>
      )}
      {many && idx < photos.length - 1 && (
        <button type="button" className="nx-icon-btn nx-photo-arrow" onClick={() => go(1)} aria-label="Следующее фото"
          style={{ ...pill, position: "absolute", right: 16, top: "50%", marginTop: -22, ...fade }}>
          <span style={{ display: "flex", transform: "scaleX(-1)" }}>{Icon.arrowLeft({ c: onFoldC, s: 18 })}</span>
        </button>
      )}
    </div>,
    document.body,
  );
}

export function FileViewer({ file, folders = FOLDERS, devices = [], photos = [], siblings = [], onNavigate, pop = true, onClose, onDelete, onRename, onSent, onToast, onContinue }) {
  // Полноэкранный просмотр: только у загруженных фото (у демо-файлов нет содержимого)
  const [fullPhoto, setFullPhoto] = useState(false);
  const canFullPhoto = !!file.uploaded && file.cat === "photo";
  // Переименование: editing — открыто ли поле, draft — что сейчас введено
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const draftName = draft.trim();
  const draftError = !draftName ? "Введите имя" : /[\\/]/.test(draftName) ? "Без символов / и \\" : null;
  const startRename = () => { setDraft(file.name); setEditing(true); };
  const saveRename = () => {
    if (draftError) return;
    if (draftName !== file.name) {
      onRename(draftName);
      onToast?.({ title: "Файл переименован", text: draftName });
    }
    setEditing(false);
  };
  const [sendOpen, setSendOpen] = useState(false);   // открыт ли выбор устройства
  // Состояние отправки: на какое устройство и как идёт ("loading" / "success" / "error")
  const [send, setSend] = useState(null);
  const sendTimer = useRef(null);
  useEffect(() => () => clearTimeout(sendTimer.current), []);
  const deviceByName = (n) => devices.find((d) => d.name === n || d.alias === n);
  const sendTo = (target) => {
    setSend({ to: target, state: "loading" });
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      const dev = deviceByName(target);
      if (dev && !dev.online) {
        setSend({ to: target, state: "error" });
        return;
      }
      setSend({ to: target, state: "success" });
      // onSent — общее «дошло»: уведомление и отметка у устройства на Главной
      if (onSent && dev) onSent(dev);
      else onToast?.({ title: "Файл отправлен", text: `${file.name} → ${target}` });
    }, 900);
  };
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const cat = catOf(file);
  /* Листание: соседние файлы того списка, откуда открыли окно (папка, категория, недавние) */
  const at = siblings.findIndex((f) => f.id === file.id);
  const prevFile = at > 0 ? siblings[at - 1] : null;
  const nextFile = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;
  const step = (d) => { const f = d < 0 ? prevFile : nextFile; if (f && onNavigate) onNavigate(f.id); };
  const stepRef = useRef(step); stepRef.current = step;
  // ← → на клавиатуре — соседний файл (не в поле ввода, не при полноэкранном фото и подтверждении удаления)
  const busyRef = useRef(false); busyRef.current = editing || fullPhoto || confirmDel;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || busyRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target?.closest?.("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Свайп по превью на сенсорном экране: влево — следующий, вправо — предыдущий
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; };
  const onTouchEnd = (e) => {
    const s0 = touch.current; touch.current = null;
    const t = e.changedTouches[0]; if (!s0 || !t) return;
    const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };
  const arrow = (d) => {
    const f = d < 0 ? prevFile : nextFile;
    return (
      <button type="button" className="nx-icon-btn nx-viewer-arrow" onClick={(e) => { e.stopPropagation(); step(d); }} disabled={!f}
        aria-label={d < 0 ? "Предыдущий файл" : "Следующий файл"} title={f ? f.name : undefined} style={{
          ...btnReset, position: "absolute", top: "50%", [d < 0 ? "left" : "right"]: 8, transform: "translateY(-50%)", zIndex: 1,
          width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          background: `color-mix(in srgb, ${C.photoBg} 70%, transparent)`, opacity: f ? 1 : 0.35,
        }}>
        <span style={{ display: "flex", transform: d < 0 ? "rotate(180deg)" : "none" }}>{Icon.chevron({ c: C.onFold, s: 18 })}</span>
      </button>
    );
  };
  const many = siblings.length > 1 && at >= 0 && !!onNavigate;

  // Esc закрывает окно; пока окно открыто, страница под ним не скроллится
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

   const share = () => {
    const link = `nexa://file/${file.id}`;
    try { navigator.clipboard?.writeText(link); } catch {}
    onToast?.({ title: "Ссылка скопирована", text: link });
    setSendOpen(false);
  };

  const info = [
    ["Тип", cat.label],
    ["Размер", formatBytes(fileBytes(file))],
    ["Изменён", formatWhen(file)],
    ["Устройство", file.device],
    ["Папка", folderName(folders, file.folder)],
  ];

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 999,
    padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
  };

  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {/* stopPropagation — клик внутри окна не должен его закрывать */}
      <div
        role="dialog" aria-modal="true" aria-label={file.name}
        className={`nx-viewer-panel${pop ? " nx-pop" : ""} nx-scroll`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 16,
          boxSizing: "border-box", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              // Поле с именем: Enter — сохранить, Esc — отменить (окно при этом не закрывается)
              <form onSubmit={(e) => { e.preventDefault(); saveRename(); }} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  autoFocus
                  className="nx-input"
                  value={draft}
                  maxLength={80}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }}
                  onFocus={(e) => {
                    // Выделяем имя без расширения — чтобы его было удобно заменить
                    const dot = e.target.value.lastIndexOf(".");
                    e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                  }}
                  aria-label="Имя файла"
                  aria-invalid={!!draftError}
                  style={{
                    flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: "inherit",
                    fontSize: 16, padding: "6px 10px", borderRadius: 10, outline: "none",
                    border: `1px solid ${draftError ? C.red : C.borderStrong}`,
                  }}
                />
                <button type="submit" className="nx-icon-btn" aria-label="Сохранить имя" disabled={!!draftError} style={{
                  ...btnReset, width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.check({ c: C.green, s: 18 })}
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <button type="button" className="nx-icon-btn" onClick={startRename} aria-label="Переименовать" title="Переименовать" style={{
                  ...btnReset, width: 28, height: 28, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.edit({ c: C.muted, s: 15 })}
                </button>
              </div>
            )}
            <div style={{ fontSize: 12, color: draftError && editing ? C.red : C.mutedSoft, marginTop: 2 }}>
              {editing ? draftError || "Enter — сохранить, Esc — отменить" : `${fileMeta(file)}${many ? ` · ${at + 1} из ${siblings.length}` : ""}`}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {/* Превью: та же миниатюра, только крупно */}
        <div style={{ padding: "0 18px" }}>
          <div style={{ position: "relative" }} onTouchStart={many ? onTouchStart : undefined} onTouchEnd={many ? onTouchEnd : undefined}>
          {many && arrow(-1)}
          {many && arrow(1)}
          {canFullPhoto ? (
            <button type="button" className="nx-viewer-preview nx-photo-open" onClick={() => setFullPhoto(true)}
              aria-label="Открыть фото на весь экран" title="Открыть на весь экран"
              style={{ ...btnReset, display: "flex", width: "100%", position: "relative", cursor: "zoom-in", borderRadius: 8 }}>
              <FileThumb file={file} w="100%" h={220} iconSize={44} radius={8} fit="contain" />
              {/* Подсказка в углу: превью открывается на весь экран */}
              <span aria-hidden="true" style={{
                position: "absolute", right: 10, bottom: 10, display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 999, fontSize: 12, color: C.onFold,
                background: `color-mix(in srgb, ${C.photoBg} 70%, transparent)`,
              }}>
                {Icon.expand({ c: C.onFold, s: 14 })} На весь экран
              </span>
            </button>
          ) : (
            <div className="nx-viewer-preview" style={{ display: "flex" }}>
              <FileThumb file={file} w="100%" h={220} iconSize={44} radius={8} fit="contain" />
            </div>
          )}
          </div>
          {fullPhoto && (
            <PhotoFullscreen photos={photos.some((p) => p.id === file.id) ? photos : [file]} startId={file.id} onClose={() => setFullPhoto(false)} />
          )}
          {/* Содержимое: открыть и скачать (только у загруженных; у демо-файлов его нет) */}
          {file.uploaded
            ? <FileContentActions file={file} onToast={onToast} />
            : <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Демо-файл: содержимого нет, только пример в списке</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", padding: "18px 18px 4px", fontSize: 13 }}>
          {info.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ color: C.mutedSoft }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          {confirmDel ? (
            // Подтверждение удаления заменяет ряд кнопок
            <div className="nx-pop" style={{ border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>Удалить файл?</div>
              <div style={{ fontSize: 12, color: C.mutedSoft, marginBottom: 12 }}>
                «{file.name}» пропадёт из всех папок и списков.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => { onDelete(file); onToast?.({ title: "Файл удалён", text: file.name }); }} style={{ ...ghostBtn, color: C.red, borderColor: C.red }}>
                  {Icon.trash({ c: C.red, s: 16 })} Удалить
                </button>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghostBtn}>Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <div className="nx-viewer-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="nx-primary" onClick={() => { setSendOpen(!sendOpen); setSend(null); }} aria-expanded={sendOpen} style={{
                  ...ghostBtn, border: "1px solid transparent", color: C.onFold, fontWeight: 500,
                  background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
                }}>
                  {Icon.send({ c: C.onFold, s: 16 })} Отправить на устройство
                </button>
                {/* Открыть этот же файл на другом своём устройстве (только файлы в облаке аккаунта) */}
                {onContinue && file.path && (
                  <button type="button" className="nx-ghost-btn" onClick={() => onContinue(file)} style={ghostBtn}>
                    {Icon.shareUp({ c: C.text, s: 16 })} Продолжить на устройстве
                  </button>
                )}
                <button type="button" className="nx-ghost-btn" onClick={share} style={ghostBtn}>
                  {Icon.share({ c: C.text, s: 16 })} Поделиться
                </button>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(true)} style={{ ...ghostBtn, color: C.red }}>
                  {Icon.trash({ c: C.red, s: 16 })} Удалить
                </button>
              </div>

              {/* Выбор устройства: само устройство, где лежит файл, не предлагаем */}
              {sendOpen && (
                <div className="nx-pop" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Куда отправить?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {devices.filter((x) => x.name !== file.device && x.alias !== file.device).map((x) => x.name).map((d) => {
                      const dev = deviceByName(d);
                      return (
                        <StateButton
                          key={d}
                          state={send && send.to === d ? send.state : "idle"}
                          labels={{ loading: "Отправка…", success: "Отправлено", error: "Не в сети" }}
                          // Отключённые устройства видно сразу: серая точка рядом с именем
                          icon={<Dot color={dev && !dev.online ? C.mutedSoft : C.green} />}
                          disabled={send?.state === "loading"}
                          onClick={() => sendTo(d)}
                          style={{ padding: "8px 14px" }}
                        >
                          {d}
                        </StateButton>
                      );
                    })}
                  </div>
                  {send?.state === "error" && (
                    <div style={{ marginTop: 10 }}>
                      <StateNote kind="error">
                        {send.to} сейчас не в сети, файл не отправлен. Подключите устройство
                        на главном экране и попробуйте ещё раз.
                      </StateNote>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* «Открыть» и «Скачать» содержимое файла. Ссылка — из этого браузера (IndexedDB)
   или временная подписанная ссылка облака. В приложении — всегда ссылка облака:
   её откроет системный браузер */
/* Открыть или скачать содержимое файла.
   Сайт: «Открыть» — новая вкладка. Её открываем сразу по нажатию, а адрес
   подставляем, когда он готов: иначе Safari и Firefox считают вкладку
   навязчивым окном и блокируют. «Скачать» — ссылка с именем файла.
   Приложение: встроенный браузер этого не умеет — через модуль NexaFiles
   (сохранить в «Загрузки» или открыть другим приложением).
   Ответ — true / false (не получилось — показать уведомление) */
export async function openFileContent(file, scope, download) {
  const cloud = scope !== "guest" && !!file.path;
  if (isNative) {
    if (cloud) {
      const url = await fileUrl({ ...file, id: `cloud-${file.id}` }, scope);
      return !!url && nativeFile(download ? "save" : "open", { url, name: safeFileName(file.name), mime: file.mime });
    }
    const local = await fileUrl(file, scope);
    if (!local) return false;
    const blob = await (await fetch(local)).blob();
    return nativeFile(download ? "save" : "open", { blob, name: safeFileName(file.name), mime: file.mime || blob.type });
  }
  if (isDesktop) {
    // Приложение для ПК: окно Tauri не скачивает и не открывает вкладки — берём байты
    // (копия на этом устройстве, иначе подписанная ссылка облака) и отдаём оболочке.
    // Ответ: "saved" | "cancelled" | "opened" | "blocked" | false
    const url = await fileUrl(file, scope);
    if (!url) return false;
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const name = safeFileName(file.name);
    return download ? desktopSaveFile(blob, name) : desktopOpenFile(blob, name);
  }
  if (download) {
    const url = cloud ? await fileUrl(file, scope, { download: true }) : await fileUrl(file, scope);
    if (!url) return false;
    const a = document.createElement("a");
    a.href = url; a.rel = "noopener noreferrer"; a.download = safeFileName(file.name);
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  const win = window.open("", "_blank"); // сразу — пока нажатие «свежее»
  const url = await fileUrl(file, scope);
  if (!url) { win?.close(); return false; }
  if (win) { win.opener = null; win.location.href = url; return true; }
  // Вкладку всё-таки не дали открыть — обычной ссылкой
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
  return true;
}

export function FileContentActions({ file, onToast }) {
  const [state, setState] = useState(null); // null | "open" | "download" | "copy" — что сейчас готовим
  const go = async (download) => {
    setState(download ? "download" : "open");
    try {
      const ok = await openFileContent(file, FILE_SCOPE, download);
      if (ok && download && isNative) onToast?.({ title: "Файл сохранён", text: `«${file.name}» — в папке «Загрузки»` });
      if (ok === "saved") onToast?.({ title: "Файл сохранён", text: `«${file.name}»` });
      // Программы и сценарии по «Открыть» не запускаем — только сохранить
      if (ok === "blocked") onToast?.({ title: "Такой файл NEXA не открывает", text: "Это может быть программа. Нажмите «Скачать» и откройте сами, если доверяете файлу" });
      if (!ok) {
        onToast?.({
          title: download ? "Не получилось скачать" : "Не получилось открыть",
          text: navigator.onLine === false ? "Нет связи — файл ещё не скачан на это устройство"
            : isNative && !download ? "Нет приложения, которое умеет открывать такие файлы, или файл недоступен"
            : "Файл добавили до появления хранилища — содержимое не сохранилось",
        });
      }
    } catch {
      onToast?.({ title: "Не получилось", text: "Попробуйте ещё раз" });
    } finally { setState(null); }
  };
  // «Копировать» — само фото в буфер обмена (вставить в мессенджер, документ). Байты — копия
  // на этом устройстве или своя корзина облака; запрос буфера — сразу по нажатию
  const copy = async () => {
    setState("copy");
    try {
      const ok = await clipboardWriteImage(fileBlob(file, FILE_SCOPE), safeFileName(file.name));
      onToast?.(ok === true ? { title: "Фото скопировано", text: "Вставьте его, где нужно" }
        : ok === "old_app" ? { title: "Не получилось скопировать", text: "Обновите приложение NEXA — копирование фото появилось в новой версии" }
        : { title: "Не получилось скопировать", text: navigator.onLine === false ? "Нет связи — фото ещё не скачано на это устройство" : "Буфер обмена не принял картинку — попробуйте «Скачать»" });
    } finally { setState(null); }
  };
  const btn = { ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      <button type="button" className="nx-ghost-btn" onClick={() => go(false)} disabled={!!state} style={btn}>
        {state === "open" ? <Spinner s={13} /> : Icon.shareUp({ c: C.text, s: 15 })} Открыть
      </button>
      <button type="button" className="nx-ghost-btn" onClick={() => go(true)} disabled={!!state} style={btn}>
        {state === "download" ? <Spinner s={13} /> : Icon.download({ c: C.text, s: 15 })} Скачать
      </button>
      {file.cat === "photo" && (
        <button type="button" className="nx-ghost-btn" onClick={copy} disabled={!!state} style={btn}>
          {state === "copy" ? <Spinner s={13} /> : Icon.copy({ c: C.text, s: 15 })} Копировать
        </button>
      )}
      <span style={{ alignSelf: "center", fontSize: 12, color: C.mutedSoft }}>
        {FILE_SCOPE === "guest" ? "Хранится только в этом браузере" : "Хранится в облаке аккаунта"}
      </span>
    </div>
  );
}

/* ═══ ПЕРЕДАЧА ФАЙЛА НА УСТРОЙСТВО ═══════════════════════════
   1) У файла кнопка «Передать на…» → 2) меню с устройствами →
   3) карточка файла сгибается по диагонали (как складка) и улетает
   к иконке выбранного устройства → 4) уведомление и отметка
   «Получен файл» у устройства на Главной. */
export const FLIGHT_MS = 600;          // длительность полёта карточки

export const RECEIVED_MS = 20000;      // сколько держится отметка «Получен файл»

// Отметка «Получен файл» у устройства: мятная рамка, появляется мягко
export function ReceivedTag({ name, compact }) {
  return (
    <span className="nx-pop" title={name ? `Получен файл: ${name}` : undefined} style={{
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
      fontSize: compact ? 10.5 : 11, color: C.mint, lineHeight: 1.2,
      border: `1px solid color-mix(in srgb, ${C.mint} 55%, transparent)`, borderRadius: 10,
      padding: compact ? "1px 5px" : "2px 6px",
    }}>
      {Icon.check({ c: C.mint, s: 11 })} Получен файл
    </span>
  );
}

// Кнопка «Передать на…» в строке файла. На телефоне — только значок
export function TransferBtn({ onClick }) {
  return (
    <button type="button" className="nx-ghost-btn nx-transfer-btn" onClick={onClick} aria-label="Передать на…" title="Передать на…" style={{
      ...btnReset, display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
      border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "6px 12px", fontSize: 12,
    }}>
      {Icon.send({ c: C.text, s: 14 })}
      <span className="nx-transfer-label">Передать на…</span>
    </button>
  );
}

export function TransferMenu({ anchor, file, devices, sendingId, onPick, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busy = sendingId != null;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  // Закрываем по клику мимо, Esc, прокрутке и смене размера окна
  // (пока карточка летит — не закрываем, чтобы не потерять цель)
  useEffect(() => {
    const close = () => { if (!busyRef.current) closeRef.current(); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const key = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", down);
    window.addEventListener("touchstart", down);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    // Фокус в меню — дальше Tab ведёт по устройствам (рамку не рисуем, пока не нажмут Tab)
    ref.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  // Своё устройство (где файл уже лежит) не предлагаем
  const list = devices.filter((d) => d.name !== file.device && d.alias !== file.device);
  // Позиция: под кнопкой, по правому краю; не помещается снизу — над кнопкой
  const W = 256;
  const H = 58 + list.length * 50;
  const left = Math.min(Math.max(12, anchor.right - W), window.innerWidth - W - 12);
  const below = anchor.bottom + 6;
  const top = below + H > window.innerHeight - 12 ? Math.max(12, anchor.top - 6 - H) : below;

  return (
    <div ref={ref} role="menu" aria-label="Передать на устройство" tabIndex={-1} className="nx-pop" style={{
      position: "fixed", left, top, width: W, zIndex: 320, boxSizing: "border-box", textAlign: "left", outline: "none",
      background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: 6,
    }}>
      <div style={{ padding: "6px 8px 8px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: C.muted }}>Передать на…</div>
        <div style={{ fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 13, color: C.mutedSoft, padding: "10px 8px" }}>Других устройств пока нет</div>
      )}
      {list.map((d) => {
        const sending = sendingId === d.id;
        return (
          <button key={d.id} type="button" role="menuitem" className="nx-row-btn"
            disabled={!d.online || (busy && !sending)}
            onClick={(e) => !busy && onPick(d, e.currentTarget.querySelector("[data-target]"))}
            style={{ ...btnReset, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 10, boxSizing: "border-box" }}>
            {/* Сюда прилетит карточка файла */}
            <span data-target style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: 10, boxSizing: "border-box",
              border: `1px solid ${sending ? C.mint : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "border-color 200ms ease",
            }}>
              {d.icon({ c: C.text, s: 17 })}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ display: "block", fontSize: 11, color: sending ? C.mint : C.mutedSoft, marginTop: 1 }}>
                {sending ? "Отправка…" : d.online ? "В сети" : "Не в сети"}
              </span>
            </span>
            {sending ? <Spinner /> : <Dot color={d.online ? C.green : C.red} />}
          </button>
        );
      })}
    </div>
  );
}

/* Полёт карточки: копия карточки файла поверх всего.
   0–35% — карточка сгибается по диагонали: нижний левый угол (flap,
   цветная обратная сторона) перелистывается к правому верхнему,
   и остаётся треугольник-складка. 35–100% — складка уменьшается
   и летит к иконке устройства. Двигаем только transform/opacity/clip-path */
export const RECT4 = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";

export const TRI4 = "polygon(0 0, 100% 0, 100% 100%, 0 0)";

export function FoldFlight({ file, from: row, to, onDone }) {
  const box = useRef(null), base = useRef(null), flap = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Летит компактная карточка (миниатюра + имя) с левого края строки:
  // у широкой строки сгиб по диагонали выглядел бы тонкой полосой
  const from = { left: row.left, top: row.top, height: row.height, width: Math.min(row.width, 260) };
  useLayoutEffect(() => {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    // Во сколько раз уменьшить: до размера иконки устройства
    const k = Math.max(0.06, Math.min(0.5, to.width / from.width));
    const opts = { duration: FLIGHT_MS, easing: "cubic-bezier(0.55, 0, 0.25, 1)", fill: "forwards" };
    const flight = box.current.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: "translate(0, 0) scale(0.92)", opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-10deg)`, opacity: 0.35 },
    ], opts);
    base.current.animate([{ clipPath: RECT4 }, { clipPath: TRI4, offset: 0.35 }, { clipPath: TRI4 }], opts);
    flap.current.animate([
      { clipPath: "polygon(0 0, 0 100%, 100% 100%)", opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%)", opacity: 1, offset: 0.35 },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%)", opacity: 1 },
    ], opts);
    flight.onfinish = () => doneRef.current();
    return () => flight.cancel();
  }, []);
  return (
    <div ref={box} aria-hidden="true" style={{
      position: "fixed", left: from.left, top: from.top, width: from.width, height: from.height,
      zIndex: 400, pointerEvents: "none", willChange: "transform, opacity",
    }}>
      {/* Лицевая сторона: та же карточка файла */}
      <div ref={base} style={{
        position: "absolute", inset: 0, boxSizing: "border-box", background: C.panel,
        border: `1px solid ${C.borderStrong}`, borderRadius: 10,
        display: "flex", alignItems: "center", gap: 14, padding: "0 12px", overflow: "hidden",
      }}>
        <FileThumb file={file} />
        <span style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</span>
      </div>
      {/* Загнутый угол: обратная сторона в цветах бренда и тёмная грань сгиба */}
      <div ref={flap} style={{
        position: "absolute", inset: 0, opacity: 0,
        background: `linear-gradient(225deg, color-mix(in srgb, ${C.foldDeep} 55%, transparent), transparent 60%), linear-gradient(135deg, ${C.foldBlue}, ${C.foldCyan})`,
      }} />
    </div>
  );
}
