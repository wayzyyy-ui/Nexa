/* Связь устройств одного аккаунта в реальном времени (Supabase Realtime).

   У каждого вошедшего свой закрытый канал «nexa:<id пользователя>» (private:
   доступ проверяют правила из supabase/realtime-policies.sql).
   - Presence — кто сейчас онлайн: каждое устройство сообщает о себе
     { device_id, name, kind, platform, joined_at, sys }. sys — настоящие
     сведения (заряд, сеть, место; см. src/lib/deviceInfo.js), обновляются
     не чаще раза в 30 секунд и только когда что-то изменилось.
   - Broadcast — сообщения между устройствами: text.send, pair.claim, pair.ok,
     pair.fail, find.ring, find.stop, lock.on, lock.off, file.send, link.open,
     devices.changed, sync.changed.
     Ко всем сообщениям добавляются from_device, from_name и ts.
   Протокол описан в CLAUDE.md, раздел «Связь устройств». */
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase.js";
import { newId } from "./sync.js";

export const EVENT_TEXT = "text.send";
export const TEXT_MAX = 2000;    // самое длинное сообщение
export const SEND_GAP_MS = 300;  // отправляем не чаще одного сообщения в 300 мс
const RECEIVE_GAP_MS = 250;      // принимаем с одного устройства не чаще (запас на задержки сети)
const SYS_GAP_MS = 30000;        // сведения об устройстве в Presence — не чаще раза в 30 секунд
export const INBOX_MAX = 20;     // сколько входящих помним
const DEVICE_ID_KEY = "nexa-device-id";
const inboxKey = (uid) => `nexa-inbox@${uid}`;
const sentKey = (uid) => `nexa-flow-sent@${uid}`; // NEXA Flow: что отправили с этого устройства
const ACK_WAIT_MS = 8000; // столько ждём подтверждения от устройства-получателя

/* NEXA Flow: похоже ли на пароль, ключ или токен. Такое можно передать,
   но в историю (localStorage) текст не пишем — только пометку «скрыто».
   Проверка простая и осторожная: лучше лишний раз скрыть, чем сохранить секрет */
const SENSITIVE_RE = [
  /(пароль|password|passwd|pwd|pin|пин-?код|секрет|secret|token|токен|api[_ -]?key|ключ api)\s*[:=]/i,
  /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/,          // ключи и сертификаты
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, // JWT
  /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/,     // ключи сервисов
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/,               // ключи Supabase
  /\b(ghp|gho|github_pat|glpat|xox[abp])[-_][A-Za-z0-9_-]{16,}/, // ключи Git и чатов
  /\bAKIA[0-9A-Z]{16}\b/,                                       // ключи облаков
  /\bAIza[0-9A-Za-z_-]{30,}/,
];
export function isSensitive(text) {
  const t = String(text || "");
  if (SENSITIVE_RE.some((re) => re.test(t))) return true;
  // Одно «слово» без пробелов, длинное и пёстрое (буквы разного регистра + цифры) — похоже на пароль или токен
  const one = t.trim();
  if (one.length >= 10 && one.length <= 200 && !/\s/.test(one) && !safeUrl(one) &&
      /[a-z]/.test(one) && /[A-Z]/.test(one) && /\d/.test(one)) return true;
  return false;
}
// Для истории: секрет не сохраняем, только пометку
const forStorage = (x) => (x.sensitive ? { ...x, text: null } : x);

// Код подключения: 6 символов без похожих (нет 0, O, 1, I, L)
export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/* «Отпечаток телефона» — чтобы сайт и приложение на одном телефоне считались
   одним устройством. У них разное хранилище (браузер и приложение не видят
   данные друг друга), поэтому общего device_id быть не может. Зато экран,
   плотность пикселей, число ядер, объём памяти и часовой пояс у них общие.
   Это не секрет и не точный номер: два одинаковых телефона одной модели
   в одном аккаунте могут склеиться в одно устройство. Только для телефонов */
function phoneSignature() {
  const s = window.screen || {};
  const parts = [
    Math.min(s.width || 0, s.height || 0), Math.max(s.width || 0, s.height || 0),
    window.devicePixelRatio || 1, navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0,
    (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })(),
  ].join("|");
  let h = 0x811c9dc5; // FNV-1a: короткая сводка, по ней нельзя восстановить данные
  for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export const isHw = (v) => typeof v === "string" && /^[0-9a-f]{8}$/.test(v);

/* Кто это устройство. device_id создаётся один раз и живёт в localStorage,
   имя — по типу: приложение, сайт на телефоне или на компьютере.
   hw — «отпечаток телефона» (см. phoneSignature), у компьютера — нет */
