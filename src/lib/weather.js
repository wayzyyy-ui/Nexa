// Погода (только через наш /api/weather) и место пользователя: геолокация, Яндекс, IP, название города.
// Общие данные экрана «Сегодня» — TODAY (их читает и ассистент)
import { useState, useEffect, useRef } from "react";
import { API_BASE, widgetsSetCity } from "../native.js";
import { YMAPS_KEY, loadYmaps } from "./ymaps.js";

/* ---------- ПОГОДА: только через наш сервер /api/weather ----------
   Источник — Gismeteo (токен только на сервере), резерв — Open-Meteo; что пришло —
   видно по полю source, подпись источника обязательна (WeatherAttribution).
   Место определяется на устройстве (геолокация → IP → Казань по умолчанию, или город, выбранный
   поиском) — см. useLocation ниже; серверу уходят координаты, округлённые до 0,1° (~10 км),
   чтобы соседние запросы попадали в общий кеш. Последний удачный ответ по месту лежит
   в браузере (nexa-weather:<место>) — без сети показываем его с пометкой.
   Выдуманных цифр нет: пока данных нет — «—» под вуалью */
export const WEATHER_API = `${API_BASE}/api/weather`;

export const WEATHER_REFRESH_MS = 15 * 60 * 1000; // сервер всё равно отдаёт кеш (час) — лимит Gismeteo не тратится

export const WEATHER_TIMEOUT_MS = 10000;          // дольше 10 секунд ответа не ждём

export const WEATHER_SAVED_KEY = "nexa-weather:"; // + место ("kazan" или "55.8,49.1") → { json, at } — последний удачный ответ

// Понятная причина, почему погода не загрузилась (для строки под карточкой)
export function weatherErrorText(err, timedOut) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "нет интернета";
  if (timedOut) return "сервер погоды не ответил";
  if (err instanceof TypeError) return "нет связи с сервером погоды";
  return err.message || "неизвестная ошибка";
}

/* Состояние погоды (cond из api/weather): sun | partly | cloud | overcast | rain | snow | sleet | storm | fog.
   Значок в нашем стиле: тонкие линии и «облако»-грань (параллелограмм).
   Солнце — мятное, облака — серые грани, осадки — мятные штрихи/точки */
export function weatherKind(cond) {
  if (cond === "sun") return "sun";
  if (cond === "partly") return "partly";
  if (cond === "fog") return "fog";
  if (cond === "snow") return "snow";
  if (cond === "storm") return "storm";
  if (cond === "rain" || cond === "sleet") return "rain";
  return "cloud";
}

// Дата для карточки: «7 октября 2026»
export function formatWeatherDate(date) {
  const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  // Год берём отдельной частью: иначе некоторые браузеры допишут «г.»
  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric" })
    .formatToParts(date).find((p) => p.type === "year").value;
  return `${dayMonth} ${year}`;
}

// "2026-10-07" из ответа → дата. Берём полдень по UTC, чтобы день точно не съехал
export const dayFromIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

// Ответ /api/weather → вид экрана. Сегодня — первый день, завтра — второй
export function parseApiWeather(j) {
  if (!j || !j.now || !Array.isArray(j.days) || !j.days.length) throw new Error("неполный ответ погоды");
  const days = j.days.map((d) => ({ date: dayFromIso(d.date), max: d.max, min: d.min, cond: d.cond, text: d.text }));
  const t = days[1] || null;
  return {
    now: { ...j.now, date: days[0].date, min: days[0].min, max: days[0].max },
    tomorrow: t && { temp: t.max, min: t.min, cond: t.cond, text: t.text, date: t.date },
    days,
    source: j.source, stale: !!j.stale, attribution: j.attribution,
    dataTime: j.time ? Date.parse(j.time) : null,
  };
}

