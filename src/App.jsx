import { useState, useEffect, useRef } from "react";
// Подключаем свой логотип из папки assets
import logoSvg from "./assets/logo.svg";
import speralSvg from "./assets/speral.svg";

/* =========================================================================
   NEXA — демо-интерфейс экосистемы
   Файл состоит из пяти частей:
   1. Токены дизайна — цвета и шрифты (объект C)
   2. Иконки — все svg-иконки, которые используются в интерфейсе
   3. Складка (FoldHero) — фирменный визуал экосистемы
   4. Общие блоки — навигация, шапка, строки списков
   5. Экраны — Главная, Сегодня, Медиа, Файлы, Ассистент, Настройки
   6. App — корневой компонент, который переключает экраны
   ========================================================================= */

/* ---------- 1. ТОКЕНЫ ДИЗАЙНА ----------
   Меняешь цвет здесь — он поменяется сразу везде, где используется.
   Не нужно искать и менять hex-код в каждом месте по отдельности. */
const C = {
  bg: "#01090F",        // фон всего приложения
  panel: "#0E1016",      // фон панелей/кнопок в навигации
  border: "#1C1E26",     // основной цвет тонких границ.
  borderSoft: "#22242C", // граница чуть светлее, для мелких элементов
  text: "#FFFFFF",       // основной цвет текста
  muted: "#92A2AF",      // приглушённый текст (подписи, метаданные)
  mutedSoft: "#6B6B72",  // ещё более приглушённый текст (даты, футер)
  blue: "#4A6FFF",       // фирменный синий (локальное устройство)
  blueDark: "#1A2454",   // синий тёмный — для теневой стороны градиентов
  blueLight: "#7C97FF",  // синий светлый — для световой стороны градиентов
  mint: "#00FFDF",       // фирменный мятный (связь/облако)
  mintDark: "#0F3D38",   // мятный тёмный
  mintLight: "#7EF0E0",  // мятный светлый
  green: "#47DE8E",      // статус "онлайн"
  red: "#DE4747",        // статус "не в сети"
};

// Два шрифта: Space Grotesk для заголовков (класс ng-display),
// Inter для всего остального текста.
const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";

/* ---------- 2. ИКОНКИ ----------
   Каждая иконка — обычная svg-картинка, нарисованная прямо кодом.
   p.c — цвет обводки, p.s — размер в пикселях.
   Если захочешь заменить какую-то иконку на свою (например SVG из Figma),
   просто вставь свой <svg>...</svg> внутрь соответствующей стрелочной функции,
   сохранив те же параметры (c, s), либо см. инструкцию по импорту SVG-файла
   как картинки через <img src={...} />. */
const Icon = {
  home: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V20h2.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  list: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" strokeLinecap="round" />
    </svg>
  ),
  image: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-5 3 3 3-4 5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  folder: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" strokeLinejoin="round" />
    </svg>
  ),
  sparkle: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9 12 3.5Z" strokeLinejoin="round" />
    </svg>
  ),
  gear: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.13-1.35l2-1.55-2-3.46-2.37.96A7 7 0 0 0 14.35 5L14 2.5h-4L9.65 5a7 7 0 0 0-2.15 1.6l-2.37-.96-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .46.05.9.13 1.35l-2 1.55 2 3.46 2.37-.96c.62.66 1.35 1.2 2.15 1.6L9.65 21.5h4L14 19a7 7 0 0 0 2.15-1.6l2.37.96 2-3.46-2-1.55c.08-.45.13-.89.13-1.35Z" strokeLinejoin="round" />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M20 20l-4.8-4.8" strokeLinecap="round" />
    </svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5 19.5c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5" strokeLinecap="round" />
    </svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c || C.mutedSoft} strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  up: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c || "#07080C"} strokeWidth="2">
      <path d="M12 19V6M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  phone: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  ),
  laptop: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="10.5" rx="1.5" />
      <path d="M2.5 19h19" strokeLinecap="round" />
    </svg>
  ),
  watch: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 16v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
  buds: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M7 9v5.5a2.5 2.5 0 0 0 5 0V9" strokeLinecap="round" />
      <path d="M17 9v5.5a2.5 2.5 0 0 1-5 0V9" strokeLinecap="round" />
      <circle cx="9.5" cy="7" r="2.2" />
      <circle cx="14.5" cy="7" r="2.2" />
    </svg>
  ),
  tv: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" strokeLinecap="round" />
    </svg>
  ),
  calendar: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  ),
  pin: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  ),
  bell: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" strokeLinejoin="round" />
      <path d="M10 18.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  ),
  chat: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5v-7Z" strokeLinejoin="round" />
    </svg>
  ),
  megaphone: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M4 10v3.5l3-.6 8 3.3V7.3l-8 3.3-3-.6Z" strokeLinejoin="round" />
      <path d="M15 6v12" strokeLinecap="round" />
    </svg>
  ),
  logout: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke={p.c} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8v.01" strokeLinecap="round" />
    </svg>
  ),
  plus: (p) => (
  <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
  ),
  archive: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.6">
      <rect x="4" y="4.5" width="16" height="4" rx="1" />
      <path d="M5.5 8.5v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8M10 13h4" strokeLinecap="round" />
    </svg>
  ),
  dots: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke={p.c} strokeWidth="1.8">
      <circle cx="6" cy="12" r="1.2" fill={p.c} /><circle cx="12" cy="12" r="1.2" fill={p.c} /><circle cx="18" cy="12" r="1.2" fill={p.c} />
    </svg>
  ),
};