export function deviceIdentity() {
  let id = null;
  try { id = localStorage.getItem(DEVICE_ID_KEY); } catch {}
  if (!id) {
    id = newId();
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
  }
  const kind = Capacitor.isNativePlatform() ? "app" : "web";
  const mobile = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth <= 768;
  const platform = mobile ? "mobile" : "desktop";
  const name = kind === "app" ? "Приложение" : mobile ? "Сайт на телефоне" : "Сайт на компьютере";
  return { device_id: id, name, kind, platform, ...(mobile ? { hw: phoneSignature() } : {}) };
}

// Ссылка, которую можно открыть: только http и https (javascript: и прочее — нет)
export function safeUrl(text) {
  const t = String(text || "").trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

/* ─── Проверка формы сообщений. Неверное — молча пропускаем ─── */
const isStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const isId = (v) => isStr(v, 64);
const isTs = (v) => typeof v === "number" && Number.isFinite(v);
const isName = (v) => v == null || (typeof v === "string" && v.length <= 60);
const isKind = (v) => v === "web" || v === "app";
const isPlatform = (v) => v === "desktop" || v === "mobile";
// Общее у всех: кто прислал и когда
const base = (p) => !!p && typeof p === "object" && !Array.isArray(p) && isId(p.from_device) && isTs(p.ts) && isName(p.from_name);

const SCHEMAS = {
  "text.send": (p) => base(p) && isId(p.id)
    && typeof p.text === "string" && p.text.trim().length > 0 && p.text.length <= TEXT_MAX
    && (p.to_device == null || isId(p.to_device)),
  // Подключаемое устройство предъявляет код
  // NEXA Flow: получатель подтверждает, что текст пришёл (ok) или что передача
  // у него выключена (off). На подтверждение не отвечают — круга не бывает
  "text.ack": (p) => base(p) && isId(p.id) && isId(p.to_device) && (p.status === "ok" || p.status === "off"),
  "pair.claim": (p) => base(p) && typeof p.code === "string" && PAIR_CODE_RE.test(p.code)
    && isId(p.device_id) && p.device_id === p.from_device && isName(p.name) && isKind(p.kind) && isPlatform(p.platform),
  // Ответ устройства с кодом: подключено / не вышло
  "pair.ok": (p) => base(p) && isId(p.device_id) && isName(p.name),
  "pair.fail": (p) => base(p) && isId(p.device_id) && ["wrong", "expired", "used", "locked"].includes(p.reason)
    && (p.left == null || (Number.isInteger(p.left) && p.left >= 0 && p.left <= 5)),
  "find.ring": (p) => base(p) && isId(p.target_device_id) && isId(p.id),
  "find.stop": (p) => base(p) && isId(p.target_device_id) && typeof p.found === "boolean",
  // Демонстрационная блокировка экрана NEXA (не системная блокировка телефона)
  "lock.on": (p) => base(p) && isId(p.target_device_id) && isId(p.id),
  "lock.off": (p) => base(p) && isId(p.target_device_id),
  // Файл уже лежит в облаке аккаунта (путь <uid>/<id>) — получатель открывает его сам
  "file.send": (p) => base(p) && isId(p.id) && isId(p.to_device) && isStr(p.name, 255)
    && Number.isFinite(p.size) && p.size >= 0 && (p.mime == null || (typeof p.mime === "string" && p.mime.length <= 255)),
  // Открыть ссылку на устройстве: только http/https, получатель проверяет ещё раз
  "link.open": (p) => base(p) && isId(p.id) && isId(p.to_device) && typeof p.url === "string" && p.url.length <= 2048 && !!safeUrl(p.url),
  // Список устройств аккаунта изменился — перечитать из облака
  "devices.changed": (p) => base(p),
  // В облаке новое (устройства или чаты) — перечитать эту таблицу сразу
  "sync.changed": (p) => base(p) && ["devices", "chats", "files", "file_folders", "schedule"].includes(p.table),
};
export const LINK_EVENTS = Object.keys(SCHEMAS);

/* Сведения об устройстве из Presence: только известные поля и разумные значения.
   Чужое (или испорченное) — молча отбрасываем, как и неверные события */
const okNum = (v, max) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max);
const NETS = ["wifi", "cellular", "ethernet", "none"];
export function cleanSys(x) {
  if (!x || typeof x !== "object") return null;
  const out = {
    battery: Number.isInteger(x.battery) && x.battery >= 0 && x.battery <= 100 ? x.battery : null,
    charging: typeof x.charging === "boolean" ? x.charging : null,
    ac: x.ac === true,
    net: NETS.includes(x.net) ? x.net : null,
    diskFree: null, diskTotal: null,
    at: isTs(x.at) ? x.at : null,
  };
  // Место — только парой и только если свободное не больше общего (до 1 ПБ)
  if (okNum(x.diskFree, 1e15) && okNum(x.diskTotal, 1e15) && x.diskTotal > 0 && x.diskFree <= x.diskTotal) {
    out.diskFree = x.diskFree; out.diskTotal = x.diskTotal;
  }
  return out.at ? out : null;
}