// Подпись дня в прогнозе: «Сегодня», «Завтра» или «Пт, 9 окт.»
export function forecastDayLabel(date, index) {
  if (index === 0) return "Сегодня";
  if (index === 1) return "Завтра";
  const s = date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Общие данные экрана «Сегодня»: расписание, город и последняя погода.
   Ими пользуются и экран «Сегодня», и ассистент (сводка «что у меня сегодня») */
/* ---------- МЕСТОПОЛОЖЕНИЕ ----------
   Определяем город двумя способами одновременно:
   1) геолокация браузера — точные координаты, но браузер спросит разрешение;
   2) ipapi.co — примерно по IP-адресу, без разрешений.
   Приоритет у геолокации: ответ по IP ставим не раньше чем через 1,5 секунды,
   чтобы геолокация успела «победить». Пока ничего не пришло — Казань. */
// Пока город не определён — Казань (погода для неё — ?city=kazan у нашего сервера)
export const DEFAULT_LOCATION = { city: "Казань", lat: 55.8, lon: 49.1, source: "default" };

export const CITY_KEY = "nexa-city"; // город, выбранный вручную

export const readManualCity = () => {
  try { const v = JSON.parse(localStorage.getItem(CITY_KEY)); if (v && v.city && v.lat != null) return { ...v, source: "manual" }; } catch {}
  return null;
};

export const TODAY = {
  schedule: [],
  city: DEFAULT_LOCATION.city, place: null, // place — см. weatherPlace
  weather: null, weatherAt: 0,
};

// Место для запроса погоды: по умолчанию — Казань по названию, иначе координаты до 0,1°
export const round1 = (n) => Math.round(n * 10) / 10;

export function weatherPlace(loc) {
  if (!loc || loc.source === "default") return { key: "kazan", q: "city=kazan" };
  const la = round1(loc.lat), lo = round1(loc.lon);
  return { key: `${la},${lo}`, q: `lat=${la}&lon=${lo}` };
}

export const readSavedWeather = (id) => {
  try { const v = JSON.parse(localStorage.getItem(WEATHER_SAVED_KEY + id)); if (v && v.json && v.at) return v; } catch {}
  return null;
};

export const keepWeather = (id, json) => { try { localStorage.setItem(WEATHER_SAVED_KEY + id, JSON.stringify({ json, at: Date.now() })); } catch {} };

// Загрузить погоду места с нашего сервера; удачный ответ — запомнить в браузере
export async function fetchWeather(place, signal) {
  const res = await fetch(`${WEATHER_API}?${place.q}`, { signal });
  if (!res.ok) throw new Error(res.status === 400 ? "место не распознано" : res.status === 503 ? "сервис погоды недоступен" : `ответ сервера ${res.status}`);
  const json = await res.json();
  const w = parseApiWeather(json);
  keepWeather(place.key, json);
  return w;
}

// Погода для сводки: свежая из TODAY, а если её нет — загружаем сами
// (ждём не дольше 5 секунд). Не вышло — сохранённая или null
export async function getTodayWeather() {
  if (TODAY.weather && Date.now() - TODAY.weatherAt < WEATHER_REFRESH_MS * 2) return TODAY.weather;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    TODAY.weather = await fetchWeather(TODAY.place || weatherPlace(null), ctrl.signal);
    TODAY.weatherAt = Date.now();
    return TODAY.weather;
  } catch {
    if (TODAY.weather) return TODAY.weather;
    const saved = readSavedWeather((TODAY.place || weatherPlace(null)).key);
    try { return saved ? parseApiWeather(saved.json) : null; } catch { return null; }
  } finally {
    clearTimeout(timer);
  }
}

export const GEO_TIMEOUT_MS = 6000;        // дольше 6 секунд геолокацию не ждём

export const GEO_CACHE_MS = 10 * 60 * 1000; // браузер может отдать координаты из кэша за 10 минут

export const IP_GRACE_MS = 1500;           // столько ждём геолокацию, прежде чем поставить город по IP

export const CITY_LOOKUP_MS = 3000;        // дольше 3 секунд название города не ждём

