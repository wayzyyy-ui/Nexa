// Устройства: типы, хранение nexa-devices, статусы, «был в сети», склейка сайта и приложения одного телефона
import { sysShort } from "./deviceInfo.js";
import { isHw } from "./realtime.js";
import { Icon } from "../ui/icons.jsx";
import { plural } from "./format.js";

// Виды устройств: значок и название по type (phone, laptop, tablet…)
export const DEVICE_TYPES = [
  { type: "phone",  icon: Icon.phone,  name: "Смартфон",  battery: 100,  memory: 128 },
  { type: "laptop", icon: Icon.laptop, name: "Ноутбук",   battery: 78,   memory: 512 },
  { type: "tablet", icon: Icon.tablet, name: "Планшет",   battery: 86,   memory: 256 },
  { type: "watch",  icon: Icon.watch,  name: "Часы",      battery: 100,  memory: 32 },
  { type: "buds",   icon: Icon.buds,   name: "Наушники",  battery: 90,   memory: 1 },
  { type: "tv",     icon: Icon.tv,     name: "Телевизор", battery: null, memory: 64 },
];

export const deviceType = (type) => DEVICE_TYPES.find((t) => t.type === type) || DEVICE_TYPES[0];

// Название без повторов: "Планшет" → если занято, "Планшет 2", "Планшет 3"…
export function uniqueDeviceName(base, names) {
  if (!names.includes(base)) return base;
  let i = 2;
  while (names.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export const DEVICES_KEY = "nexa-devices"; // ключ в localStorage

/* Что лежит в localStorage под DEVICES_KEY:
   { v: 2, state, added, removed }
   state   — настройки и статус каждого устройства по id;
   added   — устройства, которые пользователь добавил сам;
   removed — id удалённых исходных устройств.
   Раньше там лежал только state — такой старый формат тоже читаем. */
export function loadDeviceStore(key = DEVICES_KEY) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
  if (raw && raw.v === 2) {
    return { v: 2, state: raw.state || {}, added: raw.added || [], removed: raw.removed || [], updated: raw.updated || {} };
  }
  return { v: 2, state: raw || {}, added: [], removed: [], updated: {} };
}

/* Устройства аккаунта ↔ строки таблицы devices (см. src/lib/sync.js).
   В облаке у устройства: name, type и state — всё остальное одним объектом
   (заряд, память, в сети ли, переключатели). updated — когда меняли (для спора «что новее») */
export function devicesToList(store) {
  return store.added.map((d) => {
    const { id, type, name, createdAt, ...rest } = d;
    return { id, type, name, createdAt: createdAt || 0, updatedAt: store.updated?.[id] || createdAt || 0, state: { ...rest, ...store.state[id] } };
  });
}

export function devicesFromList(list, prev) {
  return {
    v: 2, removed: prev?.removed || [],
    added: list.map((i) => ({
      id: i.id, type: i.type, name: i.name, createdAt: i.createdAt,
      battery: i.state.battery ?? null, memory: i.state.memory ?? deviceType(i.type).memory,
      online: i.state.online ?? true, lastSeen: i.state.lastSeen || "только что",
    })),
    state: Object.fromEntries(list.map((i) => {
      const { battery, memory, lastSeen, ...st } = i.state;
      return [i.id, st];
    })),
    updated: Object.fromEntries(list.map((i) => [i.id, i.updatedAt])),
  };
}

// Подпись статуса: "Онлайн • 92%", "Онлайн" или "Не в сети".
// Реальное устройство: онлайн — по Presence, заряд и сеть — только настоящие (d.sys)
export const deviceStatus = (d) => d.bt
  ? [d.online ? "Подключено" : "Не подключено", d.online && d.battery != null ? `${d.battery}%` : ""].filter(Boolean).join(" • ")
  : d.real
  ? [realStatus(d), d.online ? sysShort(d.sys) : ""].filter(Boolean).join(" • ")
  : !d.online ? "Не в сети" : d.battery != null ? `Онлайн • ${d.battery}%` : "Онлайн";

export function lastSeenText(ms, now = Date.now()) {
  if (typeof ms !== "number" || !ms) return "Не в сети";
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Был в сети только что";
  if (min < 60) return `Был в сети ${min} ${plural(min, ["минуту", "минуты", "минут"])} назад`;
  const h = Math.floor(min / 60);
  const d = new Date(ms), t = new Date(now);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (h < 6) return `Был в сети ${h} ${plural(h, ["час", "часа", "часов"])} назад`;
  if (d.toDateString() === t.toDateString()) return `Был в сети сегодня в ${hm}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Был в сети вчера в ${hm}`;
  return `Был в сети ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в ${hm}`;
}

// Подпись реального устройства: «Онлайн» по Presence, иначе — когда был в сети
export const realStatus = (d) => (d.online ? "Онлайн" : lastSeenText(d.seenAt));

/* ═══ СВЯЗЬ УСТРОЙСТВ (Supabase Realtime, src/lib/realtime.js) ═══
   Блок на Главной: кто из устройств аккаунта онлайн, «Передать» текст или
   ссылку и «Входящее». Демо-устройства тут ни при чём — это настоящие окна
   и приложения, где выполнен вход в тот же аккаунт */
export const peerLabel = (d) => `${d.kind === "both" ? "Сайт и приложение" : d.kind === "app" ? "Приложение" : "Сайт"} · ${d.platform === "mobile" ? "телефон" : "компьютер"}`;

/* Сайт и приложение на одном телефоне — одно устройство в списке.
   Записи реальных устройств с одинаковым «отпечатком» (state.hw, см.
   phoneSignature в realtime.js) склеиваются: имя и id — главной записи
   (приложения), в сети — если в сети хоть одна; действия («Найти», файл,
   ссылка) идут туда, что сейчас в сети (приложение важнее).
   members — id всех записей (для удаления и переименования) */
export function mergeSamePhone(list, d) {
  if (!d.real || !isHw(d.hw)) return [...list, d];
  const i = list.findIndex((x) => x.real && x.hw === d.hw);
  if (i < 0) return [...list, d];
  const a = list[i];
  const all = [...(a.parts || [a]), d];
  const main = all.find((x) => x.kind === "app") || all[0];
  const live = all.find((x) => x.online && x.kind === "app") || all.find((x) => x.online);
  const merged = {
    ...main, parts: all, members: all.map((x) => x.id),
    kind: all.some((x) => x.kind === "app") && all.some((x) => x.kind !== "app") ? "both" : main.kind,
    online: !!live, isSelf: all.some((x) => x.isSelf),
    device_id: (live || main).device_id,
    sys: (live || main).sys || all.find((x) => x.sys)?.sys,
    seenAt: Math.max(...all.map((x) => x.seenAt || 0)) || main.seenAt,
  };
  return list.map((x, j) => (j === i ? merged : x));
}
