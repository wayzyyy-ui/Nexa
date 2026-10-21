// Общая раскладка экранов: шапка раздела с путём (Crumb), колонки «Медиа» / «Сегодня» / «Файлы»
import { T, C } from "./theme.js";
import { btnReset } from "./base.jsx";
import { FoldArt } from "./backdrop.jsx";

/* Общая раскладка «Сегодня», «Медиа» и «Файлов»: слева контент, справа объёмная складка
   из макета 2026-10 (векторная, как на Главной, крупно и обрезана правым краем). На узком экране складка прячется (см. .nx-media-art). */
// hideArt — плавно спрятать складку (например, когда справа открыт прогноз)
export function MediaLayout({ children, hideArt }) {
  return (
    <div className="ng-screen" style={{ padding: "28px 40px 40px", textAlign: "left" }}>
      <div className="nx-media-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        {/* nx-media-main — на большом мониторе растёт вместе с окном (--desk-zoom) */}
        <div className="nx-media-main" style={{ minWidth: 0 }}>{children}</div>
        <div className="nx-media-art" aria-hidden={hideArt || undefined} style={{
          position: "sticky", top: 120, display: "flex", justifyContent: "flex-end", paddingTop: 40, marginRight: -40,
          opacity: hideArt ? 0 : 1, transition: "opacity 240ms ease",
        }}>
          <MediaFold />
        </div>
      </div>
    </div>
  );
}

// Складка справа — та же векторная, что на Главной (FoldArt), крупнее
function MediaFold() {
  return <FoldArt className="nx-media-fold" />;
}

// Заголовок экрана: крупный и лёгкий, как в макете.
// На телефоне подзаголовок прячется, а заголовок встаёт в одну строку
// с иконками поиска и профиля (см. .nx-page-title в мобильных стилях)
export function MediaTitle({ title, subtitle }) {
  return (
    <>
      <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>{title}</div>
      {subtitle
        ? <div className="nx-page-sub" style={{ fontSize: 15, color: C.muted, margin: "10px 0 30px" }}>{subtitle}</div>
        : <div className="nx-page-gap" style={{ height: 40 }} />}
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
      height: 40, padding: "0 26px 0 22px", fontSize: 15, whiteSpace: "nowrap", flexShrink: 0,
      // Скос задаём в пикселях, чтобы угол был одинаковым у коротких и длинных чипсов
      clipPath: "polygon(13px 0, 100% 0, calc(100% - 13px) 100%, 0 100%)",
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
