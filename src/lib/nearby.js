/* «Рядом» — файл на соседний телефон без интернета, как AirDrop (только Android-приложение).
   Нативная часть — NexaNearbyPlugin.java (Google Nearby Connections: Bluetooth / прямой Wi-Fi),
   вызовы — nearby / onNearby / nearbyStage в src/native.js. Здесь — ход и тексты, без интерфейса
   (окна — src/ui/nearby.jsx, плашка хода — DropBanner).
   Получатель включает «Принимать рядом» на NEARBY_RECV_MS (и только пока NEXA на экране —
   в фоне модуль сам выключается); каждый входящий файл человек принимает сам, сверив код.
   Отправитель выбирает файл → видит телефоны рядом → нажимает → ждёт «Принять» → передача.
   Аккаунт и облако не нужны: принимать можно и от чужого телефона — поэтому без «Принять»
   ничего не приходит, а видно телефон только по явному включению. */
import { useEffect, useRef, useState } from "react";
import { nearby, onNearby, nearbyStage, nearbySupported } from "../native.js";

import { nearbyFailText, NEARBY_RECV_MS, NEARBY_FILE_MAX } from "./nearbyText.js";
export { nearbyFailText, leftText, NEARBY_RECV_MS, NEARBY_FILE_MAX } from "./nearbyText.js";

const reasonOf = (e) => (["unsupported", "permission", "services"].includes(e?.code) ? e.code : "start_failed");

/* Ход «Рядом». name — как этот телефон видят другие; onReceived(e) — файл пришёл целиком
   ({ id, name, size, mime, from }); onIncoming(e) — кто-то хочет передать (ask уже показан) */
