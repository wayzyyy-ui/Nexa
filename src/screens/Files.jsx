// Экран «Файлы»: папки, загрузки, очередь
import { useState, useRef, useEffect, useMemo } from "react";
import { C, fontDisplay } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { plural } from "../lib/format.js";
import { btnReset, Spinner, EmptyState } from "../ui/base.jsx";
import { FOLDERS, MEDIA_CATS, sortByRecent, folderName, fileMeta } from "../lib/fileStore.js";
import { MediaLayout, MediaTitle, Crumb } from "../ui/layout.jsx";
import { FolderThumb, FileThumb } from "../ui/files.jsx";
import { TransferBtn } from "../ui/FileViewer.jsx";
import { clipboardRead, clipboardReadImage } from "../native.js";
import { readClipForFile, clipDefaultName, clipFinalName } from "../lib/clipFile.js";
import { useModalLock } from "../lib/hooks.js";
import { useLongPress, FileMenu, SelectBar } from "../ui/fileSelect.jsx";
import { vibrate } from "../native.js";

// ЭКРАН "ФАЙЛЫ" — путь навигации (хлебные крошки), поиск, папки и файлы.
// filter — id категории, если пришли сюда из "Медиа" (тогда показываем
// плоский список файлов этой категории из всех папок).
// device — устройство, если пришли из окна устройства (тогда показываем
// плоский список файлов с этого устройства).
// folders — все папки (демо + созданные), uploads — идущие загрузки,
// onAddFiles(список, папка) — добавить файлы, onCreateFolder(имя, родитель) — новая папка
// onTransfer(файл, карточка, кнопка) — открыть меню «Передать на…»
// onUploadAction(id, "cancel" | "retry" | "dismiss") — управление строкой загрузки
// onNearby — «Рядом»: файл на соседний телефон без интернета (только Android-приложение)
// onBack — пришли из «Медиа»: «Назад» возвращает туда (вкладка и прокрутка на месте); onToast — всплывающее
const FILES_PAGE = 60; // сколько строк файлов рисовать за раз

/* Строка файла. Нажатие — открыть (в режиме выделения — отметить), долгое нажатие / правая кнопка —
   меню файла (в режиме выделения — тоже отметить). data-transfer-card — отсюда полетит карточка при передаче */
function FileRowItem({ f, rowStyle, meta, selecting, selected, onOpen, onToggle, onLong, onTransfer }) {
  const card = useRef(null);
  const { handlers, wasLong } = useLongPress((x, y) => onLong(x, y, card.current));
  return (
    <div ref={card} data-transfer-card className={`nx-file-row${selected ? " is-selected" : ""}`} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: rowStyle.borderBottom }}>
      <button type="button" className="nx-row-btn" {...handlers} aria-pressed={selecting ? selected : undefined}
        onClick={() => { if (wasLong()) return; if (selecting) onToggle(); else onOpen(); }}
        style={{ ...rowStyle, borderBottom: "none", flex: 1, minWidth: 0 }}>
        {selecting && (
          <span className="nx-file-check" aria-hidden="true" style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            border: `1.5px solid ${selected ? C.mint : C.borderStrong}`, background: selected ? C.mint : "transparent",
          }}>{selected && Icon.check({ c: C.onAccent, s: 14 })}</span>
        )}
        <FileThumb file={f} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
          <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
        </div>
      </button>
      {!selecting && onTransfer && <TransferBtn onClick={(e) => onTransfer(f, card.current, e.currentTarget)} />}
      {!selecting && <span aria-hidden="true" className="nx-hide-mobile" style={{ display: "flex", opacity: 0.7, paddingRight: 4 }}>{Icon.chevron({ c: C.text, s: 20 })}</span>}
    </div>
  );
}

