// Картинки в заметке: полоса миниатюр над текстом, просмотр на весь экран, удаление.
// Сами картинки и их хранение — src/lib/noteImages.js; сведения лежат в заметке (note.images).
import { useState } from "react";
import { C } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { btnReset } from "../../ui/base.jsx";
import { useNoteImageUrl } from "../../lib/noteImages.js";

// Миниатюра: высота одна на всех, ширина — по пропорциям (не уже квадрата и не шире 2 высот)
function Thumb({ img, uid, scope, h, onOpen, onRemove }) {
  const [retry, setRetry] = useState(0);
  const { url, failed } = useNoteImageUrl(img, uid, scope, retry);
  const ratio = img.w && img.h ? Math.min(2, Math.max(1, img.w / img.h)) : 1.3;
  return (
    <div className="nx-note-thumb" data-no-note-swipe style={{ position: "relative", flexShrink: 0, height: h, width: Math.round(h * ratio), borderRadius: 16, overflow: "hidden", border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.text} 5%, transparent)` }}>
      {url ? (
        <button type="button" onClick={onOpen} aria-label={`Открыть картинку «${img.name}»`} style={{ ...btnReset, display: "block", width: "100%", height: "100%" }}>
          <img src={url} alt={img.name} draggable={false} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={() => setRetry((n) => (n < 1 ? n + 1 : n))} />
        </button>
      ) : failed ? (
        <button type="button" onClick={() => setRetry((n) => n + 1)} style={{ ...btnReset, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: C.muted, padding: 8, textAlign: "center" }}>
          {Icon.refresh({ c: C.muted, s: 16 })} Не загрузилась
        </button>
      ) : null}
      <button type="button" onClick={onRemove} aria-label={`Убрать картинку «${img.name}»`} title="Убрать"
        style={{ ...btnReset, position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
          background: `color-mix(in srgb, ${C.bg} 78%, transparent)`, border: `1px solid ${C.borderStrong}` }}>
        {Icon.close({ c: C.text, s: 11 })}
      </button>
    </div>
  );
}

/* Полоса картинок. Листается вбок (data-no-note-swipe — жест «смахнуть заметку» её не трогает).
   Пусто — ничего не рисуем */
export function NoteImages({ images, uid, scope, phone, onOpen, onRemove }) {
  if (!images.length) return null;
  return (
    <div className="nx-note-images nx-scroll nx-no-scrollbar" data-no-swipe data-no-note-swipe role="list" aria-label="Картинки в заметке"
      style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 0 12px", marginBottom: 2, overscrollBehaviorX: "none", touchAction: "pan-x pan-y" }}>
      {images.map((img) => (
        <div role="listitem" key={img.id} style={{ display: "contents" }}>
          <Thumb img={img} uid={uid} scope={scope} h={phone ? 112 : 132} onOpen={() => onOpen(img.id)} onRemove={() => onRemove(img)} />
        </div>
      ))}
    </div>
  );
}
