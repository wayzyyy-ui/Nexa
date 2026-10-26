// Значки файлов и папок, общие для «Медиа», «Файлов» и поиска
import { useFileUrl } from "../lib/files.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { catOf, FILE_SCOPE, idHue } from "../lib/fileStore.js";

// У настоящей картинки (загруженной пользователем) — сама картинка из хранилища,
// и после перезагрузки, и на другом устройстве. У остальных — цветная плашка с иконкой
export function FileThumb({ file, w = 52, h = 34, iconSize = 16, radius = 6, fit = "cover" }) {
  const cat = catOf(file);
  const plain = file.cat === "doc" || file.cat === "other";
  const url = useFileUrl(file, FILE_SCOPE, !!file.uploaded && file.cat === "photo");
  if (url) {
    return (
      <div style={{ width: w, height: h, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: C.chip }}>
        <img src={url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, flexShrink: 0, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: plain ? C.chip : `linear-gradient(${idHue(file.id)}deg, ${cat.from}, ${cat.to})`,
    }}>
      {/* Складка: тёмная треугольная грань поверх цвета */}
      {!plain && <div style={{
        position: "absolute", inset: 0,
        clipPath: "polygon(55% 0, 100% 0, 100% 100%)",
        background: `color-mix(in srgb, ${C.foldDeep} 30%, transparent)`,
      }} />}
      <div style={{ position: "relative", display: "flex" }}>
        {cat.icon({ c: plain ? C.muted : C.onFold, s: iconSize })}
      </div>
    </div>
  );
}

// Миниатюра папки
export function FolderThumb() {
  return (
    <div style={{ width: 52, height: 34, borderRadius: 12, flexShrink: 0, background: C.chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {Icon.folder({ c: C.muted, s: 18 })}
    </div>
  );
}
