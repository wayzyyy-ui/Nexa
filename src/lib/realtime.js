/* Связь устройств одного аккаунта в реальном времени (Supabase Realtime).

   У каждого вошедшего свой закрытый канал «nexa:<id пользователя>» (private:
   доступ проверяют правила из supabase/realtime-policies.sql).
   - Presence — кто сейчас онлайн: каждое устройство сообщает о себе
     { device_id, name, kind, platform, joined_at }.
   - Broadcast — сообщения между устройствами: text.send, pair.claim, pair.ok,
     pair.fail, scene.set, find.ring, find.stop, devices.changed.
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
export const INBOX_MAX = 20;     // сколько входящих помним
const DEVICE_ID_KEY = "nexa-device-id";
const inboxKey = (uid) => `nexa-inbox@${uid}`;

// Код подключения: 6 символов без похожих (нет 0, O, 1, I, L)
export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const SCENE_IDS = ["work", "home", "road", "sleep"];

/* Кто это устройство. device_id создаётся один раз и живёт в localStorage,
   имя — по типу: приложение, сайт на телефоне или на компьютере */
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
  return { device_id: id, name, kind, platform };
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
  "pair.claim": (p) => base(p) && typeof p.code === "string" && PAIR_CODE_RE.test(p.code)
    && isId(p.device_id) && p.device_id === p.from_device && isName(p.name) && isKind(p.kind) && isPlatform(p.platform),
  // Ответ устройства с кодом: подключено / не вышло
  "pair.ok": (p) => base(p) && isId(p.device_id) && isName(p.name),
  "pair.fail": (p) => base(p) && isId(p.device_id) && ["wrong", "expired", "used", "locked"].includes(p.reason)
    && (p.left == null || (Number.isInteger(p.left) && p.left >= 0 && p.left <= 5)),
  "scene.set": (p) => base(p) && SCENE_IDS.includes(p.scene),
  "find.ring": (p) => base(p) && isId(p.target_device_id) && isId(p.id),
  "find.stop": (p) => base(p) && isId(p.target_device_id) && typeof p.found === "boolean",
  // Список устройств аккаунта изменился — перечитать из облака
  "devices.changed": (p) => base(p),
};
export const LINK_EVENTS = Object.keys(SCHEMAS);

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
    });
  }
  return list.sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
}

function loadInbox(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(inboxKey(uid)));
    return Array.isArray(v) ? v.filter((x) => x && isId(x.id) && typeof x.text === "string" && isTs(x.ts)).slice(0, INBOX_MAX) : [];
  } catch { return []; }
}

/* Хук связи устройств.
   uid — id вошедшего (null — гость: ничего не подключаем);
   handlers — { onText(item), onEvent(event, payload) }: что делать с пришедшим.
   Возвращает: status ("off" | "connecting" | "online" | "offline" | "denied"),
   self (это устройство), peers (кто онлайн, вместе с этим), inbox,
   send (текст), emit (любое событие протокола), removeInbox, clearInbox */
export function useDeviceLink(uid, handlers) {
  const [status, setStatus] = useState("off");
  const [peers, setPeers] = useState([]);
  const [inbox, setInbox] = useState(() => (uid ? loadInbox(uid) : []));
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

  // Входящее у каждого аккаунта своё
  useEffect(() => { setInbox(uid ? loadInbox(uid) : []); }, [uid]);
  const saveInbox = (list) => { if (uid) try { localStorage.setItem(inboxKey(uid), JSON.stringify(list)); } catch {} };

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
      const now = Date.now();
      if (now - (lastFrom.current[payload.from_device] || 0) < RECEIVE_GAP_MS) return;
      lastFrom.current[payload.from_device] = now;

      if (event === "text.send") {
        if (payload.to_device && payload.to_device !== me.device_id) return; // не нам
        const item = {
          id: payload.id, text: payload.text, from_device: payload.from_device,
          from_name: payload.from_name || "Устройство", ts: payload.ts, to_device: payload.to_device ?? null,
        };
        setInbox((list) => {
          if (list.some((x) => x.id === item.id)) return list;
          const next = [item, ...list].slice(0, INBOX_MAX);
          try { localStorage.setItem(inboxKey(uid), JSON.stringify(next)); } catch {}
          return next;
        });
        h.current?.onText?.(item);
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
          try { await channel.track({ ...me, joined_at: new Date().toISOString() }); } catch {}
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
          // Нет прав на канал (правила не вставлены) — отдельная подпись
          setStatus(/unauthori|permission/i.test(String(err?.message || "")) ? "denied" : "offline");
          setPeers([]);
        }
      });
    })();

    const onOffline = () => { setStatus("offline"); setPeers([]); };
    const onOnline = () => setStatus((s) => (s === "offline" ? "connecting" : s));
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

  // Отправить текст или ссылку на устройство to (device_id). Возвращает { ok } или { error }
  const send = async (text, to) => {
    const t = String(text || "").trim();
    if (!t) return { error: "Напишите текст или вставьте ссылку" };
    if (t.length > TEXT_MAX) return { error: `Слишком длинно — до ${TEXT_MAX} символов` };
    if (!channelRef.current || status !== "online") return { error: "Нет связи — отправить не получилось" };
    if (Date.now() - lastSent.current < SEND_GAP_MS) return { error: "Чуть помедленнее — подождите секунду" };
    const ok = await emit(EVENT_TEXT, { id: newId(), text: t, to_device: to || null });
    return ok ? { ok: true } : { error: "Не дошло — попробуйте ещё раз" };
  };

  const removeInbox = (id) => setInbox((list) => { const next = list.filter((x) => x.id !== id); saveInbox(next); return next; });
  const clearInbox = () => { setInbox([]); saveInbox([]); };

  return { status, self: self.current, peers, inbox, send, emit, removeInbox, clearInbox };
}
