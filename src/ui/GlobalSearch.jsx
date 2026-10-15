// Глобальный поиск по NEXA
import { useState, useRef, useEffect } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { deviceStatus } from "../lib/devices.js";
import { useLeave } from "../lib/hooks.js";
import { EmptyState } from "./base.jsx";
import { NAV } from "./navigation.jsx";
import { FOLDERS, sortByRecent, fileMeta } from "../lib/fileStore.js";
import { VERSION } from "../version.js";
import { FileThumb } from "./files.jsx";

export const SETTINGS_INDEX = [
  { title: "Пользователь", subtitle: "user@example.com", keywords: ["профиль", "аккаунт", "почта"] },
  { title: "Тема оформления", subtitle: "Светлая или тёмная", keywords: ["тема", "оформление", "светлая", "тёмная"] },
  { title: "Уведомления", subtitle: "Файлы, текст и ссылки, устройства, синхронизация, расписание, обновления", keywords: ["уведомления", "колокольчик", "напоминания", "категории"] },
  { title: "Системные уведомления", subtitle: "Уведомления телефона или браузера", keywords: ["системные", "разрешение", "пуш", "push"] },
  { title: "Выйти из аккаунта", subtitle: "Завершить сессию на всех устройствах", keywords: ["выход", "logout", "выйти"] },
  { title: "О системе", subtitle: `NEXA ${VERSION}`, keywords: ["версия", "о системе", "nexa"] },
];

