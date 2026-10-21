/* Ссылки nexa:// (приложение для ПК): открыть экран NEXA из браузера, ярлыка или уведомления Windows.
   Ссылка только ОТКРЫВАЕТ экран — ничего не отправляет, не удаляет и не меняет: её может
   подсунуть любой сайт, поэтому разбор строгий, а неизвестное молча пропускаем.
     nexa://chat/<id>    — диалог ассистента
     nexa://file/<id>    — окно файла
     nexa://device/<id>  — экран устройства
     nexa://tab/<раздел> — home | today | assistant | media | files | settings
     nexa://activity, nexa://sync, nexa://update, nexa://clip (список общего буфера в Настройках)
   Нажатие на уведомление Windows идёт тем же путём: targetToLink(target) → ссылка → parseNexaLink.
   Тесты — tests/deeplink.test.mjs */
export const LINK_TABS = ["home", "today", "assistant", "media", "files", "settings"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

// Ссылка → куда перейти ({ chat } | { file } | { device } | { tab } | { activity } | { sync } | { update }) или null
export function parseNexaLink(url) {
  if (typeof url !== "string" || url.length > 512) return null;
  const m = /^nexa:\/\/([a-z]+)(?:\/([^/?#]*))?\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  const what = m[1].toLowerCase();
  let id = m[2] || "";
  try { id = decodeURIComponent(id); } catch { return null; }
  if (what === "activity" || what === "sync" || what === "update" || what === "clip") return id ? null : { [what]: true };
  if (what === "tab") return LINK_TABS.includes(id) ? { tab: id } : null;
  if ((what === "chat" || what === "file" || what === "device") && ID.test(id)) return { [what]: id };
  return null;
}

// Куда перейти → ссылка (для уведомлений Windows). Неизвестное — null (нажатие просто откроет NEXA)
export function targetToLink(t) {
  if (!t || typeof t !== "object") return null;
  for (const k of ["chat", "file", "device"]) if (typeof t[k] === "string" && ID.test(t[k])) return `nexa://${k}/${t[k]}`;
  if (t.tab && LINK_TABS.includes(t.tab)) return `nexa://tab/${t.tab}`;
  for (const k of ["activity", "sync", "update", "clip"]) if (t[k]) return `nexa://${k}`;
  return null;
}
