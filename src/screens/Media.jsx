// Экран «Медиа и файлы»: категории, объём хранилища
import { useState, useEffect } from "react";
import { formatBytes } from "../lib/deviceInfo.js";
import { cloudBytes, localBytes, CLOUD_QUOTA_BYTES } from "../lib/files.js";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { fileBytes, plural } from "../lib/format.js";
import { btnReset, foldFill } from "../ui/base.jsx";
import { MEDIA_CATS, sortByRecent, fileMeta } from "../lib/fileStore.js";
import { MediaLayout, MediaTitle } from "../ui/layout.jsx";
import { FileThumb } from "../ui/files.jsx";
import { TransferBtn } from "../ui/FileViewer.jsx";

/* Хранилище по макету: одна лента из пяти стеклянных складок, которые
   наезжают друг на друга. Рисуем одной svg-картинкой (растягивается по
   ширине карточки), подписи — поверх, в тех же процентах. Картинка и подписи
   растягиваются вместе с карточкой, поэтому подпись не съезжает с формы.
   pts — углы складки в координатах 1000×150, label — где подпись (x%, y%),
   from / to — цвета градиента, edge — светлая грань у правого края */
export const STORAGE_FOLDS = {
  photo: { pts: "0,140 118,20 362,4 244,128",          label: [13, 36],  from: C.foldDeep, to: C.foldBlue, edge: C.foldCyan },
  video: { pts: "188,148 425,26 558,132 420,144",       label: [37, 56], from: C.foldDeep, to: C.foldBlue, edge: C.foldBlue },
  doc:   { pts: "470,48 716,2 676,134 560,130",         label: [56, 34], from: C.foldBlue, to: C.foldCyan, edge: C.foldCyan },
  music: { pts: "600,150 742,30 880,12 800,142",        label: [72, 38], from: C.foldCyan, to: C.foldMint, edge: C.foldMint },
  other: { pts: "806,138 848,26 1000,44 990,138",       label: [88, 40], from: C.foldMint, to: C.foldGreen, edge: C.foldMint },
};

// Вся лента: складки-кнопки (нажатие — подробности категории) и подписи
export function StorageFolds({ cats, selected, onSelect }) {
  return (
    <div className="ng-storage-folds" style={{ position: "relative", flex: 1, height: 132, minWidth: 0 }}>
      <svg viewBox="0 0 1000 150" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <defs>
          {cats.map((c) => {
            const f = STORAGE_FOLDS[c.id];
            return (
              // Градиент снизу-слева (глубокий) к верху-справа (светлый край) — как стекло
              <linearGradient key={c.id} id={`nx-sf-${c.id}`} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" style={{ stopColor: f.from, stopOpacity: 0.95 }} />
                <stop offset="0.62" style={{ stopColor: f.to, stopOpacity: 0.9 }} />
                <stop offset="1" style={{ stopColor: f.edge, stopOpacity: 1 }} />
              </linearGradient>
            );
          })}
        </defs>
        {cats.map((c) => {
          const f = STORAGE_FOLDS[c.id];
          const dimmed = selected !== null && selected !== c.id;
          return (
            <g key={c.id} className="nx-seg-btn nx-sf" role="button" tabIndex={0} aria-pressed={selected === c.id}
              aria-label={`${c.label}: ${formatBytes(c.bytes)}`}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }}
              style={{ cursor: "pointer", opacity: dimmed ? 0.35 : 1, transition: "opacity 200ms ease, filter 160ms ease" }}>
              <polygon points={f.pts} fill={`url(#nx-sf-${c.id})`} />
              {/* Тонкий светлый край — граница стекла */}
              <polygon points={f.pts} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke"
                style={{ stroke: `color-mix(in srgb, ${C.onFold} 22%, transparent)` }} />
            </g>
          );
        })}
      </svg>
      {/* Подписи поверх складок; нажатие проходит сквозь них на складку */}
      {cats.map((c) => {
        const f = STORAGE_FOLDS[c.id];
        const dimmed = selected !== null && selected !== c.id;
        return (
          <div key={c.id} className="nx-seg-label" data-cat={c.id} aria-hidden="true" style={{
            position: "absolute", left: `${f.label[0]}%`, top: `${f.label[1]}%`, pointerEvents: "none",
            color: C.onFold, lineHeight: 1.2, whiteSpace: "nowrap",
            opacity: dimmed ? 0.45 : 1, transition: "opacity 200ms ease",
          }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{c.label}</span>
            <span style={{ display: "block", fontSize: 12 }}>{formatBytes(c.bytes)}</span>
            {/* Пустая категория — без «0%» */}
            {c.bytes > 0 && <span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>{c.pct}%</span>}
          </div>
        );
      })}
    </div>
  );
}

