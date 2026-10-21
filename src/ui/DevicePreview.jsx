// Превью интерфейса на экране устройства (часы, ТВ, наушники, ноутбук)
import { useState } from "react";
import { C, fontDisplay } from "./theme.js";
import { Icon } from "./icons.jsx";
import { TODAY } from "../lib/weather.js";
import { hhmm } from "../lib/format.js";
import { useClock } from "../lib/hooks.js";
import { btnReset } from "./base.jsx";
import { sortByRecent, fileMeta } from "../lib/fileStore.js";
import { FileThumb } from "./files.jsx";

/* ═══ ПРЕВЬЮ ИНТЕРФЕЙСА NEXA НА УСТРОЙСТВЕ ═══════════════════
   Корпус рисуем схематично: тонкая линия, без бликов. Экран внутри —
   уменьшенный интерфейс NEXA, собранный обычной разметкой.
   Каждое превью нарисовано в своём "родном" размере (PREVIEW_SIZE),
   а на сцене масштабируется, чтобы влезть и на телефоне. */
export const PREVIEW_SIZE = {
  phone:  { w: 190, h: 370 },
  laptop: { w: 470, h: 290 },
  tablet: { w: 420, h: 290 },
  watch:  { w: 210, h: 340 },
  tv:     { w: 490, h: 310 },
  buds:   { w: 520, h: 250 },
};

// Какой тип у устройства: у добавленных он записан, у исходных — это id
// Настольный компьютер показываем той же картинкой экрана, что ноутбук
export const typeOf = (d) => (d.type === "desktop" ? "laptop" : d.type || d.id);

// Ближайшее дело из расписания (или null, если на сегодня всё)
export function nextEvent(now) {
  const m = now.getHours() * 60 + now.getMinutes();
  return TODAY.schedule.find((it) => {
    const [h, mm] = it.time.split(":").map(Number);
    return h * 60 + mm >= m;
  }) || null;
}

// Мини-строка устройства для уменьшенной главной
export function MiniDeviceRow({ d, size = 8 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ display: "flex", width: 14, height: 14, border: `1px solid ${C.border}`, borderRadius: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {d.icon({ c: C.text, s: 9 })}
      </span>
      <span style={{ fontSize: size, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: d.online ? C.green : C.red, flexShrink: 0 }} />
    </div>
  );
}

// Маленькая складка-акцент (та же форма, что у героя на главной)
export function MiniFold({ w = 70, h = 54 }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", width: w, height: h }}>
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(18% 8%, 100% 0, 78% 100%, 0 82%)", background: `linear-gradient(135deg, ${C.foldDeep}, ${C.foldBlue})` }} />
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(100% 0, 78% 100%, 46% 46%)", background: `linear-gradient(135deg, ${C.foldCyan}, ${C.foldMint})`, opacity: 0.9 }} />
    </div>
  );
}

