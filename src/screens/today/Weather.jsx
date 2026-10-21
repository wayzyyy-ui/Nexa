// Карточка погоды, выбор города, прогноз на 2 недели, подпись источника
import { useState, useEffect } from "react";
import { C, fontDisplay } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { weatherKind, searchCities, forecastDayLabel } from "../../lib/weather.js";
import { signed } from "../../lib/format.js";
import { btnReset, Spinner, EmptyState } from "../../ui/base.jsx";
import { FoldHero } from "../../ui/backdrop.jsx";

// Значок погоды: ромб в круге
export const weatherMark = (s = 24) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={C.text} strokeWidth="1.3">
    <circle cx="12" cy="12" r="10.5" />
    <polygon points="12,6.5 17.5,12 12,17.5 6.5,12" />
  </svg>
);

// Крупная температура, за градусом острая складка.
// tone — цвет складки: мятный для ясной погоды, серый для пасмурной.
// rain — идёт дождь: вдоль складки падают мятные капли
export function TempFold({ temp, tone, rain }) {
  return (
    <div className="nx-temp" style={{ position: "relative", display: "inline-flex", alignItems: "flex-start", paddingRight: 22, flexShrink: 0 }}>
      {rain && <RainDrops />}
      {/* Складка: светлая у верхней вершины и тающая книзу */}
      <div aria-hidden="true" style={{
        position: "absolute", top: -8, bottom: 0, left: "36%", right: 0,
        clipPath: "polygon(0 22%, 100% 0, 42% 100%)",
        background: `linear-gradient(to bottom left, ${tone}, transparent 80%)`,
      }} />
      <span style={{ position: "relative", fontFamily: fontDisplay, fontSize: 64, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.03em" }}>
        {signed(temp)}
      </span>
      <span style={{ position: "relative", fontFamily: fontDisplay, fontSize: 40, lineHeight: 0.8, marginLeft: 2 }}>°</span>
    </div>
  );
}

/* Капли дождя: короткие косые штрихи, яркие на «голове» и тающие к хвосту.
   Наклон — как у складки. При появлении капли трижды пролетают вниз
   и остаются на месте неподвижными штрихами (бесконечного движения нет).
   x, y — где капля (в % от складки), len — длина, d — задержка, o — яркость */
export const RAIN_DROPS = [
  [8, 30, 16, 0, 0.5], [18, 8, 22, 420, 0.8], [27, 46, 14, 180, 0.45], [34, 20, 26, 620, 0.9],
  [42, 60, 18, 300, 0.55], [50, 4, 20, 820, 0.7], [57, 36, 30, 120, 1], [64, 70, 16, 540, 0.5],
  [70, 18, 18, 720, 0.65], [77, 52, 24, 260, 0.85], [84, 6, 14, 960, 0.5], [90, 34, 20, 380, 0.7],
  [24, 76, 12, 680, 0.4], [46, 88, 14, 80, 0.45],
];

export function RainDrops() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "24%", right: -14, top: -26, bottom: -18, pointerEvents: "none" }}>
      {RAIN_DROPS.map(([x, y, len, d, o], i) => (
        <span key={i} className="nx-drop" style={{
          position: "absolute", left: `${x}%`, top: `${y}%`, width: 1.6, height: len, borderRadius: 1,
          opacity: o, animationDelay: `${d}ms`,
          background: `linear-gradient(to bottom, transparent, ${C.mint})`,
        }} />
      ))}
    </div>
  );
}

