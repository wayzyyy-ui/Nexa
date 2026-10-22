import { allow, clientKey } from './_lib/rate-limit.js';

/* Погода для NEXA (сайт, приложение, виджет Android) — только через этот адрес.
   GET /api/weather?city=kazan          — город из списка CITIES (Казань по умолчанию, Москва)
   GET /api/weather?lat=55.8&lon=49.1   — место, определённое на устройстве (геолокация, IP, поиск).
     Координаты сервер округляет до 0,1° (~10 км): соседние запросы одного города попадают
     в один и тот же кеш и не тратят лимит Gismeteo. Название — из ответа Gismeteo (location.name)

   Источник — Gismeteo (API v4, https://docs.gismeteo.net/v4/weather/): один запрос
   /forecast/h3?days=14 даёт и текущую погоду (current), и прогноз с шагом 3 часа на 14 дней.
   Токен — переменная окружения GISMETEO_TOKEN, уходит только в заголовке X-Gismeteo-Token
   запроса сервера к Gismeteo. Клиенту токен не отдаём, в журнал не пишем.

   Бесплатный тариф — 1000 запросов в месяц, поэтому:
   - ответ кешируется на CDN Vercel: Cache-Control: public, s-maxage=3600, stale-while-revalidate=1800;
   - в памяти функции — последний удачный ответ по каждому городу (свежий — без нового запроса);
   - пока запрос к Gismeteo в пути, остальные ждут его же (без повторных запросов);
   - счётчик обращений к Gismeteo за 30 дней (GISMETEO_MONTH_MAX) — дальше сразу резерв
     (важно: каждое новое место — свой запрос раз в час, поэтому лимит и счётчик).
   Резерв: Gismeteo не ответил или лимит исчерпан → последний ответ из памяти с пометкой
   stale: true → нет и его → Open-Meteo (бесплатный, без ключа) с его собственной подписью.

   Ответ: { source: "gismeteo" | "openmeteo", stale, city: { id, name }, time (данные на),
     fetchedAt, now: { temp, feels, wind, humidity, pressure, cond, text },
     days: [{ date: "YYYY-MM-DD", min, max, cond, text }], attribution: { text, url } }
   cond — свой код NEXA для значков: sun | partly | cloud | overcast | rain | snow | sleet | storm | fog */

// Города по названию (?city=…): Казань по умолчанию и Москва. Координаты — из примеров
// документации Gismeteo. Остальные места — по координатам (?lat=…&lon=…)
const CITIES = {
  kazan: { name: 'Казань', lat: 55.796501, lon: 49.1082 },
  moscow: { name: 'Москва', lat: 55.755798, lon: 37.617599 },
};
const DEFAULT_CITY = 'kazan';
const GISMETEO_URL = 'https://api.gismeteo.net/v4/weather/forecast/h3';
const FRESH_MS = 60 * 60 * 1000;     // ответ свежий час — как s-maxage
const TIMEOUT_MS = 8000;             // дольше 8 секунд источник не ждём
const GISMETEO_MONTH_MAX = 900;      // с запасом до 1000 в месяц
/* С одного адреса: не больше IP_GISMETEO_PER_HOUR новых обращений к Gismeteo в час (дальше — резерв,
   не ошибка: перебором координат месячный лимит Gismeteo на всех не истратить) и не больше
   IP_HITS_PER_10MIN запросов к самой функции за 10 минут (дальше 429). Обычный человек почти всегда
   получает ответ из кеша CDN и сюда не доходит. Адреса операторов связи бывают общими на многих людей —
   поэтому лимиты с запасом и при превышении Gismeteo — просто данные Open-Meteo */
const IP_GISMETEO_PER_HOUR = 10;
const IP_HITS_PER_10MIN = 60;
const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=1800';
const CACHE_FALLBACK = 'public, s-maxage=600, stale-while-revalidate=600'; // резерв — пробуем Gismeteo снова через 10 минут

const ATTR = {
  gismeteo: { text: 'По данным Gismeteo', url: 'https://www.gismeteo.ru' },
  openmeteo: { text: 'Данные: Open-Meteo', url: 'https://open-meteo.com' },
};

const memory = new Map();   // место ("kazan" или "55.8,49.1") → { data, at } — последний удачный ответ Gismeteo
const inFlight = new Map(); // место → Promise — запрос в пути

