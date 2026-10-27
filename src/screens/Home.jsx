// Главная (макет 2026-10, второй вариант): устройства, складка, ассистент, активность
import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { C } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { deviceStatus } from "../lib/devices.js";
import { EmptyState, StateButton, btnReset, Logo, LogoMark, MadeBy } from "../ui/base.jsx";
import { QuickBtn } from "../ui/QuickPanel.jsx";
import { FoldArt, FOLD_INTRO_KEY } from "../ui/backdrop.jsx";
import { useBackdropMotion, reducedMotion } from "../lib/hooks.js";
import { ReceivedTag } from "../ui/FileViewer.jsx";
import { UpdateCard, InstallBanner, DesktopAppPill } from "../ui/install.jsx";
import { isDesktop } from "../native.js";
import { HomeWeatherCard, HomeTimeline, HomeNextCard, DevicePager, device3d, ExpStorage, ExpBlobs, useExpUi } from "./home/widgets.jsx";

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
  // Настольный компьютер — монитор на ножке (в стиле значков из макета)
  desktop: { vb: "0 0 40 36", w: 40, h: 36, body: (
    <><rect x="0.5" y="0.5" width="39" height="26" rx="6.5" stroke="currentColor" strokeLinejoin="round" />
      <path d="M20 27v6M13.5 34.5h13" stroke="currentColor" strokeLinecap="round" /></>) },
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
// «Найти» на карточках не показываем — оно на экране устройства (быстрые действия)
// activityBlock — компактная лента «Активность» (только у вошедшего)
/* Плашка устройства (компьютер и экран «Все устройства»): «таблетка» во всю ширину,
   слева рисунок устройства, справа точка статуса; заливка цветом статуса */
export function DeviceRow({ d, received, onOpen }) {
  return (
    <div style={{ position: "relative" }}>
      <button type="button" data-link-id={d.id} className="nx-row-btn nx-dev-row" data-online={d.online || d.isSelf ? "1" : "0"} onClick={() => onOpen(d.id)}
        style={{ ...btnReset, width: "100%", textAlign: "left", color: C.text }}>
        <span className="nx-dev-row-icon" aria-hidden="true">{deviceArt(d, 34)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="nx-dev-row-name">{d.name}</span>
          {received?.[d.id]
            ? <span style={{ display: "block", marginTop: 3 }}><ReceivedTag name={received[d.id].name} compact /></span>
            : <span className="nx-dev-row-sub">{[deviceStatus(d), d.isSelf && "это устройство"].filter(Boolean).join(" · ")}</span>}
        </span>
        <span className="nx-status-dot" style={{ color: d.online || d.isSelf ? C.green : C.red, background: d.online || d.isSelf ? C.green : C.red }} />
      </button>
    </div>
  );
}

// «Добавить устройство» — пунктирная таблетка
function AddDeviceRow({ onClick }) {
  return (
    <button type="button" className="nx-row-btn nx-dev-row is-add" onClick={onClick} style={{ ...btnReset, width: "100%", textAlign: "left", color: C.text }}>
      <span className="nx-dev-row-icon" aria-hidden="true">{Icon.plus({ c: C.mint, s: 30 })}</span>
      <span className="nx-dev-row-name">Добавить устройство</span>
    </button>
  );
}

/* Складка Главной (компьютер): объёмная складка из макета, векторная (FoldArt в backdrop.jsx).
   Движение (только transform и прозрачность граней, при «уменьшении движения» — ничего):
   - первое открытие Главной за сессию — грани раскрываются из общего сгиба (~1,3 с);
   - за курсором грани расходятся на разную глубину (--px / --py от useBackdropMotion);
   - стало больше устройств — короткий «вздох» гранями.
   count — сколько устройств */
/* Движение граней по кадрам: frame(t) → { rotate, scale } для t от 0 до 1; грани по очереди (stagger мс).
   Пишем transform прямо в стиль каждой грани — так Chrome перерисовывает свечение */
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function foldMotion(root, { duration, stagger, frame }) {
  const faces = ["hf-blue", "hf-mint", "hf-bottom"].map((c) => root?.querySelector("." + c)).filter(Boolean);
  if (!faces.length) return () => {};
  let raf = 0;
  const start = performance.now();
  const tick = (now) => {
    let done = true;
    faces.forEach((el, i) => {
      const t = Math.min(1, Math.max(0, (now - start - i * stagger) / duration));
      if (t < 1) done = false;
      const { rotate, scale } = frame(t);
      el.style.transform = t >= 1 ? "" : `rotate(${rotate}deg) scale(${scale})`;
    });
    if (!done) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); faces.forEach((el) => { el.style.transform = ""; }); };
}