// Карточка погоды (на экране "Сегодня" их две: на сегодня и на завтра).
// city и details необязательные: у карточки "на завтра" их нет.
// art — показать складку внутри карточки (только на телефоне, как в макете).
// note — своя подпись под состоянием вместо «Ощущается как …» (для завтра)
// cityNote — мелкая подпись после города: откуда взялось местоположение
// veil — «вуаль», когда настоящих данных нет: { kind: "loading" | "error", text, onRetry }.
//   Значения размываются, поверх — сообщение и кнопка «Обновить»
// footer — строка внизу карточки (например «Обновлено в 14:32»),
// grow — карточка растягивается на всю свободную высоту, значения встают по центру
// onCity — нажатие на город (открыть выбор), cityPicker — сам выбор, если открыт
// rain — идёт дождь (капли на складке температуры)
export function WeatherCard({ title, date, city, cityNote, temp, cond, feels, note, tone, rain, details, art, veil, footer, grow, onCity, cityPicker }) {
  return (
    <div className="nx-weather" style={{
      position: "relative", overflow: "hidden",
      border: `1px solid ${C.borderStrong}`, borderRadius: 16, padding: "22px 24px",
      display: "flex", flexDirection: "column", boxSizing: "border-box",
      ...(grow ? { flex: 1 } : {}),
    }}>
      {art && (
        <div className="nx-weather-art" aria-hidden="true" style={{ display: "none", position: "absolute", right: -8, top: 44 }}>
          <FoldHero size={128} />
        </div>
      )}

      {/* Шапка: на компьютере "Погода" и дата, под ними город;
          на телефоне "Погода" прячется, город и дата встают в одну строку */}
      <div className="nx-weather-head" style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto",
        gridTemplateAreas: `"title date" "city city"`, alignItems: "center", columnGap: 12,
      }}>
        <div className="nx-weather-title" style={{ gridArea: "title", display: "flex", alignItems: "center", gap: 14, fontFamily: fontDisplay, fontSize: 20 }}>
          {weatherMark()} {title}
        </div>
        <div className="nx-weather-date" style={{ gridArea: "date", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{date}</div>
        {/* Пока погоды нет (грузится или ошибка), город тоже размыт — как и значения под ним */}
        {cityPicker}
        {city && !cityPicker && (
          <button type="button" onClick={onCity} title="Выбрать город" className="nx-weather-city nx-link-btn" aria-hidden={veil ? true : undefined} style={{
            ...btnReset, cursor: onCity ? "pointer" : "default",
            gridArea: "city", display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: C.muted, marginTop: 8, minWidth: 0,
            ...(veil ? { filter: "blur(5px)", opacity: 0.45, userSelect: "none" } : {}),
          }}>
            <span className="nx-weather-pin" style={{ display: "flex", width: 24, justifyContent: "center", flexShrink: 0 }}>{Icon.pin({ c: C.muted, s: 20 })}</span>
            {/* Длинное название города обрезается многоточием, подпись не съезжает */}
            <span className="nx-weather-cityname" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city === "—" ? "Город не выбран" : city}</span>
            {cityNote && city !== "—" && (
              <span className="nx-weather-note" style={{ flexShrink: 0, marginLeft: -6, fontSize: 11, color: C.mutedSoft, whiteSpace: "nowrap" }}>· {cityNote}</span>
            )}
            {/* Город не определился — подсказываем, что его можно указать */}
            {city === "—" && <span style={{ flexShrink: 0, marginLeft: -6, fontSize: 12, color: C.mint, whiteSpace: "nowrap" }}>· Указать</span>}
          </button>
        )}
      </div>

      {/* Значения погоды. Если настоящих данных нет (veil), они размыты,
          а поверх — сообщение: «загружаем» или «не удалось + Обновить».
          flex: 1 + центр — в растянутой карточке значения стоят посередине.
          minHeight — чтобы сообщение с кнопкой не вылезало за край карточки */}
      <div style={{
        position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        minHeight: veil ? 150 : undefined,
      }}>
        <div aria-hidden={veil ? true : undefined} style={veil ? {
          filter: "blur(8px)", opacity: 0.45, pointerEvents: "none", userSelect: "none",
        } : { transition: "filter 300ms ease, opacity 300ms ease" }}>
          <div className="nx-weather-main" style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            <TempFold temp={temp} tone={tone} rain={rain} />
            <div>
              <div style={{ fontSize: 20 }}>{cond}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{note || `Ощущается как ${signed(feels)}°`}</div>
            </div>
          </div>

          {details && (
            <div className="nx-weather-details" style={{ position: "relative", display: "flex", marginTop: 26 }}>
              {details.map((d, i) => (
                <div key={d.label} className="nx-weather-detail" style={{
                  flex: 1, minWidth: 0,
                  paddingLeft: i ? 16 : 0,
                  borderLeft: i ? `1px solid ${C.borderStrong}` : "none",
                }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{d.label}</div>
                  <div className="nx-weather-value" style={{ fontSize: 19, fontWeight: 300, color: C.muted, marginTop: 2, whiteSpace: "nowrap" }}>{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {veil && (
          <div role={veil.kind === "error" ? "alert" : "status"} className="nx-pop" style={{
            position: "absolute", inset: 0, marginTop: 12,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, textAlign: "center",
          }}>
            {veil.kind === "loading" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.muted }}>
                <Spinner /> Загружаем погоду…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                  Не удалось загрузить погоду
                  {veil.text && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>{veil.text}</div>}
                </div>
                <button type="button" className="nx-ghost-btn" onClick={veil.onRetry} style={{
                  ...btnReset, display: "flex", alignItems: "center", gap: 8,
                  // Кнопка-«таблетка», как кнопки в окне устройства
                  border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 18px", fontSize: 13,
                  background: C.panel,
                }}>
                  {Icon.refresh({ c: C.text, s: 14 })} Обновить
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
    </div>
  );
}

export function WeatherGlyph({ cond, s = 20 }) {
  const kind = weatherKind(cond);
  const mint = { stroke: C.mint }, gray = { stroke: C.muted };
  const cloud = (pts, o = 1) => <polygon points={pts} strokeWidth="1.3" strokeLinejoin="round" style={{ stroke: C.muted, fill: `color-mix(in srgb, ${C.muted} ${Math.round(o * 35)}%, transparent)` }} />;
  const rays = (cx, cy, r1, r2, n) => Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    return <line key={i} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)} strokeWidth="1.4" strokeLinecap="round" style={mint} />;
  });
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {kind === "sun" && <><circle cx="12" cy="12" r="4" strokeWidth="1.5" style={{ ...mint, fill: `color-mix(in srgb, ${C.mint} 25%, transparent)` }} />{rays(12, 12, 6.6, 9, 8)}</>}
      {kind === "partly" && <><circle cx="9" cy="9" r="3.2" strokeWidth="1.4" style={mint} />{rays(9, 9, 5.2, 7, 6)}{cloud("5,20 9,13 21,13 17,20")}</>}
      {kind === "cloud" && <>{cloud("8,15 12,7 22,7 18,15", 0.5)}{cloud("2,20 6,12 17,12 13,20")}</>}
      {kind === "fog" && [8, 12, 16].map((y, i) => <line key={y} x1={3 + i * 2} y1={y} x2={21 - (2 - i) * 2} y2={y} strokeWidth="1.5" strokeLinecap="round" style={gray} />)}
      {kind === "rain" && <>{cloud("3,13 7,5 21,5 17,13")}{[7, 12, 17].map((x) => <line key={x} x1={x} y1="16" x2={x - 2} y2="21" strokeWidth="1.5" strokeLinecap="round" style={mint} />)}</>}
      {kind === "snow" && <>{cloud("3,13 7,5 21,5 17,13")}{[[7, 17], [12, 20], [17, 17]].map(([x, y]) => <rect key={x} x={x - 1.3} y={y - 1.3} width="2.6" height="2.6" transform={`rotate(45 ${x} ${y})`} style={{ fill: C.mint }} />)}</>}
      {kind === "storm" && <>{cloud("3,12 7,4 21,4 17,12")}<path d="M13 13 9.5 18h4L11 22.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={mint} /></>}
    </svg>
  );
}

// Цвет складки температуры и капли: мятный — ясно и малооблачно, серый — остальное
export function condLook(cond) {
  return {
    tone: cond === "sun" || cond === "partly" ? C.mint : C.muted,
    rain: cond === "rain" || cond === "sleet" || cond === "storm",
  };
}

// Подпись источника погоды — обязательное условие Gismeteo («По данным Gismeteo» со ссылкой
// на gismeteo.ru). Резерв — подпись Open-Meteo. Ссылка открывается во внешнем браузере
export function WeatherAttribution({ w, style }) {
  const a = w && w.attribution;
  if (!a || !/^https:\/\//.test(a.url || "")) return null;
  return (
    <a className="nx-weather-attr" href={a.url} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: 12, color: C.muted, textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: C.borderStrong, ...style }}>
      {a.text}
    </a>
  );
}

/* Выбор города: поле поиска и список вариантов прямо в карточке погоды.
   Enter — первый вариант, Esc — отмена */
export function CityPicker({ onPick, onAuto, onClose, isManual }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ loading: false, list: [], error: null });
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setState({ loading: false, list: [], error: null }); return; }
    const ctrl = new AbortController();
    setState((st) => ({ ...st, loading: true, error: null }));
    // Ищем через 300 мс после последней буквы, чтобы не слать запрос на каждую
    const t = setTimeout(() => {
      searchCities(text, ctrl.signal)
        .then((list) => setState({ loading: false, list, error: null }))
        .catch((e) => { if (e.name !== "AbortError") setState({ loading: false, list: [], error: "Не удалось найти — проверьте интернет" }); });
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const text = q.trim();
  return (
    <div className="nx-pop" style={{ gridArea: "city", marginTop: 10 }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); if (state.list[0]) onPick(state.list[0]); }} style={{ display: "flex", gap: 6 }}>
        <input autoFocus className="nx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Введите город"
          aria-label="Поиск города" style={{
            flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 16,
            border: "1px solid " + C.borderStrong, borderRadius: 10, padding: "8px 10px", outline: "none", boxSizing: "border-box",
          }} />
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Отмена" style={{
          ...btnReset, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {Icon.close({ c: C.muted, s: 16 })}
        </button>
      </form>
      <div style={{ marginTop: 6 }}>
        {state.loading && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, padding: "6px 2px" }}><Spinner /> Ищем…</div>}
        {state.error && <div style={{ fontSize: 13, color: C.red, padding: "6px 2px" }}>{state.error}</div>}
        {!state.loading && !state.error && text.length >= 2 && state.list.length === 0 && (
          <div style={{ fontSize: 13, color: C.mutedSoft, padding: "6px 2px" }}>Ничего не нашлось</div>
        )}
        {state.list.map((c) => (
          <button key={c.lat + "," + c.lon} type="button" className="nx-row-btn" onClick={() => onPick(c)} style={{
            ...btnReset, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "baseline", gap: 8,
            padding: "8px 4px", borderBottom: "1px solid " + C.border, fontSize: 14,
          }}>
            <span>{c.city}</span>
            <span style={{ fontSize: 12, color: C.mutedSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.region}</span>
          </button>
        ))}
        {isManual && (
          <button type="button" className="nx-link-btn" onClick={onAuto} style={{ ...btnReset, fontSize: 13, color: C.muted, padding: "8px 2px" }}>
            Определять автоматически
          </button>
        )}
      </div>
    </div>
  );
}