// Подпись под городом на карточке погоды: откуда взялось местоположение
export const LOCATION_SOURCE_TEXT = {
  geo: "определено точно",
  ip: "примерно по IP",
  default: "по умолчанию",
  manual: "выбран вами",
};

/* Местоположение по IP: пробуем несколько бесплатных сервисов по очереди
   (у каждого бывают лимиты и блокировки). Ответ — { lat, lon } или null.
   С VPN по IP определится город сервера VPN — для точности есть геолокация
   и ручной выбор города */
export const IP_SERVICES = [
  ["https://ipapi.co/json/", (d) => !d.error && [d.latitude, d.longitude]],
  ["https://ipwho.is/", (d) => d.success !== false && [d.latitude, d.longitude]],
  ["https://get.geojs.io/v1/ip/geo.json", (d) => [parseFloat(d.latitude), parseFloat(d.longitude)]],
];

export const IP_SERVICE_MS = 4000; // один сервис ждём не дольше 4 секунд — потом следующий

export let ipFailedAt = 0;          // все сервисы не ответили — 10 минут не спрашиваем снова

/* Место и город силами Яндекса (JS API v3, тот же скрипт, что у карты; ключ VITE_YANDEX_MAPS_KEY).
   ymaps3.geolocation.getPosition() — { coords: [долгота, широта], accuracy }: по описанию Яндекса
   берёт место из браузера и/или по IP (своя база адресов, по России обычно точнее сторонних).
   ymaps3.search({ text: "долгота,широта", type: ["toponyms"] }) — название места; поиску нужен
   отдельный ключ VITE_YANDEX_SEARCH_KEY (setApikeys({ search })). Нет ключей или Яндекс молчит —
   прежние сервисы (ipapi, ipwho, geojs; BigDataCloud, Nominatim) */
export const YMAPS_SEARCH_KEY = import.meta.env.VITE_YANDEX_SEARCH_KEY || "";

export const YANDEX_LOC_MS = 7000; // первый раз скрипт карт ещё грузится — ждём дольше

export const withLimit = (promise, ms) => Promise.race([promise.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

export async function yandexLocation() {
  if (!YMAPS_KEY) return null;
  const ymaps3 = await withLimit(loadYmaps(), YANDEX_LOC_MS);
  if (!ymaps3 || !ymaps3.geolocation) return null;
  const r = await withLimit(ymaps3.geolocation.getPosition(), YANDEX_LOC_MS);
  const c = r && r.coords;
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return { lat: c[1], lon: c[0] };
}

// Город из найденного объекта: у самого города в описании — регион и страна («Республика Татарстан,
// Россия»), у улицы или дома — город первым («Казань, Россия»)
export const REGION_RE = /област|республик|край|округ|район|росси|автоном/i;

export function cityFromFeature(p) {
  const name = String(p.name || "").trim();
  const parts = String(p.description || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length || REGION_RE.test(parts[0])) return name || null;
  return parts[0];
}

export async function yandexCityName(lat, lon) {
  if (!YMAPS_KEY || !YMAPS_SEARCH_KEY) return null;
  const ymaps3 = await withLimit(loadYmaps(), YANDEX_LOC_MS);
  if (!ymaps3 || !ymaps3.search) return null;
  try { ymaps3.getDefaultConfig().setApikeys({ search: YMAPS_SEARCH_KEY }); } catch { return null; }
  const res = await withLimit(ymaps3.search({ text: `${lon},${lat}`, type: ["toponyms"], limit: 1 }), YANDEX_LOC_MS);
  const p = Array.isArray(res) && res[0] && res[0].properties;
  return p ? cityFromFeature(p) : null;
}

export async function ipLocation(signal) {
  // Сначала Яндекс (если есть ключ карт), потом прежние сервисы по очереди
  const ya = await yandexLocation().catch(() => null);
  if (ya || signal?.aborted) return ya;
  if (Date.now() - ipFailedAt < 10 * 60 * 1000) return null;
  for (const [url, pick] of IP_SERVICES) {
    // Свой «стоп» на каждый сервис: зависший сервис не держит очередь
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    const timer = setTimeout(stop, IP_SERVICE_MS);
    signal?.addEventListener("abort", stop);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) continue;
      const ll = pick(await res.json());
      if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) return { lat: ll[0], lon: ll[1] };
    } catch {
      if (signal?.aborted) return null; // экран закрыли — дальше не спрашиваем
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  }
  if (!signal?.aborted) ipFailedAt = Date.now();
  return null;
}