export function GlobalSearch({ files, chats = [], folders: allFolders = FOLDERS, devices: allDevices = [], onOpenDevice, onClose: closeNow, onOpenFile, onOpenFolder, onOpenChat, onNavigate, initialQuery = "" }) {
  const [leaving, onClose] = useLeave(closeNow);
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef(null);
  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Фокус в поле сразу при открытии, закрытие по Esc
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const match = (text) => hasQuery && typeof text === "string" && text.toLowerCase().includes(q);
  const hitKeys = (arr) => (arr || []).some((k) => match(k));

  // Результаты. Пока запрос пуст, ничего не ищем.
  const tabs = hasQuery ? NAV.filter((t) => match(t.label)) : [];
  const devices = hasQuery ? allDevices.filter((d) => match(d.name)) : [];
  const folders = hasQuery ? allFolders.filter((f) => match(f.name)) : [];
  const fileHits = hasQuery ? sortByRecent(files.filter((f) => match(f.name))) : [];
  const chatHits = (() => {
    if (!hasQuery) return [];
    return chats.filter((c) => match(c.title));
  })();
  const settingHits = hasQuery
    ? SETTINGS_INDEX.filter((s) => match(s.title) || match(s.subtitle) || hitKeys(s.keywords))
    : [];

  const total = tabs.length + devices.length + folders.length + fileHits.length + chatHits.length + settingHits.length;

  // Обработчик клика: делаем действие и закрываем поиск
  const go = (fn) => () => { fn(); onClose(); };

  return (
    <div
      className={`nx-search-overlay nx-fade-in${leaving ? " nx-fade-leaving" : ""}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: `color-mix(in srgb, ${C.bg} 75%, transparent)`,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "10vh 20px 20px", boxSizing: "border-box",
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Поиск"
        className={`nx-search-panel nx-pop${leaving ? " nx-leaving" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)", maxHeight: "calc(100vh - 10vh - 20px)",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 16,
          display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box",
        }}
      >
        {/* Строка ввода */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
        }}>
          {Icon.search({ c: C.muted, s: 18 })}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти файл, папку, диалог, настройку…"
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none",
              outline: "none", color: C.text, fontSize: 15,
            }}
          />
          <kbd style={{
            fontSize: 10, letterSpacing: "0.06em", color: C.mutedSoft,
            border: `1px solid ${C.border}`, borderRadius: 10, padding: "2px 6px", fontFamily: "inherit",
          }}>Esc</kbd>
        </div>

        {/* Область результатов */}
        <div className="nx-scroll" style={{ overflowY: "auto", padding: "8px 0" }}>
          {!hasQuery && (
            <div style={{ padding: "22px 18px", fontSize: 13, color: C.mutedSoft, lineHeight: 1.6 }}>
              Начните вводить — найдём по всему приложению.
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Например: «Диплом», «Фото», «Отпуск», «Тема».
              </div>
            </div>
          )}

          {hasQuery && total === 0 && (
            <EmptyState compact title="Ничего не нашлось" text={`По запросу «${query.trim()}» нет ни разделов, ни файлов. Попробуйте другое слово.`} />
          )}

          {tabs.length > 0 && (
            <SearchGroup title="Разделы">
              {tabs.map((t) => (
                <SearchRow
                  key={t.id}
                  icon={t.icon({ c: C.muted, s: 16 })}
                  title={t.label}
                  subtitle="Перейти в раздел"
                  onClick={go(() => onNavigate(t.id))}
                />
              ))}
            </SearchGroup>
          )}

          {devices.length > 0 && (
            <SearchGroup title="Устройства">
              {devices.map((d) => (
                <SearchRow
                  key={d.id}
                  icon={d.icon({ c: C.muted, s: 16 })}
                  title={d.name}
                  subtitle={deviceStatus(d)}
                  onClick={go(() => onOpenDevice ? onOpenDevice(d.id) : onNavigate("home"))}
                />
              ))}
            </SearchGroup>
          )}

          {fileHits.length > 0 && (
            <SearchGroup title={`Файлы · ${fileHits.length}`}>
              {fileHits.slice(0, 8).map((f) => (
                <SearchRow
                  key={f.id}
                  thumb={<FileThumb file={f} w={34} h={22} iconSize={12} radius={4} />}
                  title={f.name}
                  subtitle={fileMeta(f)}
                  onClick={go(() => onOpenFile(f))}
                />
              ))}
              {fileHits.length > 8 && (
                <div style={{ padding: "6px 18px", fontSize: 12, color: C.mutedSoft }}>
                  и ещё {fileHits.length - 8}…
                </div>
              )}
            </SearchGroup>
          )}

          {folders.length > 0 && (
            <SearchGroup title="Папки">
              {folders.map((f) => (
                <SearchRow
                  key={f.id}
                  icon={Icon.folder({ c: C.muted, s: 16 })}
                  title={f.name}
                  subtitle="Открыть в файлах"
                  onClick={go(() => onOpenFolder(f.id))}
                />
              ))}
            </SearchGroup>
          )}

          {chatHits.length > 0 && (
            <SearchGroup title="Диалоги">
              {chatHits.map((c) => (
                <SearchRow
                  key={c.id}
                  icon={Icon.chat({ c: C.muted, s: 16 })}
                  title={c.title}
                  subtitle="Открыть в ассистенте"
                  onClick={go(() => onOpenChat(c.id))}
                />
              ))}
            </SearchGroup>
          )}

          {settingHits.length > 0 && (
            <SearchGroup title="Настройки">
              {settingHits.map((s) => (
                <SearchRow
                  key={s.title}
                  icon={Icon.gear({ c: C.muted, s: 16 })}
                  title={s.title}
                  subtitle={s.subtitle}
                  onClick={go(() => onNavigate("settings"))}
                />
              ))}
            </SearchGroup>
          )}
        </div>
      </div>
    </div>
  );
}

// Заголовок группы результатов
export function SearchGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
        color: C.mutedSoft, padding: "8px 18px 4px",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// Одна строка результата. Либо иконка, либо миниатюра файла слева.
export function SearchRow({ icon, thumb, title, subtitle, onClick }) {
  const visual = thumb || icon;
  return (
    <button
      type="button"
      className="nx-search-row"
      onClick={onClick}
      style={{
        width: "100%", boxSizing: "border-box",
        background: "transparent", border: "none", padding: "9px 18px",
        font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      {visual && (
        <div style={{
          width: 34, height: 26, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {visual}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 12, color: C.mutedSoft, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{subtitle}</div>
        )}
      </div>
      <div style={{ color: C.mutedSoft, flexShrink: 0 }}>
        {Icon.chevron({ c: C.mutedSoft, s: 14 })}
      </div>
    </button>
  );
}
