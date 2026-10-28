/* Ключ шифрования на этом устройстве (2026-10-28). Правила и само шифрование — e2e.js.
   Настройка аккаунта (соль и проверочная строка, без пароля) — профиль Supabase user_metadata.nexa_e2e:
   так все устройства аккаунта знают, что шифрование включено. Пароль человек вводит на каждом
   устройстве один раз; ключ хранится в IndexedDB этого браузера как «неизвлекаемый» объект
   CryptoKey — даже скрипт страницы не может прочитать его байты. Выход из аккаунта стирает ключ.
   Состояние: none — шифрование не включено; locked — включено, но здесь пароль не введён
   (или его сменили на другом устройстве); ready — можно шифровать; loading — ещё узнаём */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { makeE2eConfig, unlockE2e, keyMatches, validConfig } from "./e2e.js";

const DB = "nexa-e2e", STORE = "keys";
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idb(mode, fn) {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { d.close(); }
}
const loadKey = (uid) => idb("readonly", (s) => s.get(uid)).catch(() => null);
const saveKey = (uid, key) => idb("readwrite", (s) => s.put(key, uid)).catch(() => null);
// Стереть ключ аккаунта на этом устройстве (выход, «Забыть пароль здесь»)
export const forgetE2eKey = (uid) => (uid ? idb("readwrite", (s) => s.delete(uid)).catch(() => null) : Promise.resolve());

async function fetchConfig() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    const c = data?.user?.user_metadata?.nexa_e2e;
    return validConfig(c) ? c : null;
  } catch { return undefined; } // нет связи — не знаем
}

export function useE2e(uid) {
  const [st, setSt] = useState({ status: "loading", key: null, config: null });
  const uidRef = useRef(uid); uidRef.current = uid;

  const refresh = useCallback(async () => {
    const u = uidRef.current;
    if (!u || !supabase) { setSt({ status: "none", key: null, config: null }); return; }
    const config = await fetchConfig();
    if (uidRef.current !== u) return;
    const key = await loadKey(u);
    if (config === undefined) { // без сети: есть ключ — работаем с ним, нет — «не знаем», не шифруем и не отправляем
      setSt((s) => (key ? { status: "ready", key, config: s.config } : { status: s.config ? "locked" : "loading", key: null, config: s.config }));
      return;
    }
    if (!config) { setSt({ status: "none", key: null, config: null }); return; }
    if (key && (await keyMatches(key, config))) setSt({ status: "ready", key, config });
    else setSt({ status: "locked", key: null, config });
  }, []);

  useEffect(() => { refresh(); }, [uid, refresh]);

  // Включить шифрование для аккаунта (на этом устройстве — сразу готово)
  const setup = async (pass) => {
    const { key, config } = await makeE2eConfig(pass);
    const { error } = await supabase.auth.updateUser({ data: { nexa_e2e: config } });
    if (error) return "Не получилось включить — проверьте связь и попробуйте ещё раз";
    await saveKey(uid, key);
    setSt({ status: "ready", key, config });
    return null;
  };
  // Ввести пароль на этом устройстве
  const unlock = async (pass) => {
    const config = (await fetchConfig()) || st.config;
    if (!config) return "Шифрование для аккаунта не включено";
    const key = await unlockE2e(pass, config);
    if (!key) return "Пароль не подходит";
    await saveKey(uid, key);
    setSt({ status: "ready", key, config });
    return null;
  };
  // Забыть ключ только здесь (пароль останется у аккаунта)
  const forget = async () => { await forgetE2eKey(uid); setSt((s) => ({ status: s.config ? "locked" : "none", key: null, config: s.config })); };
  // Выключить для всего аккаунта: дальше буфер уходит без шифрования
  const disable = async () => {
    const { error } = await supabase.auth.updateUser({ data: { nexa_e2e: null } });
    if (error) return "Не получилось выключить — проверьте связь";
    await forgetE2eKey(uid);
    setSt({ status: "none", key: null, config: null });
    return null;
  };
  return { ...st, setup, unlock, forget, disable, refresh };
}
