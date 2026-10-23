// Файл из буфера обмена: чистые правила (имя, расширение) и чтение буфера по нажатию
const pad = (n) => String(n).padStart(2, "0");
// «Буфер обмена 2026-10-23 14-05» — без двоеточий, чтобы имя годилось для любой системы
export function clipStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
export function clipDefaultName(kind, d = new Date()) {
  return `Буфер обмена ${clipStamp(d)}.${kind === "image" ? "png" : "txt"}`;
}
// Человек мог стереть расширение или написать другое — для текста всегда .txt/.md, для картинки — по типу
export function clipFinalName(raw, kind, mime = "image/png") {
  let name = String(raw || "").replace(/[\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) return null;
  const ext = kind === "image" ? (mime.split("/")[1] || "png").replace("jpeg", "jpg") : null;
  if (kind === "image") {
    if (!new RegExp(`\.${ext}$`, "i").test(name)) name = name.replace(/\.[a-z0-9]{1,5}$/i, "") + "." + ext;
  } else if (!/\.(txt|md|csv|json)$/i.test(name)) name = name.replace(/\.[a-z0-9]{1,5}$/i, "") + ".txt";
  return name;
}

/* Прочитать буфер (clipboardRead из native.js передаёт экран) — только когда человек нажал кнопку. Возвращает
   { kind: "image", blob } | { kind: "text", text } | { error } (пусто — «Буфер пуст») */
export async function readClipForFile(clipboardRead) {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const t = it.types.find((x) => /^image\/(png|jpeg|webp|gif)$/.test(x));
        if (t) { const blob = await it.getType(t); if (blob.size) return { kind: "image", blob }; }
      }
    }
  } catch { /* картинку не дали прочитать — попробуем текст */ }
  const r = await clipboardRead();
  if (r.error) return { error: r.error };
  if (!r.text || !r.text.trim()) return { error: "Буфер пуст — сначала скопируйте текст или картинку" };
  return { kind: "text", text: r.text };
}
