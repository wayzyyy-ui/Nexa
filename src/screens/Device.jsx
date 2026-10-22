// Экран устройства: сцена, состояние, сведения, быстрые действия, переименование
import { useState, useRef, useEffect } from "react";
import { sysShort, NO_DATA, batteryText, formatBytes, netText } from "../lib/deviceInfo.js";
import { safeUrl } from "../lib/realtime.js";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { sysTime } from "../lib/format.js";
import { lastSeenText, peerLabel, deviceStatus } from "../lib/devices.js";
import { btnReset, Spinner } from "../ui/base.jsx";
import { FindChip } from "../ui/overlays.jsx";
import { LocateResult } from "../ui/LocateMap.jsx";
import { Crumb } from "../ui/layout.jsx";
import { ReceivedTag } from "../ui/FileViewer.jsx";
import { PREVIEW_SIZE, typeOf, DevicePreview } from "../ui/DevicePreview.jsx";

export function RealDeviceActions({ d, act, st = {}, linkOnline }) {
  const [url, setUrl] = useState("");
  const [urlNote, setUrlNote] = useState(null);
  const fileRef = useRef(null);
  if (d.isSelf) return null;
  // Почему действия недоступны (null — доступны)
  const why = !linkOnline ? "Нет связи с облаком — проверьте интернет" : !d.online ? "Устройство не в сети — действия появятся, когда на нём откроют NEXA" : null;
  // «Найти» у приложения работает и без сети на той стороне — push-уведомлением
  const pushFindOk = linkOnline && !d.online && (d.kind === "app" || d.kind === "both");
  const send = st.send || {};
  const sending = send.state === "uploading";
  const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap" };
  const off = (x) => (why ? { ...x, color: C.mutedSoft, cursor: "not-allowed" } : x);
  const goLink = (e) => {
    e.preventDefault();
    const safe = safeUrl(url);
    if (!safe) { setUrlNote("Нужна ссылка, которая начинается с http:// или https://"); return; }
    act.openLink(d, safe).then((ok) => { setUrlNote(ok ? null : "Не отправилось — попробуйте ещё раз"); if (ok) setUrl(""); });
  };
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, color: C.mutedSoft, marginBottom: 10 }}>Быстрые действия</div>
      <div className="nx-quick-actions" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <FindChip state={st.find} onClick={() => act.find(d)} style={pushFindOk ? pill : off({ ...pill })} />
        <button type="button" className="nx-ghost-btn" disabled={!!why || st.lock === "locked"} onClick={() => act.lock(d)} style={off(pill)}>
          {Icon.lock({ c: why ? C.mutedSoft : C.text, s: 14 })} {st.lock === "locked" ? "Заблокировано" : "Заблокировать экран"}
        </button>
        <button type="button" className="nx-ghost-btn" disabled={!!why || sending} onClick={() => fileRef.current?.click()} style={off(pill)}>
          {Icon.send({ c: why ? C.mutedSoft : C.text, s: 14 })} Отправить файл
        </button>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) act.sendFile(d, f); }} />
        <button type="button" className="nx-ghost-btn" disabled={!!why || st.locate?.state === "asking"} onClick={() => act.locate(d)} style={off(pill)}>
          {Icon.pin({ c: why ? C.mutedSoft : C.text, s: 14 })} Где устройство?
        </button>
      </div>
      <LocateResult r={st.locate} />
      {/* Отправка файла: настоящий процент, отмена; ошибка — честно */}
      {send.state && (
        <div role={send.state === "error" ? "alert" : "status"} style={{ marginTop: 10, fontSize: 13, color: send.state === "error" ? C.red : C.muted }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sending ? <Spinner s={11} /> : send.state === "done" ? Icon.check({ c: C.green, s: 13 }) : Icon.alert({ c: C.red, s: 13 })}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sending ? `Отправляем «${send.name}» — ${Math.round((send.progress || 0) * 100)}%` : send.state === "done" ? `«${send.name}» отправлен` : send.error}
            </span>
            {sending && <button type="button" onClick={() => act.cancelSend(d)} style={{ ...btnReset, fontSize: 13, color: C.mutedSoft, textDecoration: "underline", textUnderlineOffset: 3 }}>Отменить</button>}
          </div>
          {sending && (
            <div style={{ height: 2, background: C.border, marginTop: 8 }}>
              <div style={{ height: "100%", width: `${Math.max(2, (send.progress || 0) * 100)}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`, transition: "width 200ms linear" }} />
            </div>
          )}
        </div>
      )}
      {/* Открыть ссылку на устройстве */}
      <form onSubmit={goLink} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="nx-input" value={url} onChange={(e) => { setUrl(e.target.value); setUrlNote(null); }} disabled={!!why}
          type="url" inputMode="url" placeholder="https://…" aria-label="Ссылка, которую открыть на устройстве"
          style={{ flex: 1, minWidth: 0, background: "transparent", color: C.text, fontSize: 14, fontFamily: "inherit", border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "8px 12px", outline: "none" }} />
        <button type="submit" className="nx-ghost-btn" disabled={!!why || !url.trim()} style={off(pill)}>
          {Icon.shareUp({ c: why ? C.mutedSoft : C.text, s: 14 })} Открыть на устройстве
        </button>
      </form>
      {urlNote && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 6 }}>{urlNote}</div>}
      {why && <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 10, lineHeight: 1.5 }}>{why}{pushFindOk ? ". «Найти» сработает и сейчас: телефону придёт уведомление, которое звонит" : ""}</div>}
      {!d.online && linkOnline && (
        <button type="button" className="nx-ghost-btn" onClick={act.reconnect} style={{ ...pill, marginTop: 10 }}>
          {Icon.refresh({ c: C.text, s: 14 })} Подключить снова
        </button>
      )}
    </div>
  );
}