function HomeFoldArt({ count = 0 }) {
  const ref = useRef(null);
  useBackdropMotion(ref);
  // Раскрытие — один раз за сессию: грани выходят из общего сгиба по очереди (синяя, мятная, нижняя)
  useLayoutEffect(() => {
    let first = false;
    try { first = !reducedMotion() && !sessionStorage.getItem(FOLD_INTRO_KEY); if (first) sessionStorage.setItem(FOLD_INTRO_KEY, "1"); } catch {}
    if (!first) return;
    return foldMotion(ref.current, { duration: 1100, stagger: 140, frame: (t) => { const e = easeOut(t); return { rotate: -38 * (1 - e), scale: 0.05 + 0.95 * e }; } });
  }, []);
  // Стало больше устройств — короткий «вздох»: грани чуть раскрываются и возвращаются
  const prev = useRef(count);
  useEffect(() => {
    const grew = count > prev.current;
    prev.current = count;
    if (!grew || reducedMotion()) return;
    return foldMotion(ref.current, { duration: 800, stagger: 70, frame: (t) => { const k = Math.sin(Math.PI * t); return { rotate: -5 * k, scale: 1 + 0.06 * k }; } });
  }, [count]);
  return (
    <span ref={ref} data-link-hub className="nx-hf-live" style={{ display: "block" }}>
      <FoldArt className="nx-home-fold-art" />
    </span>
  );
}

// Сколько устройств видно на Главной; остальные — «Все устройства».
// Компьютер — две, как в макете: карточка не растёт и вся Главная помещается в экран
const HOME_DESK_MAX = 2;

