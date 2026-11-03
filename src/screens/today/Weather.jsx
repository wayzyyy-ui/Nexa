// Карточка погоды, выбор города, прогноз на 2 недели, подпись источника
import { useState, useEffect, useRef, useId } from "react";
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
// snow — снег или дождь со снегом: медленно падают снежинки
export function TempFold({ temp, tone, rain, snow }) {
  return (
    <div className="nx-temp" style={{ position: "relative", display: "inline-flex", alignItems: "flex-start", paddingRight: 22, flexShrink: 0 }}>
      {rain && <RainDrops />}
      {snow && <SnowFlakes />}
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

/* Снежинки: маленькие ромбы-складки (как в значке снега), падают медленнее капель
   и чуть покачиваются. Так же трижды пролетают и остаются на месте.
   x, y — где (в % от складки), s — размер, d — задержка, o — яркость */
export const SNOW_FLAKES = [
  [12, 14, 5, 200, 0.7], [30, 4, 4, 900, 0.55], [38, 40, 6, 0, 0.9], [52, 22, 4, 600, 0.6],
  [61, 58, 5, 1300, 0.75], [73, 10, 6, 400, 0.85], [82, 44, 4, 1000, 0.5], [92, 20, 5, 1600, 0.65],
  [20, 66, 4, 1200, 0.45],
];

export function SnowFlakes() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "24%", right: -14, top: -26, bottom: -18, pointerEvents: "none" }}>
      {SNOW_FLAKES.map(([x, y, s, d, o], i) => (
        <span key={i} className="nx-flake" style={{
          position: "absolute", left: `${x}%`, top: `${y}%`, width: s, height: s,
          opacity: o, animationDelay: `${d}ms`, background: C.text,
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
// rain — идёт дождь (капли на складке температуры), snow — снег / дождь со снегом (снежинки)
export function WeatherCard({ title, date, city, cityNote, temp, cond, feels, note, tone, rain, snow, details, art, veil, footer, grow, onCity, cityPicker }) {
  return (
    <div className="nx-weather nx-glass nx-glass-subtle" style={{
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
            <TempFold temp={temp} tone={tone} rain={rain} snow={snow} />
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

/* Значки прогноза по рисункам автора (ноябрь 2026): облако — грань-параллелограмм
   с заливкой и внутренней обводкой, осадки и солнце — мятные линии.
   Снег трёх видов — по тексту Gismeteo: «небольшой» — одна снежинка, «сильный» — три.
   Координаты — из SVG автора как есть */
const WX_CLOUD = "M28.5027 0H138.036L109.533 64.3946H0L28.5027 0Z";
const WX_DROP = (x) => `M${x + 71.886} 100.353L${x + 82.829} 71.9065`; // x — сдвиг от левой капли
const WX_FLAKE = (dx) => [
  `M${20.979 + dx} 72.894L${11.132 + dx} 96.429`, `M${27.828 + dx} 89.583L${4.293 + dx} 79.736`,
  `M${20.902 + dx} 96.464L${11.223 + dx} 72.859`, `M${27.86 + dx} 79.82L${4.255 + dx} 89.499`,
];
const WX_SUN_RAYS = [
  "M61.1443 27.7598V2.18286", "M61.7407 92.9218L61.7407 118.499", "M95.1252 60.3408L120.702 60.3408",
  "M27.7598 60.3408L2.18286 60.3408", "M85.4501 33.6279L102.176 14.2778", "M35.0277 33.6279L18.3018 14.2778",
  "M37.4349 87.0538L20.709 106.404", "M85.45 84.6466L104.8 101.373",
];

// Сколько снежинок: по словам в описании дня
function snowLevel(text = "") {
  const t = String(text).toLowerCase();
  if (/сильн|метел|снегопад/.test(t)) return 3;
  if (/небольш|слаб/.test(t)) return 1;
  return 2;
}

export function WeatherGlyph({ cond, text, s = 22 }) {
  const id = "wx" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const kind = cond === "sleet" ? "sleet" : cond === "overcast" ? "overcast" : weatherKind(cond);
  const mint = { stroke: C.mint, strokeLinecap: "round" };
  // Облако: заливка + обводка внутрь (маской по самой фигуре), dx/dy — сдвиг
  const cloud = (key, dx = 0, dy = 0) => (
    <g key={key} transform={`translate(${dx} ${dy})`}>
      <mask id={`${id}${key}`} fill="white"><path d={WX_CLOUD} /></mask>
      <path d={WX_CLOUD} style={{ fill: C.wxCloud }} />
      <path d={WX_CLOUD} strokeWidth="20" mask={`url(#${id}${key})`} style={{ stroke: C.muted }} />
    </g>
  );
  const flakes = (shifts) => shifts.flatMap((dx) => WX_FLAKE(dx).map((d) => <path key={d} d={d} strokeWidth="4" style={mint} />));
  const drops = (shifts) => shifts.map((x) => <path key={x} d={WX_DROP(x)} strokeWidth="6" style={mint} />);
  const sun = (k = 1, dx = 0, dy = 0) => (
    <g transform={`translate(${dx} ${dy}) scale(${k})`}>
      <circle cx="61.7406" cy="60.3409" r="26.713" style={{ fill: C.mint }} />
      {WX_SUN_RAYS.map((d) => <path key={d} d={d} strokeWidth="4.36568" style={mint} />)}
    </g>
  );
  const box = {
    sun: "0 0 123 121", partly: "0 0 160 121", cloud: "-2 -2 143 70", overcast: "0 0 204 92",
    rain: "0 0 139 104", sleet: "0 0 139 104", snow: "0 0 139 99", storm: "0 0 139 104", fog: "0 0 139 70",
  }[kind] || "0 0 139 104";
  return (
    <svg viewBox={box} width={Math.round(s * 1.5)} height={s} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {kind === "sun" && sun()}
      {kind === "partly" && <>{sun(0.62, 48, 0)}{cloud("c", 0, 44)}</>}
      {kind === "cloud" && cloud("c")}
      {kind === "overcast" && <>{cloud("a", 0, 27.5)}{cloud("b", 65.13, 0)}</>}
      {kind === "rain" && <>{cloud("c")}{drops([-61.257, -25.314, 10.629])}</>}
      {kind === "sleet" && <>{cloud("c")}{drops([-25.314, 10.629])}{flakes([2.169])}</>}
      {kind === "snow" && <>{cloud("c")}{flakes([0, 35.446, 70.893].slice(0, snowLevel(text)))}</>}
      {kind === "storm" && <>{cloud("c")}<path d="M76 70 58 88h20L62 102" strokeWidth="6" strokeLinejoin="round" style={mint} /></>}
      {kind === "fog" && [10, 34, 58].map((y, i) => <path key={y} d={`M${8 + i * 10} ${y}H${131 - (2 - i) * 10}`} strokeWidth="8" strokeLinecap="round" style={{ stroke: C.muted }} />)}
    </svg>
  );
}

// Цвет складки температуры, капли и снежинки: мятный — ясно и малооблачно, серый — остальное.
// Дождь со снегом — и капли, и снежинки
export function condLook(cond) {
  return {
    tone: cond === "sun" || cond === "partly" ? C.mint : C.muted,
    rain: cond === "rain" || cond === "sleet" || cond === "storm",
    snow: cond === "snow" || cond === "sleet",
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
  const touch = useRef(null); // где палец коснулся варианта (отличить нажатие от прокрутки)
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
          // Город выбирается уже при отпускании пальца (tap): иначе на айфоне поле теряло фокус,
          // клавиатура закрывалась, список съезжал — и нажатие уходило мимо города
          <button key={c.lat + "," + c.lon} type="button" className="nx-row-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const t = touch.current, p = e.changedTouches[0]; touch.current = null;
              if (!t || Math.abs(p.clientX - t.x) > 10 || Math.abs(p.clientY - t.y) > 10) return; // это была прокрутка
              e.preventDefault(); onPick(c);
            }} style={{
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
              <WeatherGlyph cond={day.cond} text={day.text} />
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