// Уменьшенная главная NEXA — для смартфона и ноутбука
export function MiniHome({ devices, wide, now }) {
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: wide ? "14px 16px" : "10px 10px", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
      {/* Строка состояния: время и логотип-буквы */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: C.muted }}>
        <span style={{ letterSpacing: "0.3em" }}>NEXA</span><span>{hhmm(now)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 6, letterSpacing: "0.18em", color: C.muted }}>ВАША ЭКОСИСТЕМА</div>
          <div style={{ fontFamily: fontDisplay, fontSize: wide ? 14 : 12, fontWeight: 600, lineHeight: 1.15, marginTop: 4 }}>
            Все устройства в одной системе
          </div>
        </div>
        {!wide && <MiniFold w={44} h={34} />}
      </div>
      <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, padding: "5px 7px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
            <span>Устройства</span>
            <span style={{ color: C.muted }}>{devices.filter((d) => d.online).length} в сети</span>
          </div>
          {devices.slice(0, wide ? 5 : 7).map((d) => <MiniDeviceRow key={d.id} d={d} size={wide ? 8 : 7.5} />)}
        </div>
        {wide && (
          <div style={{ width: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
            <MiniFold w={96} h={76} />
            <div style={{
              width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 3, padding: "6px 7px", fontSize: 7.5,
              background: `linear-gradient(90deg, color-mix(in srgb, ${C.blueDark} 30%, transparent), color-mix(in srgb, ${C.mintDark} 30%, transparent))`,
            }}>
              AI-ассистент
              <div style={{ color: C.muted, fontSize: 6.5, marginTop: 2 }}>Чем могу помочь?</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Уменьшенный менеджер файлов — для планшета
export function MiniFiles({ files, folders }) {
  const roots = folders.filter((f) => f.parent === null).slice(0, 3);
  const recent = sortByRecent(files).slice(0, 4);
  const chip = (active) => ({
    fontSize: 7.5, padding: "3px 10px 3px 9px", color: C.onFold,
    clipPath: "polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)",
    background: active ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` : C.foldDeep,
  });
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: "12px 14px", textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: fontDisplay, fontSize: 15 }}>Файлы</div>
      <div style={{ display: "flex", gap: 4 }}>
        <span style={chip(false)}>Хранилище</span>
        <span style={chip(true)}>Недавние</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.borderStrong}` }}>
        {roots.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 24, height: 16, borderRadius: 2, background: C.chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.folder({ c: C.muted, s: 10 })}
            </span>
            <span style={{ fontSize: 8.5 }}>{f.name}</span>
          </div>
        ))}
        {recent.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", borderBottom: `1px solid ${C.border}` }}>
            <FileThumb file={f} w={24} h={16} iconSize={9} radius={2} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ fontSize: 6.5, color: C.mutedSoft }}>{fileMeta(f)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Часы: круглый циферблат — время, ближайшее дело, статус связи.
// По краю — кольцо заряда (синий → мятный)
export function WatchFace({ online, now, battery }) {
  const ev = nextEvent(now);
  const pct = battery ?? 100;
  const R = 46, LEN = 2 * Math.PI * R; // кольцо в координатах 0..100
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center" }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="nx-watch-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: C.blue }} />
            <stop offset="1" style={{ stopColor: C.mint }} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="1.6" style={{ stroke: C.border }} />
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="1.6" strokeLinecap="round"
          stroke="url(#nx-watch-ring)" strokeDasharray={`${(LEN * pct) / 100} ${LEN}`} transform="rotate(-90 50 50)" />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: online ? C.green : C.red }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: online ? C.green : C.red }} />
        {online ? "На связи" : "Нет связи"}
      </div>
      <div style={{ fontFamily: fontDisplay, fontSize: 42, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em" }}>{hhmm(now)}</div>
      <div style={{ fontSize: 8.5, color: C.muted }}>{now.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</div>
      {/* Тонкая черта-грань, как сгиб складки */}
      <div style={{ width: 74, height: 1, background: `linear-gradient(90deg, transparent, ${C.mint}, transparent)`, margin: "3px 0" }} />
      <div style={{ fontSize: 8.5, maxWidth: 118, lineHeight: 1.3 }}>
        {ev ? <><span style={{ color: C.mint }}>{ev.time}</span> · {ev.title}</> : "На сегодня дел нет"}
      </div>
    </div>
  );
}

// ТВ: «Продолжить просмотр» и полка медиа
export function TvScreen({ files }) {
  const videos = files.filter((f) => f.cat === "video");
  const main = videos[0];
  const shelf = files.filter((f) => f.cat === "video" || f.cat === "photo").filter((f) => f.id !== main?.id).slice(0, 4);
  // Видео ещё нет — на экране ТВ просто подсказка
  if (!main) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16, boxSizing: "border-box" }}>
      {Icon.video({ c: C.muted, s: 22 })}
      <div style={{ fontSize: 11 }}>Здесь появятся ваши видео</div>
      <div style={{ fontSize: 8.5, color: C.muted }}>Загрузите их в «Файлы»</div>
    </div>
  );
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: "16px 18px", textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 8, letterSpacing: "0.18em", color: C.muted }}>ПРОДОЛЖИТЬ ПРОСМОТР</div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ position: "relative", width: 230, flexShrink: 0 }}>
          <FileThumb file={main} w={230} h={124} iconSize={22} radius={4} />
          {/* Прогресс просмотра — тонкая полоска внизу кадра */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: `color-mix(in srgb, ${C.onFold} 25%, transparent)` }}>
            <div style={{ width: "42%", height: "100%", background: C.mint }} />
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main.name.replace(/\.[^.]+$/, "")}</div>
          <div style={{ fontSize: 8.5, color: C.muted, marginTop: 3 }}>Осталось 12 мин</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "5px 12px", borderRadius: 999,
            fontSize: 8.5, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
          }}>
            {Icon.play({ c: C.onFold, s: 10 })} Продолжить
          </div>
        </div>
      </div>
      <div style={{ fontSize: 8, letterSpacing: "0.18em", color: C.muted, marginTop: 2 }}>МЕДИА</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {shelf.map((f) => <FileThumb key={f.id} file={f} w="100%" h={50} iconSize={13} radius={3} />)}
      </div>
    </div>
  );
}