/* Прогноз на 2 недели. Только настоящие данные: пока их нет,
   показываем загрузку или ошибку, а не выдуманные дни.
   variant:
     "inline" — список раскрывается под кнопкой (узкий экран и телефон);
     "aside"  — панель справа от погоды на всю высоту колонки (широкий экран),
                с заголовком, кнопкой «закрыть» и своей прокруткой. */
export function ForecastList({ id, days, loading, error, onRetry, variant = "inline", onClose, attribution }) {
  const aside = variant === "aside";

  // Что внутри: загрузка, ошибка или список дней
  let body;
  if (!days && loading) {
    body = (
      <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "26px 16px", fontSize: 13, color: C.muted }}>
        <Spinner /> Загружаем прогноз…
      </div>
    );
  } else if (!days) {
    body = (
      <EmptyState
        compact
        title="Прогноз пока недоступен"
        text={error ? `Не удалось загрузить: ${error}.` : "Данных о погоде ещё нет."}
        action={
          <button type="button" className="nx-ghost-btn" onClick={onRetry} style={{
            ...btnReset, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: "8px 14px", fontSize: 13,
          }}>
            Повторить
          </button>
        }
      />
    );
  } else {
    body = (
      <>
        {days.map((day, i) => {
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13,
              borderTop: i ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ width: 86, flexShrink: 0, color: i < 2 ? C.text : C.muted }}>{forecastDayLabel(day.date, i)}</div>
              {/* Значок погоды: солнце, облака, дождь, снег, туман или гроза */}
              <WeatherGlyph cond={day.cond} />
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{day.text}</div>
              {/* Днём и ночью */}
              <div style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {signed(day.max)}°<span style={{ color: C.mutedSoft }}> / {signed(day.min)}°</span>
              </div>
            </div>
          );
        })}
        <div style={{ padding: "8px 14px 10px", fontSize: 12, color: C.mutedSoft, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span>Днём / ночью</span>
          <WeatherAttribution w={attribution} />
        </div>
      </>
    );
  }

  if (!aside) {
    return (
      <div id={id} className="nx-pop" style={{ marginTop: 10, border: `1px solid ${C.borderStrong}`, borderRadius: 14 }}>
        {body}
      </div>
    );
  }

  return (
    <div id={id} role="region" aria-label="Прогноз на 2 недели" className="nx-fc-slide" style={{
      // Как карточки погоды рядом: прозрачная, яркая тонкая обводка, крупное скругление
      height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column",
      background: "transparent", border: `1px solid ${C.lineBright}`, borderRadius: 32, overflow: "hidden",
    }}>
      {/* Шапка панели: заголовок и «закрыть» */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 16px 14px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, fontFamily: fontDisplay, fontSize: 17 }}>Прогноз на 2 недели</div>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть прогноз" style={{
          ...btnReset, width: 30, height: 30, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.muted, s: 16 })}
        </button>
      </div>
      {/* Список прокручивается внутри панели, сама панель высотой с колонку погоды */}
      <div className="nx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {body}
      </div>
    </div>
  );
}