export function useNearby({ name, onReceived, onIncoming }) {
  const [recv, setRecv] = useState({ on: false, until: 0, error: null });
  const [peers, setPeers] = useState([]);  // найденные телефоны: [{ endpointId, name }]
  const [send, setSend] = useState(null);  // { file, token, phase, target, targetName, digits, bytes, total, error }
  const [ask, setAsk] = useState(null);    // входящий запрос: { endpointId, name, file, size, digits }
  const [inc, setInc] = useState(null);    // входящая передача: { endpointId, from, file, size, bytes, total, phase, id, mime }
  const st = useRef({}); st.current = { recv, send, inc, ask, name };
  const cb = useRef({}); cb.current = { onReceived, onIncoming };

  // Разрешение и сервисы Google — перед первым включением
  const ensure = async () => {
    const s = await nearby("status");
    if (!s.available) throw Object.assign(new Error("services"), { code: "services" });
    if (s.permission === "granted") return;
    const r = await nearby("requestPermission");
    if (r.permission !== "granted") throw Object.assign(new Error("permission"), { code: "permission" });
  };

  // События модуля — подписка один раз
  useEffect(() => {
    if (!nearbySupported) return;
    const offs = [
      onNearby("found", (e) => setPeers((l) => (l.some((p) => p.endpointId === e.endpointId) ? l : [...l, { endpointId: e.endpointId, name: e.name || "Телефон" }]))),
      onNearby("lost", (e) => {
        setPeers((l) => l.filter((p) => p.endpointId !== e.endpointId));
        setSend((s) => (s && s.target === e.endpointId && s.phase === "connecting" ? { ...s, phase: "failed", error: nearbyFailText("lost") } : s));
      }),
      onNearby("request", (e) => {
        // Не принимаем — сразу отказываем (телефон мог остаться видимым на долю секунды)
        if (!st.current.recv.on || st.current.inc?.phase === "receiving") { nearby("reject", { endpointId: e.endpointId }).catch(() => {}); return; }
        if (e.tooBig) return;
        setAsk({ endpointId: e.endpointId, name: e.name || "Телефон", file: e.file || "Файл", size: e.size || 0, digits: e.digits || "" });
        cb.current.onIncoming?.(e);
      }),
      onNearby("waiting", (e) => setSend((s) => (s && s.target === e.endpointId ? { ...s, phase: "waiting", digits: e.digits || "" } : s))),
      onNearby("progress", (e) => {
        if (e.incoming) setInc((x) => (x && x.endpointId === e.endpointId ? { ...x, phase: "receiving", bytes: e.bytes, total: e.total || x.size } : x));
        else setSend((s) => (s && s.target === e.endpointId ? { ...s, phase: "sending", bytes: e.bytes, total: e.total || s.file.size } : s));
      }),
      onNearby("sent", (e) => {
        setSend((s) => (s && s.target === e.endpointId ? { ...s, phase: "done", bytes: s.total || s.file.size, token: null } : s));
        nearby("stopDiscover").catch(() => {});
      }),
      onNearby("received", (e) => {
        setInc((x) => ({ ...(x || {}), endpointId: e.endpointId, from: e.from || x?.from || "Телефон", file: e.name, size: e.size, mime: e.mime, id: e.id, phase: "done", bytes: e.size, total: e.size }));
        cb.current.onReceived?.(e);
      }),
      onNearby("failed", (e) => {
        setSend((s) => (s && s.target === e.endpointId && s.phase !== "done" ? { ...s, phase: "failed", error: nearbyFailText(e.reason) } : s));
        setInc((x) => (x && x.endpointId === e.endpointId && x.phase !== "done" ? { ...x, phase: "failed", error: nearbyFailText(e.reason) } : x));
        setAsk((a) => (a && a.endpointId === e.endpointId ? null : a));
      }),
      onNearby("disconnected", (e) => {
        setSend((s) => (s && s.target === e.endpointId && ["connecting", "waiting", "sending"].includes(s.phase) ? { ...s, phase: "failed", error: nearbyFailText(s.phase === "sending" ? "transfer" : "connect") } : s));
        setInc((x) => (x && x.endpointId === e.endpointId && x.phase === "receiving" ? { ...x, phase: "failed", error: nearbyFailText("transfer") } : x));
        setAsk((a) => (a && a.endpointId === e.endpointId ? null : a));
      }),
      // NEXA ушла в фон — модуль перестал быть видимым и искать
      onNearby("stopped", () => setRecv((r) => (r.on ? { on: false, until: 0, error: null } : r))),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // В фоне модуль перестаёт искать (NexaNearbyPlugin.handleOnPause) — вернулись во время поиска, ищем снова
  useEffect(() => {
    if (!nearbySupported) return;
    const back = () => { if (document.visibilityState === "visible" && st.current.send?.phase === "search") nearby("discover").catch(() => {}); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);

  // Видимость — не дольше NEARBY_RECV_MS
  useEffect(() => {
    if (!recv.on) return;
    const t = setTimeout(() => { nearby("stopAdvertise").catch(() => {}); setRecv({ on: false, until: 0, error: null }); }, Math.max(0, recv.until - Date.now()));
    return () => clearTimeout(t);
  }, [recv.on, recv.until]);

  const startRecv = async () => {
    try {
      await ensure();
      await nearby("advertise", { name: st.current.name || "Телефон" });
      setRecv({ on: true, until: Date.now() + NEARBY_RECV_MS, error: null });
      return true;
    } catch (e) { setRecv({ on: false, until: 0, error: nearbyFailText(reasonOf(e)) }); return false; }
  };
  const stopRecv = () => { nearby("stopAdvertise").catch(() => {}); setRecv({ on: false, until: 0, error: null }); };

  // Выбрали файл: кладём во временный файл модуля и начинаем искать соседей
  const beginSend = async (file) => {
    const old = st.current.send;
    if (old?.token) nearby("stageDrop", { token: old.token }).catch(() => {});
    if (file.size > NEARBY_FILE_MAX) { setSend({ file, phase: "failed", error: nearbyFailText("too_big") }); return; }
    setPeers([]);
    setSend({ file, phase: "preparing", bytes: 0, total: file.size });
    try {
      await ensure();
      const token = await nearbyStage(file);
      setSend((s) => (s && s.file === file ? { ...s, token, phase: "search" } : s));
      await nearby("discover");
    } catch (e) {
      setSend((s) => (s && s.file === file ? { ...s, phase: "failed", error: nearbyFailText(reasonOf(e)) } : s));
    }
  };
  const pick = async (peer) => {
    const s = st.current.send;
    if (!s?.token) return;
    setSend({ ...s, phase: "connecting", target: peer.endpointId, targetName: peer.name, digits: "", error: null });
    try {
      await nearby("connect", { endpointId: peer.endpointId, token: s.token, name: st.current.name || "Телефон", file: s.file.name, mime: s.file.type || "" });
    } catch {
      setSend((x) => (x && x.target === peer.endpointId ? { ...x, phase: "failed", error: nearbyFailText("connect") } : x));
    }
  };
  // Закрыли / отменили отправку: рвём соединение, убираем временный файл, перестаём искать
  const cancelSend = () => {
    const s = st.current.send;
    if (s?.target && !["done", "failed"].includes(s.phase)) nearby("cancel", { endpointId: s.target }).catch(() => {});
    if (s?.token) nearby("stageDrop", { token: s.token }).catch(() => {});
    nearby("stopDiscover").catch(() => {});
    setPeers([]);
    setSend(null);
  };
  // Ещё раз тому же телефону / выбрать другой — файл уже подготовлен, если не ушёл
  const retrySend = () => {
    const s = st.current.send;
    if (!s) return;
    if (s.token) { setSend({ ...s, phase: "search", target: null, error: null }); nearby("discover").catch(() => {}); }
    else beginSend(s.file);
  };

  const acceptAsk = async () => {
    const a = st.current.ask;
    if (!a) return;
    setAsk(null);
    setInc({ endpointId: a.endpointId, from: a.name, file: a.file, size: a.size, bytes: 0, total: a.size, phase: "receiving" });
    try { await nearby("accept", { endpointId: a.endpointId }); }
    catch { setInc((x) => (x && x.endpointId === a.endpointId ? { ...x, phase: "failed", error: nearbyFailText("connect") } : x)); }
  };
  const rejectAsk = () => {
    const a = st.current.ask;
    if (!a) return;
    setAsk(null);
    nearby("reject", { endpointId: a.endpointId }).catch(() => {});
  };
  const cancelInc = () => {
    const x = st.current.inc;
    if (x?.phase === "receiving") nearby("cancel", { endpointId: x.endpointId }).catch(() => {});
    setInc(null);
  };

  return { supported: nearbySupported, recv, peers, send, ask, inc, startRecv, stopRecv, beginSend, pick, cancelSend, retrySend, acceptAsk, rejectAsk, cancelInc, closeInc: () => setInc(null) };
}
