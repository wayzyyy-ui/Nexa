// Общая раскладка экранов: шапка раздела с путём (Crumb), колонки «Медиа» / «Сегодня» / «Файлы»
import { T, C } from "./theme.js";
import { btnReset } from "./base.jsx";
import { FoldHero } from "./backdrop.jsx";

/* Общая раскладка "Медиа" и "Файлов": слева контент, справа фирменная
   складка, как в макете. На узком экране складка прячется (см. .nx-media-art). */
// hideArt — плавно спрятать складку (например, когда справа открыт прогноз)
export function MediaLayout({ children, hideArt }) {
  return (
    <div className="ng-screen" style={{ padding: "28px 40px 40px", textAlign: "left" }}>
      <div className="nx-media-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>{children}</div>
        <div className="nx-media-art" aria-hidden={hideArt || undefined} style={{
          position: "sticky", top: 120, display: "flex", justifyContent: "flex-end", paddingTop: 60, marginRight: -40,
          opacity: hideArt ? 0 : 1, transition: "opacity 240ms ease",
        }}>
          <FoldHero size={440} />
        </div>
      </div>
    </div>
  );
}

// Заголовок экрана: крупный и лёгкий, как в макете.
// На телефоне подзаголовок прячется, а заголовок встаёт в одну строку
// с иконками поиска и профиля (см. .nx-page-title в мобильных стилях)
export function MediaTitle({ title, subtitle }) {
  return (
    <>
      <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>{title}</div>
      <div className="nx-page-sub" style={{ fontSize: 15, color: C.muted, margin: "10px 0 30px" }}>{subtitle}</div>
    </>
  );
}

// Один чипс в строке пути (хлебных крошек) — скошенная цветная плашка.
// active — текущая папка: она ярче остальных и не нажимается.
export function Crumb({ children, active, onClick }) {
  return (
    <button type="button" disabled={active} onClick={onClick} className={active ? undefined : "nx-crumb"} style={{
      ...btnReset,
      cursor: active ? "default" : "pointer",
      height: 30, padding: "0 20px 0 18px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0,
      // Скос задаём в пикселях, чтобы угол был одинаковым у коротких и длинных чипсов
      clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
      background: active
        ? `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`
        : `linear-gradient(90deg, ${C.foldDeep}, color-mix(in srgb, ${C.foldBlue} 70%, ${C.foldDeep}))`,
      color: C.onFold,
      display: "flex", alignItems: "center", gap: 7,
    }}>
      {children}
    </button>
  );
}
