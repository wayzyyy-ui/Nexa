/* Общий буфер обмена (NEXA Flow как облачный буфер) — ход для NexaApp. Правила — clipsync.js.
   Только приложения (ПК и Android) и только у вошедшего; на каждом устройстве включается
   отдельно (nexa-clip@<uid> { on, ttl }, по умолчанию выключено).

   Откуда берётся текст:
   - ПК: оболочка следит за буфером (clipboard.rs) и присылает новое копирование (onDesktopClip);
   - телефон: при открытии NEXA / возврате в неё читаем буфер (система сама покажет
     «вставлено из буфера») — так человек видит, что NEXA его взяла; в фоне не читаем никогда.
   Куда: запись в таблицу clipboard (для тех, кто не в сети, и для push), событие clip.new
   в закрытый канал nexa:<uid>, push приложениям на телефонах, где буфер включён, а NEXA закрыта.
   Пришедшее само в буфер устройства не попадает — только кнопкой «Скопировать». */
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { useSharedState } from "./shared.js";
import { newId, isMissingTable } from "./sync.js";
import { isNative, isDesktop, API_BASE, clipboardRead, clipboardWrite } from "../native.js";
import { clipWatch, onDesktopClip } from "./desktop.js";
import { clipDecision, clipHash, clipExp, clipMerge, clipPurge, clipFromRow, loadClipPrefs, CLIP_SKIP_TEXT } from "./clipsync.js";

export const clipAvailable = isNative || isDesktop;
const loadItems = (key) => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? clipPurge(v) : []; } catch { return []; } };
const loadPrefs = (key) => { try { return loadClipPrefs(JSON.parse(localStorage.getItem(key))); } catch { return loadClipPrefs(null); } };
const PURGE_MS = 15000;

