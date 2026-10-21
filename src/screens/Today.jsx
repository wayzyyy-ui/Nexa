// Экран «Сегодня»: полоса дней, расписание (форма дела), погода
import { useState, useEffect } from "react";
import { C, fontDisplay, fontBody } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { TODAY, useLocation, weatherPlace, useWeather, formatWeatherDate, LOCATION_SOURCE_TEXT } from "../lib/weather.js";
import { hhmm, plural, signed } from "../lib/format.js";
import { dayKey, nextHour, DAYS_AHEAD, itemsOn, toMinutes, untilText, dayFromKey } from "../lib/schedule.js";
import { useClock } from "../lib/hooks.js";
import { btnReset, EmptyState, StateButton, Spinner } from "../ui/base.jsx";
import { condLook, WeatherCard, CityPicker, WeatherAttribution, ForecastList } from "./today/Weather.jsx";
import { MediaLayout, MediaTitle } from "../ui/layout.jsx";

/* Форма нового дела: дата, время, название и описание (необязательно).
   day — выбранный день (по умолчанию дело ставится на него). Enter — добавить, Esc — отмена */
export function ScheduleForm({ existing, day, onSave, onCancel }) {
  const [date, setDate] = useState(day || dayKey());
  const [time, setTime] = useState(nextHour);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState(""); // описание (в данных поле по-прежнему place)
  const t = title.trim();
  const today = dayKey();
  const dup = existing.some((x) => x.date === date && x.time === time && x.title.toLowerCase() === t.toLowerCase());
  const error = !t ? null
    : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Укажите дату"
    : date < today ? "Эта дата уже прошла"
    : !/^\d{2}:\d{2}$/.test(time) ? "Укажите время"
    : dup ? "Такое дело уже есть" : null;
  const save = () => { if (t && !error) onSave({ date, time, title: t, place: place.trim() }); };
  // Поля скруглённые — как кнопки рядом
  const field = {
    background: `color-mix(in srgb, ${C.panel2} 50%, transparent)`, color: C.text, fontFamily: "inherit", fontSize: 14,
    border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "9px 16px", outline: "none", minWidth: 0, boxSizing: "border-box",
  };
  return (
    <form className="nx-pop nx-sched-form" onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      style={{ border: `1px solid color-mix(in srgb, ${C.mint} 45%, transparent)`, borderRadius: 18, padding: 14, marginBottom: 20, display: "grid", gap: 10 }}>
      <div className="nx-sched-form-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 124px", gap: 10 }}>
        <input type="date" required value={date} min={today} onChange={(e) => setDate(e.target.value)} className="nx-input" aria-label="Дата" style={field} />
        <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="nx-input" aria-label="Время" style={field} />
      </div>
      <input autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className="nx-input"
        placeholder="Что за дело?" aria-label="Название" aria-invalid={!!error} style={field} />
      <input value={place} maxLength={80} onChange={(e) => setPlace(e.target.value)} className="nx-input"
        placeholder="Описание (необязательно)" aria-label="Описание" style={field} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={error ? undefined : "nx-sched-hint"} style={{ flex: 1, fontSize: 12, color: error ? C.red : C.mutedSoft }}>{error || "Enter — добавить, Esc — отмена"}</span>
        <button type="button" className="nx-ghost-btn" onClick={onCancel} style={{ ...btnReset, fontSize: 13, padding: "7px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}` }}>
          Отмена
        </button>
        <button type="submit" className="nx-primary" disabled={!t || !!error} style={{
          ...btnReset, fontSize: 13, padding: "7px 14px", borderRadius: 999, border: "1px solid transparent",
          color: C.onFold, fontWeight: 500, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
        }}>
          Добавить
        </button>
      </div>
    </form>
  );
}

