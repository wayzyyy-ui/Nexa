// Настройки уведомлений, общие для аккаунта (user_metadata.nexa_settings)
import { useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import { NOTE_CATS } from "./notes.js";

/* НАСТРОЙКИ АККАУНТА: какие категории уведомлений включены — одинаково на всех
   устройствах аккаунта. Лежат в профиле Supabase (user_metadata.nexa_settings =
   { notes: { files: true, flow: false, … }, at }) — отдельная таблица и миграция не нужны.
   В браузере — обычная копия (nexa-note-prefs) и время последней правки здесь
   (nexa-settings-at@<uid>, стирается при выходе). При входе, возвращении в NEXA,
   возврате связи и сигнале с другого устройства сверяемся с облаком: новее облако —
   берём его, новее здесь — отправляем. Без сети правка ждёт и уйдёт, когда сеть вернётся.
   У каждого устройства свои: системные уведомления (разрешение даёт само устройство),
   фон от наклона, Flow и «Поиск этого устройства» */
export const SETTINGS_AT_KEY = "nexa-settings-at@";

export const SETTINGS_PULL_MS = 30 * 1000; // при возвращении в NEXA — не чаще раза в 30 с

export const notesOnly = (p) => Object.fromEntries(NOTE_CATS.map((c) => [c.id, !!p[c.id]?.app]));

export function useAccountSettings(uid, notePrefs, setNotePrefs, onPushed) {
  const atKey = SETTINGS_AT_KEY + uid;
  const readAt = () => { try { return Number(localStorage.getItem(atKey)) || 0; } catch (e) { return 0; } };
  const writeAt = (t) => { try { localStorage.setItem(atKey, String(t)); } catch (e) {} };
  const prefsRef = useRef(notePrefs); prefsRef.current = notePrefs;
  const pushedRef = useRef(onPushed); pushedRef.current = onPushed;
  const pending = useRef(false);   // правка ещё не дошла до облака
  const lastSig = useRef(null);    // какие категории были включены в прошлый раз
  const fromCloud = useRef(false); // изменение пришло из облака — назад не отправляем
  const lastPull = useRef(0);
  const timer = useRef(0);

  const push = async () => {
    if (!uid || !supabase) return;
    if (!navigator.onLine) { pending.current = true; return; }
    const at = readAt() || Date.now();
    const { error } = await supabase.auth.updateUser({ data: { nexa_settings: { notes: notesOnly(prefsRef.current), at } } });
    if (error) { pending.current = true; return; } // повторим при возврате связи / в NEXA
    pending.current = false;
    pushedRef.current?.();
  };
  const pull = async (force) => {
    if (!uid || !supabase || !navigator.onLine) return;
    if (!force && Date.now() - lastPull.current < SETTINGS_PULL_MS) return;
    lastPull.current = Date.now();
    const { data, error } = await supabase.auth.getUser();
    if (error || data?.user?.id !== uid) return;
    const cloud = data.user.user_metadata?.nexa_settings;
    const localAt = readAt();
    if (cloud?.notes && (cloud.at || 0) > localAt && !pending.current) {
      // В облаке новее — берём. Системные остаются, как были на этом устройстве
      fromCloud.current = true;
      setNotePrefs((p) => Object.fromEntries(NOTE_CATS.map((c) => {
        const on = cloud.notes[c.id] !== false;
        return [c.id, { app: on, system: on && !!p[c.id]?.system }];
      })));
      writeAt(cloud.at);
    } else if (!cloud?.notes || localAt > (cloud.at || 0) || pending.current) {
      // В облаке ещё пусто (первый вход) или здесь новее — отправляем своё
      if (!localAt) writeAt(Date.now());
      push();
    }
  };

  // Человек переключил категорию (здесь или в другой вкладке) — запоминаем время и отправляем
  useEffect(() => {
    const sig = JSON.stringify(notesOnly(notePrefs));
    const prev = lastSig.current;
    lastSig.current = sig;
    if (prev === null || prev === sig) return;
    if (fromCloud.current) { fromCloud.current = false; return; }
    if (!uid) return;
    writeAt(Date.now());
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(push, 800); // несколько щелчков подряд — одна отправка
  }, [notePrefs, uid]);

  // Вход, возвращение в NEXA, возврат связи
  useEffect(() => {
    if (!uid) return;
    pull(true);
    const onVisible = () => { if (document.visibilityState === "visible") pull(false); };
    const onOnline = () => (pending.current ? push() : pull(true));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [uid]);
  return { pull: () => pull(true) };
}