/* Поиск города по названию (Open-Meteo, без ключа). До 6 вариантов:
   { city, region, lat, lon } — регион, чтобы различать одинаковые названия */
export async function searchCities(q, signal) {
  const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=ru&format=json&name=" + encodeURIComponent(q), { signal });
  if (!res.ok) throw new Error("ответ сервера " + res.status);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    city: r.name, region: [r.admin1, r.country].filter(Boolean).join(", "),
    lat: round2(r.latitude), lon: round2(r.longitude),
  }))
    // Одинаковые «город + регион» (город и одноимённый район) показываем один раз
    .filter((c, i, all) => all.findIndex((x) => x.city === c.city && x.region === c.region) === i);
}

// Геолокация браузера в виде промиса. Если браузер её не умеет
// (старый браузер или сайт открыт не по HTTPS) — сразу «отказ»
export function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("геолокация недоступна"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: GEO_TIMEOUT_MS,
      maximumAge: GEO_CACHE_MS,
    });
  });
}

// Название города по координатам, по-русски (BigDataCloud, без ключа).
// Берём city, а если его нет — locality. Не дождались или ошибка — null
// Запрос с ограничением по времени: не ответил за CITY_LOOKUP_MS — считаем, что не вышло
export function withTimeout(promise) {
  const giveUp = new Promise((resolve) => setTimeout(() => resolve(null), CITY_LOOKUP_MS));
  return Promise.race([promise.catch(() => null), giveUp]);
}

// Крупные города — запасной вариант, если ни один сервис не назвал город.
// Работает даже без интернета: просто ищем ближайший по координатам
export const KNOWN_CITIES = [
  ["Москва", 55.76, 37.62], ["Санкт-Петербург", 59.94, 30.31], ["Казань", 55.79, 49.11],
  ["Нижний Новгород", 56.33, 44.0], ["Екатеринбург", 56.84, 60.61], ["Новосибирск", 55.03, 82.92],
  ["Самара", 53.2, 50.15], ["Уфа", 54.74, 55.97], ["Челябинск", 55.16, 61.4],
  ["Пермь", 58.01, 56.25], ["Ростов-на-Дону", 47.24, 39.71], ["Краснодар", 45.04, 38.98],
  ["Воронеж", 51.66, 39.2], ["Волгоград", 48.71, 44.51], ["Омск", 54.99, 73.37],
  ["Красноярск", 56.01, 92.85], ["Набережные Челны", 55.74, 52.4], ["Ижевск", 56.85, 53.2],
  ["Ульяновск", 54.31, 48.4], ["Чебоксары", 56.14, 47.25], ["Йошкар-Ола", 56.63, 47.89],
];

export function nearestKnownCity(lat, lon) {
  // Расстояние в км по формуле для небольших расстояний — точности хватает
  const km = ([, la, lo]) => {
    const dx = (lo - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    const dy = (la - lat) * 111;
    return Math.hypot(dx, dy);
  };
  const best = KNOWN_CITIES.reduce((a, b) => (km(b) < km(a) ? b : a));
  // Ближе 60 км — это тот самый город; дальше — честно пишем «рядом с»
  return km(best) < 60 ? best[0] : `Рядом с г. ${best[0]}`;
}

// Название города по координатам, по-русски. Пробуем по очереди:
// 0) поиск Яндекса (если есть ключи), 1) BigDataCloud (city или locality), 2) OpenStreetMap (Nominatim),
// 3) ближайший крупный город из списка выше. Пустым не бывает никогда
export async function cityByCoords(lat, lon, signal) {
  const ya = await yandexCityName(lat, lon).catch(() => null);
  if (ya) return ya;
  const bdc = await withTimeout(
    fetch("https://api.bigdatacloud.net/data/reverse-geocode-client" +
      `?latitude=${lat}&longitude=${lon}&localityLanguage=ru`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && (data.city || data.locality)) || null)
  );
  if (bdc) return bdc;

  const osm = await withTimeout(
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=ru" +
      `&lat=${lat}&lon=${lon}`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const a = data && data.address;
        return (a && (a.city || a.town || a.village || a.municipality)) || null;
      })
  );
  if (osm) return osm;

  return nearestKnownCity(lat, lon);
}