/* Складка-«конверт» в окне устройства (как в макете): скошенный
   четырёхугольник, разрезанный на 4 треугольника от центра.
   Точки — в % от размера складки. Чтобы поменять форму, меняй точки тут. */
export const FOLD_TL = "17% 5%", FOLD_TR = "100% 0", FOLD_BR = "84% 93%", FOLD_BL = "0 100%", FOLD_C = "52% 49%";

export const DEVICE_FOLD_SHAPE = `polygon(${FOLD_TL}, ${FOLD_TR}, ${FOLD_BR}, ${FOLD_BL})`;

// on — цвет грани, когда устройство в сети; off — серый, когда отключено.
// delay — задержка: грани меняются по очереди, получается «волна».
// tear — куда грань отлетает при отключении («разрыв» связи, как в макете):
//   x, y — сдвиг в пикселях от центра, r — небольшой поворот в градусах
export const DEVICE_FOLD_FACETS = [
  { id: "top",    clip: `polygon(${FOLD_TL}, ${FOLD_TR}, ${FOLD_C})`, delay: 0,
    on: `color-mix(in srgb, ${C.foldDeep} 55%, ${C.foldBlue})`, off: `color-mix(in srgb, ${C.muted} 35%, ${C.chip})`,
    tear: { x: -2, y: -12, r: -4 } },
  { id: "right",  clip: `polygon(${FOLD_TR}, ${FOLD_BR}, ${FOLD_C})`, delay: 70,
    on: `color-mix(in srgb, ${C.foldBlue} 80%, ${C.foldDeep})`, off: `color-mix(in srgb, ${C.muted} 70%, ${C.chip})`,
    tear: { x: 14, y: -6, r: 5 } },
  { id: "bottom", clip: `polygon(${FOLD_BR}, ${FOLD_BL}, ${FOLD_C})`, delay: 140,
    on: `color-mix(in srgb, ${C.foldBlue} 45%, ${C.foldCyan})`, off: `color-mix(in srgb, ${C.muted} 85%, ${C.chip})`,
    tear: { x: 2, y: 12, r: -3 } },
  { id: "left",   clip: `polygon(${FOLD_BL}, ${FOLD_TL}, ${FOLD_C})`, delay: 210,
    on: C.foldBlue, off: `color-mix(in srgb, ${C.muted} 50%, ${C.chip})`,
    tear: { x: -14, y: 4, r: 4 } },
];