// Из состояния Presence — список устройств (по одному на device_id)
function flattenPresence(state) {
  const list = [];
  for (const metas of Object.values(state || {})) {
    const m = metas?.[0];
    if (!m || !isId(m.device_id)) continue;
    list.push({
      device_id: m.device_id,
      name: typeof m.name === "string" ? m.name.slice(0, 60) : "Устройство",
      kind: m.kind === "app" ? "app" : "web",
      platform: m.platform === "mobile" ? "mobile" : "desktop",
      joined_at: m.joined_at,
      sys: cleanSys(m.sys),
      hw: isHw(m.hw) ? m.hw : null,
    });
  }
  return list.sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
}

// Сохранённая история: текст или (у скрытых) null
function loadList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v.filter((x) => x && isId(x.id) && (typeof x.text === "string" || x.sensitive) && isTs(x.ts)).slice(0, INBOX_MAX) : [];
  } catch { return []; }
}
const loadInbox = (uid) => loadList(inboxKey(uid));
// Отправленное: «отправляем» после перезагрузки уже не изменится — пишем «не подтвердило»
const loadSent = (uid) => loadList(sentKey(uid)).map((x) => (x.status === "sending" || x.status === "sent" ? { ...x, status: "unconfirmed" } : x));

/* Хук связи устройств.
   uid — id вошедшего (null — гость: ничего не подключаем);
   handlers — { onText(item), onEvent(event, payload), flowOn() }: что делать с пришедшим;
   flowOn() — включена ли передача текста (NEXA Flow) на этом устройстве.
   Возвращает: status ("off" | "connecting" | "online" | "offline" | "denied"),
   self (это устройство), peers (кто онлайн, вместе с этим), inbox,
   send (текст), emit (любое событие протокола), removeInbox, clearInbox */
