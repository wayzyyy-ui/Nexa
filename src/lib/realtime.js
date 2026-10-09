/* Связь устройств одного аккаунта в реальном времени (Supabase Realtime).

   У каждого вошедшего свой закрытый канал «nexa:<id пользователя>» (private:
   доступ проверяют правила из supabase/realtime-policies.sql).
   - Presence — кто сейчас онлайн: каждое устройство сообщает о себе
     { device_id, name, kind, platform, joined_at }.
   - Broadcast — сообщения между устройствами. Пока одно событие:
     «text.send» { id, text, from_device, from_name, to_device, ts }.
   Протокол описан в CLAUDE.md, раздел «Связь устройств». */
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase.js";
import { newId } from "./sync.js";

export const EVENT_TEXT = "text.send";
export const TEXT_MAX = 2000;    // самое длинное сообщение
export const SEND_GAP_MS = 300;  // не чаще одного сообщения в 300 мс с устройства
export const INBOX_MAX = 20;     // сколько входящих помним
const DEVICE_ID_KEY = "nexa-device-id";
const inboxKey = (uid) => `nexa-inbox@${uid}`;

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

// Сообщение правильной формы? Всё остальное молча пропускаем
const isStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
function validText(p) {
  return !!p && typeof p === "object"
    && isStr(p.id, 64) && isStr(p.from_device, 64)
    && typeof p.text === "string" && p.text.trim().length > 0 && p.text.length <= TEXT_MAX
    && typeof p.ts === "number" && Number.isFinite(p.ts)
    && (p.to_device == null || isStr(p.to_device, 64))
    && (p.from_name == null || (typeof p.from_name === "string" && p.from_name.length <= 60));
}

// Из состояния Presence — список устройств (по одному на device_id)
function flattenPresence(state) {
  const list = [];
  for (const metas of Object.values(state || {})) {
    const m = metas?.[0];
    if (!m || !isStr(m.device_id, 64)) continue;
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
  try { const v = JSON.parse(localStorage.getItem(inboxKey(uid))); return Array.isArray(v) ? v.filter(validText).slice(0, INBOX_MAX) : []; } catch { return []; }
}

/* Хук связи устройств.
   uid — id вошедшего (null — гость: ничего не подключаем);
   onIncoming(item) — пришло новое сообщение (для уведомления).
   Возвращает: status ("off" | "connecting" | "online" | "offline" | "denied"),
   self (это устройство), peers (кто онлайн, вместе с этим), inbox, send, removeInbox, clearInbox */
export function useDeviceLink(uid, onIncoming) {
  const [status, setStatus] = useState("off");
  const [peers, setPeers] = useState([]);
  const [inbox, setInbox] = useState(() => (uid ? loadInbox(uid) : []));
  // Это устройство: определяем сразу, чтобы интерфейс мог показать его имя
  const self = useRef(null);
  if (!self.current) self.current = deviceIdentity();
  const channelRef = useRef(null);
  const lastSent = useRef(0);
  const lastFrom = useRef({});   // device_id → когда пришло последнее (защита от шквала)
  const incoming = useRef(onIncoming);
  incoming.current = onIncoming;

  // Входящее у каждого аккаунта своё
  useEffect(() => { setInbox(uid ? loadInbox(uid) : []); }, [uid]);
  const saveInbox = (list) => { if (uid) try { localStorage.setItem(inboxKey(uid), JSON.stringify(list)); } catch {} };

  useEffect(() => {
    if (!uid || !supabase) { setStatus("off"); setPeers([]); return; }
    let closed = false;
    let channel = null;
    const me = self.current;
    setStatus(navigator.onLine === false ? "offline" : "connecting");

    // Пришло сообщение: проверяем форму, своё и не нам — пропускаем
    const receive = (payload) => {
      if (!validText(payload)) return;
      if (payload.from_device === me.device_id) return;
      if (payload.to_device && payload.to_device !== me.device_id) return;
      const now = Date.now();
      if (now - (lastFrom.current[payload.from_device] || 0) < SEND_GAP_MS) return;
      lastFrom.current[payload.from_device] = now;
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
      incoming.current?.(item);
    };

    (async () => {
      // Закрытому каналу нужен ключ входа — передаём его Realtime перед подпиской
      try { await supabase.realtime.setAuth(); } catch {}
      if (closed) return;
      channel = supabase.channel(`nexa:${uid}`, {
        config: { private: true, broadcast: { self: false, ack: true }, presence: { key: me.device_id } },
      });
      channelRef.current = channel;
      channel
        .on("presence", { event: "sync" }, () => setPeers(flattenPresence(channel.presenceState())))
        .on("broadcast", { event: EVENT_TEXT }, ({ payload }) => receive(payload))
        .subscribe(async (st, err) => {
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

  // Отправить текст или ссылку на устройство to (device_id). Возвращает { ok } или { error }
  const send = async (text, to) => {
    const t = String(text || "").trim();
    if (!t) return { error: "Напишите текст или вставьте ссылку" };
    if (t.length > TEXT_MAX) return { error: `Слишком длинно — до ${TEXT_MAX} символов` };
    const ch = channelRef.current;
    if (!ch || status !== "online") return { error: "Нет связи — отправить не получилось" };
    if (Date.now() - lastSent.current < SEND_GAP_MS) return { error: "Чуть помедленнее — подождите секунду" };
    lastSent.current = Date.now();
    const me = self.current;
    const payload = { id: newId(), text: t, from_device: me.device_id, from_name: me.name, to_device: to || null, ts: Date.now() };
    try {
      const res = await ch.send({ type: "broadcast", event: EVENT_TEXT, payload });
      return res === "ok" ? { ok: true } : { error: "Не дошло — попробуйте ещё раз" };
    } catch {
      return { error: "Не дошло — попробуйте ещё раз" };
    }
  };

  const removeInbox = (id) => setInbox((list) => { const next = list.filter((x) => x.id !== id); saveInbox(next); return next; });
  const clearInbox = () => { setInbox([]); saveInbox([]); };

  return { status, self: self.current, peers, inbox, send, removeInbox, clearInbox };
}