export function DayStrip({ value, onChange, all }) {
  // Обычно — сегодня и 6 дней вперёд. Выбрали в календаре день вне этой недели — полоса начинается с него
  const today = dayKey();
  const inWeek = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return dayKey(d); }).includes(value);
  const start = inWeek ? new Date() : dayFromKey(value);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return dayKey(d); })();
  return (
    <div role="tablist" aria-label="День" className="nx-day-strip nx-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 18 }}>
      {days.map((d, i) => {
        const key = dayKey(d), on = key === value, has = all.some((it) => it.date === key);
        const top = key === today ? "Сегодня" : key === tomorrow ? "Завтра"
          : inWeek ? d.toLocaleDateString("ru-RU", { weekday: "short" }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
        return (
          <button key={key} type="button" role="tab" aria-selected={on} onClick={() => onChange(key)} className="nx-day-chip" style={{
            ...btnReset, flexShrink: 0, minWidth: 64, padding: "8px 14px 7px", borderRadius: 18, textAlign: "center",
            border: `1px solid ${on ? "transparent" : C.borderStrong}`,
            background: on ? `linear-gradient(135deg, ${C.foldBlue}, ${C.foldCyan})` : "transparent",
            color: on ? C.onFold : C.text,
          }}>
            <span style={{ display: "block", fontSize: 12, opacity: on ? 0.9 : 0.7, whiteSpace: "nowrap" }}>{top}</span>
            <span className="nx-day-num" style={{ display: "block", fontFamily: fontDisplay, fontSize: 18, lineHeight: 1.2, marginTop: 1 }}>{d.getDate()}</span>
            <span style={{ display: "block", width: 4, height: 4, margin: "3px auto 0", borderRadius: "50%", background: has ? (on ? C.onFold : C.mint) : "transparent" }} />
          </button>
        );
      })}
    </div>
  );
}