// Наушники: схема наушников + мини-плеер, заряд и режим (переключается)
export const BUDS_MODES = [["anc", "Шумоподавление"], ["clear", "Прозрачность"], ["off", "Выкл."]];

export function BudsPanel({ files, battery, online }) {
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("anc");
  const tracks = files.filter((f) => f.cat === "music");
  const [ti, setTi] = useState(0);
  const track = tracks.length ? tracks[ti % tracks.length] : null;
  const b = battery ?? 80;
  const charge = [["Л", b], ["П", Math.max(5, b - 4)], ["Кейс", 54]];
  const iconBtn = { ...btnReset, width: 28, height: 28, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 28, textAlign: "left" }}>
      {/* Схема: два наушника тонкой линией */}
      <svg viewBox="0 0 160 200" width={160} height={200} fill="none" stroke={C.muted} strokeWidth="1.2" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="48" cy="62" r="26" />
        <circle cx="48" cy="62" r="11" stroke={online ? C.mint : C.muted} />
        <path d="M60 85 64 160a8 8 0 0 1-16 1l-2-72" />
        <circle cx="112" cy="102" r="26" />
        <circle cx="112" cy="102" r="11" stroke={online ? C.mint : C.muted} />
        <path d="M100 125 96 186a8 8 0 0 0 16 1l2-62" />
      </svg>
      <div style={{ width: 300, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "14px 16px", background: C.panel, boxSizing: "border-box" }}>
        {/* Мини-плеер */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {track ? <FileThumb file={track} w={38} h={38} iconSize={15} radius={4} /> : <div style={{ width: 38, height: 38, background: C.chip, borderRadius: 10 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track ? track.name.replace(/\.[^.]+$/, "") : "Нет треков"}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{playing ? "Играет" : "На паузе"} · Музыка</div>
          </div>
          <button type="button" className="nx-icon-btn" aria-label="Предыдущий трек" onClick={() => setTi((i) => i + tracks.length - 1)} style={iconBtn}>
            {Icon.next({ c: C.text, s: 14, flip: true })}
          </button>
          <button type="button" className="nx-icon-btn" aria-label={playing ? "Пауза" : "Играть"} onClick={() => setPlaying(!playing)} style={{ ...iconBtn, border: `1px solid ${C.borderStrong}` }}>
            {(playing ? Icon.pause : Icon.play)({ c: C.text, s: 14 })}
          </button>
          <button type="button" className="nx-icon-btn" aria-label="Следующий трек" onClick={() => setTi((i) => i + 1)} style={iconBtn}>
            {Icon.next({ c: C.text, s: 14 })}
          </button>
        </div>
        <div style={{ height: 2, background: C.border, marginTop: 10 }}>
          <div style={{ width: playing ? "38%" : "37%", height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
        </div>

        {/* Заряд: левый, правый, кейс */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
          {charge.map(([label, v]) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: C.muted }}><span>{label}</span><span>{v}%</span></div>
              <div style={{ height: 3, background: C.border, marginTop: 4 }}>
                <div style={{ width: `${v}%`, height: "100%", background: v < 20 ? C.red : C.green }} />
              </div>
            </div>
          ))}
        </div>

        {/* Режим: три кнопки-сегмента */}
        <div role="radiogroup" aria-label="Режим наушников" style={{ display: "flex", marginTop: 14, border: `1px solid ${C.borderStrong}`, borderRadius: 10, overflow: "hidden" }}>
          {BUDS_MODES.map(([id, label], i) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} style={{
              ...btnReset, flex: 1, textAlign: "center", fontSize: 9.5, padding: "6px 4px",
              borderLeft: i ? `1px solid ${C.borderStrong}` : "none",
              background: mode === id ? C.blue : "transparent", color: mode === id ? C.onFold : C.text,
              transition: "background-color 160ms ease, color 160ms ease",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Корпус + экран для нужного типа. online=false — экран тускнеет, сверху «Нет связи»
export function DevicePreview({ device, devices, files, folders }) {
  const now = useClock();
  const type = typeOf(device);
  // Контур корпуса: заметнее приглушённого цвета, но тоньше текста
  const lineColor = `color-mix(in srgb, ${C.text} 48%, transparent)`;
  const line = `1px solid ${lineColor}`;
  const screen = { background: C.bg, border: `1px solid ${C.border}`, overflow: "hidden", position: "relative" };
  // Экран выключенного устройства: тусклый, с подписью поверх
  const content = (node) => (
    <>
      <div style={{ height: "100%", opacity: device.online ? 1 : 0.3, filter: device.online ? "none" : "grayscale(1)", transition: "opacity 300ms ease" }}>{node}</div>
      {!device.online && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, padding: "4px 10px", border: `1px solid ${C.red}`, color: C.red, borderRadius: 10, background: C.bg }}>Нет связи</span>
        </div>
      )}
    </>
  );

  if (type === "phone") return (
    <div style={{ width: 190, height: 370, border: line, borderRadius: 26, padding: 7, boxSizing: "border-box", background: C.panel }}>
      <div style={{ ...screen, height: "100%", borderRadius: 20 }}>{content(<MiniHome devices={devices} now={now} />)}</div>
    </div>
  );
  if (type === "laptop") return (
    <div style={{ width: 470, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 400, height: 262, border: line, borderRadius: "8px 8px 2px 2px", padding: 8, boxSizing: "border-box", background: C.panel }}>
        <div style={{ ...screen, height: "100%", borderRadius: 3 }}>{content(<MiniHome devices={devices} now={now} wide />)}</div>
      </div>
      {/* Основание: тонкая планка с выемкой под открытие */}
      <div style={{ width: 470, height: 12, border: line, borderRadius: "2px 2px 10px 10px", boxSizing: "border-box", background: C.panel, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 60, height: 4, borderBottom: line, borderLeft: line, borderRight: line, borderRadius: "0 0 4px 4px" }} />
      </div>
    </div>
  );
  if (type === "tablet") return (
    <div style={{ width: 420, height: 290, border: line, borderRadius: 18, padding: 11, boxSizing: "border-box", background: C.panel }}>
      <div style={{ ...screen, height: "100%", borderRadius: 14 }}>{content(<MiniFiles files={files} folders={folders} />)}</div>
    </div>
  );
  if (type === "watch") return (
    <div style={{ width: 210, height: 340, position: "relative" }}>
      {/* Ремешки: сужаются к концу, по краю строчка, на нижнем — дырочки.
          Заливка цветом корпуса — складка остаётся позади часов */}
      <svg viewBox="0 0 210 340" width={210} height={340} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <g strokeWidth="1" style={{ fill: C.panel, stroke: lineColor }}>
          <path d="M60 6 Q60 2 64 2 L146 2 Q150 2 150 6 L158 88 L52 88 Z" />
          <path d="M52 252 L158 252 L150 334 Q150 338 146 338 L64 338 Q60 338 60 334 Z" />
        </g>
        <g fill="none" strokeWidth="0.8" strokeDasharray="2 3" style={{ stroke: `color-mix(in srgb, ${C.text} 22%, transparent)` }}>
          <path d="M59 80 L66 8 L144 8 L151 80" />
          <path d="M59 260 L66 332 L144 332 L151 260" />
        </g>
        {[284, 300, 316].map((y) => (
          <rect key={y} x="101" y={y} width="8" height="4" rx="2" strokeWidth="0.8" style={{ fill: C.bg, stroke: lineColor }} />
        ))}
      </svg>
      {/* Корпус: круг, на ободе метки минут (каждая пятая длиннее и ярче) */}
      <div style={{ position: "absolute", left: 5, top: 70, width: 200, height: 200, borderRadius: "50%", border: line, padding: 9, boxSizing: "border-box", background: C.panel }}>
        <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: "absolute", left: -1, top: -1, width: 200, height: 200 }}>
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1="100" y1={i % 5 ? 3.5 : 2.5} x2="100" y2={i % 5 ? 6.5 : 8.5} transform={`rotate(${i * 6} 100 100)`}
              strokeWidth={i % 5 ? 0.6 : 1.1}
              style={{ stroke: `color-mix(in srgb, ${C.text} ${i % 5 ? 25 : 60}%, transparent)` }} />
          ))}
        </svg>
        <div style={{ ...screen, height: "100%", borderRadius: "50%" }}>{content(<WatchFace online={device.online} now={now} battery={device.battery} />)}</div>
        {/* Заводная головка с насечками и кнопка под ней */}
        <div style={{
          position: "absolute", right: -9, top: 80, width: 9, height: 30, border: line, borderLeft: "none", borderRadius: "0 3px 3px 0", boxSizing: "border-box",
          background: `repeating-linear-gradient(0deg, ${lineColor} 0 1px, ${C.panel} 1px 4px)`,
        }} />
        <div style={{ position: "absolute", right: -5, top: 124, width: 5, height: 16, border: line, borderLeft: "none", borderRadius: "0 2px 2px 0", boxSizing: "border-box", background: C.panel }} />
      </div>
    </div>
  );
  if (type === "tv") return (
    <div style={{ width: 490, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 490, height: 280, border: line, borderRadius: 10, padding: 6, boxSizing: "border-box", background: C.panel }}>
        <div style={{ ...screen, height: "100%", borderRadius: 2 }}>{content(<TvScreen files={files} />)}</div>
      </div>
      {/* Подставка: ножка и основание */}
      <div style={{ width: 1, height: 16, background: C.muted }} />
      <div style={{ width: 150, height: 1, background: C.muted }} />
    </div>
  );
  // Наушники: экрана нет — показываем панель управления рядом со схемой
  return (
    <div style={{ width: 520, height: 250, position: "relative" }}>
      {content(<BudsPanel files={files} battery={device.battery} online={device.online} />)}
    </div>
  );
}

/* ЭКРАН УСТРОЙСТВА — открывается по нажатию на устройство на «Главной»
   или из поиска. Сверху «Назад», в центре превью интерфейса NEXA на этом
   устройстве (на складке-конверте), ниже статус, заряд и действия.
   Всё в демо-режиме: состояние (в сети ли, переключатели) живёт в App
   и запоминается в браузере. */