export function ScreenFiles({ files, filter, device, onClearFilter, onOpenFile, initialFolder, folders = FOLDERS, uploads = [], onAddFiles, onCreateFolder, onTransfer, onUploadAction, onBack, onToast, onNearby, onDeleteFiles }) {
  // Текущая папка (null — корень хранилища)
  const [folder, setFolder] = useState(initialFolder || null);
  const fileInput = useRef(null);
  // Файл из буфера: { kind, text | blob, name } — окно с именем; clipBusy — читаем буфер
  const [clip, setClip] = useState(null);
  const [clipBusy, setClipBusy] = useState(false);
  // Новая папка: newFolder — введённое имя (null — поле закрыто)
  const [newFolder, setNewFolder] = useState(null);
  // Тащат ли сейчас файлы над окном (для подсветки зоны)
  const [dragging, setDragging] = useState(false);
  // Строка поиска: ищет только в текущей папке (или категории)
  const [query, setQuery] = useState("");
  // Положение прокрутки строки пути: для полоски под чипсами и затухания справа
  const [scroll, setScroll] = useState({ left: 0, ratio: 1, more: false });
  const crumbsRef = useRef(null);

  const cat = MEDIA_CATS.find((c) => c.id === filter);
  const folderById = (id) => folders.find((f) => f.id === id);

  const measure = () => {
    const el = crumbsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScroll({
      left: max > 0 ? el.scrollLeft / el.scrollWidth : 0,
      ratio: el.clientWidth / el.scrollWidth,
      more: el.scrollLeft < max - 2,
    });
  };

  // При смене папки: прокручиваем путь к текущей папке и чистим поиск
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    measure();
    setQuery("");
  }, [folder, filter, device]);

  // Ширина окна поменялась — пересчитываем полоску прокрутки
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Путь от корня до текущей папки: идём от папки вверх по parent
  const path = [];
  for (let id = folder; id; id = folderById(id).parent) path.unshift(folderById(id));

  const q = query.trim().toLowerCase();
  const match = (name) => !q || name.toLowerCase().includes(q);
  // flat — включён отбор (по категории или устройству): показываем
  // все подходящие файлы из всех папок одним списком
  const flat = Boolean(cat || device);
  const onDevice = (f) => f.device === device.name || f.device === device.alias;
  const subfolders = flat ? [] : folders.filter((f) => f.parent === folder && match(f.name));
  const list = sortByRecent((flat
    ? files.filter((f) => (!cat || f.cat === cat.id) && (!device || onDevice(f)))
    : files.filter((f) => f.folder === folder)).filter((f) => match(f.name)));
  // Длинный список рисуем порциями по FILES_PAGE: следующая — когда прокрутили к концу (меньше работы телефону)
  const [limit, setLimit] = useState(FILES_PAGE);
  const listKey = `${folder}|${q}|${cat?.id || ""}|${device?.name || ""}`;
  useEffect(() => { setLimit(FILES_PAGE); }, [listKey]);
  // Выделение нескольких файлов и меню одного файла (долгое нажатие / правая кнопка)
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { file, x, y, card }
  const exitSelect = () => { setSelecting(false); setSel(new Set()); };
  useEffect(() => { exitSelect(); setMenu(null); }, [listKey]);
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const startSelect = (id) => { setSelecting(true); setSel(new Set([id])); };
  const deleteSelected = () => {
    const doomed = list.filter((f) => sel.has(f.id));
    if (!doomed.length) return;
    onDeleteFiles?.(doomed);
    exitSelect();
  };
  const moreRef = useRef(null);
  const hasMore = list.length > limit;
  useEffect(() => {
    const el = moreRef.current;
    if (!hasMore || !el || !window.IntersectionObserver) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setLimit((n) => n + FILES_PAGE); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);
  // Сколько всего лежит внутри папки (подпапки + файлы)
  const countIn = (id) => folders.filter((f) => f.parent === id).length + files.filter((f) => f.folder === id).length;

  // Куда попадут новые файлы: в открытую папку. Если включён отбор
  // по категории или устройству — в корень "Хранилище"
  const target = flat ? null : folder;
  const targetName = folderName(folders, target);
  const upload = (list) => { if (list && list.length) onAddFiles?.(list, target); };
  // Буфер читаем только по этому нажатию; пусто или нет доступа — понятное сообщение, ничего не создаём
  const fromClipboard = async () => {
    if (clipBusy) return;
    setClipBusy(true);
    try {
      const r = await readClipForFile(clipboardRead, clipboardReadImage);
      if (r.error) { onToast?.({ title: "Файл из буфера не создан", text: r.error, kind: "error" }); return; }
      setClip({ ...r, name: clipDefaultName(r.kind) });
    } finally { setClipBusy(false); }
  };
  const createClipFile = () => {
    const name = clipFinalName(clip.name, clip.kind, clip.blob?.type);
    if (!name) return;
    const file = clip.kind === "image"
      ? new File([clip.blob], name, { type: clip.blob.type || "image/png" })
      : new File([clip.text], name, { type: "text/plain" });
    setClip(null);
    onAddFiles?.([file], target);
  };

  // Проверка имени новой папки: не пустое и не повторяет соседнюю папку
  const nfName = (newFolder || "").trim();
  const nfError = !nfName ? null
    : folders.some((f) => f.parent === folder && f.name.toLowerCase() === nfName.toLowerCase()) ? "Такая папка уже есть" : null;
  const saveFolder = () => {
    if (!nfName || nfError) return;
    onCreateFolder?.(nfName, folder);
    setNewFolder(null);
  };
  // Сменили папку — поле новой папки закрываем
  const folderAfterClear = useRef(false); // «Новая папка» в категории: после сброса фильтра сразу поле имени
  useEffect(() => { setNewFolder(folderAfterClear.current ? "" : null); folderAfterClear.current = false; }, [folder, filter, device]);
  const startNewFolder = () => {
    if (flat) { folderAfterClear.current = true; onClearFilter?.(); return; }
    setNewFolder("");
  };

  /* Перетаскивание файлов прямо в окно (на компьютере).
     Слушаем всё окно: пока над ним держат файлы — показываем рамку,
     отпустили — загружаем. depth нужен, потому что dragenter/dragleave
     приходят от каждого вложенного элемента */
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); }; // без этого браузер откроет файл сам
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      uploadRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const heading = device ? `${device.name} · все папки` : cat ? `${cat.label} · все папки` : folder ? folderById(folder).name : "Хранилище";

  const rowStyle = {
    ...btnReset, width: "100%", boxSizing: "border-box",
    borderBottom: `1px solid color-mix(in srgb, ${C.borderStrong} 55%, transparent)`, padding: "12px 4px",
    display: "flex", alignItems: "center", gap: 14,
  };

  return (
    <MediaLayout>
      <MediaTitle title="Файлы" />

      {/* alignItems: flex-end — черта поиска на одной линии с чертой под путём */}
      <div className="nx-files-top" style={{ display: "flex", alignItems: "flex-end", gap: 28, marginBottom: 26 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Путь навигации. Если включён фильтр — вместо пути
              показываем фильтр и кнопку, чтобы его сбросить.
              Справа путь плавно затухает, если дальше есть ещё чипсы */}
          <div
            ref={crumbsRef} onScroll={measure} className="ng-crumbs nx-no-scrollbar"
            style={{
              display: "flex", gap: 6, overflowX: "auto",
              maskImage: scroll.more ? "linear-gradient(90deg, black 82%, transparent)" : "none",
              WebkitMaskImage: scroll.more ? "linear-gradient(90deg, black 82%, transparent)" : "none",
            }}
          >
            {flat ? (
              <>
                <Crumb onClick={onBack || onClearFilter}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} {onBack ? "Назад" : "Все папки"}</Crumb>
                <Crumb active>
                  {(device || cat).icon({ c: C.onFold, s: 15 })} {device ? device.name : cat.label} · {list.length} {plural(list.length, ["файл", "файла", "файлов"])}
                </Crumb>
              </>
            ) : (
              <>
                {folder ? (
                  <Crumb onClick={() => setFolder(folderById(folder).parent)}>
                    {Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад
                  </Crumb>
                ) : onBack && (
                  <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
                )}
                <Crumb active={!folder} onClick={() => setFolder(null)}>{Icon.drive({ c: C.onFold, s: 15 })} Хранилище</Crumb>
                {path.map((p, i) => (
                  <Crumb key={p.id} active={i === path.length - 1} onClick={() => setFolder(p.id)}>
                    {Icon.folder({ c: C.onFold, s: 15 })} {p.name}
                  </Crumb>
                ))}
              </>
            )}
          </div>
          {/* Полоска под путём: показывает, какая часть пути сейчас видна */}
          <div style={{ position: "relative", height: 2, background: C.border, marginTop: 14 }}>
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${scroll.left * 100}%`, width: `${scroll.ratio * 100}%`,
              background: C.muted,
            }} />
          </div>
        </div>

        <label className="nx-files-search" style={{
          width: 200, flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 6, marginTop: 0,
        }}>
          {Icon.search({ c: C.muted, s: 16 })}
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={device ? "Поиск по устройству…" : cat ? "Поиск в категории…" : "Поиск в этой папке…"}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, padding: 0 }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" style={{ ...btnReset, display: "flex" }}>
              {Icon.close({ c: C.muted, s: 14 })}
            </button>
          )}
        </label>
      </div>

      {/* Заголовок папки, справа — "Новая папка" и "Добавить файл".
          На телефоне кнопки встают под заголовок на всю ширину */}
      <div className="nx-files-head" style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
        paddingBottom: 10, borderBottom: `1px solid ${C.borderStrong}`,
      }}>
        <div className="nx-files-heading" style={{
          // Как в макете 2026-10: название папки прописными, без жирности
          fontFamily: fontDisplay, fontSize: 18, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.02em",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {heading}
        </div>
        <div className="nx-files-actions" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {(
            <button type="button" className="nx-ghost-btn nx-fa-folder nx-glass" onClick={startNewFolder} disabled={newFolder !== null} style={{
              ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
              border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 16px", fontSize: 13,
            }}>
              {Icon.folder({ c: C.text, s: 15 })} Новая папка
            </button>
          )}
          {onNearby && (
            <button type="button" className="nx-ghost-btn nx-fa-near nx-glass" onClick={onNearby} style={{
              ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
              border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 16px", fontSize: 13,
            }}>
              {Icon.signal({ c: C.text, s: 15 })} Рядом
            </button>
          )}
          <button type="button" className="nx-ghost-btn nx-fa-clip nx-glass" onClick={fromClipboard} disabled={clipBusy} style={{
            ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
            border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 16px", fontSize: 13,
          }}>
            {Icon.copy({ c: C.text, s: 15 })} Из буфера
          </button>
          <button type="button" className="nx-primary nx-fa-add" onClick={() => fileInput.current?.click()} style={{
            ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
            border: "1px solid transparent", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 500,
            color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
          }}>
            {Icon.plus({ c: C.onFold, s: 15 })} Добавить файл
          </button>
          {/* Обычный выбор файлов системы. value сбрасываем,
              чтобы тот же файл можно было выбрать ещё раз */}
          <input
            ref={fileInput} type="file" multiple hidden
            onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
          />
        </div>
      </div>

      {/* Загрузки: имя, настоящий процент, отмена; ошибка — «Повторить» и «Убрать» */}
      {uploads.map((u) => {
        const failed = u.status === "error";
        // Ждёт в очереди (нет сети или пауза перед повтором) — содержимое сохранено на устройстве
        const waiting = u.status === "queued";
        const waitText = navigator.onLine === false ? "Нет сети — загрузится, когда связь вернётся (пока NEXA открыта)"
          : u.nextAt ? `Не вышло — повторим в ${new Date(u.nextAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Скоро отправим";
        const small = { ...btnReset, fontSize: 13, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap" };
        return (
          <div key={u.id} role={failed ? "alert" : "status"} className="nx-pop" style={{ padding: "12px 4px 10px", borderBottom: `1px solid color-mix(in srgb, ${C.borderStrong} 55%, transparent)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              {failed ? Icon.alert({ c: C.red, s: 16 }) : waiting ? Icon.refresh({ c: C.muted, s: 16 }) : <Spinner />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {failed ? `Не загрузилось: «${u.name}»` : waiting ? `Ждёт отправки: «${u.name}»` : `Загружаем «${u.name}»`}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {!failed && !waiting && <span style={{ fontSize: 12, color: C.mutedSoft, fontFamily: fontDisplay }}>{Math.round(u.progress * 100)}%</span>}
                {(failed || (waiting && navigator.onLine !== false)) && <button type="button" className="nx-ghost-btn" onClick={() => onUploadAction?.(u.id, "retry")} style={small}>{waiting ? "Сейчас" : "Повторить"}</button>}
                <button type="button" className="nx-icon-btn" onClick={() => onUploadAction?.(u.id, failed || waiting ? "dismiss" : "cancel")}
                  aria-label={failed || waiting ? "Убрать" : "Отменить загрузку"} title={failed || waiting ? "Убрать" : "Отменить"} style={{
                    ...btnReset, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {Icon.close({ c: C.muted, s: 13 })}
                </button>
              </span>
            </div>
            {failed
              ? <div style={{ fontSize: 12, color: C.red, marginTop: 6, paddingLeft: 26 }}>{u.error}</div>
              : waiting ? <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 6, paddingLeft: 26 }}>{waitText}</div>
              : (
                <div style={{ height: 2, background: C.border, marginTop: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${Math.max(2, u.progress * 100)}%`, transition: "width 200ms linear",
                    background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
                  }} />
                </div>
              )}
          </div>
        );
      })}

      {/* Рамка "отпустите файлы": видна, пока над окном держат файлы */}
      {dragging && (
        <div className="nx-drop-zone" aria-hidden="true" style={{
          position: "fixed", inset: 12, zIndex: 250, pointerEvents: "none",
          border: `1px dashed ${C.mint}`, borderRadius: 10,
          background: `color-mix(in srgb, ${C.bg} 82%, transparent)`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <div style={{
            width: 56, height: 56, border: `1px solid ${C.mint}`, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.up({ c: C.mint, s: 26 })}
          </div>
          <div className="ng-display" style={{ fontSize: 22 }}>Отпустите, чтобы добавить</div>
          <div style={{ fontSize: 13, color: C.muted }}>{target ? <>Файлы попадут в папку «{targetName}»</> : "Файлы сами разложатся по папкам: фото, видео, документы…"}</div>
        </div>
      )}

      {/* Список прокручивается внутри себя, как в макете.
          key меняется при смене папки — список появляется заново с анимацией */}
      <div key={device ? `dev-${device.id}` : cat ? `cat-${cat.id}` : `f-${folder}`} className="nx-stagger nx-scroll nx-files-list" style={{
        maxHeight: "calc(100vh - 400px)", minHeight: 260, overflowY: "auto", paddingRight: 14,
      }}>
        {/* Новая папка: строка с полем имени. Enter — создать, Esc — отменить */}
        {newFolder !== null && (
          <form className="nx-pop" onSubmit={(e) => { e.preventDefault(); saveFolder(); }} style={{ ...rowStyle, cursor: "default" }}>
            <FolderThumb />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                autoFocus
                className="nx-input"
                value={newFolder}
                maxLength={40}
                placeholder="Название папки"
                aria-label="Название новой папки"
                aria-invalid={!!nfError}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setNewFolder(null); }}
                style={{
                  width: "100%", boxSizing: "border-box", background: "transparent", color: C.text,
                  fontFamily: "inherit", fontSize: 16, padding: "6px 10px", borderRadius: 10, outline: "none",
                  border: `1px solid ${nfError ? C.red : C.borderStrong}`,
                }}
              />
              {nfError && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{nfError}</div>}
            </div>
            <button type="submit" className="nx-icon-btn" aria-label="Создать папку" disabled={!nfName || !!nfError} style={{
              ...btnReset, width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {Icon.check({ c: C.green, s: 18 })}
            </button>
            <button type="button" className="nx-icon-btn" aria-label="Отменить" onClick={() => setNewFolder(null)} style={{
              ...btnReset, width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {Icon.close({ c: C.muted, s: 16 })}
            </button>
          </form>
        )}
        {subfolders.map((sf) => {
          const n = countIn(sf.id);
          return (
            <button type="button" key={sf.id} className="nx-row-btn" onClick={() => setFolder(sf.id)} style={rowStyle}>
              <FolderThumb />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{sf.name}</div>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>
                  Папка · {n} {plural(n, ["объект", "объекта", "объектов"])}
                </div>
              </div>
              {Icon.chevron({ c: C.text, s: 20 })}
            </button>
          );
        })}
        {/* Строка файла: сама строка открывает файл, справа — «Передать на…».
            data-transfer-card — отсюда полетит карточка при передаче */}
        {list.slice(0, limit).map((f) => (
          <FileRowItem key={f.id} f={f} rowStyle={rowStyle} meta={`${fileMeta(f)}${flat ? ` · ${folderName(folders, f.folder)}` : ""}`}
            selecting={selecting} selected={sel.has(f.id)}
            onOpen={() => onOpenFile({ id: f.id, list: list.map((x) => x.id) })}
            onToggle={() => toggleSel(f.id)}
            onLong={(x, y, card) => { if (selecting) { toggleSel(f.id); return; } vibrate(12); setMenu({ file: f, x, y, card }); }}
            onTransfer={onTransfer} />
        ))}
        {menu && (
          <FileMenu at={{ x: menu.x, y: menu.y }} file={menu.file} onClose={() => setMenu(null)}
            onOpen={() => onOpenFile({ id: menu.file.id, list: list.map((x) => x.id) })}
            onSelect={() => startSelect(menu.file.id)}
            onTransfer={onTransfer ? () => onTransfer(menu.file, menu.card, menu.card) : null}
            onDelete={() => onDeleteFiles?.([menu.file])} onToast={onToast} />
        )}
        {/* Запас снизу: последние строки не прячутся под панелью выделения */}
        {selecting && <div aria-hidden="true" style={{ height: 76 }} />}
        {selecting && (
          <SelectBar count={sel.size} total={list.length} onExit={exitSelect}
            onAll={() => setSel(new Set(list.map((f) => f.id)))} onNone={() => setSel(new Set())} onDelete={deleteSelected} />
        )}
        {/* Метка конца порции: дошли до неё прокруткой — дорисовываем следующую */}
        {hasMore && <div ref={moreRef} aria-hidden="true" style={{ height: 1 }} />}
        {subfolders.length === 0 && list.length === 0 && (
          q ? (
            <EmptyState
              title="Ничего не нашлось"
              text={`По запросу «${query.trim()}» здесь ничего нет. Попробуйте другое слово.`}
              action={
                <button type="button" className="nx-ghost-btn" onClick={() => setQuery("")} style={{
                  ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: "8px 14px", fontSize: 13,
                }}>
                  Очистить поиск
                </button>
              }
            />
          ) : (
            <EmptyState
              title={device ? `На устройстве «${device.name}» пока нет файлов` : "Здесь пока пусто"}
              text={device ? "Файлы появятся, когда устройство что-нибудь сохранит." : "Нажмите «Добавить файл» или перетащите файлы в окно."}
            />
          )
        )}
      </div>
      {clip && <ClipFileDialog clip={clip} setClip={setClip} onCreate={createClipFile} />}
    </MediaLayout>
  );
}

/* ═══ СОСТОЯНИЯ: загрузка, успех, ошибка, пусто ═══════════════
   Общие детали, чтобы эти состояния везде выглядели одинаково.
   hover / pressed / focus / disabled задаются классами в блоке <style>
   (см. «ЕДИНАЯ СИСТЕМА СОСТОЯНИЙ»). */

// Окно «Файл из буфера»: имя можно изменить, перед созданием видно, что именно лежит в буфере
function ClipFileDialog({ clip, setClip, onCreate }) {
  useModalLock();
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus(); inputRef.current?.select();
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); setClip(null); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const url = useMemo(() => (clip.kind === "image" ? URL.createObjectURL(clip.blob) : null), [clip.blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const bad = !clipFinalName(clip.name, clip.kind, clip.blob?.type);
  return (
    <div className="nx-viewer" onClick={() => setClip(null)} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-label="Файл из буфера обмена" className="nx-pop" onClick={(e) => e.stopPropagation()} style={{
        width: "min(440px, calc(100vw - 32px))", boxSizing: "border-box", padding: 20, borderRadius: 28, background: C.panel,
        border: `1px solid ${C.lineBright}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 18 }}>Файл из буфера обмена</div>
        {url ? <img src={url} alt="Картинка из буфера" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 14, alignSelf: "center" }} />
          : <div className="nx-scroll" style={{ maxHeight: 130, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, color: C.muted,
              padding: "10px 12px", borderRadius: 14, border: `1px solid ${C.border}` }}>{clip.text.length > 600 ? clip.text.slice(0, 600) + "…" : clip.text}</div>}
        <label style={{ fontSize: 12, color: C.muted, display: "flex", flexDirection: "column", gap: 6 }}>
          Название файла
          <input ref={inputRef} value={clip.name} onChange={(e) => setClip({ ...clip, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && !bad) onCreate(); }}
            style={{ background: "transparent", color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none" }} />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="nx-ghost-btn" onClick={() => setClip(null)} style={{ ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 16px", fontSize: 13 }}>Отмена</button>
          <button type="button" className="nx-primary" onClick={onCreate} disabled={bad} style={{ ...btnReset, borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 500, color: C.onFold,
            background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, opacity: bad ? 0.5 : 1 }}>Создать</button>
        </div>
      </div>
    </div>
  );
}