/* Календарь на месяц: листать месяцы, точка — в этот день есть дела, мятная рамка — сегодня.
   Выбор дня открывает его расписание. Окно — role="dialog", Esc и «Назад» Android закрывают */
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function MonthCalendar({ value, all, onPick, onClose }) {
  const [month, setMonth] = useState(() => { const d = dayFromKey(value); return new Date(d.getFullYear(), d.getMonth(), 1); });
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const today = dayKey();
  const busy = new Set(all.map((it) => it.date));
  const first = (month.getDay() + 6) % 7; // сколько пустых клеток до 1-го числа (неделя с понедельника)
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const title = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  const navBtn = { ...btnReset, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div role="dialog" aria-label="Календарь" className="nx-pop nx-month" style={{ border: "1px solid " + C.lineBright, borderRadius: 24, padding: "14px 16px 16px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <button type="button" className="nx-icon-btn" onClick={() => shift(-1)} aria-label="Предыдущий месяц" style={navBtn}>
          <span style={{ display: "flex", transform: "rotate(180deg)" }}>{Icon.chevron({ c: C.text, s: 16 })}</span>
        </button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: fontDisplay, fontSize: 17, textTransform: "capitalize" }}>{title}</div>
        <button type="button" className="nx-icon-btn" onClick={() => shift(1)} aria-label="Следующий месяц" style={navBtn}>{Icon.chevron({ c: C.text, s: 16 })}</button>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть календарь" style={navBtn}>{Icon.close({ c: C.muted, s: 16 })}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: "center", fontSize: 11, color: C.mutedSoft, paddingBottom: 4 }}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <span key={"e" + i} />;
          const key = dayKey(d), on = key === value, isToday = key === today;
          return (
            <button key={key} type="button" onClick={() => onPick(key)} aria-pressed={on}
              aria-label={d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + (busy.has(key) ? ", есть дела" : "")}
              className="nx-month-day" style={{
                ...btnReset, height: 42, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontFamily: fontDisplay, fontSize: 15, color: on ? C.onFold : key < today ? C.mutedSoft : C.text,
                background: on ? "linear-gradient(135deg, " + C.foldBlue + ", " + C.foldCyan + ")" : "transparent",
                border: "1px solid " + (isToday && !on ? C.mint : "transparent"),
              }}>
              {d.getDate()}
              <span style={{ width: 4, height: 4, marginTop: 2, borderRadius: "50%", background: busy.has(key) ? (on ? C.onFold : C.mint) : "transparent" }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
        <button type="button" className="nx-link-btn" onClick={() => onPick(today)} style={{ ...btnReset, fontSize: 13, color: C.mint }}>Сегодня</button>
      </div>
    </div>
  );
}

// schedule — все дела (по датам, общие с ассистентом), onAddItem / onRemoveItem — добавить и удалить
export function ScreenToday({ schedule: all = TODAY.schedule, onAddItem, onRemoveItem }) {
  // Какой день смотрим (по умолчанию сегодня). Дела этого дня — schedule
  const [day, setDay] = useState(dayKey);
  const today = dayKey();
  const isToday = day === today;
  const schedule = itemsOn(all, day);
  // Живое расписание: «сейчас» обновляется сам (раз в 15 секунд) — только для сегодня
  const clock = useClock();
  const nowMin = isToday ? clock.getHours() * 60 + clock.getMinutes() : -1;
  const nextIdx = isToday ? schedule.findIndex((it) => toMinutes(it.time) >= nowMin) : -1; // -1 — всё прошло / не сегодня
  const next = nextIdx >= 0 ? schedule[nextIdx] : null;
  const cursorAt = !isToday ? -1 : nextIdx >= 0 ? nextIdx : schedule.length; // курсор «сейчас» — перед ближайшим делом
  const [adding, setAdding] = useState(false);
  const [calOpen, setCalOpen] = useState(false); // открыт ли календарь на месяц

  // Курсор «сейчас»: ромб на линии таймлайна, мятная черта и время справа
  const nowMarker = (
    // Своя строка высотой 18px: ромб на линии таймлайна, черта и время —
    // всё на одной оси, с промежутками до соседних дел (ничего не наезжает)
    <div key="now" className="nx-sched-now" aria-label={`Сейчас ${hhmm(clock)}`} style={{ position: "relative", height: 18, margin: "-4px 0 10px" }}>
      <span style={{ position: "absolute", left: "var(--dot-x)", top: "50%", width: 9, height: 9, margin: "-4.5px 0 0 -4.5px", background: C.mint, transform: "rotate(45deg)" }} />
      <span style={{ position: "absolute", left: "calc(var(--dot-x) + 10px)", right: 52, top: "50%", height: 1, background: `linear-gradient(90deg, ${C.mint}, color-mix(in srgb, ${C.mint} 15%, transparent))` }} />
      <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 11, lineHeight: 1, color: C.mint, letterSpacing: "0.04em" }}>{hhmm(clock)}</span>
    </div>
  );
  // Сначала определяем город, потом по нему грузим погоду
  const location = useLocation();
  const place = weatherPlace(location);
  // Настоящая погода с нашего сервера; пока её нет — «—» под вуалью (выдуманных цифр нет)
  const weather = useWeather(place);
  const [pickingCity, setPickingCity] = useState(false); // открыт ли выбор города
  // Город и место — в общие данные (для сводки ассистента)
  useEffect(() => { TODAY.city = location.city; TODAY.place = place; }, [location.city, place.key]);
  const [forecastOpen, setForecastOpen] = useState(false); // раскрыт ли прогноз на 2 недели
  const now = weather.now;
  const tomorrow = weather.tomorrow;
  const nowSky = condLook(now?.cond);
  const tomorrowSky = condLook(tomorrow?.cond);
  const hm = (ms) => (ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—");

  // Тихая строка под карточкой: идёт обновление или не вышло обновить
  const statusLine = { fontSize: 12, color: C.mutedSoft };

  // Настоящих данных ещё нет — вместо выдуманных цифр размываем значения
  // и пишем, что происходит: грузим или не вышло (тогда кнопка «Обновить»)
  const veil = weather.now ? null
    : weather.loading ? { kind: "loading" }
    : { kind: "error", text: weather.error, onRetry: weather.refetch };

  return (
    <MediaLayout hideArt={forecastOpen}>
      <MediaTitle title="Сегодня" />

      {/* is-fc — открыт прогноз: на широком экране он третья колонка (расписание чуть уже),
          поэтому всегда помещается в окно, как бы ни выросло содержимое (--desk-zoom) */}
      <div className={`nx-today-grid nx-stagger${forecastOpen ? " is-fc" : ""}`} style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 356px)",
        // Справа три панели с одинаковыми отступами: погода, завтра, прогноз.
        // "Завтра" растягивается (строка 1fr), поэтому верх правой колонки
        // вровень с верхом расписания, а кнопка прогноза — с его низом
        gridTemplateAreas: `"sched now" "sched next" "sched month"`,
        gridTemplateRows: "auto 1fr auto",
        gap: "18px 44px", alignItems: "start",
      }}>
        {/* alignSelf: stretch — рамка расписания всегда по высоте правой колонки */}
        <section className="nx-sched" style={{ gridArea: "sched", alignSelf: "stretch", border: `1px solid ${C.lineBright}`, borderRadius: 40, padding: "26px 28px 30px" }}>
          <div className="nx-sched-head" style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: fontDisplay, fontSize: 20, marginBottom: 14 }}>
            <span className="nx-sched-name">Расписание</span>
            {/* Своё дело: открывает форму над таймлайном (на телефоне эта кнопка — ниже, рядом с «Календарём») */}
            {!adding && (
              <button type="button" className="nx-ghost-btn nx-sched-add-top" onClick={() => setAdding(true)} style={{
                ...btnReset, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: fontBody,
                fontSize: 13, padding: "6px 12px", borderRadius: 999, border: `1px solid ${C.borderStrong}`,
              }}>
                {Icon.plus({ c: C.mint, s: 14 })} Добавить
              </button>
            )}
          </div>
          {/* Дни: сегодня, завтра и дальше */}
          <DayStrip value={day} onChange={(k) => { setDay(k); setAdding(false); }} all={all} />
          {/* «Календарь» — месяц целиком; на телефоне рядом «+ Добавить» (макет) */}
          <div className="nx-sched-tools" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <button type="button" className="nx-ghost-btn" onClick={() => setCalOpen(!calOpen)} aria-expanded={calOpen}
              style={{ ...btnReset, flex: 1, fontSize: 14, padding: "7px 14px", borderRadius: 999, border: `1px solid ${C.lineBright}`, textAlign: "center" }}>
              Календарь
            </button>
            {!adding && (
              <button type="button" className="nx-ghost-btn nx-sched-add-row" onClick={() => setAdding(true)}
                style={{ ...btnReset, flex: 1, fontSize: 14, padding: "7px 14px", borderRadius: 999, border: `1px solid ${C.lineBright}`, justifyContent: "center", alignItems: "center", gap: 6 }}>
                {Icon.plus({ c: C.mint, s: 14 })} Добавить
              </button>
            )}
          </div>
          {calOpen && <MonthCalendar value={day} all={all} onClose={() => setCalOpen(false)} onPick={(k) => { setDay(k); setAdding(false); setCalOpen(false); }} />}
          {/* Живая строка: сколько осталось до ближайшего дела (пустая — не занимает места) */}
          {(next || schedule.length > 0) && (
            <div role="status" className="nx-sched-until" style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
              {next
                ? <>{untilText(toMinutes(next.time) - nowMin)} — <span style={{ color: C.text }}>{next.title.toLowerCase()}</span></>
                : isToday ? "На сегодня всё — дел больше нет"
                : `${dayFromKey(day).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })} · ${schedule.length} ${plural(schedule.length, ["дело", "дела", "дел"])}`}
            </div>
          )}

          {adding && (
            <ScheduleForm existing={all} day={day} onCancel={() => setAdding(false)}
              onSave={(it) => { onAddItem?.(it); setDay(it.date); setAdding(false); }} />
          )}

          {schedule.length === 0 && !adding && (
            <EmptyState compact title={isToday ? "Дел на сегодня нет" : "На этот день дел нет"} text="Добавьте дело — оно появится на таймлайне"
              action={<StateButton variant="primary" icon={Icon.plus({ c: C.onFold, s: 15 })} onClick={() => setAdding(true)}>Добавить дело</StateButton>} />
          )}

          {/* Вертикальная линия таймлайна — один div. --dot-x — где центр
              кружков; на телефоне время стоит слева, и линия сдвигается.
              Прошедшие дела бледнее, ближайшее выделено мятным,
              между ними — курсор «сейчас» */}
          {schedule.length > 0 && (
          <div className="nx-sched-list nx-stagger" style={{ position: "relative", "--dot-x": "12px" }}>
            <div className="nx-sched-line" style={{ position: "absolute", left: "var(--dot-x)", top: 8, bottom: -10, width: 1, background: C.muted }} />
            {schedule.flatMap((it, i) => {
              const past = i < cursorAt;
              const isNext = i === nextIdx;
              const row = (
              <div key={`${it.time}-${it.title}`} className="nx-sched-item" style={{
                display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)",
                gridTemplateAreas: `"dot time" ". box"`, columnGap: 20, marginBottom: 14,
                opacity: past ? 0.45 : 1, transition: "opacity 400ms ease",
              }}>
                <span className="nx-sched-dot" style={{
                  gridArea: "dot", justifySelf: "center", alignSelf: "center", position: "relative",
                  width: 12, height: 12, boxSizing: "border-box", borderRadius: "50%",
                  border: `1.5px solid ${isNext ? C.mint : C.text}`,
                  background: isNext ? C.mint : past ? C.muted : C.bg,
                }} />
                <div className="nx-sched-time" style={{ gridArea: "time", fontSize: 14, fontWeight: 500, marginBottom: 6, color: isNext ? C.mint : C.text }}>{it.time}</div>
                <div className="nx-sched-box" style={{
                  gridArea: "box", borderRadius: 18, padding: "9px 10px 9px 16px",
                  border: `1px solid ${isNext ? `color-mix(in srgb, ${C.mint} 70%, transparent)` : C.borderStrong}`,
                  background: isNext ? `color-mix(in srgb, ${C.mint} 6%, transparent)` : "transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                  transition: "border-color 400ms ease, background-color 400ms ease",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="nx-sched-title" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                    {it.place && <div className="nx-sched-place" style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.4, overflowWrap: "anywhere" }}>{it.place}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {isNext && <span style={{ fontSize: 11, color: C.mint, letterSpacing: "0.04em" }}>скоро</span>}
                    <button type="button" className="nx-icon-btn nx-sched-del" onClick={() => onRemoveItem?.(it)} aria-label={`Удалить «${it.title}»`} title="Удалить" style={{
                      ...btnReset, width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {Icon.trash({ c: C.muted, s: 15 })}
                    </button>
                  </div>
                </div>
              </div>
              );
              return i === cursorAt ? [nowMarker, row] : [row];
            }).concat(isToday && cursorAt === schedule.length ? [nowMarker] : [])}
          </div>
          )}
        </section>

        <div style={{ gridArea: "now" }}>
            <WeatherCard title="Погода" date={formatWeatherDate(now?.date || new Date())} city={location.city} cityNote={LOCATION_SOURCE_TEXT[location.source]}
            onCity={() => setPickingCity(true)}
            cityPicker={pickingCity && (
              <CityPicker
                isManual={location.source === "manual"}
                onClose={() => setPickingCity(false)}
                onPick={(c) => { location.pick(c); setPickingCity(false); }}
                onAuto={() => { location.pick(null); setPickingCity(false); }}
              />
            )}
            temp={now?.temp ?? null} cond={now?.text ?? "—"} feels={now?.feels ?? null} tone={nowSky.tone} rain={nowSky.rain}
            details={[
              { label: "Ветер", value: `${now?.wind ?? "—"} м/с` },
              { label: "Влажность", value: `${now?.humidity ?? "—"} %` },
              { label: "Давление", value: `${now?.pressure ?? "—"} мм` },
            ]}
            veil={veil}
            // Пока данных нет, о загрузке и ошибке говорит сама карточка (вуаль),
            // поэтому строку статуса показываем только когда погода уже есть
            footer={weather.now &&
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
            {/* Кнопка обновления доступна всегда — можно потянуть погоду заново */}
            <button
              type="button"
              className="nx-icon-btn"
              onClick={weather.refetch}
              disabled={weather.loading}
              aria-label="Обновить погоду"
              title="Обновить погоду"
              style={{
                ...btnReset, width: 30, height: 30, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {weather.loading
                ? <Spinner s={14} />
                : Icon.refresh({ c: C.muted, s: 14 })}
            </button>

            {/* Что происходит: обновляемся, нет связи (показаны сохранённые), источник недоступен или «обновлено в 14:32» */}
            <div role="status" style={{ ...statusLine, flex: 1, minWidth: 0 }}>
              {weather.loading
                ? "Обновление…"
                : weather.offline
                  ? `Нет связи — данные на ${hm(weather.updatedAt)}`
                  : weather.error
                    ? `Не удалось обновить: ${weather.error} · нажмите ↻`
                    : weather.stale
                      ? `Источник недоступен — последние данные на ${hm(weather.dataTime || weather.updatedAt)}`
                      : `Обновлено в ${hm(weather.updatedAt)}`}
            </div>
            <WeatherAttribution w={weather} style={{ flexShrink: 0 }} />
          </div>
            } />
        </div>
        <div style={{ gridArea: "next", alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <WeatherCard title="Погода (завтра)" date={formatWeatherDate(tomorrow?.date || new Date(Date.now() + 86400000))}
            temp={tomorrow?.temp ?? null} cond={tomorrow?.text ?? "—"} note={`Ночью ${signed(tomorrow?.min ?? null)}°`} tone={tomorrowSky.tone} rain={tomorrowSky.rain}
            veil={veil} grow
            footer={tomorrow && <div style={{ display: "flex", justifyContent: "flex-end" }}><WeatherAttribution w={weather} /></div>} />
        </div>
        <div style={{ gridArea: "month", alignSelf: "end" }}>
          <button type="button" className="nx-ghost-btn"
            onClick={() => setForecastOpen(!forecastOpen)}
            aria-expanded={forecastOpen} aria-controls="nx-forecast nx-forecast-side"
            style={{
              ...btnReset, width: "100%", boxSizing: "border-box",
              border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "6px 14px",
              display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", fontSize: 14,
            }}>
            <span />
            <span>Прогноз на 2 недели</span>
            {/* Стрелка: на широком экране при открытии смотрит влево («закрыть»),
                на узком — вниз (список под кнопкой). См. .nx-fc-chev в стилях */}
            <span className={`nx-fc-chev${forecastOpen ? " is-open" : ""}`} style={{ justifySelf: "end", display: "flex" }}>
              {Icon.chevron({ c: C.text })}
            </span>
          </button>
          {/* Узкий экран и телефон: список под кнопкой */}
          {forecastOpen && (
            <div className="nx-fc-inline">
              <ForecastList id="nx-forecast" days={weather.days} loading={weather.loading}
                error={weather.error} onRetry={weather.refetch} attribution={weather} />
            </div>
          )}
        </div>

        {/* Широкий экран: панель — третья колонка справа от погоды (все строки — вровень с расписанием).
            Внутренняя обёртка absolute — поэтому панель берёт высоту колонки погоды, но сама её не растягивает */}
        {forecastOpen && (
          <div className="nx-fc-aside" style={{
            gridColumn: 3, gridRow: "1 / -1", alignSelf: "stretch",
            width: "100%", position: "relative", zIndex: 3,
          }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <ForecastList id="nx-forecast-side" variant="aside" days={weather.days} loading={weather.loading}
                error={weather.error} onRetry={weather.refetch} onClose={() => setForecastOpen(false)} attribution={weather} />
            </div>
          </div>
        )}
      </div>
    </MediaLayout>
  );
}
