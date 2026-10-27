/* Прямая передача файла между своими устройствами без облака (2026-10-27).
   Как устроено:
   1) отправитель создаёт WebRTC-соединение с каналом данных, собирает свои адреса в сети (без внешних
      серверов — только одна сеть Wi-Fi) и шлёт p2p.offer по закрытому каналу аккаунта (nexa:<uid>);
   2) получатель видит «X передаёт файл» и сам решает: «Принять» → p2p.answer, «Отклонить» → p2p.reject;
   3) устройства соединяются напрямую, файл идёт кусками по 64 КБ, получатель подтверждает «ok»;
   4) в облако ничего не попадает. Не соединились за 15 с — честно говорим и предлагаем облако.
   Правила и тексты — directPlan.js (тесты tests/direct.test.mjs). Принятое живёт в памяти страницы,
   пока человек не нажал «Сохранить» или «В «Файлы»» (или не закрыл плашку) */
import { useState, useRef, useCallback, useEffect } from "react";
import { newId } from "./sync.js";
import { RTC_CONFIG, CHUNK, READ_BLOCK, HIGH_WATER, LOW_WATER, ASK_MS, CONNECT_MS, STALL_MS, ICE_MS, DIRECT_MAX, DIRECT_FAIL, metaMsg, parseCtl, lanOnlySdp } from "./directPlan.js";

// Свои адреса в сети собраны (или вышло время) — описание соединения готово к отправке
function gathered(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, ICE_MS);
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); } });
  });
}
const close = (pc) => { try { pc?.close(); } catch { /* уже закрыто */ } };

/* link — useDeviceLink; enabled — вошли и канал есть.
   Возвращает { out, inc, ask, send, accept, reject, cancelOut, cancelInc, closeOut, closeInc, handle } */
