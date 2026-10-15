// Главная: устройства, ассистент, активность; линии к складке (компьютер)
import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { C } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { deviceStatus } from "../lib/devices.js";
import { EmptyState, StateButton, Dot, btnReset, Logo } from "../ui/base.jsx";
import { HomeFold } from "../ui/backdrop.jsx";
import { FindChip } from "../ui/overlays.jsx";
import { ReceivedTag } from "../ui/FileViewer.jsx";
import { UpdateCard, InstallBanner } from "../ui/install.jsx";

/* ---------- 5. ЭКРАНЫ ---------- */
// Карточка одного устройства — для мобильной 2×2 сетки.
export function DeviceCard({ device }) {
  const { icon, name, status, online } = device;
  return (
    <div style={{
      position: "relative",
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: "16px 16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minHeight: 128,
      boxSizing: "border-box",
    }}>
      {/* Индикатор статуса — точка в правом верхнем углу */}
      <span style={{
        position: "absolute", top: 14, right: 14,
        width: 8, height: 8, borderRadius: "50%",
        background: online ? C.green : C.red,
      }} />

      {/* Иконка устройства */}
      <div style={{
        width: 36, height: 36,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon({ c: C.text, s: 30 })}
      </div>

      {/* Название и статус — прижаты к низу */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 15, fontWeight: 500, textAlign: "left" }}>{name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2, textAlign: "left" }}>{status}</div>
      </div>

      {/* Стрелка — правый нижний угол */}
      <div style={{ position: "absolute", bottom: 12, right: 12, color: C.mutedSoft }}>
        {Icon.chevron({ c: C.mutedSoft, s: 14 })}
      </div>
    </div>
  );
}