/* ─── Gismeteo → наш вид ───
   Состояние для значков NEXA считаем по описанным в документации полям:
   гроза (storm_prediction), тип осадков (precipitation_type: 0 нет, 1 дождь, 2 снег,
   3 дождь со снегом), облачность (cloudiness, %: 0–25 ясно, 26–50 малооблачно,
   51–75 облачно, 76–100 пасмурно). Код значка icon_weather в документации не расшифрован —
   его не разбираем */
function gisCond(storm, ptype, cloud) {
  if (storm) return 'storm';
  if (ptype === 2) return 'snow';
  if (ptype === 3) return 'sleet';
  if (ptype === 1) return 'rain';
  if (cloud == null) return 'cloud';
  if (cloud <= 25) return 'sun';
  if (cloud <= 50) return 'partly';
  if (cloud <= 75) return 'cloud';
  return 'overcast';
}
const COND_TEXT = {
  sun: 'Ясно', partly: 'Малооблачно', cloud: 'Облачно', overcast: 'Пасмурно',
  rain: 'Дождь', snow: 'Снег', sleet: 'Дождь со снегом', storm: 'Гроза', fog: 'Туман',
};
const r0 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);

function fromGismeteo(j, place) {
  const c = j && j.current;
  const f = j && j.forecast;
  if (!c || !f || !Array.isArray(f.time) || typeof c.temperature_air !== 'number') throw new Error('bad-shape');
  // Сроки в UTC; сутки считаем по местному времени города (time_zone_offset — минуты)
  const off = (j.location && j.location.time_zone_offset) || 0;
  const localDate = (iso) => new Date(Date.parse(iso) + off * 60000).toISOString().slice(0, 10);
  const byDay = new Map();
  f.time.forEach((t, i) => {
    const d = localDate(t);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  });
  const at = (name, i) => (Array.isArray(f[name]) ? f[name][i] : null);
  const days = [...byDay.entries()].map(([date, idx]) => {
    const temps = idx.map((i) => at('temperature_air', i)).filter((x) => typeof x === 'number');
    if (!temps.length) return null;
    // Состояние дня — самое заметное за сутки: гроза > снег/дождь > средняя облачность
    const storm = idx.some((i) => at('storm_prediction', i) === true);
    const types = new Set(idx.map((i) => at('precipitation_type', i)).filter((x) => x));
    const ptype = types.has(3) || (types.has(1) && types.has(2)) ? 3 : types.has(2) ? 2 : types.has(1) ? 1 : 0;
    const clouds = idx.map((i) => at('cloudiness', i)).filter((x) => typeof x === 'number');
    const cloud = clouds.length ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null;
    const cond = gisCond(storm, ptype, cloud);
    return { date, min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)), cond, text: COND_TEXT[cond] };
  }).filter(Boolean);
  const cond = gisCond(c.storm_prediction === true, c.precipitation_type, c.cloudiness);
  const gisName = j.location && typeof j.location.name === 'string' ? j.location.name.trim().slice(0, 60) : '';
  return {
    source: 'gismeteo', stale: false,
    city: { id: place.id, name: place.name || gisName || null },
    time: c.time || null,
    fetchedAt: new Date().toISOString(),
    now: {
      temp: r0(c.temperature_air),
      feels: r0(c.temperature_heat_index ?? c.temperature_air),
      wind: r0(c.wind_speed),
      humidity: r0(c.humidity),
      pressure: r0(c.pressure),   // уже мм рт. ст.
      cond,
      // Описание от Gismeteo («Пасмурно, сильный дождь»), нет — своё по состоянию
      text: typeof c.description === 'string' && c.description.trim() ? c.description.trim() : COND_TEXT[cond],
    },
    days,
    attribution: ATTR.gismeteo,
  };
}

/* ─── Open-Meteo (резерв) → тот же вид ─── */
function wmoCond(code) {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code === 66 || code === 67) return 'sleet';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloud';
}
function fromOpenMeteo(j, place) {
  const c = j && j.current, d = j && j.daily;
  if (!c || !d || !Array.isArray(d.time)) throw new Error('bad-shape');
  const cond = wmoCond(c.weather_code);
  return {
    source: 'openmeteo', stale: false,
    city: { id: place.id, name: place.name },
    time: c.time ? new Date(c.time + 'Z').toISOString() : null,
    fetchedAt: new Date().toISOString(),
    now: {
      temp: r0(c.temperature_2m),
      feels: r0(c.apparent_temperature),
      wind: r0(c.wind_speed_10m / 3.6),            // км/ч → м/с
      humidity: r0(c.relative_humidity_2m),
      pressure: r0(c.surface_pressure * 0.750062), // гПа → мм рт. ст.
      cond, text: COND_TEXT[cond],
    },
    days: d.time.map((date, i) => ({ date, min: r0(d.temperature_2m_min[i]), max: r0(d.temperature_2m_max[i]), cond: wmoCond(d.weather_code[i]) }))
      .filter((x) => x.min != null && x.max != null)
      .map((x) => ({ ...x, text: COND_TEXT[x.cond] })),
    attribution: ATTR.openmeteo,
  };
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
  if (!res.ok) { const e = new Error('http'); e.status = res.status; throw e; }
  return res.json();
}