export function useDirect(link, enabled) {
  const [out, setOut] = useState(null); // { id, to, toName, toType, file, phase: asking|connecting|sending|done|failed, bytes, total, error }
  const [inc, setInc] = useState(null); // { id, from, fromName, name, size, mime, phase: connecting|receiving|done|failed, bytes, blob, error }
  const [ask, setAsk] = useState(null); // { id, from, name (кто), file, size, mime, sdp }
  const outRef = useRef(null), incRef = useRef(null), askRef = useRef(null);
  const linkRef = useRef(link); linkRef.current = link;
  const timers = useRef({});
  const clearT = (k) => { clearTimeout(timers.current[k]); delete timers.current[k]; };
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // Ход передачи в интерфейс — не чаще 5 раз в секунду (иначе перерисовка на каждый кусок)
  const lastPaint = useRef(0);
  const paint = (set, patch, force) => {
    const now = Date.now();
    if (!force && now - lastPaint.current < 200) return;
    lastPaint.current = now;
    set((x) => (x ? { ...x, ...patch } : x));
  };

  /* ── Отправка ── */
  const failOut = useCallback((reason, tellPeer) => {
    const o = outRef.current;
    if (!o) return;
    Object.keys(timers.current).filter((k) => k.startsWith("o")).forEach(clearT);
    if (tellPeer) linkRef.current.emit("p2p.cancel", { id: o.id, to_device: o.to });
    close(o.pc); outRef.current = { ...o, pc: null, dc: null, done: true };
    setOut((x) => (x && x.id === o.id ? { ...x, phase: "failed", error: DIRECT_FAIL[reason] || DIRECT_FAIL.failed, reason } : x));
  }, []);

  const pump = async (o) => {
    const dc = o.dc, file = o.file;
    dc.bufferedAmountLowThreshold = LOW_WATER;
    dc.send(metaMsg(file));
    let sent = 0;
    setOut((x) => (x && x.id === o.id ? { ...x, phase: "sending", bytes: 0 } : x));
    const stall = () => { clearT("ostall"); timers.current.ostall = setTimeout(() => failOut("stall", true), STALL_MS); };
    stall();
    while (sent < file.size) {
      if (outRef.current?.id !== o.id || outRef.current.done || dc.readyState !== "open") return;
      if (dc.bufferedAmount > HIGH_WATER) {
        await new Promise((r) => { const on = () => { dc.removeEventListener("bufferedamountlow", on); r(); }; dc.addEventListener("bufferedamountlow", on); });
        continue;
      }
      // С диска — блоком по 1 МБ (чтение по 64 КБ тормозило всё), в канал — кусками по 64 КБ
      const block = new Uint8Array(await file.slice(sent, sent + READ_BLOCK).arrayBuffer());
      for (let off = 0; off < block.length; off += CHUNK) {
        if (dc.readyState !== "open") return;
        dc.send(block.subarray(off, Math.min(off + CHUNK, block.length)));
      }
      sent += block.length;
      stall();
      paint(setOut, { bytes: sent });
    }
    dc.send(JSON.stringify({ t: "end" }));
    paint(setOut, { bytes: sent }, true);
  };

  const send = useCallback(async (device, file) => {
    if (!enabled || outRef.current && !outRef.current.done) return false;
    const id = newId(), to = device.device_id;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel("nexa-file", { ordered: true });
    dc.binaryType = "arraybuffer";
    const o = { id, to, pc, dc, file };
    outRef.current = o;
    setOut({ id, to, toName: device.name, toType: device.type, file, phase: "asking", bytes: 0, total: file.size });
    dc.onopen = () => { clearT("oconn"); pump(o).catch(() => failOut("stall", true)); };
    dc.onmessage = (e) => {
      const m = parseCtl(e.data);
      if (m?.t === "ok") {
        Object.keys(timers.current).filter((k) => k.startsWith("o")).forEach(clearT);
        outRef.current = { ...o, done: true };
        setOut((x) => (x && x.id === id ? { ...x, phase: "done", bytes: file.size } : x));
        setTimeout(() => close(pc), 500);
      }
    };
    dc.onclose = () => { if (outRef.current?.id === id && !outRef.current.done) failOut("stall"); };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (outRef.current?.id !== id) return false;
      const ok = await linkRef.current.emit("p2p.offer", { id, to_device: to, name: String(file.name || "файл").slice(0, 255), size: file.size, mime: file.type || "", sdp: lanOnlySdp(pc.localDescription.sdp) });
      if (!ok) { failOut("failed"); return false; }
      timers.current.oask = setTimeout(() => failOut("noanswer", true), ASK_MS);
      return true;
    } catch {
      failOut("failed");
      return false;
    }
  }, [enabled, failOut]);

  const cancelOut = useCallback(() => failOut("cancel", true), [failOut]);
  const closeOut = useCallback(() => {
    const o = outRef.current;
    if (o && !o.done) failOut("cancel", true);
    outRef.current = null; setOut(null);
  }, [failOut]);

  /* ── Приём ── */
  const failInc = useCallback((reason, tellPeer) => {
    const i = incRef.current;
    if (!i) return;
    Object.keys(timers.current).filter((k) => k.startsWith("i")).forEach(clearT);
    if (tellPeer) linkRef.current.emit("p2p.cancel", { id: i.id, to_device: i.from });
    close(i.pc); incRef.current = { ...i, pc: null, chunks: null, done: true };
    setInc((x) => (x && x.id === i.id ? { ...x, phase: "failed", error: DIRECT_FAIL[reason] || DIRECT_FAIL.failed } : x));
  }, []);

  const accept = useCallback(async () => {
    const a = askRef.current;
    if (!a) return;
    askRef.current = null; setAsk(null); clearT("iask");
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const i = { id: a.id, from: a.from, pc, chunks: [], bytes: 0, size: a.size };
    incRef.current = i;
    setInc({ id: a.id, from: a.from, fromName: a.name, fromType: a.fromType, name: a.file, size: a.size, mime: a.mime, phase: "connecting", bytes: 0 });
    timers.current.iconn = setTimeout(() => failInc("connect", true), CONNECT_MS);
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dc.binaryType = "arraybuffer";
      const stall = () => { clearT("istall"); timers.current.istall = setTimeout(() => failInc("stall", true), STALL_MS); };
      dc.onopen = () => { clearT("iconn"); stall(); setInc((x) => (x && x.id === i.id ? { ...x, phase: "receiving" } : x)); };
      dc.onmessage = (e) => {
        const cur = incRef.current;
        if (!cur || cur.id !== i.id || cur.done) return;
        if (typeof e.data !== "string") {
          cur.chunks.push(e.data); cur.bytes += e.data.byteLength;
          if (cur.bytes > DIRECT_MAX || cur.bytes > i.size) { failInc("size", true); return; }
          stall(); paint(setInc, { bytes: cur.bytes });
          return;
        }
        const m = parseCtl(e.data);
        if (m?.t === "end") {
          clearT("istall");
          if (cur.bytes !== i.size) { failInc("size", true); return; }
          const blob = new Blob(cur.chunks, { type: a.mime || "" });
          incRef.current = { ...cur, chunks: null, done: true };
          try { dc.send(JSON.stringify({ t: "ok" })); } catch { /* отправитель уже ушёл — файл всё равно целый */ }
          setInc((x) => (x && x.id === i.id ? { ...x, phase: "done", bytes: i.size, blob } : x));
          setTimeout(() => close(pc), 800);
        }
      };
      dc.onclose = () => { if (incRef.current?.id === i.id && !incRef.current.done) failInc("stall"); };
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: a.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      if (incRef.current?.id !== i.id) return;
      await linkRef.current.emit("p2p.answer", { id: a.id, to_device: a.from, sdp: lanOnlySdp(pc.localDescription.sdp) });
    } catch {
      failInc("failed", true);
    }
  }, [failInc]);

  const reject = useCallback(() => {
    const a = askRef.current;
    if (!a) return;
    askRef.current = null; setAsk(null); clearT("iask");
    linkRef.current.emit("p2p.reject", { id: a.id, to_device: a.from, reason: "declined" });
  }, []);
  const cancelInc = useCallback(() => failInc("cancel", true), [failInc]);
  const closeInc = useCallback(() => {
    const i = incRef.current;
    if (i && !i.done) failInc("cancel", true);
    incRef.current = null; setInc(null);
  }, [failInc]);

  /* События канала. true — наше (обработано) */
  const handle = useCallback((event, p) => {
    if (!event.startsWith("p2p.")) return false;
    if (!enabled) return true;
    if (event === "p2p.offer") {
      // Уже принимаем или спрашиваем — «занято»
      if (askRef.current || (incRef.current && !incRef.current.done)) {
        linkRef.current.emit("p2p.reject", { id: p.id, to_device: p.from_device, reason: "busy" });
        return true;
      }
      const a = { id: p.id, from: p.from_device, name: p.from_name, file: p.name, size: p.size, mime: p.mime || "", sdp: p.sdp };
      askRef.current = a; setAsk(a);
      // Не ответили за время ожидания отправителя — молча убираем вопрос
      timers.current.iask = setTimeout(() => { if (askRef.current?.id === a.id) { askRef.current = null; setAsk(null); } }, ASK_MS);
      return true;
    }
    const o = outRef.current;
    if (event === "p2p.answer" && o && o.id === p.id && p.from_device === o.to && !o.done) {
      clearT("oask");
      setOut((x) => (x && x.id === o.id ? { ...x, phase: "connecting" } : x));
      timers.current.oconn = setTimeout(() => failOut("connect", true), CONNECT_MS);
      o.pc.setRemoteDescription({ type: "answer", sdp: p.sdp }).catch(() => failOut("failed", true));
      return true;
    }
    if (event === "p2p.reject" && o && o.id === p.id && p.from_device === o.to) { failOut(p.reason === "busy" ? "busy" : "declined"); return true; }
    if (event === "p2p.cancel") {
      if (o && o.id === p.id && p.from_device === o.to && !o.done) failOut("cancel");
      const i = incRef.current;
      if (i && i.id === p.id && p.from_device === i.from && !i.done) failInc("cancel");
      if (askRef.current?.id === p.id && askRef.current.from === p.from_device) { askRef.current = null; setAsk(null); clearT("iask"); }
    }
    return true;
  }, [enabled, failOut, failInc]);

  return { out, inc, ask, send, accept, reject, cancelOut, cancelInc, closeOut, closeInc, handle };
}
