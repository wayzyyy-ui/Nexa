// Базовые элементы интерфейса NEXA: кнопки, логотип, переключатель, заголовки, пустые состояния, QR, строки настроек
import QRCode from "qrcode";
import { C, T, fontDisplay } from "./theme.js";
import { Icon } from "./icons.jsx";
import { LOGO_MARK_D, WORD_RECTS, WORD_PATHS, MONO_PATHS, MONO_RECTS, MONO_DOT } from "./brandArt.js";

// onClick необязательный: если передан, кнопка становится нажимаемой.
export function IconBtn({ icon, s = 18, onClick, label, className }) {
  // Без onClick — просто значок. С onClick — настоящая кнопка: до неё можно
  // дойти клавишей Tab и нажать Enter / пробелом
  if (!onClick) return (
    <div aria-hidden="true" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon({ c: C.text, s })}
    </div>
  );
  return (
    <button type="button" className={`nx-icon-btn${className ? " " + className : ""}`} onClick={onClick} aria-label={label} title={label}
      style={{ ...btnReset, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon({ c: C.text, s })}
    </button>
  );
}

// Знак NEXA — грани складки линиями (макет, Logo-mini.svg). Цвет — как у текста
export function LogoMark({ s = 30, color }) {
  return (
    <svg viewBox="0 0 46 45" width={s} height={(s * 45) / 46} fill="none" aria-hidden="true" style={{ display: "block", flexShrink: 0, color: color || C.logo }}>
      <path d={LOGO_MARK_D}
        stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Логотип NEXA. Это тот же SVG из Figma (assets/logo.svg), только вставлен
// прямо в код. Все фигуры залиты fill="currentColor" и берут цвет C.logo:
// в тёмной теме логотип белый, в светлой — фирменный синий. Отдельный чёрный
// файл не нужен, иначе в тёмной теме он пропал бы на фоне.
// bare — без внешних отступов (в шапке мобильной Главной рядом со знаком)
export function Logo({ small, bare, h: height, color }) {
  const h = height || (bare ? 20 : small ? 28 : 36);
  return (
    <svg
      viewBox="0 0 149 25" height={h} width={(h * 149) / 25}
      fill="currentColor" role="img" aria-label="NEXA"
      style={{ color: color || C.logo, marginBottom: bare ? 0 : 20, marginRight: bare ? 0 : 20, display: "block" }}
    >
      {WORD_RECTS.map((r, i) => <rect key={i} {...r} />)}
      {WORD_PATHS.map((p, i) => <path key={i} d={p.d} {...(p.evenodd ? { fillRule: "evenodd", clipRule: "evenodd" } : {})} />)}
    </svg>
  );
}

// Универсальная строка списка (используется в карточке устройств,
// настройках, и т.д.): иконка слева, заголовок+подпись, что-то справа
// (например статус) и стрелка-шеврон.
export function Row({ leftIcon, title, subtitle, right, accent }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 18px", borderBottom: `1px solid ${C.border}`, gap: 14,
    }}>
      {/* Левая часть: иконка + текст — занимает всё свободное место */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        {leftIcon && (
          <div style={{
            width: 42, height: 42, borderRadius: 10, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {leftIcon}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, textAlign: "left", lineHeight: 1.2 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 3, textAlign: "left", lineHeight: 1.3 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Правая часть: индикатор + стрелка — фиксированной ширины */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {right}
        {accent !== false && <span className="nx-chev">{Icon.chevron({})}</span>}
      </div>
    </div>
  );
}

// Маленький цветной кружок-индикатор статуса (онлайн/оффлайн).
export function Dot({ color }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

/* Заголовок раздела на Главной — как «Мои устройства»: маленькая надпись
   сверху (eyebrow), крупный заголовок и что-то справа (статус, счётчик) */
export function SectionHead({ eyebrow, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.mutedSoft, marginBottom: 6 }}>{eyebrow}</div>}
        <div className="ng-display" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

// Скошенный ярлык — как чипсы пути в «Файлах» (складка)
export const SkewTag = ({ children, active = true, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: 1, whiteSpace: "nowrap",
    padding: "5px 13px 5px 12px", color: C.onFold,
    clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)",
    background: active
      ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`
      : `linear-gradient(90deg, ${C.foldDeep}, color-mix(in srgb, ${C.foldBlue} 70%, ${C.foldDeep}))`,
    ...style,
  }}>{children}</span>
);

// Маленькая контурная складка — для пустых состояний и приглашений
export const OutlineFold = ({ s = 44 }) => (
  <svg viewBox="0 0 44 32" width={s} height={s * 32 / 44} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <polygon points="2,26 14,3 28,8 18,30" style={{ stroke: C.borderStrong }} strokeWidth="1" />
    <polygon points="18,30 28,8 42,14 34,29" style={{ stroke: C.mint }} strokeWidth="1" opacity="0.7" />
  </svg>
);

// Сброс стандартного вида кнопки: убираем рамку, фон и системный шрифт,
// чтобы кнопка выглядела как обычный блок, но нажималась и с клавиатуры
export const btnReset = {
  background: "none", border: "none", padding: 0, margin: 0,
  font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer",
};

/* Заливка складки: основной градиент + тёмная грань с резким краем.
   Резкий край (две точки на одном проценте) и даёт ощущение сгиба стекла. */
export const foldFill = (c) =>
  `linear-gradient(${c.facet}, transparent 56%, color-mix(in srgb, ${C.foldDeep} 45%, transparent) 56%), ` +
  `linear-gradient(135deg, ${c.from}, ${c.to})`;

// Индикатор загрузки: контур квадрата, по которому бежит мятная грань
export function Spinner({ s = 14, c = C.mint }) {
  return (
    <svg className="nx-spin" viewBox="0 0 16 16" width={s} height={s} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" />
      <path d="M2 8V3a1 1 0 0 1 1-1h5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Кнопка с состоянием.
   state: "idle" (обычная) | "loading" (идёт действие) | "success" | "error".
   variant: "primary" — главная, с градиентом; "ghost" — с рамкой.
   Подписи для каждого состояния передаются отдельно; если не переданы,
   остаётся основная подпись (children). */
export function StateButton({ state = "idle", variant = "ghost", icon, children, labels = {}, onClick, disabled, style }) {
  const primary = variant === "primary" && (state === "idle" || state === "loading");
  const base = {
    ...btnReset, borderRadius: T.r.pill, padding: "10px 16px", fontSize: T.fs.sub, minHeight: 40,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    border: `1px solid ${C.borderStrong}`,
  };
  // Цвет рамки и текста по состоянию
  const look =
    state === "success" ? { borderColor: C.green, color: C.green } :
    state === "error"   ? { borderColor: C.red, color: C.red } :
    primary ? {
      border: "1px solid transparent", color: C.onFold, fontWeight: 500,
      background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
    } : {};
  const mark =
    state === "loading" ? <Spinner c={primary ? C.onFold : C.mint} /> :
    state === "success" ? Icon.check({ c: C.green, s: 16 }) :
    state === "error"   ? Icon.alert({ c: C.red, s: 16 }) :
    icon;
  return (
    <button
      type="button"
      // nx-shake: при переходе в ошибку кнопка один раз вздрагивает
      className={`${primary ? "nx-primary" : "nx-ghost-btn"}${state === "error" ? " nx-shake" : ""}`}
      onClick={onClick}
      disabled={disabled || state === "loading"}
      aria-busy={state === "loading"}
      style={{ ...base, ...look, ...style }}
    >
      {mark}
      <span>{labels[state] || children}</span>
    </button>
  );
}

// Короткое сообщение о результате внутри панели: ошибка или успех
export function StateNote({ kind = "error", children }) {
  const color = kind === "error" ? C.red : C.green;
  return (
    <div role={kind === "error" ? "alert" : "status"} className="nx-pop" style={{
      display: "flex", alignItems: "flex-start", gap: T.sp[3] - 2, padding: `${T.sp[3] - 2}px ${T.sp[3]}px`,
      border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, borderRadius: T.r.sm,
      background: `color-mix(in srgb, ${color} 8%, transparent)`, fontSize: T.fs.sub, lineHeight: 1.45,
    }}>
      <span style={{ display: "flex", marginTop: 1 }}>
        {(kind === "error" ? Icon.alert : Icon.check)({ c: color, s: 16 })}
      </span>
      <div>{children}</div>
    </div>
  );
}

/* Подпись студии внизу страницы («О системе»): обычный текст в потоке страницы, не плавающий.
   «Сделано» — мелко и приглушённо, дальше логотип mono.engineering — вектор автора (моно.svg) как есть:
   знак и слово — цветом текста темы (в файле белые), точка — мятная (в файле #00FFDF) */
// Фигуры — src/ui/brandArt.js (те же берёт заставка запуска)
export function MonoLogo({ h = 13, color = C.muted }) {
  return (
    <svg viewBox="0 0 911 77" height={h} width={Math.round((h * 911) / 77)} role="img" aria-label="mono.engineering" style={{ display: "block", flexShrink: 0 }}>
      <g fill={color}>
        {MONO_PATHS.map((d, i) => <path key={i} d={d} />)}
        {MONO_RECTS.map((r, i) => <rect key={i} {...r} />)}
      </g>
      <circle {...MONO_DOT} fill={C.mint} />
    </svg>
  );
}
export function MadeBy({ style, h = 13 }) {
  return (
    <div className="nx-made-by" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 9, fontSize: 12, lineHeight: 1, color: C.mutedSoft, ...style }}>
      <span>Сделано</span>
      <MonoLogo h={h} />
    </div>
  );
}

export function EmptyState({ title, text, action, compact }) {
  return (
    <div className="nx-pop" style={{
      padding: compact ? "26px 18px" : "48px 16px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    }}>
      {/* Пустая складка: только контур и линия сгиба */}
      <svg viewBox="0 0 64 44" width={compact ? 52 : 64} height={compact ? 36 : 44} fill="none" aria-hidden="true" style={{ marginBottom: 6 }}>
        <path d="M10 4 62 1 54 41 2 43Z" stroke={C.borderStrong} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M62 1 34 22 54 41" stroke={C.borderStrong} strokeWidth="1.4" strokeDasharray="3 3" strokeLinejoin="round" />
      </svg>
      <div style={{ fontSize: T.fs.row, fontWeight: 500 }}>{title}</div>
      {text && <div style={{ fontSize: T.fs.sub, color: C.muted, maxWidth: 320, lineHeight: 1.5 }}>{text}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

// Одна серая полоска внутри скелетона.
// Пульсирует только прозрачностью — минимум движения.
export function SkeletonLine({ width }) {
  return (
    <div style={{
      height: 12,
      width,
      borderRadius: 10,
      background: C.chip,
      animation: "nx-skeleton-pulse 1.4s ease-in-out infinite",
    }} />
  );
}

// Переключатель вкл/выкл.
// on — включён сейчас или нет (true/false)
// onClick — функция, которая сработает при клике
export function Toggle({ on, onClick, label, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}          // при клике вызываем переданную функцию
      role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className="nx-toggle"
      style={{
        border: "none", opacity: disabled ? 0.45 : 1,
        width: 42, height: 24, borderRadius: 999, padding: 3, boxSizing: "border-box",
        // включён: градиент, выключен: нейтральный фон
        background: on ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : C.chip,
        cursor: "pointer", flexShrink: 0,
        transition: "background 200ms ease",
      }}
    >
      {/* Кружок сдвигается на 18px вправо, когда переключатель включён */}
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: C.onFold,
        transform: on ? "translateX(18px)" : "translateX(0)",
        // Пружинистая кривая: кружок чуть проскакивает и встаёт на место
        transition: "transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }} />
    </button>
  );
}

export function SectionTitle({ children }) {
  return (
    <div
      className="ng-display nx-section-title"
      style={{
        fontSize: T.fs.section,
        fontWeight: 600,
        color: C.text,
        marginBottom: T.sp[3],
        marginTop: 0,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}
// Одна строка настроек. Все строки экрана собраны из неё, поэтому у них
// одинаковые отступы, размер иконки и шрифты.
// icon: иконка слева (в квадрате 40x40), title и subtitle: текст,
// right: что стоит справа (переключатель, стрелка), wrap: на телефоне
// правая часть переносится под текст на всю ширину.
/* ═══ УСТАНОВКА ПРИЛОЖЕНИЯ ═══════════════════════════════════
   Телефон с Android — кнопка «Скачать приложение» (файл /nexa.apk),
   iPhone/iPad — как добавить сайт на экран «Домой»,
   компьютер — QR-код, чтобы открыть сайт на телефоне.
   Внутри приложения и в уже установленной версии ничего не показываем */

// QR-код: свой рисунок из клеток. Светлая подложка нужна всегда —
// камеры телефонов плохо читают «перевёрнутый» светлый код на тёмном
export function QrCode({ text, size = 120, radius = 10, label = "QR-код: адрес сайта NEXA" }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, d = qr.modules.data, pad = 2;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x + pad} ${y + pad}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + pad * 2} ${n + pad * 2}`} width={size} height={size} role="img" aria-label={label} data-no-swipe
      shapeRendering="crispEdges" style={{ display: "block", borderRadius: radius }}>
      <rect width="100%" height="100%" style={{ fill: C.onFold }} />
      <path d={path} style={{ fill: C.foldDeep }} />
    </svg>
  );
}

export function SettingsRow({ icon, title, subtitle, right, last, wrap, onClick }) {
  return (
    <div
      className={wrap ? "nx-set-row nx-set-row-wrap" : "nx-set-row"}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: T.sp[3], padding: `${T.sp[3]}px ${T.sp[4]}px`, minHeight: 64, boxSizing: "border-box",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="nx-set-main" style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        <div className="nx-set-icon" style={{
          width: 40, height: 40, borderRadius: 16, border: `1px solid ${C.border}`, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div className="nx-set-title" style={{ fontSize: T.fs.row, fontWeight: 500, lineHeight: 1.25 }}>{title}</div>
          {subtitle && (
            <div className="nx-set-sub" style={{ fontSize: T.fs.sub, color: C.muted, marginTop: T.sp[1] - 1, lineHeight: 1.35, maxWidth: 560 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {right && <div className="nx-set-right" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{right}</div>}
    </div>
  );
}

// Рамка вокруг группы строк
export function SettingsGroup({ children }) {
  return (
    // Фон страницы — карточка лежит на сетке-чертеже как плашка, линии не идут сквозь текст
    <div className="nx-set-group" style={{ border: `1px solid ${C.border}`, borderRadius: T.r.lg, overflow: "hidden", marginBottom: T.sp[8], background: C.bg }}>
      {children}
    </div>
  );
}

// Код по клеткам — как на экране «Подключить устройство»
export function CodeCells({ code = "", dim }) {
  return (
    <div aria-label="Код" style={{ display: "flex", gap: 5, userSelect: "all" }}>
      {code.split("").map((ch, i) => (
        <span key={i} style={{
          width: 34, height: 46, flexShrink: 0, boxSizing: "border-box",
          border: `1px solid ${dim ? C.border : C.borderStrong}`, borderRadius: 10,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: fontDisplay, fontSize: 22, color: dim ? C.mutedSoft : C.text,
          background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`,
        }}>{ch}</span>
      ))}
    </div>
  );
}

// Поле ввода входа: угол 4px, обводка 1px, красная при ошибке
export const authField = (invalid) => ({
  display: "block", width: "100%", boxSizing: "border-box", marginTop: 8,
  background: "transparent", color: C.text, fontSize: 16, fontFamily: "inherit",
  border: `1px solid ${invalid ? C.red : C.borderStrong}`, borderRadius: 10,
  padding: "12px 14px", outline: "none",
});

// Кнопка-ссылка: «Отправить ещё раз», «Изменить почту»
export const authLink = { ...btnReset, padding: 0, fontSize: 13, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 };
