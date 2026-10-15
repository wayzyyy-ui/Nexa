// Карта «Где устройство?» на Яндекс Картах (JS API v3) и результат поиска места
import { useRef, useState, useEffect } from "react";
import { isNative } from "../native.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { YMAPS_KEY, loadYmaps, ymapsTheme, yandexMapsUrl } from "../lib/ymaps.js";
import { btnReset, Spinner } from "./base.jsx";

// Круг точности: у JS API v3 нет готового круга — рисуем многоугольник из 64 точек.
// Координаты у Яндекса — [долгота, широта]
export function accuracyRing(lat, lon, meters) {
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    ring.push([
      lon + (meters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a),
      lat + (meters / 111320) * Math.sin(a),
    ]);
  }
  return ring;
}

export function LocateMap({ lat, lon, acc }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  // ready — карта на экране; loading — грузим; nokey / offline / error — заглушка
  const [state, setState] = useState(YMAPS_KEY ? "loading" : "nokey");
  const [attempt, setAttempt] = useState(0); // «Повторить» и возврат сети — новая попытка
  // Сеть вернулась — пробуем ещё раз сами
  useEffect(() => {
    if (state !== "offline" && state !== "error") return;
    const again = () => setAttempt((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [state]);
  // Карта создаётся заново только при новых координатах или новой попытке
  useEffect(() => {
    if (!YMAPS_KEY) return;
    if (navigator.onLine === false) { setState("offline"); return; }
    setState("loading");
    let off = false, map = null, ring = null, themeWatch = null;
    loadYmaps()
      // Один кадр — чтобы блок карты точно успел появиться (после заглушки при повторе)
      .then((ymaps3) => new Promise((r) => requestAnimationFrame(() => r(ymaps3))))
      .then((ymaps3) => {
      if (off || !ref.current) return;
      const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker, YMapFeature } = ymaps3;
      const css = () => getComputedStyle(document.documentElement);
      const ringStyle = () => {
        const mint = css().getPropertyValue("--mint").trim();
        return { fill: mint, fillOpacity: 0.12, stroke: [{ color: mint, width: 1 }] };
      };
      map = new YMap(ref.current, {
        location: { center: [lon, lat], zoom: acc > 2000 ? 12 : acc > 300 ? 15 : 17 },
        theme: ymapsTheme(),
        // Как раньше: колёсико не крутит масштаб (страница прокручивается), остальное — как обычно
        behaviors: ["drag", "pinchZoom", "dblClick"],
      });
      map.addChild(new YMapDefaultSchemeLayer({}));
      map.addChild(new YMapDefaultFeaturesLayer({})); // без этого слоя маркер и круг не видны
      ring = new YMapFeature({ geometry: { type: "Polygon", coordinates: [accuracyRing(lat, lon, Math.max(acc, 10))] }, style: ringStyle() });
      map.addChild(ring);
      // Точка устройства — свой элемент: синяя точка с обводкой, по центру координаты
      const dot = document.createElement("div");
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;box-sizing:border-box;transform:translate(-50%,-50%);background:${C.blue};border:2px solid ${C.blue}`;
      dot.setAttribute("aria-hidden", "true");
      map.addChild(new YMapMarker({ coordinates: [lon, lat] }, dot));
      mapRef.current = map;
      // Сменили тему NEXA — меняется и тема карты (и цвет круга)
      themeWatch = new MutationObserver(() => { map.update({ theme: ymapsTheme() }); ring.update({ style: ringStyle() }); });
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      setState("ready");
    }).catch(() => { if (!off) setState(navigator.onLine === false ? "offline" : "error"); });
    // Ушли с экрана или пришли новые координаты — карту уничтожаем целиком
    return () => { off = true; themeWatch?.disconnect(); mapRef.current = null; map?.destroy(); };
  }, [lat, lon, acc, attempt]);

  const zoomBy = (d) => {
    const map = mapRef.current;
    if (map) map.update({ location: { zoom: map.zoom + d, duration: 200 } });
  };
  const coords = `${lat.toFixed(6).replace(".", ",")}, ${lon.toFixed(6).replace(".", ",")}`;
  // Заглушка вместо пустого блока: почему нет карты, координаты текстом и ссылка
  if (state === "nokey" || state === "offline" || state === "error") {
    const why = { nokey: "Карта не настроена — нет ключа Яндекс Карт", offline: "Нет связи — карта загрузится, когда появится интернет", error: "Яндекс Карты не загрузились" }[state];
    return (
      <div className="nx-map nx-map-stub" role="status" style={{ marginTop: 10, minHeight: 160, boxSizing: "border-box", borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
        <div style={{ fontSize: 13, color: C.mutedSoft }}>{why}</div>
        <div style={{ fontSize: 15, color: C.text }}>{coords}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <a className="nx-ghost-btn" href={yandexMapsUrl(lat, lon)} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 13, color: C.text, textDecoration: "none", border: `1px solid ${C.borderStrong}` }}>
            {Icon.pin({ c: C.mint, s: 15 })} Открыть в Яндекс Картах
          </a>
          {state === "error" && (
            <button type="button" className="nx-ghost-btn" onClick={() => setAttempt((n) => n + 1)}
              style={{ ...btnReset, padding: "9px 14px", fontSize: 13, color: C.text, border: `1px solid ${C.borderStrong}` }}>
              Повторить
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="nx-map" data-no-swipe role="region" aria-label="Карта: где устройство" style={{ position: "relative", height: 220, marginTop: 10, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {state === "loading" && (
        <div role="status" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: C.muted }}>
          <Spinner s={12} /> Загружаем карту…
        </div>
      )}
      {/* «+ / −» — сверху справа: логотип и ссылки Яндекса внизу карты остаются открытыми */}
      {state === "ready" && (
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 6, zIndex: 1 }}>
          {[["+", 1, "Приблизить"], ["−", -1, "Отдалить"]].map(([t, d, label]) => (
            <button key={t} type="button" className="nx-icon-btn" onClick={() => zoomBy(d)} aria-label={label} title={label}
              style={{ ...btnReset, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1, color: C.text, background: C.panel, border: `1px solid ${C.borderStrong}` }}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Ответ на «Где устройство?»: карта, точность, когда определено, «Открыть в картах»
export function LocateResult({ r }) {
  if (!r) return null;
  if (r.state === "asking") return <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginTop: 10 }}><Spinner s={11} /> Спрашиваем устройство…</div>;
  if (r.state !== "ok") return (
    <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 10, lineHeight: 1.45 }}>
      {{ off: "На устройстве не разрешено показывать местоположение — включите это в его Настройках → «Поиск этого устройства»",
         denied: "Устройству не дали доступ к геолокации — разрешите его в настройках телефона или браузера",
         error: "Устройство не смогло определить место — нет сигнала GPS или сети",
         timeout: "Устройство не ответило — возможно, NEXA на нём закрыта" }[r.state]}
    </div>
  );
  const when = new Date(r.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const acc = r.acc < 1000 ? `±${Math.round(r.acc)} м` : `±${(r.acc / 1000).toFixed(1).replace(".", ",")} км`;
  const url = yandexMapsUrl(r.lat, r.lon);
  return (
    <div style={{ marginTop: 6 }}>
      <LocateMap lat={r.lat} lon={r.lon} acc={r.acc} />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", marginTop: 8, fontSize: 13, color: C.muted }}>
        <span>Определено в {when} · точность {acc}</span>
        <a href={isNative ? `geo:${r.lat},${r.lon}?q=${r.lat},${r.lon}` : url} target="_blank" rel="noopener noreferrer" style={{ color: C.mint }}>Открыть в картах</a>
      </div>
    </div>
  );
}