// ЭКРАН "МЕДИА И ФАЙЛЫ" — диаграмма хранилища + категории + недавние файлы
// files — общий список файлов из App, onOpenFile открывает окно просмотра,
// onOpenCategory переводит на экран "Файлы" с фильтром по категории
// (null — без фильтра).
// onTransfer(файл, карточка, кнопка) — открыть меню «Передать на…»
// uid — вошедший (null — гость).
// Хранилище — только настоящие файлы: у аккаунта — сколько занято в облаке
// (считает база, nexa_storage_used) из лимита CLOUD_QUOTA_BYTES; у гостя —
// сколько реально лежит в этом браузере (IndexedDB), лимита у NEXA нет.
// Демо-файлы без содержимого в объём не входят
export function ScreenMedia({ files, uid = null, onOpenFile, onOpenCategory, onTransfer }) {
  // Какой сегмент хранилища выбран (id категории или null)
  const [selected, setSelected] = useState(null);
  const real = files.filter((f) => f.uploaded);
  const sig = real.map((f) => `${f.id}:${f.size ?? f.mb}`).join(",");
  // Сколько занято: { used — байты | null, sizes — Map id → байты у гостя, ready }
  const [store, setStore] = useState({ used: null, sizes: null, ready: false });
  useEffect(() => {
    let off = false;
    (async () => {
      if (uid) {
        const used = await cloudBytes();
        // База не ответила (нет связи, не запущена миграция) — сумма размеров
        // загруженных файлов: это размеры самого содержимого, записанные при загрузке
        if (!off) setStore({ used: used ?? real.reduce((n, f) => n + fileBytes(f), 0), sizes: null, ready: true });
      } else {
        const sizes = await localBytes("guest", real.map((f) => f.id));
        if (!off) setStore({ used: sizes ? [...sizes.values()].reduce((n, b) => n + b, 0) : null, sizes, ready: true });
      }
    })();
    return () => { off = true; };
  }, [uid, sig]);
  // Размер файла для разбивки: у гостя — только то, что правда лежит в браузере
  const sizeOf = (f) => (uid ? fileBytes(f) : store.sizes?.get(String(f.id)) || 0);
  const bytesOf = (id) => real.filter((f) => !id || f.cat === id).reduce((n, f) => n + sizeOf(f), 0);
  const total = bytesOf(null);
  const cats = MEDIA_CATS.map((c) => {
    const bytes = bytesOf(c.id);
    const byDevice = {};
    real.filter((f) => f.cat === c.id).forEach((f) => { const n = f.device || "Это устройство"; byDevice[n] = (byDevice[n] || 0) + sizeOf(f); });
    return {
      ...c, bytes,
      pct: total > 0 ? Math.round((bytes / total) * 100) : 0,
      devices: Object.entries(byDevice).filter(([, b]) => b > 0),
    };
  });
  const sel = cats.find((c) => c.id === selected);
  const quota = uid ? CLOUD_QUOTA_BYTES : null;
  // «12,4 МБ из 2 ГБ» / «12,4 МБ в этом браузере» / «Нет данных»
  const usedLabel = !store.ready ? "Считаем…"
    : store.used == null ? "Нет данных"
    : quota ? `${formatBytes(store.used)} из ${formatBytes(quota)}` : `${formatBytes(store.used)} в этом браузере`;
  const usedPct = quota && store.used != null ? Math.min(100, (store.used / quota) * 100) : null;
  // Пояснение под объёмом
  const storeNote = uid
    ? "Облачное хранилище аккаунта"
    : store.ready && store.used == null
      ? "Браузер не дал доступ к хранилищу — объём неизвестен"
      : "Файлы гостя живут только в этом браузере, общий объём задаёт сам браузер";
  const usedBar = (wide) => usedPct != null && (
    <span className={wide ? "nx-sys-bar nx-sys-bar-wide" : "nx-sys-bar"} role="meter" aria-label="Занято в хранилище" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)}>
      <span style={{ width: `${Math.max(usedPct, store.used > 0 ? 1 : 0)}%`, background: usedPct > 90 ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
    </span>
  );
  const countOf = (id) => files.filter((f) => f.cat === id).length;
  const recent = sortByRecent(files).slice(0, 6);

  return (
    <MediaLayout>
      <MediaTitle title="Медиа и файлы" />

      {/* Только на телефоне: заголовок хранилища над карточкой, как в макете */}
      <div className="nx-only-mobile nx-storage-head" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="ng-display" style={{ fontSize: T.fs.section, fontWeight: 600 }}>Хранилище</div>
        <div style={{ fontSize: 13, color: C.muted, textAlign: "right" }}>{usedLabel}</div>
      </div>
      {/* Телефон: полоска заполнения и пояснение — под заголовком */}
      <div className="nx-only-mobile" style={{ flexDirection: "column", margin: "-4px 0 14px" }}>
        {usedBar(true)}
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 6, lineHeight: 1.4 }}>{storeNote}</div>
      </div>

      <div className="nx-storage-box" style={{ border: `1px solid ${C.lineBright}`, borderRadius: 48, padding: "22px 30px 20px", marginBottom: 34 }}>
        <div className="ng-storage-card" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div className="nx-storage-label" style={{ flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-start", width: 180 }}>
            {Icon.drive({ c: C.text, s: 24 })}
            {/* Колонка узкая: только объём и полоска. Пояснение — внизу карточки,
                во всю ширину (в узкой колонке оно рвалось на шесть строк) */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>Хранилище</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.35 }}>{usedLabel}</div>
              {usedBar(true)}
            </div>
          </div>
          {/* Собираем диаграмму из массива MEDIA_CATS — чтобы поменять пропорции
              или форму складки, меняй объект в этом массиве */}
          {/* Повторное нажатие на складку снимает выделение */}
          <StorageFolds cats={cats} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />
        </div>

        {/* Подробности по выбранной складке. key={sel.id} нужен,
            чтобы при смене категории блок появлялся заново с анимацией */}
        {sel ? (
          <div key={sel.id} className="nx-pop nx-storage-detail" style={{
            borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16,
            display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start",
          }}>
            <div style={{ minWidth: 140 }}>
              <div className="ng-display" style={{ fontSize: 26, fontWeight: 400 }}>{formatBytes(sel.bytes)}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sel.label}{sel.bytes > 0 ? ` · ${sel.pct}% занятого места` : " · пока пусто"}</div>
              <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 2 }}>
                {countOf(sel.id)} {plural(countOf(sel.id), ["файл", "файла", "файлов"])} в списке
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Где хранится</div>
              {/* Ничего не занято — не рисуем пустые полоски */}
              {sel.devices.length === 0 && (
                <div style={{ fontSize: 13, color: C.mutedSoft, lineHeight: 1.5 }}>Здесь пока ничего нет. Добавьте файлы в «Файлах» — покажем, на каком устройстве они лежат.</div>
              )}
              {sel.devices.map(([name, bytes]) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 13 }}>
                  <div style={{ width: 76, flexShrink: 0 }}>{name}</div>
                  <div style={{ flex: 1, height: 6, background: C.chip, overflow: "hidden" }}>
                    {/* Полоска "вырастает" слева направо — показывает долю устройства */}
                    <div className="nx-bar" style={{
                      width: `${(bytes / sel.bytes) * 100}%`, height: "100%",
                      background: `linear-gradient(90deg, ${sel.from}, ${sel.to})`,
                    }} />
                  </div>
                  <div style={{ minWidth: 56, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{formatBytes(bytes)}</div>
                </div>
              ))}
            </div>
            <button type="button" className="nx-ghost-btn" onClick={() => onOpenCategory(sel.id)} style={{
              ...btnReset, fontSize: 13, border: `1px solid ${C.borderStrong}`, borderRadius: 12,
              padding: "8px 14px", alignSelf: "flex-end", whiteSpace: "nowrap",
            }}>
              Открыть в файлах →
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10, lineHeight: 1.5 }}>
            {/* На телефоне пояснение уже стоит над карточкой */}
            <span className="nx-hide-mobile">{storeNote}. </span>Нажмите на складку, чтобы увидеть, где лежат файлы
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div className="ng-display" style={{ fontSize: T.fs.section, fontWeight: 600 }}>Категории</div>
        <button type="button" className="nx-link-btn" onClick={() => onOpenCategory(null)} style={{
          ...btnReset, fontSize: 12, color: C.mutedSoft, borderBottom: `1px solid ${C.borderStrong}`, paddingBottom: 2,
        }}>
          Все файлы →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, marginBottom: 34 }} className="ng-cat-grid nx-stagger">
        {MEDIA_CATS.map((cat) => {
          const n = countOf(cat.id);
          return (
            <button type="button" key={cat.id} className="nx-cat-card" onClick={() => onOpenCategory(cat.id)} style={{
              ...btnReset, border: `1px solid ${C.lineBright}`, borderRadius: 64,
              background: `color-mix(in srgb, ${C.panel} 35%, transparent)`,
              padding: "14px 24px 16px 28px", height: 122, boxSizing: "border-box",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              transition: "border-color 160ms ease",
            }}>
              {/* Маленькая складка той же формы и цвета, что и на диаграмме */}
              <div className="nx-cat-fold" style={{
                width: "58%", maxWidth: 130, height: 46, alignSelf: "center",
                clipPath: cat.clip, background: foldFill(cat),
              }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
                <div>
                  <div style={{ fontSize: 14 }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2 }}>{n} {plural(n, ["файл", "файла", "файлов"])}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="ng-display" style={{ fontSize: T.fs.section, fontWeight: 600, marginBottom: T.sp[3] }}>Недавние файлы</div>
      {/* Файлов ещё нет (новый аккаунт) — подсказка вместо пустой ленты */}
      {recent.length === 0 && (
        <div style={{ border: `1px dashed ${C.borderStrong}`, borderRadius: 16, padding: "18px 20px", fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
          Пока пусто. Добавьте файлы в разделе{" "}
          <button type="button" className="nx-link-btn" onClick={() => onOpenCategory(null)} style={{ ...btnReset, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 }}>
            «Файлы»
          </button>{" "}— они появятся здесь.
        </div>
      )}
      {/* Лента: вертикальная линия слева и кружок у каждого файла */}
      <div className="nx-stagger" style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 6, top: 24, bottom: 24, width: 1, background: C.text, opacity: 0.6 }} />
        {recent.map((f) => (
          <div key={f.id} style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: -26, top: "50%", marginTop: -7, width: 14, height: 14, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${C.text}`, background: C.bg }} />
            {/* Карточка файла: нажатие открывает файл, справа — «Передать на…» */}
            <div data-transfer-card className="nx-recent-row" style={{
              display: "flex", alignItems: "center", gap: 8, paddingRight: 4, borderRadius: 14,
            }}>
              <button type="button" className="nx-row-btn" onClick={() => onOpenFile(f)} style={{
                ...btnReset, flex: 1, minWidth: 0, boxSizing: "border-box", borderRadius: 14, padding: "7px 8px",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <FileThumb file={f} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: C.mutedSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileMeta(f)}</div>
                </div>
              </button>
              {onTransfer && <TransferBtn onClick={(e) => onTransfer(f, e.currentTarget.closest("[data-transfer-card]"), e.currentTarget)} />}
              <span aria-hidden="true" className="nx-hide-mobile" style={{ display: "flex", opacity: 0.7 }}>{Icon.chevron({ c: C.text, s: 18 })}</span>
            </div>
          </div>
        ))}
      </div>
    </MediaLayout>
  );
}
