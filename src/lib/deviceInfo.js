/* Настоящие сведения об этом устройстве: заряд, зарядка, тип сети и место.
   Берём только то, что платформа реально отдаёт. Нет данных — null,
   и интерфейс пишет «Нет данных». Условных значений не подставляем.

   Откуда что берётся:
   - приложение Android: заряд и зарядка — @capacitor/device (getBatteryInfo),
     сеть — @capacitor/network, место — свой модуль NexaDisk (MainActivity:
     StatFs по разделу данных; в @capacitor/device 8 полей места на диске нет);
   - браузер: заряд — navigator.getBattery() (есть не везде), сеть —
     navigator.connection.type (обычно только Chrome на Android) и navigator.onLine;
     места на диске браузер не сообщает. navigator.storage.estimate() —
     это место для сайта внутри браузера, а не память телефона, его не используем;
   - приложение для ПК: всё из Windows через оболочку (device_info в desktop.rs) —
     заряд и зарядка (GetSystemPowerStatus; нет батареи — «от сети»), сеть (адаптер со шлюзом:
     провод / Wi-Fi / мобильная), место на системном диске. Не ответила — как в браузере.

   Сведения (sys): { battery 0–100 | null, charging true/false | null,
   ac — питание от сети, а уровень заряда браузер не знает,
   net "wifi" | "cellular" | "ethernet" | "none" | null,
   diskFree, diskTotal — байты | null, at — когда прочитано (мс) } */
import { useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { Network } from "@capacitor/network";
import { isDesktop } from "./platform.js";
import { desktopDeviceInfo } from "./desktop.js";

const isNative = Capacitor.isNativePlatform();
const NexaDisk = registerPlugin("NexaDisk");
export const SYS_POLL_MS = 30000; // не чаще раза в 30 секунд

// Смартфон, планшет или компьютер — без моделей и брендов
export function thisDeviceKind() {
  const side = Math.min(window.screen?.width || 0, window.screen?.height || 0);
  if (isDesktop) return "computer"; // приложение для ПК — всегда компьютер (даже с сенсорным экраном)
  const touch = isNative || !!window.matchMedia?.("(pointer: coarse)").matches;
  if (!touch) return "computer";
  return side >= 600 ? "tablet" : "phone";
}
export const KIND_LABEL = { phone: "Смартфон", tablet: "Планшет", computer: "Компьютер" };

const pct = (x) => (typeof x === "number" && x >= 0 && x <= 1 ? Math.round(x * 100) : null);
const NET = { wifi: "wifi", cellular: "cellular", ethernet: "ethernet", none: "none" };

/* ─── Приложение ─── */
async function readNative() {
  const out = { battery: null, charging: null, ac: false, net: null, diskFree: null, diskTotal: null };
  try {
    const b = await Device.getBatteryInfo();
    out.battery = pct(b.batteryLevel);
    out.charging = typeof b.isCharging === "boolean" ? b.isCharging : null;
  } catch {}
  try {
    const n = await Network.getStatus();
    out.net = n.connected === false ? "none" : NET[n.connectionType] || null; // unknown — нет данных
  } catch {}
  try {
    const d = await NexaDisk.getSpace();
    if (Number.isFinite(d?.total) && d.total > 0 && Number.isFinite(d?.free) && d.free >= 0 && d.free <= d.total) {
      out.diskFree = d.free; out.diskTotal = d.total;
    }
  } catch {} // старое приложение без модуля — нет данных
  return out;
}

/* ─── Браузер ─── */
let batteryPromise = null;
const getBattery = () => {
  if (!batteryPromise) batteryPromise = typeof navigator.getBattery === "function" ? navigator.getBattery().catch(() => null) : Promise.resolve(null);
  return batteryPromise;
};
async function readWeb() {
  const out = { battery: null, charging: null, ac: false, net: null, diskFree: null, diskTotal: null };
  const b = await getBattery();
  if (b) {
    // На компьютере без батареи браузер отвечает «100%, заряжается, полностью заряжена».
    // Так же выглядит и полный ноутбук на зарядке — честно можно сказать только «от сети»
    const noBattery = b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity;
    if (noBattery) out.ac = true;
    else { out.battery = pct(b.level); out.charging = !!b.charging; }
  }
  const c = navigator.connection;
  if (navigator.onLine === false) out.net = "none";
  else if (c && typeof c.type === "string") out.net = NET[c.type] || null; // effectiveType — скорость, не тип: не берём
  return out;
}

/* ─── Приложение для ПК ─── */
async function readDesktop() {
  const i = await desktopDeviceInfo();
  if (!i) return readWeb();
  const num = (x) => (Number.isFinite(x) && x >= 0 ? x : null);
  const free = num(i.disk_free), total = num(i.disk_total);
  return {
    battery: Number.isInteger(i.battery) && i.battery >= 0 && i.battery <= 100 ? i.battery : null,
    charging: typeof i.charging === "boolean" ? i.charging : null,
    ac: !!i.ac,
    net: navigator.onLine === false ? "none" : NET[i.net] || null,
    diskFree: total && free != null && free <= total ? free : null,
    diskTotal: total && free != null && free <= total ? total : null,
  };
}

export const readThisDevice = async () => ({ ...(await (isNative ? readNative() : isDesktop ? readDesktop() : readWeb())), at: Date.now() });

// Одинаковы ли сведения (время чтения не считаем; место — с точностью до 100 МБ,
// чтобы мелкие записи на диск не считались изменением)
const MB100 = 100 * 1024 * 1024;
export function sameSys(a, b) {
  if (!a || !b) return a === b;
  const r = (x) => (x == null ? null : Math.round(x / MB100));
  return a.battery === b.battery && a.charging === b.charging && !!a.ac === !!b.ac && a.net === b.net &&
    r(a.diskFree) === r(b.diskFree) && r(a.diskTotal) === r(b.diskTotal);
}

/* Хук: сведения об этом устройстве. Перечитывает раз в 30 секунд и сразу —
   при событиях (заряд, зарядка, сеть). Новое значение — только если что-то
   правда изменилось, иначе компонент не перерисовывается */
export function useThisDeviceSys() {
  const [sys, setSys] = useState(null);
  const last = useRef(null);
  useEffect(() => {
    let stop = false;
    let busy = false;
    const read = async () => {
      // Приложение для ПК в трее тоже «в сети» — его заряд и сеть видят другие устройства
      if (busy || (document.visibilityState === "hidden" && !isDesktop)) return;
      busy = true;
      try {
        const next = await readThisDevice();
        if (stop) return;
        if (!sameSys(last.current, next)) { last.current = next; setSys(next); }
      } finally { busy = false; }
    };
    read();
    const timer = setInterval(read, SYS_POLL_MS);
    const offs = [];
    const on = (target, ev) => { target?.addEventListener?.(ev, read); offs.push(() => target?.removeEventListener?.(ev, read)); };
    on(window, "online"); on(window, "offline"); on(document, "visibilitychange");
    if (isNative) {
      let handle = null;
      Network.addListener("networkStatusChange", read).then((h) => { handle = h; if (stop) h.remove(); }).catch(() => {});
      offs.push(() => handle?.remove());
    } else {
      on(navigator.connection, "change");
      getBattery().then((b) => { if (!b || stop) return; on(b, "levelchange"); on(b, "chargingchange"); });
    }
    return () => { stop = true; clearInterval(timer); offs.forEach((f) => f()); };
  }, []);
  return sys;
}

/* ─── Подписи ─── */
// Размер по-русски: 0 Б, 812 Б, 12,4 КБ, 3,1 МБ, 1,2 ГБ (1 КБ = 1024 Б)
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Нет данных";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const num = i === 0 ? String(Math.round(v)) : (v >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString().replace(".", ","));
  return `${num} ${units[i]}`;
}
export const NO_DATA = "Нет данных";
export const batteryText = (s) => {
  if (!s) return NO_DATA;
  if (s.battery != null) return `${s.battery}%${s.charging ? " · заряжается" : ""}`;
  if (s.ac) return "От сети";
  return NO_DATA;
};
export const netText = (s) => ({ wifi: "Wi-Fi", cellular: "Мобильная сеть", ethernet: "Проводная сеть", none: "Нет сети" })[s?.net] || NO_DATA;
export const diskText = (s) => (s?.diskTotal ? `Свободно ${formatBytes(s.diskFree)} из ${formatBytes(s.diskTotal)}` : NO_DATA);
// Коротко для карточки: «64% · Wi-Fi» (только то, что известно)
export const sysShort = (s) => [s?.battery != null ? `${s.battery}%` : null, s?.net && s.net !== "none" ? netText(s) : null].filter(Boolean).join(" · ");