// Пружинистая кривая: грани чуть «перелетают» и встают на место —
// разрыв выглядит как щелчок, а не плавное расползание
export const TEAR_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// onBack — вернуться назад, onRemove — удалить устройство из списка,
// devices / files / folders — данные для превью, received — только что получен файл
// Реальное устройство (d.real): «в сети» — по Presence, «Найти» зовёт его
// по-настоящему (onFind, findState), можно переименовать (onRename)
// Карточка реального устройства на его экране: переименовать, тип, статус
// actions — быстрые действия (RealDeviceActions), рисуются внизу карточки
/* Телефон, где есть и сайт, и приложение (одна карточка, mergeSamePhone):
   каждая часть отдельно — свой статус и заряд; если в сети обе, человек
   выбирает, куда уходят действия («Найти», файл, ссылка, блокировка) */
export const partLabel = (p) => (p.kind === "app" ? "Приложение" : "Сайт");

export function PhoneParts({ d, pick, onPick }) {
  const live = d.parts.filter((p) => p.online && !p.isSelf);
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
      <div style={{ fontSize: 13, color: C.mutedSoft, marginBottom: 8 }}>Сайт и приложение на этом телефоне</div>
      <div role={live.length > 1 ? "radiogroup" : undefined} aria-label="Куда отправлять действия" style={{ display: "grid", gap: 6 }}>
        {d.parts.map((p) => {
          const chosen = live.length > 1 && p.id === pick?.id;
          const row = (
            <>
              <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {(p.kind === "app" ? Icon.phone : Icon.web)({ c: p.online ? C.mint : C.mutedSoft, s: 14 })}
              </span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 14, color: C.text }}>{partLabel(p)}{p.isSelf ? " · это устройство" : ""}</span>
                <span style={{ display: "block", fontSize: 12, marginTop: 2, color: p.online ? C.green : C.mutedSoft }}>
                  {p.online ? ["Онлайн", sysShort(p.sys)].filter(Boolean).join(" · ") : lastSeenText(p.seenAt)}
                </span>
              </span>
              {live.length > 1 && p.online && !p.isSelf && (
                <span style={{ fontSize: 12, color: chosen ? C.mint : C.mutedSoft, flexShrink: 0 }}>{chosen ? "Действия сюда" : "Выбрать"}</span>
              )}
            </>
          );
          const box = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 14, border: `1px solid ${chosen ? C.mint : C.border}` };
          return live.length > 1 && p.online && !p.isSelf ? (
            <button key={p.id} type="button" role="radio" aria-checked={chosen} className="nx-row-btn" onClick={() => onPick(p.id)}
              style={{ ...btnReset, ...box, width: "100%", background: chosen ? `color-mix(in srgb, ${C.mint} 8%, transparent)` : "transparent" }}>{row}</button>
          ) : <div key={p.id} style={box}>{row}</div>;
        })}
      </div>
      {live.length === 1 && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 8 }}>Действия уйдут в «{partLabel(live[0])}» — сейчас в сети только оно</div>}
    </div>
  );
}

/* Bluetooth-устройство (часы, наушники…): с каким телефоном сопряжено, подключено ли,
   когда это проверял телефон. Найти, звонить, менять режимы — NEXA не умеет и не обещает */