// Push «Скопировано» в приложение на телефоне (api/push.js читает текст из таблицы сам, по номеру)
async function pushClip(targetDeviceId, id, fromDevice) {
  try {
    const { data } = await supabase.auth.getSession();
    await fetch(`${API_BASE}/api/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ action: "clip", target_device_id: targetDeviceId, id, from_device: fromDevice }),
    });
  } catch {}
}

/* uid — кто вошёл; link — useDeviceLink; pushTargets() — device_id приложений с включённым буфером,
   которых сейчас нет в сети; onIncoming(item) — показать пришедшее (уведомление) */
export function useClipSync({ uid, link, online, pushTargets, onIncoming }) {
  const scope = uid ? `@${uid}` : "";
  const [prefs, setPrefs] = useSharedState("nexa-clip" + scope, loadPrefs);
  const [items, setItems] = useSharedState("nexa-clip-items" + scope, loadItems);
  // Строка под переключателем: почему не отправили, нет таблицы, ошибка — { kind, text }
  const [note, setNote] = useState(null);
  const on = !!uid && !!supabase && clipAvailable && prefs.on;
  const selfId = link.self?.device_id;
  const itemsRef = useRef(items); itemsRef.current = items;
  // Отпечаток последнего отправленного (повтор не шлём) — переживает перезапуск: иначе телефон
  // при каждом открытии NEXA заново отправлял бы то, что и так уже лежит в буфере
  const lastKey = "nexa-clip-last" + scope;
  const lastSent = useRef(null);
  lastSent.current ??= (() => { try { return localStorage.getItem(lastKey); } catch { return null; } })();
  const tableOk = useRef(true);  // нет таблицы clipboard — работаем только через канал
  const ctx = useRef({}); ctx.current = { on, prefs, selfId, link, pushTargets, onIncoming, online };

  const send = async (text) => {
    const c = ctx.current;
    if (!c.on || !c.selfId) return { skip: "off" };
    const d = clipDecision({ text, lastSent: lastSent.current, received: itemsRef.current });
    if (!d.send) {
      if (CLIP_SKIP_TEXT[d.skip]) setNote({ kind: "skip", text: CLIP_SKIP_TEXT[d.skip] });
      return d;
    }
    lastSent.current = clipHash(text);
    try { localStorage.setItem(lastKey, lastSent.current); } catch {}
    const now = Date.now();
    const item = { id: newId(), text, from_device: c.selfId, from_name: c.link.self?.name || "Это устройство", at: now, exp: clipExp(c.prefs.ttl, now), mine: true };
    setItems((l) => clipMerge(l, [item]));
    if (!c.online) { setNote({ kind: "skip", text: "Нет связи — скопированное осталось на этом устройстве" }); return { skip: "offline" }; }
    let stored = false;
    if (tableOk.current) {
      const { error } = await supabase.from("clipboard").insert({
        id: item.id, from_device: c.selfId, from_name: String(item.from_name).slice(0, 60), text, expires_at: new Date(item.exp).toISOString(),
      });
      if (!error) stored = true;
      else if (isMissingTable(error)) { tableOk.current = false; setNote({ kind: "setup", text: "Облачная история буфера не настроена — текст уходит только устройствам в сети" }); }
      else setNote({ kind: "error", text: "Не сохранилось в облаке — устройства не в сети его не получат" });
    }
    await c.link.emit("clip.new", { id: item.id, text, exp: item.exp, enc: 0 });
    // Телефонам, где NEXA закрыта, — push (сервер возьмёт текст из таблицы, поэтому только если записалось)
    if (stored) for (const t of c.pushTargets?.() || []) pushClip(t, item.id, c.selfId);
    setNote(null);
    return { send: true };
  };

  // Пришло по каналу (NexaApp → handleLinkEvent). true — событие наше
  const handle = (event, p) => {
    if (!event.startsWith("clip.")) return false;
    if (event === "clip.del") { setItems((l) => l.filter((x) => x.id !== p.id)); return true; }
    // «Очистить всё» на другом устройстве — убираем всё, кроме скопированного уже после очистки
    if (event === "clip.clear") { setItems((l) => l.filter((x) => x.at > (p.ts || Date.now()))); return true; }
    if (!ctx.current.on || itemsRef.current.some((x) => x.id === p.id)) return true;
    const item = { id: p.id, text: p.text, from_device: p.from_device, from_name: p.from_name || "Устройство", at: p.ts, exp: p.exp, mine: false };
    setItems((l) => clipMerge(l, [item]));
    ctx.current.onIncoming?.(item);
    return true;
  };

  // Из облака — то, что пришло, пока устройство было не в сети (без уведомлений)
  const refresh = async () => {
    const c = ctx.current;
    if (!c.on || !c.online || !tableOk.current) return;
    const { data, error } = await supabase.from("clipboard")
      .select("id, text, from_device, from_name, created_at, expires_at, enc").order("created_at", { ascending: false }).limit(30);
    if (error) { if (isMissingTable(error)) tableOk.current = false; return; }
    setItems((l) => clipMerge(l, (data || []).map((r) => clipFromRow(r, c.selfId)).filter(Boolean)));
  };

  const remove = async (id) => {
    setItems((l) => l.filter((x) => x.id !== id));
    if (tableOk.current) await supabase.from("clipboard").delete().eq("id", id);
    await link.emit("clip.del", { id });
  };
  const clear = async () => {
    setItems([]);
    if (tableOk.current && uid) await supabase.from("clipboard").delete().eq("user_id", uid);
    await link.emit("clip.clear", {});
  };
  // «Скопировать» — только по нажатию человека. ПК: оболочка помнит, что это записала NEXA (не петля)
  const copy = async (item) => clipboardWrite(item.text);

  // Просроченное убираем и с экрана
  useEffect(() => {
    const t = setInterval(() => setItems((l) => { const p = clipPurge(l); return p.length === l.length ? l : p; }), PURGE_MS);
    return () => clearInterval(t);
  }, [setItems]);

  // ПК: слежение за буфером — только пока включено
  useEffect(() => {
    if (!isDesktop) return;
    clipWatch(on);
    if (!on) return;
    const off = onDesktopClip((e) => {
      if (e.long) setNote({ kind: "skip", text: CLIP_SKIP_TEXT.long });
      else if (typeof e.text === "string") send(e.text);
    });
    return () => { off(); clipWatch(false); };
  }, [on]);

  // Телефон: при открытии NEXA и при возврате в неё — взять текст из буфера (не чаще раза в 2 с)
  useEffect(() => {
    if (!isNative || !on) return;
    let last = 0;
    const pull = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      const r = await clipboardRead();
      if (r?.text) send(r.text);
    };
    pull();
    document.addEventListener("visibilitychange", pull);
    return () => document.removeEventListener("visibilitychange", pull);
  }, [on]);

  // Включили / вошли / вернулась связь — забрать пропущенное из облака
  useEffect(() => { if (on && online) refresh(); }, [on, online, uid]);

  return { available: clipAvailable && !!uid, on, prefs, setPrefs, items, note, send, handle, refresh, remove, clear, copy };
}
