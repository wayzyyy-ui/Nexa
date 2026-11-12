// Главная на компьютере (макет 2026-11-12): компактные карточки. Телефон — в Home.jsx, его это не касается.
// Стили — src/ui/desktopHomeStyles.js (классы nx-hd-*), размеры в px: заголовок карточки 17, текст 14, подписи 12–13
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { deviceStatus } from "../../lib/devices.js";
import { WeatherAttribution } from "../today/Weather.jsx";
import { ActivityList } from "../Activity.jsx";
import { useHomeWeather, upcomingToday, TempFacet, signedTemp, cap } from "./widgets.jsx";
import { plural } from "../../lib/format.js";
import { openQuickPanel } from "../../ui/QuickPanel.jsx";

// Сколько устройств видно на Главной компьютера; остальные — по ссылке «Все устройства»
export const HOME_DESK_MAX = 6;

// Шапка карточки: название слева, маленькая мятная ссылка справа
function CardHead({ title, link, onLink }) {
  return (
    <div className="nx-hd-head">
      <h2 className="nx-hd-h">{title}</h2>
      {link && <button type="button" className="nx-hd-link" onClick={onLink}>{link}</button>}
    </div>
  );
}

// Плашка устройства: значок, имя, «Был в сети…», точка статуса. Без заливки цветом статуса
function DeviceTile({ d, art, onOpen }) {
  const on = d.online || d.isSelf;
  return (
    <button type="button" className="nx-hd-dev" data-self={d.isSelf ? "" : undefined} onClick={() => onOpen(d.id)}>
      <span className="nx-hd-dev-ico" aria-hidden="true">{art(d, 22)}</span>
      <span className="nx-hd-dev-text">
        <span className="nx-hd-dev-name">{d.name}</span>
        <span className="nx-hd-dev-sub">{d.isSelf ? "Это устройство" : deviceStatus(d)}</span>
      </span>
      <span className="nx-hd-dot" role="img" aria-label={on ? "В сети" : "Не в сети"} style={{ background: on ? C.green : C.red }} />
    </button>
  );
}

/* Погода: слева «Погода» и город, справа градус, ниже состояние и источник (условие Gismeteo),
   под чертой — ближайшее дело на сегодня со ссылкой на расписание и «Заметки» */
function WeatherCard({ schedule, onToday, onNotes }) {
  const { w, city } = useHomeWeather();
  const now = w.now;
  const next = upcomingToday(schedule, 1)[0];
  return (
    <section className="nx-hd-card nx-hd-wx nx-glass nx-glass-subtle" aria-label="Погода">
      <button type="button" className="nx-hd-wx-main" onClick={onToday}
        aria-label={`Погода: ${now ? `${signedTemp(now.temp)}°, ${now.text || ""}` : "загружается"}. Открыть «Сегодня»`}>
        <span>
          <span className="nx-hd-h">Погода</span>
          <span className="nx-hd-sub">{city ? `${city} · сегодня` : "—"}</span>
        </span>
        <span className={`nx-hd-temp${now ? "" : " is-veil"}`}>
          <TempFacet />
          <span className="nx-hd-deg">{now ? signedTemp(now.temp) : "—"}<i className="nx-deg-ring" aria-hidden="true" /></span>
        </span>
      </button>
      <div className="nx-hd-wx-cond">
        <b>{now ? cap(now.text) : w.error ? "Погода недоступна" : "Загружаем…"}</b>
        {now && Number.isFinite(now.feels) && <span> · Ощущается как {signedTemp(now.feels)}</span>}
      </div>
      <WeatherAttribution w={w} style={{ fontSize: 12 }} />
      <div className="nx-hd-line" />
      <div className="nx-hd-sched">
        <span className="nx-hd-sched-text">
          {next ? <><b>{next.time}</b> · {next.title}</> : "На сегодня дел больше нет"}
        </span>
        <button type="button" className="nx-hd-link" onClick={onToday}>Расписание</button>
      </div>
      {onNotes && (
        <button type="button" className="nx-ghost-btn nx-hd-notes" onClick={onNotes}>
          {Icon.doc({ c: C.text, s: 16 })} Заметки
        </button>
      )}
    </section>
  );
}

/* Строка под заголовком «Главная»: только настоящие данные — сколько устройств, сколько не в сети, погода.
   Чего нет (устройств, погоды) — той части строки нет; совсем пусто — строки нет */
