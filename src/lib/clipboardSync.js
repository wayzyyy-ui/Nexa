/* Общий буфер обмена (NEXA Flow как облачный буфер) — ход для NexaApp. Правила — clipsync.js.
   Только приложения (ПК и Android) и только у вошедшего; на каждом устройстве включается
   отдельно (nexa-clip@<uid> { on, ttl }, по умолчанию выключено).

   Откуда берётся текст:
   - ПК: оболочка следит за буфером (clipboard.rs) и присылает новое копирование (onDesktopClip);
   - телефон: при открытии NEXA / возврате в неё читаем буфер (система сама покажет
     «вставлено из буфера») — так человек видит, что NEXA его взяла; в фоне не читаем никогда.
   Куда: запись в таблицу clipboard (для тех, кто не в сети, и для push), событие clip.new
   в закрытый канал nexa:<uid>, push приложениям на телефонах, где буфер включён, а NEXA закрыта.
   Пришедшее (2026-11-03, просьба автора — «чтобы всё было автоматически») сразу кладётся в буфер этого
   устройства, если включено «Сразу в буфер этого устройства» (prefs.auto, по умолчанию да); выключено —
   как раньше, только кнопкой «Скопировать». Телефон с закрытой NEXA кладёт текст из push сам
   (NexaClipReceiver; переключатель туда передаёт clipAutoNativeSet). Пропущенное, пока NEXA спала, —
   при возврате: сначала свой буфер уходит (если в нём новое), потом самое свежее пришедшее кладётся в буфер,
   если оно новее последнего события буфера здесь (clipToApply, mark — nexa-clip-mark@<uid>). */
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { useSharedState } from "./shared.js";
import { newId, isMissingTable } from "./sync.js";
import { isNative, isDesktop, API_BASE, clipboardRead, clipboardWrite, clipAutoNativeSet } from "../native.js";
import { clipWatch, onDesktopClip } from "./desktop.js";
import { clipDecision, clipHash, clipExp, clipMerge, clipPurge, clipFromRow, clipToApply, loadClipPrefs, CLIP_SKIP_TEXT } from "./clipsync.js";
import { sealText, openText } from "./e2e.js";

/* Шифрование (2026-10-28, e2e.js / e2eKey.js): включено для аккаунта и пароль введён здесь — текст уходит
   в таблицу и канал зашифрованным (enc: 1), сервер его не видит; push телефонам в этом случае не шлём
   (сервер не может прочитать текст для уведомления). Включено, но пароль здесь не введён — не отправляем
   вовсе (иначе текст ушёл бы открытым). Пришло зашифрованное, а ключа нет — запись «закрыта» (locked) */