// schedule — дела (погода и ближайшие дела на Главной, макет 2026-10-27), files — для «Хранилища»
// экспериментального интерфейса, onOpenCategory — открыть категорию «Медиа»
export function ScreenHome({ devices, received = {}, update, onUpdateLater, loading, activityBlock, onNavigate, onOpenDevice, onAddDevice, onAbout, onAllDevices, onSearch, bell, schedule = [], files = [], onOpenCategory }) {
  const exp = useExpUi(); // экспериментальный интерфейс телефона (Настройки → «Внешний вид»)
  const toToday = () => onNavigate("today");
  // Сколько устройств сейчас в сети — для счётчика рядом с заголовком
  const onlineCount = devices.filter((d) => d.online || d.isSelf).length;
  const deskList = devices.slice(0, HOME_DESK_MAX);

  // Пустой список. Пока грузим из облака — вместо «Устройств пока нет» заготовка строк
  const empty = devices.length === 0 && (loading ? <DevicesSkeleton /> : (
    <EmptyState
      compact
      title="Устройств пока нет"
      text="Войдите в ту же почту на другом устройстве — оно появится здесь само"
      action={
        <StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={onAddDevice}>Добавить устройство</StateButton>
      }
    />
  ));

  // Ассистент — крупная таблетка (на компьютере со свечением по макету)
  const aiPill = (cls) => (
    <button type="button" className={`nx-row-btn nx-pill-card nx-ai-pill nx-glass nx-glass-prominent ${cls || ""}`} onClick={() => onNavigate("assistant")}
      style={{ ...btnReset, width: "100%", textAlign: "left", color: C.text }}>
      <span aria-hidden="true" className="nx-ai-pill-icon">{Icon.sparkle({ c: C.onFold, s: 22 })}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="ng-display nx-ai-pill-title">ИИ — Ассистент</span>
        <span className="nx-ai-pill-sub" style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 3 }}>Чем могу помочь?</span>
      </span>
      {Icon.chevron({ c: C.text, s: 20 })}
    </button>
  );

  return (
    <div className="ng-screen ng-home" style={{ padding: "28px 40px 40px", textAlign: "left" }}>

      {/* ══════════ КОМПЬЮТЕР ══════════ */}
      <div className="ng-home-desktop">
        {/* Знак и NEXA, под ними «Ваша экосистема». Справа сверху — общая верхняя строка */}
        <div className="nx-home-brand-desk">
          <span style={{ display: "flex", alignItems: "center", gap: 36 }} role="img" aria-label="NEXA">
            <LogoMark s={58} />
            <Logo bare h={40} />
          </span>
          <div className="nx-home-eco">Ваша экосистема</div>
        </div>
        {/* В приложении для ПК обновление — таблеткой рядом с ассистентом (DesktopAppPill) */}
        {update && !isDesktop && <div style={{ marginBottom: 24 }}><UpdateCard update={update} onLater={onUpdateLater} /></div>}

        {/* Макет 2026-10-27: слева устройства и «Активность», в середине погода с ближайшими делами,
            ассистент и «Приложение NEXA», справа складка */}
        <div className="nx-home-grid2">
          <div className="nx-home-colA">
            {/* data-nosnippet — поисковики не берут отсюда текст для описания сайта (тут личные устройства) */}
            <section className="nx-home-card nx-home-devices nx-glass nx-glass-subtle" aria-label="Мои устройства" data-nosnippet>
              <div className="nx-home-card-title">Мои устройства</div>
              <div className="nx-stagger" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {empty}
                {deskList.map((d) => <DeviceRow key={d.id} d={d} received={received} onOpen={onOpenDevice} />)}
                {devices.length > 0 && <AddDeviceRow onClick={onAddDevice} />}
              </div>
              {devices.length > 0 && (
                <button type="button" className="nx-ghost-btn nx-home-all" onClick={onAllDevices}>
                  {devices.length > HOME_DESK_MAX ? `Все устройства · ${devices.length}` : "Все устройства"}
                </button>
              )}
            </section>
            {activityBlock && <div className="nx-home-act nx-glass nx-glass-subtle" data-nosnippet>{activityBlock}</div>}
          </div>
          <div className="nx-home-colB">
            <HomeWeatherCard className="nx-hw-desk" onOpen={toToday}>
              <HomeTimeline schedule={schedule} onOpen={toToday} />
            </HomeWeatherCard>
            {/* В приложении для ПК обновление — таблеткой «Приложение NEXA» (DesktopAppPill) */}
            <div className="nx-home-pills2">
              {aiPill("nx-ai-glow")}
              <DesktopAppPill update={isDesktop ? update : null} />
            </div>
          </div>
          <div className="nx-home-fold2" aria-hidden="true"><HomeFoldArt count={devices.length} /></div>
        </div>

        {onAbout && (
          <div className="nx-home-about-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            {/* Подпись студии — слева, «Подробнее о системе» — справа */}
            <MadeBy style={{ justifyContent: "flex-start" }} />
            <button type="button" className="nx-link-btn nx-about-link nx-home-about" onClick={onAbout} style={{ ...btnReset, fontSize: 14, color: C.muted, display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden="true">→</span> Подробнее о системе
            </button>
          </div>
        )}
      </div>

      {/* ══════════ ТЕЛЕФОН ══════════ */}
      <div className="ng-home-mobile">
        {/* Шапка (макет): NEXA по центру, уведомления и быстрые действия справа.
            Профиль — во вкладке нижней панели, слева пусто */}
        {/* Шапка и поиск закреплены вместе: при прокрутке поиск не уезжает под логотип */}
        <div className="nx-home-top">
          <div className="nx-home-head">
            <span aria-hidden="true" style={{ height: 40 }} />
            <span style={{ justifySelf: "center" }}><Logo bare h={22} /></span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              {bell}
              <QuickBtn />
            </span>
          </div>
          {/* Поиск — широкая таблетка */}
          {/* Поиск — широкая таблетка; в эксперименте рядом — «AI» (ассистент) */}
          <div className={exp ? "nx-home-search-row" : undefined}>
            <button type="button" className="nx-row-btn nx-home-search nx-glass" onClick={() => onSearch?.()}>
              {Icon.search({ c: C.text, s: 15 })} Поиск
            </button>
            {exp && <button type="button" className="nx-exp-ai" onClick={() => onNavigate("assistant")} aria-label="ИИ — Ассистент" style={{ ...btnReset }}>AI</button>}
          </div>
        </div>

        {update && <div style={{ marginTop: 18 }}><UpdateCard update={update} onLater={onUpdateLater} /></div>}
        <InstallBanner onHowTo={() => {
          onNavigate("settings");
          setTimeout(() => document.getElementById("nx-install")?.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
        }} />

        {/* Мои устройства (макет 2026-10-27): по 4 клетки на страницу, листаются вбок, точки внизу.
            Экспериментальный интерфейс — с 3D-рисунками устройств (data-nosnippet — не в описание сайта) */}
        <div style={{ marginTop: 22 }} data-nosnippet>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="ng-display" style={{ fontSize: 22, fontWeight: 500 }}>Мои устройства</div>
            <button type="button" className="nx-row-btn" title="В сети · все устройства" onClick={onAllDevices}
              style={{ ...btnReset, display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 18, fontWeight: 600 }}>
              <span>{onlineCount}</span>
              <span className="nx-status-dot" style={{ color: C.green, background: C.green }} />
            </button>
          </div>
          {empty && <div className="nx-pill-card" style={{ borderRadius: 32 }}>{empty}</div>}
          {devices.length > 0 && (
            <DevicePager devices={devices}
              cell={(d) => {
                const on = d.online || d.isSelf;
                const art = exp && device3d(d);
                return (
                  <button type="button" data-link-id={d.id} className={`nx-row-btn nx-dev-pill${art ? " is-3d" : ""}`} data-online={on ? "1" : "0"}
                    onClick={() => onOpenDevice(d.id)} style={{ ...btnReset, width: "100%", minWidth: 0, textAlign: "left", color: C.text }}>
                    <span className="nx-dev-pill-icon" aria-hidden="true">{art || deviceArt(d, 28)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {/* Имя — до двух строк; статус — коротко, как в макете */}
                      <span className="nx-dev-pill-name" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 14, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", overflowWrap: "anywhere" }}>{d.name}</span>
                      {received[d.id]
                        ? <span style={{ display: "block", marginTop: 3 }}><ReceivedTag name={received[d.id].name} compact /></span>
                        : <span style={{ display: "block", fontSize: 11, lineHeight: 1.25, color: C.muted, marginTop: 3 }}>{d.isSelf ? "Это устройство" : on ? "В сети" : "Не в сети"}</span>}
                    </span>
                    <span className="nx-status-dot" style={{ color: on ? C.green : C.red, background: on ? C.green : C.red }} />
                  </button>
                );
              }}
              addCell={(
                <button type="button" className="nx-row-btn nx-dev-pill is-add is-half" onClick={onAddDevice} aria-label="Добавить устройство"
                  style={{ ...btnReset, width: "100%", minWidth: 0, color: C.text, justifyContent: "center", gap: 8 }}>
                  {Icon.plus({ c: C.mint, s: 18 })}
                  <span style={{ fontSize: 14, lineHeight: 1.2 }}>Добавить устройство</span>
                </button>
              )} />
          )}
        </div>

        {exp ? (
          <>
            {/* Эксперимент: «Активность» и «Хранилище» рядом, ниже — капли дела и погоды */}
            <div className={`nx-exp-grid${activityBlock ? "" : " is-one"}`}>
              {activityBlock && <div className="nx-exp-box nx-exp-act nx-glass nx-glass-subtle" data-nosnippet>{activityBlock}</div>}
              <ExpStorage files={files} onOpen={(cat) => onOpenCategory?.(cat)} />
            </div>
            <ExpBlobs schedule={schedule} onToday={toToday} />
          </>
        ) : (
          <>
            <div style={{ marginTop: 22 }}>{aiPill()}</div>
            {activityBlock && <div className="nx-act-pill nx-glass nx-glass-subtle" style={{ marginTop: 18 }} data-nosnippet>{activityBlock}</div>}
            {/* Погода и ближайшее дело — две карточки рядом (макет 2026-10-27) */}
            <div className="nx-home-duo">
              <HomeWeatherCard className="nx-hw-mob" onOpen={toToday} />
              <HomeNextCard schedule={schedule} onOpen={toToday} />
            </div>
          </>
        )}
        {onAbout && (
          <button type="button" className="nx-row-btn nx-pill-card nx-home-more nx-glass nx-glass-subtle" onClick={onAbout}>О системе</button>
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
