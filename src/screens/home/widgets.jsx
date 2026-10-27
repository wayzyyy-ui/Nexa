// Главная (макет 2026-10-27): погода и расписание прямо на Главной, устройства страницами,
// экспериментальный интерфейс телефона (3D-устройства, «капли» дела и погоды, хранилище)
import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset } from "../../ui/base.jsx";
import { useLocation, weatherPlace, useWeather } from "../../lib/weather.js";
import { WeatherAttribution } from "../today/Weather.jsx";
import { dayKey, nextScheduleItem, scheduleDayLabel } from "../../lib/schedule.js";
import { plural } from "../../lib/format.js";

/* ── Погода ── город и погода те же, что на «Сегодня» (кеш общий, лишних запросов нет) */
export function useHomeWeather() {
  const location = useLocation();
  const w = useWeather(weatherPlace(location));
  return { w, city: location.city };
}
const signedTemp = (t) => (Number.isFinite(t) ? `${t > 0 ? "+" : ""}${Math.round(t)}` : "—");
const shortDate = (d = new Date()) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
// «ясно» → «Ясно»
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// Мятный треугольник за градусом — фирменная грань из макета.
// id градиента — свой у каждой карточки: на странице две Главные (компьютер скрыт на телефоне), и общий id
// брался из скрытой — в Chrome грань тогда не рисовалась вовсе
function TempFacet() {
  const gid = `nx-hw-g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className="nx-hw-facet" viewBox="0 0 120 80" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0" stopColor="var(--mint)" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="var(--mint)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M120 0 L0 26 L66 80 Z" fill={`url(#${gid})`} />
    </svg>
  );
}

/* Карточка погоды: «Погода», город, дата, крупный градус с гранью, состояние, «Ощущается как»,
   подпись источника (условие Gismeteo). children — что показать ниже (на компьютере — ближайшие дела) */
export function HomeWeatherCard({ onOpen, children, className = "" }) {
  const { w, city } = useHomeWeather();
  const now = w.now;
  return (
    <section className={`nx-hw nx-glass nx-glass-subtle ${className}`} aria-label="Погода">
      <button type="button" className="nx-hw-main" onClick={onOpen} aria-label={`Погода: ${now ? `${signedTemp(now.temp)}°, ${now.text || ""}` : "загружается"}. Открыть «Сегодня»`}
        style={{ ...btnReset, color: C.text, textAlign: "left", width: "100%" }}>
        <span className="nx-hw-head">
          <span>
            <span className="nx-hw-title">Погода</span>
            <span className="nx-hw-city">{city || "—"}</span>
          </span>
          <span className="nx-hw-date">{shortDate(now?.date)}</span>
        </span>
        <span className={`nx-hw-temp${now ? "" : " is-veil"}`}>
          <TempFacet />
          <span className="nx-hw-deg">{now ? signedTemp(now.temp) : "—"}<i className="nx-deg-ring" aria-hidden="true" /></span>
        </span>
        <span className="nx-hw-cond">{now ? cap(now.text) : w.error ? "Погода недоступна" : "Загружаем…"}</span>
        {now && Number.isFinite(now.feels) && <span className="nx-hw-feels">Ощущается как {signedTemp(now.feels)}</span>}
      </button>
      <WeatherAttribution w={w} style={{ fontSize: 11 }} />
      {children}
    </section>
  );
}

/* ── Расписание ── */
// Ближайшие дела на сегодня (ещё не начались), не больше max
export function upcomingToday(schedule, max = 3, now = new Date()) {
  const today = dayKey(now);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (schedule || []).filter((it) => (it.date || today) === today && (it.time || "") >= hm)
    .sort((a, b) => (a.time || "").localeCompare(b.time || "")).slice(0, max);
}

// Компьютер: под погодой — ближайшие дела таймлайном; первое выделено мятным
export function HomeTimeline({ schedule, onOpen }) {
  const items = upcomingToday(schedule, 3);
  return (
    <div className="nx-hw-tl">
      {items.length === 0 ? (
        <button type="button" className="nx-link-btn nx-hw-tl-empty" onClick={onOpen} style={{ ...btnReset, color: C.muted }}>
          На сегодня дел больше нет · <span style={{ color: C.mint }}>Расписание</span>
        </button>
      ) : items.map((it, i) => (
        <button key={`${it.time}-${it.title}`} type="button" className={`nx-hw-tl-row${i === 0 ? " is-next" : ""}`} onClick={onOpen} style={{ ...btnReset, color: C.text, textAlign: "left" }}>
          <span className="nx-hw-tl-dot" aria-hidden="true" />
          <span className="nx-hw-tl-time">{it.time}</span>
          <span className="nx-hw-tl-pill">{it.title}</span>
        </button>
      ))}
    </div>
  );
}

// Телефон: карточка «Расписание» — ближайшее дело крупно (сегодня или позже)
export function HomeNextCard({ schedule, onOpen, className = "" }) {
  const next = nextScheduleItem(schedule || []);
  const today = dayKey();
  return (
    <button type="button" className={`nx-hn ${className}`} onClick={onOpen}
      aria-label={next ? `Ближайшее дело: ${next.title}, ${next.time}` : "Расписание: дел нет"} style={{ ...btnReset, color: C.text, textAlign: "left" }}>
      <span className="nx-hn-title">Расписание</span>
      {next ? (
        <span className="nx-hn-next">
          <span className="nx-hn-time">{next.date && next.date !== today ? `${scheduleDayLabel(next.date)}, ` : ""}{next.time}</span>
          <span className="nx-hn-what">{next.title}</span>
        </span>
      ) : (
        <span className="nx-hn-next is-empty">
          <span className="nx-hn-time">Дел нет</span>
          <span className="nx-hn-add">{Icon.plus({ c: C.mint, s: 14 })} Добавить</span>
        </span>
      )}
    </button>
  );
}