const LOCKED_NOTE = "Шифрование буфера включено, но на этом устройстве пароль не введён — скопированное не отправлено";
async function openItem(item, key) {
  if (!item.enc) return item;
  const text = await openText(key, item.text);
  return text == null ? { ...item, text: null, locked: true } : { ...item, text, enc: 0 };
}

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
export function useClipSync({ uid, link, online, pushTargets, onIncoming, e2e }) {
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
  // Когда здесь последний раз было событие буфера (отправили своё или положили пришедшее) — переживает перезапуск
  const markKey = "nexa-clip-mark" + scope;
  const mark = useRef(null);
  mark.current ??= (() => { try { return Number(localStorage.getItem(markKey)) || 0; } catch { return 0; } })();
  const setMark = (t) => { mark.current = Math.max(mark.current || 0, t); try { localStorage.setItem(markKey, String(mark.current)); } catch {} };
  // Положить пришедшее в буфер этого устройства (только если включено «Сразу в буфер»). ПК: оболочка помнит,
  // что это записала NEXA, — обратно не отправит; телефон: такой текст — «пришедший», clipDecision его не шлёт
  const apply = async (item) => {
    if (!ctx.current.prefs.auto || item.locked || typeof item.text !== "string") return false;
    const ok = await clipboardWrite(item.text);
    if (ok !== false) setMark(Math.max(item.at || 0, Date.now()));
    return ok !== false;
  };
  const ctx = useRef({}); ctx.current = { on, prefs, selfId, link, pushTargets, onIncoming, online, e2e };

  const send = async (text) => {
    const c = ctx.current;
    if (!c.on || !c.selfId) return { skip: "off" };
    // Шифрование включено, а ключа здесь нет (или ещё не узнали) — открытым не отправляем
    if (c.e2e?.status === "locked") { setNote({ kind: "skip", text: LOCKED_NOTE }); return { skip: "locked" }; }
    if (c.e2e?.status === "loading") return { skip: "loading" };
    const d = clipDecision({ text, lastSent: lastSent.current, received: itemsRef.current });
    if (!d.send) {
      if (CLIP_SKIP_TEXT[d.skip]) setNote({ kind: "skip", text: CLIP_SKIP_TEXT[d.skip] });
      return d;
    }
    lastSent.current = clipHash(text);
    try { localStorage.setItem(lastKey, lastSent.current); } catch {}
    const now = Date.now();
    setMark(now);
    const item = { id: newId(), text, from_device: c.selfId, from_name: c.link.self?.name || "Это устройство", at: now, exp: clipExp(c.prefs.ttl, now), mine: true };
    setItems((l) => clipMerge(l, [item]));
    if (!c.online) { setNote({ kind: "skip", text: "Нет связи — скопированное осталось на этом устройстве" }); return { skip: "offline" }; }
    let stored = false;
    const enc = c.e2e?.status === "ready" && c.e2e.key ? 1 : 0;
    const wire = enc ? await sealText(c.e2e.key, text) : text;
    if (tableOk.current) {
      const { error } = await supabase.from("clipboard").insert({
        id: item.id, from_device: c.selfId, from_name: String(item.from_name).slice(0, 60), text: wire, enc, expires_at: new Date(item.exp).toISOString(),
      });
      if (!error) stored = true;
      else if (isMissingTable(error)) { tableOk.current = false; setNote({ kind: "setup", text: "Облачная история буфера не настроена — текст уходит только устройствам в сети" }); }
      else setNote({ kind: "error", text: "Не сохранилось в облаке — устройства не в сети его не получат" });
    }
    await c.link.emit("clip.new", { id: item.id, text: wire, exp: item.exp, enc });
    // Телефонам, где NEXA закрыта, — push (сервер возьмёт текст из таблицы, поэтому только если записалось;
    // зашифрованное сервер прочитать не может — push не шлём)
    if (stored && !enc) for (const t of c.pushTargets?.() || []) pushClip(t, item.id, c.selfId);
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
    const raw = { id: p.id, text: p.text, enc: p.enc === 1 ? 1 : 0, from_device: p.from_device, from_name: p.from_name || "Устройство", at: p.ts, exp: p.exp, mine: false };
    openItem(raw, ctx.current.e2e?.key).then(async (item) => {
      setItems((l) => clipMerge(l, [item]));
      const copied = await apply(item);
      ctx.current.onIncoming?.(item, copied);
    });
    return true;
  };

  // Из облака — то, что пришло, пока устройство было не в сети (без уведомлений)
  const refresh = async () => {
    const c = ctx.current;
    if (!c.on || !c.online || !tableOk.current) return;
    const { data, error } = await supabase.from("clipboard")
      .select("id, text, from_device, from_name, created_at, expires_at, enc").order("created_at", { ascending: false }).limit(30);
    if (error) { if (isMissingTable(error)) tableOk.current = false; return; }
    const rows = (data || []).map((r) => clipFromRow(r, c.selfId)).filter(Boolean);
    const opened = await Promise.all(rows.map((r) => openItem(r, c.e2e?.key)));
    setItems((l) => clipMerge(l, opened));
    // Пришедшее, пока NEXA спала или была не в сети, — в буфер, если оно новее своего (без уведомлений)
    const fresh = clipToApply(opened, mark.current);
    if (fresh) await apply(fresh);
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
  const copy = async (item) => (item.locked || item.text == null ? false : clipboardWrite(item.text));

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

  // Телефон: при открытии NEXA и при возврате в неё — взять текст из буфера (не чаще раза в 2 с), потом забрать
  // пропущенное с других устройств (своё новое уходит раньше — и тогда старое чужое его не затрёт)
  useEffect(() => {
    if (!isNative || !on) return;
    let last = 0;
    const pull = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      const r = await clipboardRead();
      if (r?.text) await send(r.text);
      await refresh();
    };
    pull();
    document.addEventListener("visibilitychange", pull);
    return () => document.removeEventListener("visibilitychange", pull);
  }, [on]);

  // Телефон: переключатель «Сразу в буфер» — в Android-часть (push с закрытой NEXA обрабатывается без веб-части)
  useEffect(() => { if (isNative && uid) clipAutoNativeSet(on && prefs.auto); }, [on, prefs.auto, uid]);

  // Включили / вошли / вернулась связь — забрать пропущенное из облака
  // Ввели пароль на этом устройстве — закрытые записи открываются
  useEffect(() => { if (on && online) refresh(); }, [on, online, uid, e2e?.status]);
  useEffect(() => {
    const key = e2e?.key;
    if (!key || !itemsRef.current.some((x) => x.locked)) return;
    setItems((l) => l.filter((x) => !x.locked));
    refresh();
  }, [e2e?.key]);

  return { available: clipAvailable && !!uid, on, prefs, setPrefs, items, note, send, handle, refresh, remove, clear, copy };
}
