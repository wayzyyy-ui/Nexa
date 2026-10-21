/* Приложение NEXA для ПК (Tauri): то, что встроенный браузер Windows (WebView2)
   сам не умеет или делает не так, как нужно. Команды — в desktop/src-tauri/src/commands.rs.
   На сайте и в Android ничего не делает: все функции сначала проверяют isDesktop.
   - Ссылки «в новой вкладке» окно Tauri молча не открывает → открываем во внешнем браузере.
   - «Скачать» — системное окно «Сохранить как»; «Открыть» — файл в программе Windows.
   - Буфер обмена — без вопроса «Сайт tauri.localhost хочет…» (WebView2 спрашивает его на чтение). */
import { isDesktop } from "./platform.js";

// Модуль Tauri грузим только в окне ПК (на сайте и в Android он не нужен)
async function invoke(cmd, args, options) {
  const core = await import("@tauri-apps/api/core");
  return core.invoke(cmd, args, options);
}

// Можно ли отдавать адрес внешнему браузеру: только http и https
export function externalUrl(url) {
  try {
    const u = new URL(url, location.href);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

// Открыть ссылку во внешнем браузере. true — получилось
export async function openExternal(url) {
  const safe = externalUrl(url);
  if (!isDesktop || !safe) return false;
  try { await invoke("open_url", { url: safe }); return true; } catch { return false; }
}

// Файл (Blob) — в окно «Сохранить как». "saved" | "cancelled"; ошибка — исключение
export async function desktopSaveFile(blob, name) {
  const ok = await invoke("save_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-name": encodeURIComponent(name || "file") } });
  return ok ? "saved" : "cancelled";
}

// Файл (Blob) — открыть в программе Windows. "opened" | "blocked" (программы и сценарии не запускаем)
export async function desktopOpenFile(blob, name) {
  try {
    await invoke("open_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-name": encodeURIComponent(name || "file") } });
    return "opened";
  } catch (e) {
    if (String(e) === "blocked") return "blocked";
    throw e;
  }
}

export const desktopClipboardRead = () => invoke("clipboard_read");
export const desktopClipboardWrite = (text) => invoke("clipboard_write", { text });

/* Внешние ссылки в окне ПК. Ловим нажатия на <a target="_blank"> (в том числе созданные
   кодом и нажатые через a.click()) и window.open: окно Tauri такие ссылки не открывает. */
let linksInstalled = false;
export function installDesktopLinks() {
  if (!isDesktop || linksInstalled || typeof document === "undefined") return;
  linksInstalled = true;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = e.target?.closest?.("a[href]");
    if (!a || a.hasAttribute("download")) return;
    const url = externalUrl(a.getAttribute("href"));
    // Свои адреса (tauri.localhost) остаются внутри окна; чужие — всегда наружу
    if (!url || (a.target !== "_blank" && new URL(url).origin === location.origin)) return;
    e.preventDefault();
    openExternal(url);
  }, true);
  window.open = (url) => {
    if (url) openExternal(String(url));
    return null; // окна внутри приложения нет — код сайта это и так умеет обрабатывать
  };
}

/* ─── ПК как устройство (этап 3, desktop/src-tauri/src/desktop.rs) ─── */

// Сведения о компьютере: { name, form: "laptop" | "desktop", battery, charging, ac, net, disk_free, disk_total }
// Имя компьютера запоминаем — им называется ПК в Presence ещё до ответа оболочки
const PC_NAME_KEY = "nexa-pc-name";
export async function desktopDeviceInfo() {
  if (!isDesktop) return null;
  try {
    const info = await invoke("device_info");
    if (info?.name) try { localStorage.setItem(PC_NAME_KEY, info.name); } catch {}
    return info;
  } catch { return null; }
}
export function pcName() {
  try { return localStorage.getItem(PC_NAME_KEY) || null; } catch { return null; }
}

// Уведомление Windows; link — ссылка nexa://, которую откроет нажатие
export async function desktopNotify(title, body, link) {
  try { await invoke("notify", { title, body: body || "", link: link || null }); return true; } catch { return false; }
}

/* Ссылки nexa:// и нажатия на уведомления Windows: оболочка копит их в очереди и шлёт
   событие nexa-open — забираем всё накопившееся (и сразу при запуске). cb(url) на каждую */
export function onDesktopOpen(cb) {
  if (!isDesktop) return () => {};
  let stop = false, unlisten = null;
  const drain = async () => {
    // Забранное из очереди отдаём всегда (даже если подписку уже сняли) — иначе ссылка потеряется
    try { const list = await invoke("take_opens"); (list || []).forEach((u) => cb(u)); } catch {}
  };
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen("nexa-open", drain))
    .then((un) => { if (stop) un(); else unlisten = un; })
    .catch(() => {});
  drain();
  return () => { stop = true; unlisten?.(); };
}

// Автозапуск вместе с Windows (свёрнутой в трей). null — не удалось узнать
export async function autostartGet() {
  try { return await invoke("autostart_get"); } catch { return null; }
}
export async function autostartSet(on) {
  try { return await invoke("autostart_set", { on }); } catch { return null; }
}

/* ─── Обновление (этап 4, desktop/src-tauri/src/updater.rs) ───
   Скачать, проверить подпись и поставить версию version. onEvent({ kind: "progress", loaded, total })
   и { kind: "installing" } — дальше NEXA закрывается, установщик открывает новую версию сам.
   Ошибка — код строкой: not_configured | network | signature | not_found | no_update | version_mismatch | failed */
export async function desktopUpdateInstall(version, onEvent) {
  const { Channel, invoke: call } = await import("@tauri-apps/api/core");
  const ch = new Channel();
  ch.onmessage = (e) => onEvent?.(e);
  await call("update_install", { version, onEvent: ch });
}

/* ─── Общий буфер обмена (этап 5, desktop/src-tauri/src/clipboard.rs) ─── */
// Следить ли за буфером этого ПК (переключатель в Настройках; по умолчанию выключено)
export async function clipWatch(on) {
  if (!isDesktop) return;
  try { await invoke("clip_watch", { on: !!on }); } catch {}
}
// Новое копирование на этом ПК: cb({ text }) или cb({ long: true }) — длиннее 10 000 знаков
export function onDesktopClip(cb) {
  if (!isDesktop) return () => {};
  let stop = false, unlisten = null;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen("nexa-clip", (e) => { if (!stop) cb(e.payload || {}); }))
    .then((un) => { if (stop) un(); else unlisten = un; })
    .catch(() => {});
  return () => { stop = true; unlisten?.(); };
}
// Уведомление системы с кнопкой «Скопировать» (кладёт текст в буфер только по нажатию)
export async function desktopNotifyClip(title, text) {
  try { await invoke("notify_clip", { title, text }); return true; } catch { return false; }
}