/* ── Устройства страницами (телефон): по 4 клетки, листаются вбок, точки внизу.
   «Добавить» — последней клеткой. cell(d) рисует таблетку устройства ── */
export const PAGE_SIZE = 4;
export function DevicePager({ devices, cell, addCell }) {
  const items = [...devices.map((d) => ({ d })), { add: true }];
  const pages = [];
  for (let i = 0; i < items.length; i += PAGE_SIZE) pages.push(items.slice(i, i + PAGE_SIZE));
  const ref = useRef(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  const go = (i) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });
  return (
    <div className="nx-dpager">
      <div ref={ref} className="nx-dpager-track" data-no-swipe>
        {pages.map((p, i) => (
          <div key={i} className="nx-dpager-page" aria-hidden={i !== page || undefined}>
            {p.map((x) => (x.add ? <div key="add" className="nx-dpager-cell">{addCell}</div> : <div key={x.d.id} className="nx-dpager-cell">{cell(x.d)}</div>))}
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="nx-dpager-dots" role="tablist" aria-label="Страницы устройств">
          {pages.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === page} aria-label={`Страница ${i + 1}`} className={`nx-dpager-dot${i === page ? " is-on" : ""}`} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* Имя устройства без переноса посреди слова: «Приложение» не рвётся на «Приложени / е».
   Не влезает даже одно слово (крупный системный шрифт телефона) — шрифт уменьшается шагами до 11 px */
export function FitName({ children, className = "", style }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize) || 14;
      for (let i = 0; i < 6 && el.scrollWidth > el.clientWidth + 1 && size > 11; i++) { size -= 1; el.style.fontSize = `${size}px`; }
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => ro?.disconnect();
  }, [children]);
  return <span ref={ref} className={`nx-fit-name ${className}`} style={style}>{children}</span>;
}

/* ── Экспериментальный интерфейс (Настройки → «Внешний вид») ── */
// 3D-рисунки устройств из макета (public/art/dev3d-*.webp); нет своего — обычный значок
const ART3D = { phone: "/art/dev3d-phone.webp", tablet: "/art/dev3d-phone.webp", laptop: "/art/dev3d-laptop.webp", desktop: "/art/dev3d-laptop.webp", watch: "/art/dev3d-watch.webp" };
export function device3d(d) {
  const src = ART3D[d.type];
  return src ? <img className={`nx-d3 is-${d.type}`} src={src} alt="" draggable={false} /> : null;
}

// «Хранилище»: сколько фото, видео и документов
export function ExpStorage({ files, onOpen }) {
  const count = (cat) => files.filter((f) => f.cat === cat).length;
  const rows = [["photo", "Фото"], ["video", "Видео"], ["doc", "Документы"]];
  return (
    <section className="nx-exp-box nx-glass nx-glass-subtle" aria-label="Хранилище">
      <div className="nx-exp-box-title">Хранилище</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(([cat, label]) => {
          const n = count(cat);
          return (
            <button key={cat} type="button" className="nx-exp-chip" onClick={() => onOpen(cat)} style={{ ...btnReset, color: C.text }}>
              <span className="nx-exp-chip-t">{label}</span>
              <span className="nx-exp-chip-n">{n} {plural(n, ["файл", "файла", "файлов"])}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// «Капли»: ближайшее дело (мятная) и погода (контур)
export function ExpBlobs({ schedule, onToday }) {
  const next = nextScheduleItem(schedule || []);
  const { w } = useHomeWeather();
  const now = w.now;
  return (
    <div className="nx-exp-blobs">
      <button type="button" className="nx-exp-blob is-event" onClick={onToday} style={{ ...btnReset, color: C.text }}
        aria-label={next ? `Ближайшее дело: ${next.title}, ${next.time}` : "Дел нет — открыть расписание"}>
        {next ? <><span className="nx-exp-blob-time">{next.time}</span><span className="nx-exp-blob-big">{next.title}</span></>
          : <><span className="nx-exp-blob-time">Сегодня</span><span className="nx-exp-blob-big is-small">Дел нет</span></>}
      </button>
      <button type="button" className="nx-exp-blob is-weather" onClick={onToday} style={{ ...btnReset, color: C.text }}
        aria-label={now ? `Погода: ${signedTemp(now.temp)}°, ${now.text || ""}` : "Погода"}>
        <span className="nx-exp-temp"><TempFacet /><span className="nx-hw-deg">{now ? signedTemp(now.temp) : "—"}<i className="nx-deg-ring" aria-hidden="true" /></span></span>
        <span className="nx-exp-blob-cond">{now ? cap(now.text) : "Погода"}</span>
      </button>
    </div>
  );
}

// Экспериментальный интерфейс включён? Только на этом устройстве (localStorage nexa-exp-ui)
export const EXP_UI_KEY = "nexa-exp-ui";
export function readExpUi() { try { return localStorage.getItem(EXP_UI_KEY) === "1"; } catch { return false; } }
export const EXP_UI_EVENT = "nexa-exp-ui";
export function setExpUi(on) {
  try { if (on) localStorage.setItem(EXP_UI_KEY, "1"); else localStorage.removeItem(EXP_UI_KEY); } catch { /* не страшно */ }
  window.dispatchEvent(new Event(EXP_UI_EVENT));
}
export function useExpUi() {
  const [on, setOn] = useState(readExpUi);
  useEffect(() => {
    const f = () => setOn(readExpUi());
    window.addEventListener(EXP_UI_EVENT, f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener(EXP_UI_EVENT, f); window.removeEventListener("storage", f); };
  }, []);
  return on;
}