export const DEVICE_ART = {
  phone: { vb: "0 0 24 41", w: 24, h: 41, body: (
    <><rect x="0.5" y="0.5" width="22.6" height="39.37" rx="6.5" stroke="currentColor" strokeLinejoin="round" />
      <rect x="8.82" y="3.91" width="5.96" height="0.87" rx="0.44" fill="currentColor" /></>) },
  laptop: { vb: "0 0 37 28", w: 37, h: 28, body: (
    <><rect x="36.185" y="0.366" width="23.347" height="35.819" rx="6.229" transform="rotate(90 36.185 0.366)" stroke="currentColor" strokeWidth="0.73" strokeLinejoin="round" />
      <path d="M35.94 26.24c.34 0 .61.27.61.61 0 .34-.27.61-.61.61H.61A.61.61 0 0 1 0 26.85c0-.34.27-.61.61-.61h15.1c0 .22.18.39.39.39h4.35c.22 0 .39-.17.39-.39h15.1Z" fill="currentColor" /></>) },
  tv: { vb: "0 0 50 39", w: 50, h: 39, body: (
    <><rect x="49.25" y="0.627" width="31.444" height="48.623" rx="8.153" transform="rotate(90 49.25 0.627)" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M34.48 37.65c.29 0 .52.23.52.52 0 .29-.23.52-.52.52H15.4a.52.52 0 0 1 0-1.04h19.08Z" fill="currentColor" /></>) },
  watch: { vb: "0 0 31 44", w: 31, h: 44, body: (
    <><rect x="29.532" y="9.566" width="24.843" height="29.032" rx="6.5" transform="rotate(90 29.532 9.566)" stroke="currentColor" strokeLinejoin="round" />
      <path d="M7.75 9.07V7.5a7 7 0 0 1 7-7h.54a7 7 0 0 1 7 7v1.57M22.23 34.91v1.57a7 7 0 0 1-7 7h-.54a7 7 0 0 1-7-7v-1.57" stroke="currentColor" strokeLinejoin="round" /></>) },
};

// Значок устройства для карточки: высота h, цвет текста. Нет своего рисунка — обычный значок
export function deviceArt(d, h = 30) {
  const a = DEVICE_ART[d.type];
  if (!a) return d.icon({ c: C.text, s: Math.round(h * 0.85) });
  return <svg viewBox={a.vb} height={h} width={(h * a.w) / a.h} fill="none" style={{ display: "block", color: C.text, maxWidth: h * 1.3 }}>{a.body}</svg>;
}

// ЭКРАН "ГЛАВНАЯ" — список устройств + складка + карточка ассистента
// devices — устройства с текущим состоянием (в сети или нет) из App,
// onOpenDevice открывает окно устройства
// onAddDevice — открыть окно добавления,
/* ═══ ЖИВЫЕ СВЯЗИ НА ГЛАВНОЙ ═══════════════════════════════
   Тонкие линии от каждого устройства в списке к складке-«хабу».
   В сети — сплошная мятная линия, не в сети — серый пунктир.
   По линии пробегает точка только по событию: при открытии Главной,
   когда устройство подключилось/добавилось и когда на него отправили
   файл (тогда точка бежит от хаба к устройству). Постоянного движения нет.
   Где строки и хаб, ищем по меткам data-link-id / data-link-hub внутри
   родительского блока (он должен быть position: relative). */
export const PULSE_MS = 900;

export function DeviceLinks({ devices, received }) {
  const selfRef = useRef(null);
  const [geo, setGeo] = useState(null); // { w, h, lines: [{ id, online, x1, y1, x2, y2 }] }
  const [pulses, setPulses] = useState([]);
  const deviceKey = devices.map((d) => `${d.id}:${d.online}`).join("|");

  // Пересчёт координат: при смене размера блока и при изменении списка.
  // Родителя берём через свой элемент — он точно уже на странице
  useLayoutEffect(() => {
    const wrap = selfRef.current?.parentElement;
    if (!wrap) return;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const hubEl = wrap.querySelector("[data-link-hub]");
      if (!box.width || !hubEl) return setGeo(null); // блок скрыт (например, на телефоне)
      const hub = hubEl.getBoundingClientRect();
      const rows = [...wrap.querySelectorAll("[data-link-id]")];
      const n = rows.length;
      const lines = rows.map((el, i) => {
        const r = el.getBoundingClientRect();
        const d = devices.find((x) => x.id === el.dataset.linkId);
        const x1 = r.right - box.left, y1 = r.top + r.height / 2 - box.top;
        // Короткий горизонтальный отвод — у всех линий излом на одной вертикали
        const xm = x1 + 26;
        // Вход в складку: точки на её левой грани (на картинке грань идёт
        // от 34.5%/44% до 45%/77% размера), сверху вниз по порядку строк,
        // поэтому линии не пересекаются
        const t = n === 1 ? 0.5 : 0.12 + (0.76 * i) / (n - 1);
        const x2 = hub.left + hub.width * (0.345 + 0.105 * t) - box.left - 3;
        const y2 = hub.top + hub.height * (0.44 + 0.327 * t) - box.top;
        return { id: el.dataset.linkId, online: !!d?.online, pts: [[x1, y1], [xm, y1], [x2, y2]] };
      });
      setGeo({ w: box.width, h: box.height, lines });
    };
    measure();
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [deviceKey]);

  // Когда пускать точку: сравниваем с тем, что было в прошлый раз
  const prevOnline = useRef(null);
  const prevReceived = useRef(new Set());
  useEffect(() => {
    if (!geo || !geo.lines.length) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const first = prevOnline.current === null;
    const out = [];
    geo.lines.forEach((l, i) => {
      const wasOnline = first ? false : prevOnline.current[l.id];
      const gotFile = received[l.id] && !prevReceived.current.has(l.id);
      if (gotFile) out.push({ ...l, back: true, delay: i * 120 });          // файл: от хаба к устройству
      else if (l.online && !wasOnline) out.push({ ...l, delay: first ? i * 140 : 0 }); // подключилось / первое открытие
    });
    prevOnline.current = Object.fromEntries(geo.lines.map((l) => [l.id, l.online]));
    prevReceived.current = new Set(Object.keys(received));
    if (!reduce && out.length) {
      const stamp = Date.now();
      setPulses((p) => [...p, ...out.map((o, k) => ({ ...o, key: `${stamp}-${k}` }))]);
    }
  }, [geo, received]);

  return (
    <div ref={selfRef} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {geo && <svg width={geo.w} height={geo.h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {geo.lines.map((l) => (
          <g key={l.id}>
            <polyline points={l.pts.map((q) => q.join(",")).join(" ")} fill="none" strokeWidth="1" strokeLinejoin="miter"
              strokeDasharray={l.online ? undefined : "3 5"}
              style={{
                stroke: l.online
                  ? `color-mix(in srgb, ${C.mint} ${received[l.id] ? 70 : 32}%, transparent)`
                  : C.borderStrong,
                transition: "stroke 400ms ease",
              }} />
            {/* Узелки-ромбы: у края списка и там, где линия входит в грань складки */}
            {[l.pts[0], l.pts[2]].map(([x, y], k) => (
              <rect key={k} x={x - 2} y={y - 2} width="4" height="4" transform={`rotate(45 ${x} ${y})`}
                style={{ fill: l.online ? C.mint : C.borderStrong }} />
            ))}
          </g>
        ))}
      </svg>}
      {pulses.map((p) => (
        <LinkPulse key={p.key} p={p} onDone={() => setPulses((list) => list.filter((x) => x.key !== p.key))} />
      ))}
    </div>
  );
}

// Одна точка, которая один раз пробегает по линии и исчезает
export function LinkPulse({ p, onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useLayoutEffect(() => {
    const pts = p.back ? [...p.pts].reverse() : p.pts;
    // Длины участков — чтобы на каждом точка шла с одной скоростью
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    let run = 0;
    const frames = pts.map((q, i) => {
      if (i) run += seg[i - 1];
      return { transform: `translate(${q[0]}px, ${q[1]}px)`, offset: run / total };
    });
    // Появляется в начале и гаснет в конце
    frames[0].opacity = 0;
    frames[frames.length - 1].opacity = 0;
    for (let i = 1; i < frames.length - 1; i++) frames[i].opacity = 1;
    const a = ref.current.animate(frames, { duration: PULSE_MS, delay: p.delay, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" });
    a.onfinish = () => doneRef.current();
    return () => a.cancel();
  }, []);
  return (
    <span ref={ref} style={{
      position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%",
      background: C.mint, opacity: 0, willChange: "transform, opacity",
    }} />
  );
}

// received — у каких устройств отметка «Получен файл» { id: { name } }
// update — вышла новая версия приложения (баннер «Обновить», только в приложении)
// loading — устройства аккаунта ещё грузятся из облака
// findState / onFind — «Найти» у реальных устройств (подключённых по коду)
// activityBlock — компактная лента «Активность» (только у вошедшего)
export function ScreenHome({ devices, received = {}, update, onUpdateLater, loading, findState = {}, onFind, activityBlock, onNavigate, onOpenDevice, onAddDevice, onAbout, netState = "ok" }) {
  // Подпись под заголовком — честная: «Синхронизировано» только когда облако всё подтвердило
  const tagline = { offline: "Нет сети. Работает на этом устройстве. Рядом с вами", pending: "Сохраняем изменения. Работает. Рядом с вами", ok: "Синхронизировано. Работает. Рядом с вами", local: "Работает на этом устройстве. Рядом с вами" }[netState];
  // Сколько устройств сейчас в сети — для счётчика рядом с заголовком
  const onlineCount = devices.filter((d) => d.online).length;
  // Подпись под устройством: статус и «это устройство»
  const statusOf = (d) => [deviceStatus(d), d.isSelf && "это устройство"].filter(Boolean).join(" · ");
  // «Найти» — только у реального устройства в сети и не у себя
  const findable = (d) => d.real && d.online && !d.isSelf && onFind;

  // Пустой список: добавить новое или вернуть исходные.
  // Пока грузим из облака — вместо «Устройств пока нет» заготовка строк
  const empty = devices.length === 0 && (loading ? <DevicesSkeleton /> : (
    <EmptyState
      compact
      title="Устройств пока нет"
      text="Откройте NEXA на другом устройстве и подключите его по коду или QR — оно появится здесь"
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={onAddDevice}>
            Добавить устройство
          </StateButton>
        </div>
      }
    />
  ));

  return (
    <div className="ng-screen ng-home" style={{ padding: "28px 40px 40px", textAlign: "left" }}>

      {/* ══════════ ДЕСКТОПНАЯ ВЕРСИЯ ══════════ */}
      {/* Высота — почти на всё окно (минус футер и отступы), а содержимое
          стоит по центру по вертикали, чтобы снизу не было пустоты */}
      <div className="ng-home-desktop">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 40, position: "relative" }}>
          {/* Связи рисуются первыми — складка и карточки лежат поверх линий */}
          <DeviceLinks devices={devices} received={received} />
          {/* Левая колонка: заголовок + список. Список тянется до низа ряда —
              его нижний край совпадает с карточкой ассистента справа */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              fontSize: 30, letterSpacing: "0.2em",
              color: C.text, marginBottom: 14,
            }}>
              ВАША ЭКОСИСТЕМА
            </div>
            <div className="ng-display" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
              Все устройства в одной системе
            </div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 14, marginBottom: 30 }}>
              {tagline}
            </div>
            {/* В приложении на планшете: баннер обновления над списком устройств */}
            {update && <div style={{ marginTop: -12, marginBottom: 24 }}><UpdateCard update={update} onLater={onUpdateLater} /></div>}

            {/* Карточка «Устройства»: у каждого устройства своя плашка */}
            <div className="nx-stagger nx-home-devices" style={{ flex: 1, border: `1px solid ${C.borderStrong}`, borderRadius: 18, padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "14px 0 6px",
              }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Устройства</span>
                <span title="В сети" style={{
                  display: "flex", alignItems: "center",
                  gap: 6, fontSize: 13, color: C.muted,
                }}>
                  {onlineCount} <Dot color={C.green} />
                </span>
              </div>
              {empty}
              {/* Каждая строка — кнопка: открывает окно устройства */}
              {devices.map((d) => (
                // Обёртка: «Найти» — отдельная кнопка рядом, а не внутри строки-кнопки
                <div key={d.id} style={{ position: "relative" }}>
                  <button data-link-id={d.id} type="button" className="nx-row-btn nx-dev-plate" onClick={() => onOpenDevice(d.id)}
                    style={{ ...btnReset, display: "flex", alignItems: "stretch", width: "100%", textAlign: "left", color: C.text }}>
                    {/* Ячейка значка, отделённая тонкой линией */}
                    <span className="nx-dev-plate-icon">{d.icon({ c: C.text, s: 24 })}</span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusOf(d)}</span>
                      </span>
                      {received[d.id] && <ReceivedTag name={received[d.id].name} />}
                      {findable(d) && <span style={{ width: 108, flexShrink: 0 }} />}
                      <Dot color={d.online ? C.green : C.red} />
                    </span>
                  </button>
                  {findable(d) && (
                    <FindChip state={findState[d.device_id]} onClick={() => onFind(d)}
                      style={{ position: "absolute", right: 36, top: "50%", transform: "translateY(-50%)" }} />
                  )}
                </div>
              ))}
              {/* Последняя строка — "Добавить устройство" */}
              {devices.length > 0 && (
                <button type="button" className="nx-row-btn nx-dev-plate is-add" onClick={onAddDevice}
                  style={{ ...btnReset, display: "flex", alignItems: "stretch", width: "100%", textAlign: "left", color: C.text }}>
                  <span className="nx-dev-plate-icon">{Icon.plus({ c: C.mint, s: 22 })}</span>
                  <span style={{ flex: 1, minWidth: 0, padding: "12px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <span style={{ fontSize: 16 }}>Добавить устройство</span>
                    <span style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Смартфон, планшет, часы и другие</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Правая колонка: складка сверху, AI-карточка снизу.
              Отступ сверху — чтобы складка не залезала под часы */}
          <div style={{ display: "flex", flexDirection: "column", paddingTop: 48 }}>
            {/* Складка крупнее за счёт scale: место в раскладке остаётся
                прежним (340px), поэтому остальные блоки не сдвигаются.
                Края картинки прозрачные, так что на соседей она не «наезжает» */}
            <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div data-link-hub style={{ transform: "scale(1.4)", transformOrigin: "center" }}>
                <HomeFold size={340} count={devices.length} />
              </div>
            </div>
            <button type="button" className="nx-row-btn"
              onClick={() => onNavigate("assistant")}
              style={{
                ...btnReset, width: "100%", textAlign: "left", color: C.text, marginTop: "auto",
                border: `1px solid ${C.borderStrong}`, borderRadius: 18,
                padding: "16px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: `linear-gradient(90deg, color-mix(in srgb, ${C.blueDark} 33%, transparent), color-mix(in srgb, ${C.mintDark} 33%, transparent))`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: C.mintDark,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {Icon.sparkle({ c: C.mint, s: 18 })}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>ИИ — Ассистент</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Чем могу помочь?</div>
                </div>
              </div>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                border: `1px solid ${C.borderSoft}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {Icon.chevron({ c: C.text })}
              </div>
            </button>
          </div>
        </div>
        {activityBlock && <div style={{ marginTop: 36 }}>{activityBlock}</div>}
      </div>

      {/* ══════════ МОБИЛЬНАЯ ВЕРСИЯ (макет 2026-10: таблетки, знак NEXA) ══════════ */}
      <div className="ng-home-mobile">
        {/* Знак + слово NEXA, под ним «Ваша экосистема». Значки справа — общая верхняя строка */}
        <div className="nx-home-brand" style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 26px" }}>
          <div style={{ minWidth: 0 }}>
            <Logo small bare />
            <div style={{ fontSize: 10, letterSpacing: "0.24em", color: C.muted, marginTop: 5, textTransform: "uppercase" }}>
              Ваша экосистема
            </div>
          </div>
        </div>

        {/* Заголовок, под ним тонкая линия; справа — складка */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ng-display nx-home-hero" style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.25 }}>
              Все устройства в одной системе
            </div>
            <div aria-hidden="true" style={{ width: 108, height: 1, background: C.lineBright, margin: "14px 0 10px" }} />
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{tagline}</div>
          </div>
          <div style={{ flexShrink: 0, margin: "-30px -14px 0 -10px" }}>
            <HomeFold size={160} count={devices.length} />
          </div>
        </div>

        {/* В приложении: вышла новая версия — предлагаем обновиться */}
        {update && <div style={{ marginTop: 18 }}><UpdateCard update={update} onLater={onUpdateLater} /></div>}
        {/* Предложение установить приложение (только телефон в браузере) */}
        <InstallBanner onHowTo={() => {
          onNavigate("settings");
          setTimeout(() => document.getElementById("nx-install")?.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
        }} />

        {/* Мои устройства: карточки-«таблетки» по две в ряд */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="ng-display" style={{ fontSize: 20, fontWeight: 500 }}>Мои устройства</div>
            <div title="В сети" style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 16, fontWeight: 600 }}>
              <span>{onlineCount}</span>
              <span className="nx-status-dot" style={{ color: C.green, background: C.green }} />
            </div>
          </div>
          {empty && <div className="nx-pill-card" style={{ borderRadius: 32 }}>{empty}</div>}
          <div className="nx-stagger" style={{
            display: "grid",
            // minmax(0, 1fr) — длинное название не раздвигает колонку
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12, position: "relative",
          }}>
            {devices.map((d) => (
              <div key={d.id} style={{ position: "relative", minWidth: 0, display: "flex" }}>
                <button type="button" data-link-id={d.id} className="nx-row-btn nx-dev-pill" data-online={d.online ? "1" : "0"}
                  onClick={() => onOpenDevice(d.id)} style={{ ...btnReset, flex: 1, minWidth: 0, textAlign: "left", color: C.text }}>
                  <span className="nx-dev-pill-icon" aria-hidden="true">{deviceArt(d, 26)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    {/* Только что получен файл — отметка вместо статуса */}
                    {received[d.id]
                      ? <span style={{ display: "block", marginTop: 3 }}><ReceivedTag name={received[d.id].name} compact /></span>
                      : <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusOf(d)}</span>}
                  </span>
                  <span className="nx-status-dot" style={{ color: d.online ? C.green : C.red, background: d.online ? C.green : C.red }} />
                </button>
                {findable(d) && (
                  <FindChip compact state={findState[d.device_id]} onClick={() => onFind(d)}
                    style={{ position: "absolute", top: -8, right: 14 }} />
                )}
              </div>
            ))}
            {/* Последняя — «Добавить устройство»: пунктирная таблетка, мятный плюс */}
            {devices.length > 0 && (
              <button type="button" className="nx-row-btn nx-dev-pill is-add" onClick={onAddDevice}
                style={{ ...btnReset, textAlign: "left", color: C.text, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 2 }}>
                {Icon.plus({ c: C.mint, s: 18 })}
                <span style={{ fontSize: 14, lineHeight: 1.25 }}>Добавить устройство</span>
              </button>
            )}
          </div>
        </div>

        {/* Ассистент — крупная таблетка */}
        <button type="button" className="nx-row-btn nx-pill-card nx-ai-pill" onClick={() => onNavigate("assistant")}
          style={{ ...btnReset, width: "100%", marginTop: 28, textAlign: "left", color: C.text }}>
          <span aria-hidden="true" style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: C.mintDark,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.sparkle({ c: C.mint, s: 22 })}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="ng-display" style={{ display: "block", fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>ИИ — Ассистент</span>
            <span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 3 }}>Чем могу помочь?</span>
          </span>
          {Icon.chevron({ c: C.text, s: 20 })}
        </button>
        {/* Активность — крупная карточка с теми же краями */}
        {activityBlock && <div className="nx-act-pill" style={{ marginTop: 18 }}>{activityBlock}</div>}
        {/* О системе: что такое NEXA, что умеет, обновления и планы */}
        {onAbout && (
          <button type="button" className="nx-row-btn nx-pill-card" onClick={onAbout}
            style={{ ...btnReset, width: "100%", marginTop: 18, padding: "16px 22px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 14, color: C.text, textAlign: "left" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>О системе</span>
              <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 3 }}>Что умеет NEXA, обновления и планы</span>
            </span>
            {Icon.chevron({ c: C.text, s: 18 })}
          </button>
        )}
      </div>

    </div>
  );
}

// Пустое состояние: контурная складка, заголовок, подсказка и, если нужно, кнопка
// Заготовка списка устройств, пока они грузятся: серые плашки без анимации
export function DevicesSkeleton() {
  const bar = (w, h = 10) => <div style={{ width: w, height: h, borderRadius: 10, background: C.panel2 }} />;
  return (
    <div role="status" aria-label="Загружаем устройства" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 16, background: C.panel2, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {bar(i ? "46%" : "60%", 11)}
            {bar(i ? "28%" : "34%", 9)}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 13, color: C.mutedSoft, textAlign: "center" }}>Загружаем ваши устройства…</div>
    </div>
  );
}