export function HomeStatus({ devices }) {
  const { w } = useHomeWeather();
  const off = devices.filter((d) => !(d.online || d.isSelf)).length;
  const parts = [];
  if (devices.length) {
    parts.push(`${devices.length} ${plural(devices.length, ["устройство", "устройства", "устройств"])}`);
    parts.push(off ? `${off} не в сети` : "все в сети");
  }
  if (w.now && Number.isFinite(w.now.temp)) parts.push(`${signedTemp(w.now.temp)}°${w.now.text ? `, ${w.now.text}` : ""}`);
  if (!parts.length) return null;
  return <div className="nx-hd-status">{parts.join(" · ")}</div>;
}

/* Под строкой статуса: главная кнопка «Добавить устройство» и две квадратные — «Найти устройство»
   (одно устройство в сети — зовём его сразу, иначе выбор в быстрых действиях) и «Общий буфер» (его настройки) */
export function HomeActions({ devices, onAddDevice, onFind, onClip }) {
  const findable = devices.filter((d) => d.real && !d.isSelf && d.online);
  return (
    <div className="nx-hd-actions">
      <button type="button" className="nx-hd-add" onClick={onAddDevice}>
        {Icon.plus({ c: C.onAccent, s: 20 })} Добавить устройство
      </button>
      {onFind && (
        <button type="button" className="nx-hd-sq nx-glass" aria-label="Найти устройство" title="Найти устройство"
          onClick={() => (findable.length === 1 ? onFind(findable[0]) : openQuickPanel())}>
          {Icon.pin({ c: C.text, s: 22 })}
        </button>
      )}
      {onClip && (
        <button type="button" className="nx-hd-sq nx-glass" aria-label="Общий буфер обмена" title="Общий буфер обмена" onClick={onClip}>
          {Icon.copy({ c: C.text, s: 20 })}
        </button>
      )}
    </div>
  );
}

/* devices — уже с состоянием; art(d, высота) — значок устройства (deviceArt из Home.jsx);
   empty — что показать вместо списка (заготовка или «Устройств пока нет»);
   activity — события ленты (null — не вошли); extra — что добавить под ассистентом (обновление ПК) */
export function HomeDesktop({ devices, art, empty, activity, schedule, extra, onOpenDevice, onAllDevices, onActivity, onToday, onNotes, onAssistant }) {
  const list = devices.slice(0, HOME_DESK_MAX);
  return (
    <div className="nx-hd-grid">
      <div className="nx-hd-col">
        {/* data-nosnippet — поисковики не берут отсюда текст для описания сайта (тут личные устройства) */}
        <section className="nx-hd-card nx-glass nx-glass-subtle" aria-label="Мои устройства" data-nosnippet>
          <CardHead title="Мои устройства" onLink={onAllDevices}
            link={devices.length > 0 && (devices.length > HOME_DESK_MAX ? `Все устройства · ${devices.length}` : "Все устройства")} />
          {empty ? <div className="nx-hd-empty">{empty}</div> : (
            <div className="nx-hd-devs">
              {list.map((d) => <DeviceTile key={d.id} d={d} art={art} onOpen={onOpenDevice} />)}
            </div>
          )}
        </section>
        {activity && (
          <section className="nx-hd-card nx-glass nx-glass-subtle" aria-label="Активность" data-nosnippet>
            <CardHead title="Активность" link="Вся активность" onLink={onActivity} />
            {activity.length === 0
              ? <div className="nx-hd-note">Здесь появятся события ваших устройств: подключения, файлы, сообщения.</div>
              : <ActivityList items={activity} limit={3} />}
          </section>
        )}
      </div>
      <div className="nx-hd-col nx-hd-side">
        <WeatherCard schedule={schedule} onToday={onToday} onNotes={onNotes} />
        <button type="button" className="nx-hd-ai nx-glass nx-glass-prominent" onClick={onAssistant}>
          <span className="nx-hd-ai-ico" aria-hidden="true">{Icon.sparkle({ c: C.onFold, s: 20 })}</span>
          <span className="nx-hd-ai-text">
            <span className="nx-hd-h">AI-Ассистент</span>
            <span className="nx-hd-sub">Чем могу помочь?</span>
          </span>
          {Icon.chevron({ c: C.text, s: 18 })}
        </button>
        {extra}
      </div>
    </div>
  );
}