/* ---------- 3. СКЛАДКА — фирменный визуал (FoldHero) ----------
   Три треугольные грани (polygon), каждая со своим градиентом.
   Это векторная картинка (svg), а не растровое изображение, поэтому
   она чёткая на любом размере экрана.
   size — задаёт ширину картинки в пикселях, высота считается сама
   пропорционально (чтобы форма не искажалась). */
function FoldHero({ size = 340 }) {
  return (
    <img
      src={speralSvg}
      alt="SPERAL"
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

/* ---------- 4. ОБЩИЕ БЛОКИ ----------
   Эти компоненты используются на нескольких экранах сразу,
   поэтому вынесены отдельно, а не продублированы в каждом экране. */

// Список разделов бокового меню: id (внутреннее имя), label (подпись для title),
// icon (функция-иконка из объекта Icon выше).
// Чтобы поменять порядок разделов в навигации — просто поменяй порядок строк тут.
const NAV = [
  { id: "home", label: "Главная", icon: Icon.home },
  { id: "today", label: "Сегодня", icon: Icon.list },
  { id: "media", label: "Медиа", icon: Icon.image },
  { id: "files", label: "Файлы", icon: Icon.folder },
  { id: "assistant", label: "Ассистент", icon: Icon.sparkle },
  { id: "settings", label: "Настройки", icon: Icon.gear },
];

// Боковая навигация слева. active — id текущего активного раздела,
// onChange — функция, которая вызывается при клике (переключает экран).
function Sidebar({ active, onChange }) {
  return (
    <div style={{
      width: 78, minWidth: 78, background: C.bg, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0",
    }}>
      {NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onChange(item.id)}
            style={{
              width: 44, height: 44, borderRadius: 4, cursor: "pointer",
              // Активная иконка заливается мятным, неактивная — тёмным фоном панели
              background: isActive ? C.mint : C.panel,
              border: `1px solid ${isActive ? C.mint : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 140ms ease, border-color 140ms ease",
            }}
          >
            {item.icon({ c: isActive ? "#07080C" : C.text, s: 19 })}
          </button>
        );
      })}
    </div>
  );
}

// Верхняя строка справа (время/дата, поиск, профиль). children — то, что
// передаём внутрь при вызове компонента (см. использование в App).
function TopBar({ children }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, padding: "24px 40px 0" }}>
      {children}
    </div>
  );
}

function TimeDate() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
  <div style={{ textAlign: "right" }}>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: C.text,
      }}
    >
      {time}
    </div>

    <div
      style={{
        fontSize: 12,
        color: C.muted,
        textTransform: "capitalize",
      }}
    >
      {date}
    </div>
  </div>
  );
}

function IconBtn({ icon, s = 18 }) {
  return (
    <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon({ c: C.text, s })}
    </div>
  );
}

// Логотип NEXA — теперь это твоя картинка из Figma, а не рисунок кодом.
// height задаёт высоту (small — для футера), width: "auto" сам
// подбирает ширину по пропорциям, чтобы логотип не искажался.
function Logo({ small }) {
  return (
    <img
      src={logoSvg}
      alt="NEXA"
      style={{
        marginBottom: 20, marginRight: 20, height: small ? 28 : 36, width: "auto", display: "block"}}
    />
  );
}

// Универсальная строка списка (используется в карточке устройств,
// настройках, и т.д.): иконка слева, заголовок+подпись, что-то справа
// (например статус) и стрелка-шеврон.
function Row({ leftIcon, title, subtitle, right, accent }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 18px", borderBottom: `1px solid ${C.border}`, gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {leftIcon && (
          <div style={{
            width: 42, height: 42, borderRadius: 4, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {leftIcon}
          </div>
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        {accent !== false && Icon.chevron({})}
      </div>
    </div>
  );
}

// Маленький цветной кружок-индикатор статуса (онлайн/оффлайн).
function Dot({ color }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

/* ---------- 5. ЭКРАНЫ ---------- */

// ЭКРАН "ГЛАВНАЯ" — список устройств + складка + карточка ассистента
function ScreenHome({ onNavigate }) {
  const devices = [
    { icon: Icon.phone,  name: "Смартфон",  status: "Онлайн • 92%", online: true },
    { icon: Icon.laptop, name: "Ноутбук",   status: "Не в сети",    online: false },
    { icon: Icon.watch,  name: "Часы",      status: "Онлайн • 64%", online: true },
    { icon: Icon.buds,   name: "Наушники",  status: "Онлайн • 83%", online: true },
    { icon: Icon.tv,     name: "Телевизор", status: "Онлайн",       online: true },
  ];

  return (
    <div
      style={{
        padding: "8px 40px 40px",
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        gap: 40,
        // alignItems: "start" убран — колонки растягиваются по высоте друг друга
      }}
      className="ng-home-grid"
    >
      {/* ── Левая колонка: заголовок + устройства ──────────── */}
      <div>
        <div style={{
          fontSize: 25, letterSpacing: "0.2em",
          color: C.text, marginBottom: 14,
        }}>
          ВАША ЭКОСИСТЕМА
        </div>
        <div className="ng-display" style={{
          fontSize: 34, fontWeight: 600, lineHeight: 1,
        }}>
          Все устройства в одном месте
        </div>
        <div style={{
          fontSize: 14, color: C.muted, marginTop: 14, marginBottom: 30,
        }}>
          Синхронизировано. Работает. Рядом с вами
        </div>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 4 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "16px 18px",
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Устройства</span>
            <span style={{
              display: "flex", alignItems: "center",
              gap: 6, fontSize: 13, color: C.muted,
            }}>
              4 <Dot color={C.green} />
            </span>
          </div>
          {devices.map((d) => (
            <Row
              key={d.name}
              leftIcon={d.icon({ c: C.text, s: 19 })}
              title={d.name}
              subtitle={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>{d.status}</span>}
              right={<Dot color={d.online ? C.green : C.red} />}
            />
          ))}
        </div>
      </div>

      {/* ── Правая колонка: складка сверху, AI прижат к низу ─── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FoldHero size={340} />
        </div>

        <div
          onClick={() => onNavigate("assistant")}
          style={{
            marginTop: "auto",   // ← вот магия: прижимает карточку к низу
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: `linear-gradient(90deg, ${C.blueDark}55, ${C.mintDark}55)`,
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
              <div style={{ fontWeight: 500 }}>AI - Ассистент</div>
              <div style={{ fontSize: 12.5, color: C.muted }}>Чем могу помочь?</div>
            </div>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            border: `1px solid ${C.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.chevron({ c: C.text })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Карточка погоды (используется дважды на экране "Сегодня": на сегодня и на завтра).
// details — необязательный массив (ветер/влажность/давление), если не передать,
// строка с деталями просто не рисуется — так у карточки "на завтра" её и нет.
function WeatherCard({ date, temp, cond, feels, details }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: 20, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={C.text} strokeWidth="1.6"><polygon points="12,3 20,12 12,21 4,12" /></svg>
          Погода
        </div>
        <div style={{ fontSize: 11, color: C.mutedSoft }}>{date}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted, margin: "6px 0 18px" }}>
        {Icon.pin({ c: C.muted, s: 13 })} Казань
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Маленький фрагмент складки вместо иконки солнца/тучки —
            угол и цвет можно менять в зависимости от погоды */}
        <div style={{ position: "relative", width: 60, height: 60, display: "flex", alignItems: "center" }}>
          <svg viewBox="0 0 60 60" width="60" height="60" style={{ position: "absolute" }}>
            <defs>
              <linearGradient id={`wg-${temp}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.mintLight} /><stop offset="100%" stopColor={C.blueDark} />
              </linearGradient>
            </defs>
            <polygon points="12,50 20,8 48,20 40,55" fill={`url(#wg-${temp})`} opacity="0.85" />
          </svg>
        </div>
        <div className="ng-display" style={{ fontSize: 40, fontWeight: 600 }}>{temp}°</div>
        <div>
          <div style={{ fontWeight: 500 }}>{cond}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>Ощущается как {feels}°</div>
        </div>
      </div>
      {details && (
        <div style={{ display: "flex", gap: 26, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          {details.map((d) => (
            <div key={d.label}>
              <div style={{ fontSize: 11.5, color: C.mutedSoft }}>{d.label}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ЭКРАН "СЕГОДНЯ" — расписание (таймлайн) + погода
function ScreenToday() {
  const items = [
    { time: "09:30", title: "Лекция по проектированию" },
    { time: "11:00", title: "Встреча с куратором" },
    { time: "13:00", title: "Обед" },
    { time: "14:30", title: "Работа над дипломом" },
    { time: "17:00", title: "Тренировка" },
  ];
  return (
    <div style={{ padding: "8px 40px 40px" }}>
      <div className="ng-display" style={{ fontSize: 30, fontWeight: 600 }}>Сегодня</div>
      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, marginBottom: 30 }}>
        Ваши дела, расписание и погода — всё в одном месте.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 30 }} className="ng-today-grid">
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 500, marginBottom: 20 }}>
            {Icon.calendar({ c: C.text, s: 18 })} Расписание
          </div>
          {/* Вертикальная линия таймлайна рисуется одним абсолютно
              позиционированным div, точки — кружки поверх неё */}
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 1, background: C.border }} />
            {items.map((it) => (
              <div key={it.time} style={{ position: "relative", marginBottom: 18 }}>
                <span style={{ position: "absolute", left: -20, top: 5, width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.text}`, background: C.bg }} />
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>{it.time}</div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14.5 }}>{it.title}</span>
                  {Icon.chevron({})}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <WeatherCard date="11 сентября 2026" temp={18} cond="Ясно" feels={17}
            details={[{ label: "Ветер", value: "3 м/с" }, { label: "Влажность", value: "62%" }, { label: "Давление", value: "758 мм" }]} />
          <WeatherCard date="12 сентября 2026" temp={12} cond="Пасмурно" feels={10} />
          <button style={{
            width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
            padding: "12px 16px", color: C.text, fontSize: 14, display: "flex", justifyContent: "space-between",
            alignItems: "center", cursor: "pointer",
          }}>
            Прогноз на месяц {Icon.chevron({})}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Один сегмент диаграммы хранилища на экране "Медиа".
   ВАЖНО: форма вырезается через css clip-path прямо на самом div,
   а не отдельной svg-картинкой поверх текста — раньше подписи (название,
   объём, проценты) были нарисованы отдельным слоем поверх svg и на
   разной ширине окна съезжали относительно формы. Сейчас подпись лежит
   прямо внутри той же самой фигуры, поэтому она никогда не разъедется
   с формой, на каком бы экране это ни открыли. */
function StorageSegment({ label, val, pct, from, to, flex, first }) {
  return (
    <div style={{
      flex,
      marginLeft: first ? 0 : -18, // грани слегка наезжают друг на друга, без щели
      clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0% 100%)", // скошенная трапеция
      background: `linear-gradient(135deg, ${from}, ${to})`,
      padding: "14px 12px 14px 30px",
      minWidth: 92,
      color: "#07080C",
    }}>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 11.5, opacity: 0.85 }}>{val}</div>
      <div style={{ fontSize: 11.5, opacity: 0.7 }}>{pct}</div>
    </div>
  );
}

// ЭКРАН "МЕДИА И ФАЙЛЫ" — диаграмма хранилища + категории + недавние файлы
function ScreenMedia() {
  const segs = [
    { label: "Фото", val: "96gb", pct: "38%", from: C.blueLight, to: C.blue, flex: 2.2 },
    { label: "Видео", val: "68gb", pct: "27%", from: C.blue, to: C.blueDark, flex: 1.7 },
    { label: "Документы", val: "49gb", pct: "20%", from: C.blue, to: C.mintDark, flex: 1.3 },
    { label: "Музыка", val: "24gb", pct: "10%", from: C.mint, to: C.mintDark, flex: 0.9 },
    { label: "Другое", val: "10gb", pct: "5%", from: C.mintLight, to: C.mint, flex: 0.6 },
  ];
  const categories = ["Фото", "Видео", "Документы", "Музыка"];
  const recent = [
    { name: "IMG_4287.jpg", meta: "Фото · Сегодня 08:42 · 4.6 МБ" },
    { name: "IMG_4289.jpg", meta: "Фото · Сегодня 08:42 · 5.6 МБ" },
    { name: "IMG_4290.jpg", meta: "Фото · Сегодня 08:42 · 4.3 МБ" },
    { name: "IMG_4291.jpg", meta: "Фото · Сегодня 08:43 · 5.5 МБ" },
  ];
  return (
    <div style={{ padding: "8px 40px 40px" }}>
      <div className="ng-display" style={{ fontSize: 30, fontWeight: 600 }}>Медиа и файлы</div>
      <div style={{ fontSize: 13.5, color: C.muted, margin: "6px 0 24px" }}>
        Ваши фотографии, видео, документы и всё, что важно
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: 20, marginBottom: 30, display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>Хранилище</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>247 gb / 512 gb</div>
        </div>
        {/* Собираем диаграмму из массива segs — чтобы поменять пропорции
            или добавить категорию, меняй/добавляй объект в массиве выше */}
        <div style={{ display: "flex", flex: 1, height: 74 }}>
          {segs.map((s, i) => <StorageSegment key={s.label} {...s} first={i === 0} />)}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 500 }}>Категории</div>
        <div style={{ fontSize: 12.5, color: C.mutedSoft }}>Все файлы →</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 30 }} className="ng-cat-grid">
        {categories.map((cat, i) => (
          <div key={cat} style={{ border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: 90,
              clipPath: "polygon(0 100%, 30% 0, 100% 0, 100% 100%)",
              background: `linear-gradient(135deg, ${C.blueLight}, ${i > 1 ? C.mint : C.blue})`,
            }} />
            <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14 }}>{cat}</div>
                <div style={{ fontSize: 11.5, color: C.mutedSoft }}>файлов</div>
              </div>
              {Icon.chevron({})}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Недавние файлы</div>
      <div style={{ position: "relative", paddingLeft: 20 }}>
        <div style={{ position: "absolute", left: 4, top: 20, bottom: 20, width: 1, background: C.border }} />
        {recent.map((f) => (
          <div key={f.name} style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: -20, top: "50%", marginTop: -4, width: 8, height: 8, borderRadius: "50%", border: `2px solid ${C.text}`, background: C.bg }} />
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 32, borderRadius: 3, background: "#2A2C34" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 2 }}>{f.meta}</div>
              </div>
              {Icon.chevron({})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ЭКРАН "ФАЙЛЫ" — путь навигации (хлебные крошки) + список файлов
function ScreenFiles() {
  const crumbs = ["Назад", "Пользователи", "Диск (C:)", "Документы", "Видео"];
  const items = Array.from({ length: 6 }).map((_, i) => ({
    name: `IMG_42${87 + i}.jpg`, meta: `Фото · Сегодня 08:4${i} · 4.${i} МБ`,
  }));
  return (
    <div style={{ padding: "8px 40px 40px" }}>
      <div className="ng-display" style={{ fontSize: 30, fontWeight: 600 }}>Файлы</div>
      <div style={{ fontSize: 13.5, color: C.muted, margin: "6px 0 24px" }}>
        Ваши файлы, документы и медиа — всегда под рукой
      </div>
      {/* Путь навигации — просто ряд кнопок-чипсов, последняя (текущая
          папка) подсвечена градиентом */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, overflowX: "auto" }}>
        {crumbs.map((c, i) => (
          <div key={c} style={{
            padding: "9px 16px", fontSize: 13, whiteSpace: "nowrap",
            background: i === crumbs.length - 1 ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
            color: i === crumbs.length - 1 ? "#07080C" : C.text,
            border: `1px solid ${i === crumbs.length - 1 ? "transparent" : C.border}`,
            clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0% 100%)",
          }}>
            {c}
          </div>
        ))}
      </div>
      <div>
        {items.map((f) => (
          <div key={f.name} style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 4px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 32, borderRadius: 3, background: "#2A2C34" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{f.name}</div>
              <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 2 }}>{f.meta}</div>
            </div>
            {Icon.chevron({})}
          </div>
        ))}
      </div>
    </div>
  );
}

// ЭКРАН "АССИСТЕНТ" — поле ввода по центру + правая панель (новый диалог/поиск/...)
function ScreenAssistant() {
  const greetings = [
  "Что сегодня в повестке дня?",
  "Чем могу помочь сегодня?",
  "С чего начнём?",
  "Задайте любой вопрос — я готов помочь",
  "Что нового хотите узнать?",
  "О чём поговорим?",
  "Как дела? Расскажите, что нужно",
  "Готов помочь — с чего начнём?",
  "Есть вопросы? Я слушаю",
  "Что вас интересует сегодня?",
];
const [greeting, setGreeting] = useState(
  () => greetings[Math.floor(Math.random() * greetings.length)]
);
 useEffect(() => {
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem('nexa-chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('nexa-chats', JSON.stringify(chats)); } catch {}
  }, [chats]);

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isLoading]);

  const newChat = () => { setCurrentChatId(null); setInput(''); };
  const openChat = (id) => { setCurrentChatId(id); setInput(''); };
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === currentChatId) setCurrentChatId(null);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { role: 'user', text };
    let chatId = currentChatId;

    if (!chatId) {
      chatId = Date.now().toString();
      setChats(prev => [{
        id: chatId,
        title: text.length > 40 ? text.slice(0, 40) + '…' : text,
        messages: [userMsg],
        createdAt: Date.now(),
      }, ...prev]);
      setCurrentChatId(chatId);
    } else {
      setChats(prev => prev.map(c =>
        c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c
      ));
    }

    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const aiMsg = data.text
        ? { role: 'ai', text: data.text }
        : { role: 'ai', text: 'Не удалось получить ответ.' };
      setChats(prev => prev.map(c =>
        c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c
      ));
    } catch {
      setChats(prev => prev.map(c =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, { role: 'ai', text: 'Ошибка соединения с сервером.' }] }
          : c
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const rightItems = [
    { label: "Новый диалог", icon: Icon.plus, onClick: newChat },
    { label: "Поиск", icon: Icon.search },
    {
      label: "История",
      icon: Icon.list,
      onClick: () => setIsHistoryOpen(v => !v),
      active: isHistoryOpen,
    },
  ];

  const isEmpty = messages.length === 0 && !isLoading;

 const titleOnly = (
  <div style={{ textAlign: "left" }}>
    <div className="ng-display" style={{ fontSize: 40, fontWeight: 600, textAlign: "left" }}>
      AI - Ассистент
    </div>
    <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, textAlign: "left" }}>
      Интеллектуальный центр системы NEXA
    </div>
  </div>
);

const menuBlock = (
  <div style={{
    position: "fixed",
    top: 66,
    right: 40,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    alignItems: "flex-end",
  }}>
    {rightItems.map((it) => (
      <div
        key={it.label}
        onClick={it.onClick}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 14,
          cursor: it.onClick ? "pointer" : "default",
        }}
      >
        {it.label}
        <div style={{
          width: 30, height: 30, borderRadius: 4,
          border: `1px solid ${it.active ? C.mint : C.border}`,
          background: it.active ? C.mintDark : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 140ms ease, background 140ms ease",
        }}>
          {it.icon({ c: it.active ? C.mint : C.text, s: 15 })}
        </div>
      </div>
    ))}
  </div>
);

  const inputRow = (
    <div style={{
      width: "100%", maxWidth: 820, padding: 1.5, borderRadius: 999,
      background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`,
      boxShadow: `0 0 24px ${C.blue}33, 0 0 40px ${C.mint}22`,
    }}>
      <div style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 10px 10px 22px", borderRadius: 999,
        background: C.bg, boxSizing: "border-box",
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Написать сообщение..."
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14 }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: (isLoading || !input.trim()) ? "#2A2C34" : C.mint,
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: (isLoading || !input.trim()) ? "default" : "pointer",
            transition: "background 140ms ease",
          }}
        >
          {Icon.up({ c: (isLoading || !input.trim()) ? C.muted : "#07080C", s: 16 })}
        </button>
      </div>
    </div>
  );

  const disclaimer = (
    <div style={{ fontSize: 12, color: C.mutedSoft, textAlign: "center", whiteSpace: "nowrap" }}>
      Искусственный интеллект может допускать ошибки. Пожалуйста, перепроверяйте ответы.
    </div>
  );

  // ─── ПАНЕЛЬ ИСТОРИИ (справа) ─────────────────────────────
  const historyPanel = (
    <div
      style={{
        width: isHistoryOpen ? 240 : 0,
        marginLeft: isHistoryOpen ? 24 : 0,
        flexShrink: 0,
        overflow: "hidden",
        opacity: isHistoryOpen ? 1 : 0,
        transition:
          "width 320ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "margin-left 320ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "opacity 220ms ease",
      }}
    >
      <div
        className="nx-scroll"
        style={{
          width: 240,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderLeft: `1px solid ${C.border}`,
          paddingLeft: 20,
          paddingRight: 4,
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <div style={{
          fontSize: 11, letterSpacing: "0.15em", color: C.mutedSoft,
          textTransform: "uppercase", paddingLeft: 4, marginBottom: 4,
        }}>
          История
        </div>

        {chats.length === 0 ? (
          <div style={{ fontSize: 13, color: C.mutedSoft, padding: "4px", lineHeight: 1.5 }}>
            Здесь появятся ваши диалоги
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => openChat(chat.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: chat.id === currentChatId ? C.panel : "transparent",
                  border: `1px solid ${chat.id === currentChatId ? C.border : "transparent"}`,
                  transition: "background 140ms ease",
                }}
              >
                <div style={{
                  flex: 1, minWidth: 0, fontSize: 13.5, color: C.text,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {chat.title}
                </div>
                <button
                  onClick={(e) => deleteChat(chat.id, e)}
                  title="Удалить"
                  style={{
                    background: "transparent", border: "none",
                    color: C.mutedSoft, cursor: "pointer",
                    fontSize: 16, padding: 2, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const wrapperStyle = {
    position: "fixed",
    top: 0, left: 78, right: 0, bottom: 0,
    background: C.bg, zIndex: 5, overflow: "hidden",
    display: "flex", flexDirection: "column",
  };

  const innerStyle = {
  flex: 1, display: "flex", flexDirection: "row",
  width: "100%", maxWidth: 1440, margin: "0 auto",
  padding: "66px 40px 20px 40px",
  boxSizing: "border-box", minHeight: 0,
};
  return (
  <div style={wrapperStyle}>
    {menuBlock}

    <div style={innerStyle}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0,
      }}>
        {titleOnly}

        {isEmpty ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 24,
            paddingBottom: 120,
          }}>
            <div className="ng-display" style={{ fontSize: 22 }}>{greeting}</div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              {inputRow}
            </div>
            {disclaimer}
          </div>
        ) : (
          <>
            <div
              className="nx-scroll"
              style={{ flex: 1, overflowY: "auto", marginTop: 24, marginBottom: 16, minHeight: 0 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 10 }}>
                {messages.map((m, i) => (
                  <MessageBubble key={i} role={m.role} text={m.text} />
                ))}
                {isLoading && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            </div>

            <div style={{
              flexShrink: 0, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 10,
            }}>
              {inputRow}
              {disclaimer}
            </div>
          </>
        )}
      </div>

      {historyPanel}
    </div>
  </div>
);
}

// Мини-парсер выделений: **жирный**, *курсив*, `код`.
function renderRich(text) {
  if (typeof text !== 'string') return text;
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Обычный текст до совпадения
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: "#FFFFFF" }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} style={{
          fontFamily: "'Space Grotesk', monospace",
          background: "rgba(0, 255, 223, 0.1)",
          border: "1px solid rgba(0, 255, 223, 0.25)",
          borderRadius: 6,
          padding: "1px 6px",
          fontSize: "0.92em",
          color: C.mint,
        }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++} style={{ fontStyle: "italic", color: "#D9E4EC" }}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Обёртка — просто вызывает парсер и вставляет результат.
function RichText({ children }) {
  return <>{renderRich(children)}</>;
}

// ─── ПУЗЫРЬ СООБЩЕНИЯ ─────────────────────────────────────
function MessageBubble({ role, text }) {
  const isUser = role === 'user';

  // ─── ТВОИ СООБЩЕНИЯ ────────────────────────────────────
  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <div style={{
          maxWidth: "72%",
          padding: "12px 18px",
          borderRadius: 16,
          borderTopRightRadius: 4,
          background: C.blue,
          color: "#FFFFFF",
          fontSize: 14.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textAlign: "left",
        }}>
          <RichText>{text}</RichText>
        </div>
      </div>
    );
  }

  // ─── ОТВЕТЫ AI ─────────────────────────────────────────
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", width: "100%", gap: 12 }}>
      {/* Аватарка с иконкой-искрой */}
      <div style={{
        flexShrink: 0,
        width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.blueDark}, ${C.mintDark})`,
        border: `1px solid ${C.mint}44`,
        boxShadow: `0 0 16px ${C.mint}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 4,
      }}>
        {Icon.sparkle({ c: C.mint, s: 18 })}
      </div>

      {/* Пузырь с ответом */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "72%" }}>
        {/* Подпись "NEXA AI" над пузырём */}
        <div style={{
          fontSize: 11.5,
          letterSpacing: "0.12em",
          color: C.mint,
          opacity: 0.85,
          paddingLeft: 4,
          textTransform: "uppercase",
          fontWeight: 500,
        }}>
          NEXA AI
        </div>

        {/* Сам пузырь */}
        <div style={{
          padding: "14px 18px",
          borderRadius: 16,
          borderTopLeftRadius: 4,
          background: `linear-gradient(135deg, ${C.panel} 0%, #12141B 100%)`,
          border: `1px solid ${C.border}`,
          color: "#EAF2F7",
          fontSize: 14.5,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textAlign: "left",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Тонкая цветная полоска слева внутри пузыря */}
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: 3,
            background: `linear-gradient(180deg, ${C.blue}, ${C.mint})`,
            opacity: 0.85,
          }} />
          <div style={{ paddingLeft: 8 }}>
            <RichText>{text}</RichText>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ИНДИКАТОР «ПЕЧАТАЕТ…» ──────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", width: "100%" }}>
      <div style={{
        padding: "12px 16px", borderRadius: 16, borderTopLeftRadius: 4,
        background: C.panel, border: `1px solid ${C.border}`,
        display: "flex", gap: 6, alignItems: "center",
      }}>
        <span style={{ fontSize: 13, color: C.muted, marginRight: 4 }}>Печатает</span>
        <DotPulse delay="0s" />
        <DotPulse delay="0.2s" />
        <DotPulse delay="0.4s" />
      </div>
    </div>
  );
}

function DotPulse({ delay }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%", background: C.muted,
      display: "inline-block",
      animation: `nx-pulse 1.2s ${delay} infinite ease-in-out`,
    }} />
  );
}
// Переключатель вкл/выкл.
// on — включён сейчас или нет (true/false)
// onClick — функция, которая сработает при клике
function Toggle({ on, onClick }) {
  return (
    <div
      onClick={onClick}          // при клике вызываем переданную функцию
      style={{
        width: 42, height: 24, borderRadius: 999, padding: 3, boxSizing: "border-box",
        // включён — градиент, выключен — серый фон
        background: on ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "#2A2C34",
        // кружок уезжает вправо, если включён, и влево, если выключен
        display: "flex", justifyContent: on ? "flex-end" : "flex-start",
        cursor: "pointer",       // курсор-рука при наведении
        transition: "background 160ms ease",
      }}
    >
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
    </div>
  );
}
function SectionTitle({ children }) {
  return (
    <div
      className="ng-display"
      style={{
        fontSize: 26,
        fontWeight: 600,
        color: C.text,
        marginBottom: 14,
        marginTop: 0,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}
// ЭКРАН "НАСТРОЙКИ" — профиль, тема, уведомления, аккаунт
function ScreenSettings() {
  // Список уведомлений теперь хранится в состоянии (useState),
// а не в обычной константе, потому что он должен меняться при кликах.
const [notifs, setNotifs] = useState([
  { icon: Icon.bell, label: "Уведомления о событиях", on: true },
  { icon: Icon.chat, label: "Сообщения и комментарии", on: true },
  { icon: Icon.megaphone, label: "Рекомендации и новости", on: false },
]);

// Функция переключения: принимает номер строки (index)
// и меняет у неё on на противоположное (true → false, false → true).
const toggleNotif = (index) => {
  setNotifs(notifs.map((n, i) =>
    i === index ? { ...n, on: !n.on } : n   // нужную строку меняем, остальные оставляем как есть
  ));
};
  // useState хранит, какая тема выбрана сейчас — "light" или "dark".
  // setTheme меняет это значение при клике на одну из кнопок ниже.
  const [theme, setTheme] = useState("dark");
  return (
    <div style={{ padding: "8px 40px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div className="ng-display" style={{ fontSize: 40, fontWeight: 600 }}>Настройки</div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 999,
          padding: "8px 16px", width: 220,
        }}>
          {Icon.search({ c: C.mutedSoft, s: 15 })}
          <span style={{ fontSize: 13, color: C.mutedSoft }}>Поиск</span>
        </div>
      </div>

      <SectionTitle>Профиль</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#2A2C34", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.user({ c: C.muted, s: 20 })}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", fontSize: 19.33 }}>Пользователь</div>
            <div style={{ display: "flex", fontSize: 12.65, color: C.mutedSoft }}>user@example.com</div>
            <div style={{ fontSize: 12.65, color: C.green, display: "flex", alignItems: "center", gap: 5 }}>
              <Dot color={C.green} /> Активный аккаунт
            </div>
          </div>
          {Icon.chevron({})}
        </div>
      </div>

      <SectionTitle>Внешний вид</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 26, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Иконка слева от "Тема оформления" — маленькая складка,
              которая меняет цвет вместе с выбранной темой (theme) */}
          <div style={{ width: 36, height: 36, borderRadius: 4, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <polygon points="4,14 12,4 12,20 7,22" fill={theme === "dark" ? C.blue : C.mint} />
            </svg>
          </div>
          <span style={{display: "flex", alignItems: "left", fontSize: 21.66 }}>Тема оформления</span>
        </div>
        {/* Сегментированный переключатель: клик по кнопке меняет theme
            через setTheme, а активная кнопка подсвечивается градиентом */}
        <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
          <button onClick={() => setTheme("light")} style={{
            padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer",
            background: theme === "light" ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
            color: theme === "light" ? "#07080C" : C.muted,
          }}>Светлая</button>
          <button onClick={() => setTheme("dark")} style={{
            padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer",
            background: theme === "dark" ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
            color: theme === "dark" ? "#07080C" : C.muted,
          }}>Тёмная</button>
        </div>
      </div>

      <SectionTitle>Уведомления</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 26 }}>
        {notifs.map((n, i) => (
          <div key={n.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px",
            borderBottom: i < notifs.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {n.icon({ c: C.muted, s: 18 })}
              <span style={{ fontSize: 14 }}>{n.label}</span>
            </div>
            <Toggle on={n.on} onClick={() => toggleNotif(i)} />
          </div>
        ))}
      </div>

     <SectionTitle>Об аккаунте</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 4 }}>
        <Row leftIcon={Icon.logout({ c: C.text, s: 18 })} title="Выйти из аккаунта" />
        <Row leftIcon={Icon.info({ c: C.text, s: 18 })} title="О системе" />
      </div>
    </div>
  );
}

/* ---------- 6. APP — корневой компонент ----------
   tab хранит id текущего открытого раздела (по умолчанию "home").
   setTab меняется при клике по иконке в Sidebar — от этого зависит,
   какой из шести экранов показывается ниже. */
export default function NexaApp() {
  const [tab, setTab] = useState("home");
  useEffect(() => {
  document.body.style.overflow = tab === "assistant" ? "hidden" : "";
  return () => { document.body.style.overflow = ""; };
}, [tab]);

  return (
    <div style={{
      display: "flex",
      // ВАЖНО про размер на весь экран: "100vh" — это ровно высота окна
      // браузера. Если у тебя всё равно остаются пустые поля по краям,
      // скорее всего дело не в этом файле, а в стандартных стилях Vite
      // (файл src/index.css), которые по умолчанию центрируют и обрезают
      // содержимое страницы — см. пояснение в чате, как это убрать.
      minHeight: "100vh", width: "100%",
      background: C.bg, color: C.text,
      fontFamily: fontBody,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        .ng-display { font-family: 'Space Grotesk', sans-serif; }
        input::placeholder { color: ${C.mutedSoft}; }

        /* Сбрасываем стандартные отступы/центрирование, которые Vite
           добавляет по умолчанию в html/body/#root — без этого сброса
           приложение могло показываться маленькой карточкой посреди
           экрана, а не занимать окно браузера целиком. */
        html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
        body { display: block !important; place-items: unset !important; }

        /* На узких окнах (меньше 960px) двухколоночные сетки экранов
           "Главная" и "Сегодня" сами схлопываются в один столбец,
           а категории на "Медиа" — в два столбца вместо четырёх. */
        @media (max-width: 960px) {
          .ng-home-grid { grid-template-columns: 1fr !important; }
          .ng-today-grid { grid-template-columns: 1fr !important; }
          .ng-cat-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
           @keyframes nx-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
          /* ─── Фирменный скроллбар NEXA ───────────────────────── */
  .nx-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 255, 223, 0.35) transparent;
  }
  .nx-scroll::-webkit-scrollbar {
    width: 8px;
  }
  .nx-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .nx-scroll::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(74, 111, 255, 0.5), rgba(0, 255, 223, 0.5));
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .nx-scroll::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(74, 111, 255, 0.85), rgba(0, 255, 223, 0.85));
    background-clip: padding-box;
  }
      `}</style>

      <Sidebar active={tab} onChange={setTab} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* На экране "Ассистент" своя правая панель вместо обычной
            строки времени/поиска/профиля, поэтому TopBar тут не рисуем */}
        {tab !== "assistant" && (
          <TopBar>
            {tab === "settings" ? null : <TimeDate />}
            <IconBtn icon={Icon.search} />
            <IconBtn icon={Icon.user} />
          </TopBar>
        )}

        {/* maxWidth 1440 — контент не растягивается до бесконечности на
            очень широких мониторах, но при этом свободно заполняет
            обычное окно браузера */}
        <div style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto" }}>
          {tab === "home" && <ScreenHome onNavigate={setTab} />}
          {tab === "today" && <ScreenToday />}
          {tab === "media" && <ScreenMedia />}
          {tab === "files" && <ScreenFiles />}
          {tab === "assistant" && <ScreenAssistant />}
          {tab === "settings" && <ScreenSettings />}
        </div>
        {/* Нижняя строка: слева логотип, справа ссылка "Подробнее о системе".
    justifyContent: "space-between" разводит их по разным краям строки. */}
  {tab !== "assistant" && (
  <div style={{
    padding: "0 40px 30px", width: "100%", maxWidth: 1440, margin: "0 auto",
    boxSizing: "border-box",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  }}>
    <Logo small />
    {tab === "home" && (
      <div style={{ fontSize: 13, color: C.mutedSoft }}>
        Подробнее о системе →
      </div>
    )}
  </div>
)}
</div>
     </div>
  );
}