async function loadGismeteo(place, who) {
  const token = process.env.GISMETEO_TOKEN;
  if (!token) { const e = new Error('no-token'); e.status = 'no-token'; throw e; }
  // Сначала лимит адреса — чтобы чужой перебор не тратил общий месячный счётчик
  if (!(await allow([[`gismeteo:ip:${who}`, IP_GISMETEO_PER_HOUR, 3600]]))) { const e = new Error('ip'); e.status = 'ip-limit'; throw e; }
  // Лимит бесплатного тарифа: дальше 900 обращений за 30 дней — сразу резерв
  if (!(await allow([['gismeteo:month', GISMETEO_MONTH_MAX, 30 * 86400]]))) { const e = new Error('quota'); e.status = 'quota'; throw e; }
  const url = `${GISMETEO_URL}?coordinates=${place.lat},${place.lon}&days=14&locale=ru-RU`;
  return fromGismeteo(await getJson(url, { 'X-Gismeteo-Token': token, Accept: 'application/json' }), place);
}

async function loadOpenMeteo(place) {
  const { lat, lon } = place;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=14';
  return fromOpenMeteo(await getJson(url, { Accept: 'application/json' }), place);
}

// Погода места: свежая из памяти → Gismeteo (один запрос на всех) → память (устаревшая) → Open-Meteo
async function weatherFor(place, who) {
  const id = place.key;
  const m = memory.get(id);
  if (m && Date.now() - m.at < FRESH_MS) return { data: m.data, fresh: true };
  if (!inFlight.has(id)) {
    inFlight.set(id, loadGismeteo(place, who)
      .then((data) => { memory.set(id, { data, at: Date.now() }); return data; })
      .finally(() => inFlight.delete(id)));
  }
  try {
    return { data: await inFlight.get(id), fresh: true };
  } catch (e) {
    // В журнал — только код ошибки, без токена, заголовков и ответа Gismeteo
    console.error('weather: gismeteo', e.status || e.name || 'error');
    const last = memory.get(id);
    if (last) return { data: { ...last.data, stale: true }, fresh: false };
    return { data: await loadOpenMeteo(place), fresh: false };
  }
}

// Место из запроса: { key, id, name, lat, lon } или null, если запрос неверный.
// Координаты — только числа в допустимых пределах, округляем до 0,1° (общий кеш для города)
function placeOf(q) {
  if (q.lat != null || q.lon != null) {
    const lat = Number(q.lat), lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const la = Math.round(lat * 10) / 10, lo = Math.round(lon * 10) / 10;
    return { key: `${la},${lo}`, id: null, name: null, lat: la, lon: lo };
  }
  const id = String(q.city || DEFAULT_CITY).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CITIES, id)) return null;
  const c = CITIES[id];
  return { key: id, id, name: c.name, lat: c.lat, lon: c.lon };
}

export default async function handler(req, res) {
  // Погода — общедоступные данные: читать можно с любого адреса (сайт, приложение, виджет)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); return res.status(204).end(); }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const place = placeOf(req.query || {});
  if (!place) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.status(400).json({
      error: 'Нужен город (' + Object.keys(CITIES).join(', ') + ') или координаты lat и lon',
      cities: Object.entries(CITIES).map(([cid, c]) => ({ id: cid, name: c.name })),
    });
  }
  const who = clientKey(req);
  if (!(await allow([[`weather:${who}`, IP_HITS_PER_10MIN, 600]]))) {
    res.setHeader('Retry-After', '600');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(429).json({ error: 'Слишком часто — погода обновится через несколько минут' });
  }
  try {
    const { data, fresh } = await weatherFor(place, who);
    res.setHeader('Cache-Control', fresh ? CACHE_OK : CACHE_FALLBACK);
    return res.status(200).json(data);
  } catch (e) {
    console.error('weather: fallback', e.status || e.name || 'error');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Погода сейчас недоступна — попробуйте позже' });
  }
}