export function BtDeviceInfo({ d }) {
  return (
    <div className="nx-dev-info-box" style={{ borderRadius: 28, padding: "18px 20px", background: `color-mix(in srgb, ${C.text} 7%, transparent)` }}>
      <div style={{ fontSize: 13, color: C.mutedSoft, lineHeight: 1.55 }}>
        Bluetooth · сопряжено с «{d.host_name || "телефоном"}»
        <br /><span style={{ color: d.online ? C.green : C.mutedSoft }}>{d.online ? "Подключено к телефону" : "Сейчас не подключено"}</span>
        {d.checkedAt ? <> · по данным телефона в {new Date(d.checkedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</> : null}
        <br />Найти, позвонить и менять режимы такого устройства NEXA не может — это делает его собственное приложение.
      </div>
    </div>
  );
}

export function RealDeviceInfo({ d, actions }) {
  return (
    <>
    <div className="nx-dev-info-box" style={{ borderRadius: 28, padding: "18px 20px", background: `color-mix(in srgb, ${C.text} 7%, transparent)` }}>
      <div style={{ fontSize: 13, color: C.mutedSoft, lineHeight: 1.5 }}>
        {peerLabel(d)} · подключено по коду{d.isSelf ? " · это устройство" : ""}
        <br /><span style={{ color: d.online ? C.green : C.mutedSoft }}>{d.online ? "Онлайн" : lastSeenText(d.seenAt)}</span>
      </div>
    </div>
    {actions}
    </>
  );
}

/* Название устройства в шапке его экрана. Карандаш рядом — переименовать прямо здесь:
   название становится полем того же размера. Enter или «Сохранить» — сохранить,
   Esc или «Отмена» — вернуть как было. Пустое и то же самое не сохраняем */
export function DeviceTitle({ name, onRename }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef(null);
  useEffect(() => { if (!edit) setDraft(name); }, [name, edit]);
  useEffect(() => { if (edit) inputRef.current?.select(); }, [edit]);
  const clean = draft.trim().slice(0, 40);
  const save = () => { if (clean && clean !== name) onRename?.(clean); setEdit(false); };
  const cancel = () => { setDraft(name); setEdit(false); };
  if (!edit) return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div className="ng-display nx-device-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</div>
      {onRename && (
        <button type="button" className="nx-icon-btn" onClick={() => setEdit(true)} aria-label="Переименовать устройство" title="Переименовать"
          style={{ ...btnReset, width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.borderStrong}` }}>
          {Icon.edit({ c: C.muted, s: 16 })}
        </button>
      )}
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
      <input ref={inputRef} className="nx-input ng-display nx-device-title" value={draft} maxLength={40} aria-label="Название устройства"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } }}
        style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1, color: C.text, background: "transparent", fontFamily: "inherit",
          border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "2px 12px", outline: "none", minWidth: 0, width: "min(380px, 100%)", boxSizing: "border-box" }} />
      <button type="submit" className="nx-primary" disabled={!clean} style={{ ...btnReset, padding: "9px 16px", fontSize: 13, fontWeight: 500, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Сохранить</button>
      <button type="button" className="nx-ghost-btn" onClick={cancel} style={{ ...btnReset, padding: "9px 16px", fontSize: 13, border: `1px solid ${C.borderStrong}`, color: C.text }}>Отмена</button>
    </form>
  );
}

export function DeviceScreen({ device: d, fileCount, devices, files, folders, received, onBack, onOpenFiles, onRemove, canRevoke, onToast, onFind, findState, onRename, link, realActions, flowOn = true }) {
  const [ringing, setRinging] = useState(false); // идёт ли сейчас поиск
  const [confirmDel, setConfirmDel] = useState(false); // спрашиваем ли "точно удалить?"
  const delRef = useRef(null);
  // Вопрос "Удалить?" внизу окна — прокручиваем к нему, чтобы он был виден
  useEffect(() => {
    if (!confirmDel || !delRef.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    delRef.current.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [confirmDel]);
  // Кнопка питания: "idle" → "loading" (подключаем/отключаем) → "success" → "idle"
  const [power, setPower] = useState("idle");
  const turningOn = useRef(false); // что сейчас делаем: подключаем или отключаем
  // Номер последнего переключения: меняется — анимация складки запускается заново
  const [flip, setFlip] = useState(null);
  const foldRef = useRef(null);

  // Подключилось — складка «раскрывается» (лёгкий поворот и масштаб).
  // Запускаем анимацию прямо на элементе, не пересоздавая его, чтобы
  // не сбить плавное схождение граней. Без движения — если так в системе
  useEffect(() => {
    const el = foldRef.current;
    if (!flip || !flip.on || !el || !el.animate) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "scale(0.9) rotate(-4deg)" },
        { transform: "scale(1.04) rotate(1deg)", offset: 0.6 },
        { transform: "none" },
      ],
      { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }, [flip]);

  // Таймеры подключения: при закрытии окна их нужно отменить
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Экран открылся — начинаем сверху страницы
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Esc — назад (если не открыто никакое окно поверх и не печатаем в поле)
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Нажатие на любое пустое место страницы — назад: фон, свободная часть
     сцены, поля слева и справа от экрана, низ с логотипом.
     Не уводят: кнопки, поля, переключатели, всё с data-keep (превью, полоски,
     настройки), боковое меню и нижняя панель, уведомления, тосты и окна.
     Если в этот момент выделяли текст — тоже не уводим.
     Слушаем весь документ; подключаемся чуть позже, чтобы тот же клик,
     который открыл экран, не закрыл его сразу */
  useEffect(() => {
    const KEEP = 'button, a, input, textarea, select, label, [role="switch"], [role="radio"], [data-keep], ' +
      '[role="dialog"], [role="menu"], .ng-sidebar, .ng-mobile-tabbar, .nx-notes, .nx-toast-host, .nx-viewer';
    const onDocClick = (e) => {
      if (!(e.target instanceof Element) || e.target.closest(KEEP)) return;
      if (window.getSelection?.().toString()) return;
      backRef.current();
    };
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", onDocClick); };
  }, []);

  // Превью масштабируем под ширину сцены: меряем сцену при изменении размера
  // (ResizeObserver срабатывает только когда размер правда поменялся)
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = PREVIEW_SIZE[typeOf(d)] || PREVIEW_SIZE.buds;
  // Телефон (подключённый по коду) — объёмная картинка из макета вместо нарисованного превью
  const usePhoto = !d.bt && d.type === "phone";
  // На большом экране превью можно увеличить (до 1.5), на телефоне — уменьшаем
  const scale = stageSize.w ? Math.min(1.5, (stageSize.w - 40) / size.w, (stageSize.h - 48) / size.h) : 1;

  const connecting = power === "loading" && turningOn.current;

  // Полоски заряда и памяти. Мало заряда — полоска красная.
  // У отключённого устройства полоски серые: данные на момент отключения.
  // Реальное устройство — только то, что оно само сообщило (d.sys), иначе «Нет данных»
  const sys = d.sys;
  const bars = d.bt ? [
    // Bluetooth: заряд — только если телефон его сообщил
    { label: "Заряд", value: d.battery != null ? `${d.battery}%` : NO_DATA, pct: d.battery ?? 0, low: d.battery != null && d.battery < 20 },
  ] : d.real ? [
    { label: "Заряд", value: batteryText(sys), pct: sys?.battery ?? (sys?.ac ? 100 : 0), low: sys?.battery != null && sys.battery < 20 },
    {
      label: "Память",
      value: sys?.diskTotal ? `${formatBytes(sys.diskTotal - sys.diskFree)} из ${formatBytes(sys.diskTotal)}` : NO_DATA,
      pct: sys?.diskTotal ? ((sys.diskTotal - sys.diskFree) / sys.diskTotal) * 100 : 0,
    },
    { label: "Сеть", value: netText(sys), noBar: true },
  ] : [];
  // Кнопки окна устройства — «таблетки», как в макете
  const pillBtn = { borderRadius: 999, minHeight: 46, padding: "10px 16px", justifyContent: "center", whiteSpace: "nowrap" };

  const ghostBtn = {
    ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 12,
    padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
  };

  return (
    <div className="ng-screen nx-device-screen" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 1440 }}>
      {/* «Назад» — такой же скошенный чипс, как путь в «Файлах» */}
      <div style={{ display: "flex" }}>
        <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      </div>

      {/* Шапка: крупное название, карандаш (переименовать) и статус */}
      <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: "8px 16px", margin: "22px 0 22px" }}>
        <DeviceTitle name={d.name} onRename={onRename} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.muted, paddingBottom: 8 }}>
          <span className="nx-status-dot" style={{ width: 8, height: 8, color: d.online ? C.green : C.red, background: d.online ? C.green : C.red }} />
          {d.real || d.online ? deviceStatus(d) : `Не в сети · был в сети ${d.lastSeen}`}
          {received && <ReceivedTag name={received.name} />}
        </div>
      </div>

      {/* Сцена: превью интерфейса на фоне складки-«конверта». Складка
          цветная, пока устройство в сети, и «разорвана», когда отключено.
          Во время поиска от устройства расходятся волны сигнала */}
      <div>
          <div ref={stageRef} className="nx-device-stage" style={{
            position: "relative", height: 500, borderRadius: 56, overflow: "hidden",
            border: `1px solid ${C.lineBright}`,
            background: C.panel,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Складка-«конверт»: четыре треугольника сходятся к центру.
                ВАЖНО: складка не пересоздаётся при переключении (нет key),
                иначе грани появились бы сразу в новом положении без перехода.
                Разрыв при отключении делают сами грани (см. tear),
                «раскрытие» при подключении запускается эффектом через foldRef */}
            <div
              ref={foldRef}
              // Складка — акцент: стоит правее центра и выглядывает из-за устройства
              // Пропорции постоянные (236×166) — складка всегда лежит горизонтально,
              // на любой ширине; стоит правее центра и выглядывает из-за устройства
              className="nx-device-fold"
              style={{ position: "absolute", width: "min(460px, 54%)", aspectRatio: "236 / 166", left: "46%", top: "50%", marginTop: "calc(min(460px, 54%) * -0.35)" }}
            >
              {DEVICE_FOLD_FACETS.map((f) => (
                <div key={f.id} className="nx-facet" style={{
                  position: "absolute", inset: 0, clipPath: f.clip,
                  background: d.online ? f.on : f.off,
                  // В сети грани сомкнуты; без сети — разлетаются от центра («разрыв»).
                  // При подключении съезжаются обратно в целую складку
                  transform: d.online ? "none" : `translate(${f.tear.x}px, ${f.tear.y}px) rotate(${f.tear.r}deg)`,
                  transformOrigin: FOLD_C, // грани отлетают от центра складки
                  // Цвет и положение меняются по очереди — получается «волна»
                  transition: `background 420ms ease ${f.delay}ms, transform 560ms ${TEAR_EASE} ${f.delay}ms`,
                }} />
              ))}
              {/* Пока идёт подключение, по складке один раз проходит мятная полоса */}
              {connecting && (
                <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: DEVICE_FOLD_SHAPE }}>
                  <div className="nx-scan" style={{
                    position: "absolute", top: -10, bottom: -10, left: "50%", width: 46, marginLeft: -23,
                    background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${C.mint} 55%, transparent), transparent)`,
                  }} />
                </div>
              )}
            </div>
            {ringing && [0, 1, 2].map((i) => (
              <span key={i} className="nx-ping" style={{ animationDelay: `${i * 400}ms` }} />
            ))}
            {/* Телефон — объёмная картинка из макета (снизу обрезана краем сцены).
                Остальные устройства — превью интерфейса, как раньше */}
            {usePhoto && <img className="nx-device-photo" src="/art/device-phone.webp" alt="" draggable={false}
              style={{ position: "absolute", left: "15%", top: 22, height: "112%", width: "auto", pointerEvents: "none" }} />}
            {/* Превью в «родном» размере, уменьшенное под сцену.
                При подключении один раз проявляется (nx-icon-on) */}
            {!usePhoto && <div
              data-keep
              key={flip && flip.on ? `pv-${flip.n}` : "pv"}
              className={flip && flip.on ? "nx-icon-on" : undefined}
              style={{ position: "relative", display: "flex", width: size.w, height: size.h, alignItems: "center", justifyContent: "center", flexShrink: 0, transform: `scale(${scale})` }}
            >
              {/* Bluetooth-устройство: без выдуманного экрана — только его значок */}
              {d.bt ? <span style={{ opacity: d.online ? 1 : 0.5 }}>{d.icon({ c: C.text, s: 96 })}</span>
                : <DevicePreview device={d} devices={devices} files={files} folders={folders} />}
            </div>}
          </div>
      </div>

      {/* Под превью: слева статус, заряд и главные кнопки, справа настройки.
          На телефоне — одной колонкой */}
      <div className="nx-device-info nx-stagger" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.82fr) minmax(0, 1fr)", gap: "20px 36px", alignItems: "stretch", marginTop: 28 }}>
      {/* Обе карточки одной высоты (stretch), кнопка «Файлы» — внизу левой */}
      <div data-keep style={{ display: "flex", flexDirection: "column" }}>
        {/* Карточка «Состояние»: заряд, память, сеть и кнопки — как карточка справа */}
        <div className="nx-dev-card" style={{ border: `1px solid ${C.lineBright}`, borderRadius: 40, padding: "26px 28px", background: C.panel, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 17, color: C.muted }}>Состояние</span>
          {/* Когда сведения получены: у отключённого — последние достоверные */}
          {d.real && (
            <span style={{ fontSize: 12, color: C.mutedSoft, textAlign: "right" }}>
              {sys?.at
                ? `${d.online ? "Обновлено" : "Последние данные"} ${sysTime(sys.at)}`
                : d.online ? "Сведений пока нет" : "Сведений не было"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15 }}>
              <div style={{ width: 70, flexShrink: 0, color: C.muted }}>{b.label}</div>
              {/* Полоска-«таблетка»: толстая, со скруглёнными краями. У «Сети» полоски нет */}
              {b.noBar ? <div style={{ flex: 1 }} /> : (
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: `color-mix(in srgb, ${C.text} 10%, transparent)`, overflow: "hidden" }}>
                  <div className="nx-bar" style={{
                    width: `${b.pct}%`, height: "100%", borderRadius: 999,
                    background: !d.online ? C.muted : b.low ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
                  }} />
                </div>
              )}
              <div style={{ minWidth: 96, flexShrink: 0, textAlign: "right", color: b.value === NO_DATA ? C.mutedSoft : C.muted, whiteSpace: "nowrap" }}>{b.value}</div>
            </div>
          ))}
        </div>

        {/* Действия: три кнопки-«таблетки» равной ширины.
            На узком экране третья переносится на новую строку */}
        {/* Кнопки делят ширину поровну; «Подключить / Отключить» — на всю строку */}
        <div className="nx-device-actions" style={{
          display: "flex", flexWrap: "wrap",
          gap: 10, marginTop: "auto", paddingTop: 26,
        }}>
          {/* «В сети» решает само устройство; «Найти» — в быстрых действиях справа */}
          <button type="button" className="nx-ghost-btn" onClick={onOpenFiles} style={{ ...ghostBtn, ...pillBtn, flex: "1 1 136px" }}>
            {Icon.folder({ c: C.text, s: 16 })} Файлы · {fileCount}
          </button>
        </div>
        </div>
        {d.isSelf && (
          <div style={{ padding: "10px 0 0", fontSize: 12, color: C.mutedSoft }}>
            Это устройство — вы держите его в руках
          </div>
        )}
      </div>

      <div data-keep className="nx-dev-card" style={{ border: `1px solid ${C.lineBright}`, borderRadius: 40, padding: 22, background: C.panel }}>
        {/* Только настоящее: имя и что это за устройство. Выдуманных переключателей нет */}
        {d.real && <RealDeviceInfo d={d} actions={realActions} />}
        {d.bt && <BtDeviceInfo d={d} />}

        {/* Удаление устройства. Сначала спрашиваем прямо здесь: "Удалить?" */}
        <div ref={delRef} style={{ padding: "18px 0 0" }}>
          {confirmDel ? (
            <div role="alert" className="nx-pop" style={{
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
              padding: "12px 14px", borderRadius: 16,
              border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`,
              background: `color-mix(in srgb, ${C.red} 8%, transparent)`,
            }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{d.bt || d.isSelf ? `Удалить «${d.name}»?` : `Отключить «${d.name}» от аккаунта?`}</div>
                <div style={{ fontSize: 12, color: d.bt || d.isSelf || canRevoke ? C.mutedSoft : C.red, marginTop: 2, lineHeight: 1.45 }}>
                  {d.bt || d.isSelf ? "Его можно будет подключить заново"
                    : canRevoke ? "Вход на нём завершится, устройство пропадёт из списка. 5 секунд на «Отменить»"
                    : "Его сеанс неизвестен — уберём только из списка, вход на нём останется. Закрыть доступ: Настройки → Безопасность → «Выйти на всех других устройствах»"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(false)} style={ghostBtn}>
                  Отмена
                </button>
                <button type="button" className="nx-primary" onClick={onRemove} style={{
                  ...ghostBtn, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500,
                }}>
                  {Icon.trash({ c: C.onFold, s: 15 })} Удалить
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="nx-ghost-btn" onClick={() => setConfirmDel(true)} style={{
              ...ghostBtn, width: "100%", justifyContent: "center", borderRadius: 999, minHeight: 46,
              border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`, color: C.red,
            }}>
              {Icon.trash({ c: C.red, s: 16 })} Удалить устройство
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