export function useDeviceLink(uid, handlers) {
  const [status, setStatus] = useState("off");
  const [peers, setPeers] = useState([]);
  const [inbox, setInbox] = useState(() => (uid ? loadInbox(uid) : []));
  const [sent, setSent] = useState(() => (uid ? loadSent(uid) : [])); // NEXA Flow: отправленное
  const ackTimers = useRef({}); // id отправленного → таймер «не подтвердило»
  // Какие сообщения уже приняли (id) — повтор того же события не дублирует запись
  // и не показывает уведомление второй раз. Проверяем сразу, а не внутри
  // обновления состояния: React выполняет его не всегда в тот же момент
  const seenIds = useRef(new Set(inbox.map((x) => x.id)));
  // Это устройство: определяем сразу, чтобы интерфейс мог показать его имя
  const self = useRef(null);
  if (!self.current) self.current = deviceIdentity();
  const channelRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastSent = useRef(0);
  const lastFrom = useRef({});   // device_id → когда пришло последнее (защита от шквала)
  const h = useRef(handlers);
  h.current = handlers;
  // Что сообщаем о себе в Presence: время входа (не меняется при обновлении сведений)
  // и сведения об устройстве. Обновление — не чаще раза в SYS_GAP_MS
  const joinedAt = useRef(null);
  const sysRef = useRef(null);
  const sysSentAt = useRef(0);
  const sysTimer = useRef(null);
  const presence = () => ({ ...self.current, joined_at: joinedAt.current || new Date().toISOString(), ...(sysRef.current ? { sys: sysRef.current } : {}) });

  // Входящее и отправленное у каждого аккаунта своё
  useEffect(() => {
    const list = uid ? loadInbox(uid) : [];
    seenIds.current = new Set(list.map((x) => x.id));
    setInbox(list); setSent(uid ? loadSent(uid) : []);
  }, [uid]);
  const saveInbox = (list) => { if (uid) try { localStorage.setItem(inboxKey(uid), JSON.stringify(list.map(forStorage))); } catch {} };
  const saveSent = (list) => { if (uid) try { localStorage.setItem(sentKey(uid), JSON.stringify(list.map(forStorage))); } catch {} };
  const patchSent = (id, patch) => setSent((list) => {
    if (!list.some((x) => x.id === id)) return list;
    const next = list.map((x) => (x.id === id ? { ...x, ...patch } : x));
    saveSent(next);
    return next;
  });
  useEffect(() => () => Object.values(ackTimers.current).forEach(clearTimeout), []);

  useEffect(() => {
    if (!uid || !supabase) { setStatus("off"); setPeers([]); return; }
    let closed = false;
    let channel = null;
    const me = self.current;
    setStatus(navigator.onLine === false ? "offline" : "connecting");

    // Пришло сообщение: неизвестное, неверной формы, своё и слишком частое — пропускаем
    const receive = (event, payload) => {
      const ok = SCHEMAS[event];
      if (!ok || !ok(payload)) return;
      if (payload.from_device === me.device_id) return;
      // Подтверждение получения — отметка у отправленного (без ограничения частоты:
      // это ответ на наше же сообщение, а не поток от устройства)
      if (event === "text.ack") {
        if (payload.to_device !== me.device_id) return;
        clearTimeout(ackTimers.current[payload.id]);
        patchSent(payload.id, { status: payload.status === "ok" ? "delivered" : "off" });
        return;
      }
      const now = Date.now();
      if (now - (lastFrom.current[payload.from_device] || 0) < RECEIVE_GAP_MS) return;
      lastFrom.current[payload.from_device] = now;

      if (event === "text.send") {
        if (payload.to_device && payload.to_device !== me.device_id) return; // не нам
        // Передача выключена на этом устройстве — не принимаем и честно говорим об этом
        if (h.current?.flowOn && !h.current.flowOn()) {
          if (payload.to_device) emitRef.current?.("text.ack", { id: payload.id, to_device: payload.from_device, status: "off" });
          return;
        }
        const item = {
          id: payload.id, text: payload.text, from_device: payload.from_device,
          from_name: payload.from_name || "Устройство", ts: payload.ts, to_device: payload.to_device ?? null,
          sensitive: isSensitive(payload.text),
        };
        // То же сообщение второй раз — не дублируем (но подтверждаем ещё раз ниже)
        const fresh = !seenIds.current.has(item.id);
        seenIds.current.add(item.id);
        if (fresh) setInbox((list) => {
          if (list.some((x) => x.id === item.id)) return list;
          const next = [item, ...list].slice(0, INBOX_MAX);
          try { localStorage.setItem(inboxKey(uid), JSON.stringify(next.map(forStorage))); } catch {}
          return next;
        });
        // Подтверждаем получение (только адресное — «всем» подтверждать некому)
        if (payload.to_device) emitRef.current?.("text.ack", { id: payload.id, to_device: payload.from_device, status: "ok" });
        if (fresh) h.current?.onText?.(item);
        return;
      }
      h.current?.onEvent?.(event, payload);
    };

    (async () => {
      // Закрытому каналу нужен ключ входа — передаём его Realtime перед подпиской
      try { await supabase.realtime.setAuth(); } catch {}
      if (closed) return;
      channel = supabase.channel(`nexa:${uid}`, {
        config: { private: true, broadcast: { self: false, ack: true }, presence: { key: me.device_id } },
      });
      channelRef.current = channel;
      channel.on("presence", { event: "sync" }, () => setPeers(flattenPresence(channel.presenceState())));
      // Слушаем только известные события — остальные до нас не доходят
      for (const ev of LINK_EVENTS) channel.on("broadcast", { event: ev }, ({ payload }) => receive(ev, payload));
      channel.subscribe(async (st, err) => {
        if (closed) return;
        if (st === "SUBSCRIBED") {
          setStatus("online");
          joinedAt.current = new Date().toISOString();
          sysSentAt.current = Date.now();
          try { await channel.track(presence()); } catch {}
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
          // Нет прав на канал (правила не вставлены) — отдельная подпись
          setStatus(/unauthori|permission/i.test(String(err?.message || "")) ? "denied" : "offline");
          setPeers([]);
        }
      });
    })();

    const onOffline = () => { setStatus("offline"); setPeers([]); };
    // Сеть вернулась. Короткий обрыв часто не рвёт само соединение с каналом —
    // тогда сразу снова «на связи» и берём свежий список «кто онлайн».
    // Если соединение всё же порвалось, библиотека переподключится сама (SUBSCRIBED выше)
    const onOnline = () => {
      if (channel && channel.state === "joined") {
        setStatus("online");
        setPeers(flattenPresence(channel.presenceState()));
        channel.track(presence()).catch(() => {});
      } else {
        setStatus((s) => (s === "offline" ? "connecting" : s));
      }
    };
    // Закрыли страницу — уходим из канала (статус «онлайн» пропадёт у других)
    const leave = () => {
      if (!channel) return;
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channel = null;
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", leave);
    return () => {
      closed = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", leave);
      leave();
      channelRef.current = null;
      setPeers([]);
    };
  }, [uid]);

  /* Отправить событие протокола. Пауза 300 мс между сообщениями соблюдается
     сама: если отправляли только что — ждём. Возвращает true, если дошло до сервера */
  const emit = async (event, payload = {}) => {
    const ch = channelRef.current;
    if (!ch || statusRef.current !== "online" || !SCHEMAS[event]) return false;
    const waitMs = lastSent.current + SEND_GAP_MS - Date.now();
    lastSent.current = Math.max(Date.now(), lastSent.current + SEND_GAP_MS);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    const me = self.current;
    try {
      const res = await ch.send({ type: "broadcast", event, payload: { ...payload, from_device: me.device_id, from_name: me.name, ts: Date.now() } });
      return res === "ok";
    } catch { return false; }
  };

  const emitRef = useRef(null);
  emitRef.current = emit;

  /* Отправить текст или ссылку на устройство to (device_id; toName — для истории).
     Возвращает { ok, id } или { error }. Дальше статус в истории (sent):
     sending → sent (дошло до сервера) → delivered (устройство подтвердило) |
     off (там выключено) | unconfirmed (за 8 с подтверждения не пришло) | error */
  const send = async (text, to, toName) => {
    const t = String(text || "").trim();
    if (!t) return { error: "Напишите текст или вставьте ссылку" };
    if (t.length > TEXT_MAX) return { error: `Слишком длинно — до ${TEXT_MAX} символов` };
    if (!channelRef.current || status !== "online") return { error: "Нет связи — отправить не получилось" };
    if (Date.now() - lastSent.current < SEND_GAP_MS) return { error: "Чуть помедленнее — подождите секунду" };
    const id = newId();
    const rec = { id, text: t, to_device: to || null, to_name: toName || null, ts: Date.now(), status: "sending", sensitive: isSensitive(t) };
    setSent((list) => { const next = [rec, ...list].slice(0, INBOX_MAX); saveSent(next); return next; });
    const ok = await emit(EVENT_TEXT, { id, text: t, to_device: to || null });
    if (!ok) { patchSent(id, { status: "error" }); return { error: "Не дошло — попробуйте ещё раз" }; }
    patchSent(id, { status: "sent" });
    if (to) {
      ackTimers.current[id] = setTimeout(() => setSent((list) => {
        const x = list.find((y) => y.id === id);
        if (!x || x.status !== "sent") return list;
        const next = list.map((y) => (y.id === id ? { ...y, status: "unconfirmed" } : y));
        saveSent(next);
        return next;
      }), ACK_WAIT_MS);
    }
    return { ok: true, id };
  };

  const removeInbox = (id) => setInbox((list) => { const next = list.filter((x) => x.id !== id); saveInbox(next); return next; });
  const removeSent = (id) => setSent((list) => { const next = list.filter((x) => x.id !== id); saveSent(next); return next; });
  const clearInbox = () => { setInbox([]); saveInbox([]); };
  // Очистить всю историю передач на этом устройстве (полученное и отправленное)
  const clearFlow = () => { setInbox([]); saveInbox([]); setSent([]); saveSent([]); };

  /* Новые сведения об этом устройстве (заряд, сеть, место). Сразу запоминаем;
     в Presence уходят не чаще раза в SYS_GAP_MS — если раньше, отправка
     откладывается до конца паузы и уходит одна, самая свежая */
  const shareSys = (sys) => {
    sysRef.current = cleanSys(sys);
    clearTimeout(sysTimer.current);
    const push = () => {
      const ch = channelRef.current;
      if (!ch || statusRef.current !== "online") return; // при подключении уйдёт вместе с track
      sysSentAt.current = Date.now();
      ch.track(presence()).catch(() => {});
    };
    const wait = SYS_GAP_MS - (Date.now() - sysSentAt.current);
    if (wait <= 0) push(); else sysTimer.current = setTimeout(push, wait);
  };
  useEffect(() => () => clearTimeout(sysTimer.current), []);

  return { status, self: self.current, peers, inbox, sent, send, emit, removeInbox, removeSent, clearInbox, clearFlow, shareSys };
}
