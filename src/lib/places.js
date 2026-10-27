/* Последнее известное место своих устройств (2026-10-27) — supabase/device-places.sql.
   Только если на САМОМ устройстве включено «Поиск этого устройства» (решение автора): так выключенный
   или потерявший сеть телефон можно найти хотя бы там, где он был в последний раз.
   Одна точка на устройство, без истории. Выключили поиск — точка этого устройства удаляется.
   Нет таблицы — всё молча работает как раньше (только «Где устройство?» вживую). */
import { supabase } from "./supabase.js";

export const PLACE_GAP_MS = 10 * 60 * 1000;   // писать не чаще раза в 10 минут
const AT_KEY = (uid) => `nexa-place-at@${uid}`;
const ON_KEY = (uid) => `nexa-place-on@${uid}`;
// Поиск на этом устройстве включён — запомнить, чтобы при выключении точно стереть точку в облаке
export function markPlaceOn(uid) { try { localStorage.setItem(ON_KEY(uid), "1"); } catch { /* не страшно */ } }

// Место этого устройства → в облако. force — не смотреть на паузу (сворачивание NEXA)
export async function savePlace(uid, deviceId, { force = false } = {}) {
  if (!supabase || !uid || !deviceId || !navigator.geolocation || navigator.onLine === false) return false;
  let last = 0;
  try { last = Number(localStorage.getItem(AT_KEY(uid))) || 0; } catch { /* не страшно */ }
  if (!force && Date.now() - last < PLACE_GAP_MS) return false;
  const pos = await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10000 });
  });
  if (!pos) return false;
  const row = {
    device_id: deviceId,
    lat: pos.coords.latitude, lon: pos.coords.longitude,
    acc: Math.min(1000000, Math.max(0, pos.coords.accuracy || 0)),
    at: Math.round(pos.timestamp || Date.now()),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("device_places").upsert(row, { onConflict: "user_id,device_id" });
  if (error) return false;
  try { localStorage.setItem(AT_KEY(uid), String(Date.now())); } catch { /* не страшно */ }
  return true;
}

// Поиск выключили — последняя точка этого устройства больше не хранится
export async function forgetPlace(uid, deviceId) {
  if (!supabase || !uid || !deviceId) return;
  // Поиск на этом устройстве и не включали — удалять нечего (лишний запрос при каждом запуске не нужен).
  // Отметка ON_KEY ставится при включении: точку мог записать и сервер (ответ на push), не только это устройство
  try { if (!localStorage.getItem(ON_KEY(uid))) return; localStorage.removeItem(ON_KEY(uid)); localStorage.removeItem(AT_KEY(uid)); } catch { return; }
  await supabase.from("device_places").delete().eq("device_id", deviceId).then(() => {}, () => {});
}

// Последнее место другого своего устройства: { lat, lon, acc, at } или null
export async function loadPlace(deviceId) {
  if (!supabase || !deviceId) return null;
  const { data, error } = await supabase.from("device_places").select("lat, lon, acc, at").eq("device_id", deviceId).limit(1);
  if (error || !data?.[0]) return null;
  const r = data[0];
  return Number.isFinite(r.lat) && Number.isFinite(r.lon) ? { lat: r.lat, lon: r.lon, acc: Number(r.acc) || 0, at: Number(r.at) } : null;
}