// Координаты округляем до сотых (≈1 км): для погоды точнее не нужно
export const round2 = (n) => Math.round(n * 100) / 100;

/* Хук местоположения. Возвращает { city, lat, lon, source },
   source — "geo" (геолокация), "ip" (по IP) или "default" (Казань). */
/* Память на время работы страницы: экран «Сегодня» открывают много раз,
   а город и погода за пару минут не меняются. Без неё каждый заход
   заново спрашивал IP-сервис и сервис погоды */
export const AUTO_LOC_TTL = 30 * 60 * 1000; // город, определённый автоматически, — 30 минут

export let autoLocMemo = null;              // { loc, at }

export const freshAutoLoc = () => (autoLocMemo && Date.now() - autoLocMemo.at < AUTO_LOC_TTL ? autoLocMemo.loc : null);

export function useLocation() {
  // Город, выбранный вручную, важнее автоматики
  const [manual, setManual] = useState(readManualCity);
  const [loc, setLocState] = useState(() => freshAutoLoc() || DEFAULT_LOCATION);
  // Найденный автоматически город запоминаем (см. autoLocMemo)
  const setLoc = (l) => {
    if (l && (l.source === "ip" || l.source === "geo")) autoLocMemo = { loc: l, at: Date.now() };
    setLocState(l);
  };

  useEffect(() => {
    if (manual) return; // выбран вручную — ничего не определяем
    // Уже определили недавно точно (геолокация) — не спрашиваем снова.
    // По IP — показываем сразу, но геолокацию всё равно пробуем: она точнее
    const memo = freshAutoLoc();
    if (memo?.source === "geo") return;
    let cancelled = false;   // экран закрыли — больше ничего не обновляем
    let geoWon = false;      // геолокация сработала — ответ по IP больше не нужен
    let graceOver = false;   // прошли ли 1,5 секунды ожидания геолокации
    let ipLoc = null;        // готовый ответ по IP, если уже пришёл
    const ctrl = new AbortController(); // чтобы оборвать запросы при закрытии

    // Ставим город по IP, только если: он уже пришёл, 1,5 секунды прошли
    // и геолокация не успела победить
    const applyIp = () => {
      if (!cancelled && !geoWon && graceOver && ipLoc) setLoc(ipLoc);
    };
    const graceTimer = setTimeout(() => { graceOver = true; applyIp(); }, IP_GRACE_MS);

    // Способ 1: по IP (несколько сервисов по очереди). Название города
    // переспрашиваем по координатам — так оно по-русски
    // Город по IP уже запомнен — второй раз IP-сервис не спрашиваем
    (memo ? Promise.resolve(null) : ipLocation(ctrl.signal))
      .then(async (ll) => {
        if (!ll) return;
        const lat = round2(ll.lat);
        const lon = round2(ll.lon);
        const city = await cityByCoords(lat, lon, ctrl.signal);
        ipLoc = { city, lat, lon, source: "ip" };
        applyIp();
      })
      .catch(() => { /* тихо: остаётся следующий по приоритету вариант */ });

    // Способ 2: геолокация браузера. Если пользователь отказал или
    // браузер не ответил за 6 секунд — тихо, остаётся IP или Казань
    getBrowserPosition()
      .then(async (pos) => {
        if (cancelled) return;
        geoWon = true; // с этого момента ответ по IP игнорируем
        const lat = round2(pos.coords.latitude);
        const lon = round2(pos.coords.longitude);
        const city = await cityByCoords(lat, lon, ctrl.signal);
        if (!cancelled) setLoc({ city, lat, lon, source: "geo" });
      })
      .catch(() => { /* отказ или нет геолокации — без ошибок и всплывашек */ });

    return () => {
      cancelled = true;
      clearTimeout(graceTimer);
      ctrl.abort();
    };
  }, [manual]);

  // Выбрать город вручную (null — снова определять автоматически)
  const pick = (c) => {
    try {
      if (c) localStorage.setItem(CITY_KEY, JSON.stringify({ city: c.city, lat: c.lat, lon: c.lon }));
      else localStorage.removeItem(CITY_KEY);
    } catch {}
    widgetsSetCity(c); // виджет погоды на рабочем столе (только в приложении)
    if (!c) setLoc(DEFAULT_LOCATION);
    setManual(c ? { city: c.city, lat: c.lat, lon: c.lon, source: "manual" } : null);
  };

  return { ...(manual || loc), pick };
}

/* Хук погоды. Возвращает { loading, error, now, tomorrow, days, source, stale, offline, updatedAt, refetch }.
   Сразу показывает последний сохранённый ответ (если есть), потом обновляет.
   Не вышло (нет сети) — остаются сохранённые данные с пометкой offline.
   Незаконченный запрос отменяется при новом и при закрытии экрана */
export const weatherMemo = new Map(); // id города → { at, data } — на время работы страницы

export function useWeather(place) {
  const cityId = place.key; // ключ места: кеш, сохранённое, перезапуск при смене
  const memoOf = (k) => { const m = weatherMemo.get(k); return m && Date.now() - m.at < WEATHER_REFRESH_MS ? m : null; };
  const initial = (k) => {
    const m = memoOf(k);
    if (m) return { loading: false, error: null, offline: false, updatedAt: m.at, ...m.data };
    const saved = readSavedWeather(k);
    if (saved) { try { return { loading: true, error: null, offline: false, updatedAt: saved.at, ...parseApiWeather(saved.json) }; } catch {} }
    return { loading: true, error: null, offline: false, now: null, tomorrow: null, days: null, updatedAt: null };
  };
  const [state, setState] = useState(() => initial(cityId));
  const ctrlRef = useRef(null);

  const load = () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, WEATHER_TIMEOUT_MS);
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchWeather(place, ctrl.signal)
      .then((w) => {
        TODAY.weather = w; // заодно для ассистента
        TODAY.weatherAt = Date.now();
        weatherMemo.set(cityId, { at: Date.now(), data: w });
        setState({ loading: false, error: null, offline: false, updatedAt: Date.now(), ...w });
      })
      .catch((err) => {
        if (err.name === "AbortError" && !timedOut) return; // отменили сами — не ошибка
        // Есть сохранённые данные — показываем их с пометкой «нет связи»
        setState((s) => ({ ...s, loading: false, error: weatherErrorText(err, timedOut), offline: !!s.now }));
      })
      .finally(() => clearTimeout(timer));
  };

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    // Сменили город — сразу то, что есть по нему (память/сохранённое), и загрузка
    setState(initial(cityId));
    const m = memoOf(cityId);
    let id = 0;
    const first = setTimeout(() => {
      loadRef.current();
      id = setInterval(() => loadRef.current(), WEATHER_REFRESH_MS);
    }, m ? WEATHER_REFRESH_MS - (Date.now() - m.at) : 0);
    // Потянули экран вниз в приложении (событие "nexa-refresh") и вернулась сеть — тоже обновляем
    const again = () => loadRef.current();
    window.addEventListener("nexa-refresh", again);
    window.addEventListener("online", again);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("nexa-refresh", again);
      window.removeEventListener("online", again);
      ctrlRef.current?.abort();
    };
  }, [cityId]);

  return { ...state, refetch: load };
}
