import { useEffect, useReducer, useRef, useState } from "react";
import { storedSession } from "./auth.js";
import { ASKED_KEY, CONSENT_KEY, QUEUE_KEY } from "./mini/collect.js";
import { useSharedState } from "./shared.js";
import { supabase } from "./supabase.js";

const WELCOME_KEY = "nexa-test-welcome-v1";
const welcomeField = "nexa_test_welcome_v1_seen";
const miniField = "nexa_mini_help_seen";
const loadSeen = (key) => { try { return localStorage.getItem(key) === "true"; } catch { return false; } };

// Старые отметки и разрешение принадлежат устройству с уже сохранённым входом.
// Если входа нет, следующий аккаунт начинает со своего выбора.
if (supabase) {
  const owner = storedSession()?.user.id;
  try {
    for (const key of [WELCOME_KEY, ASKED_KEY, CONSENT_KEY, QUEUE_KEY]) {
      const value = localStorage.getItem(key);
      if (value === null) continue;
      if (owner && localStorage.getItem(key + "@" + owner) === null) localStorage.setItem(key + "@" + owner, value);
      localStorage.removeItem(key);
    }
  } catch { /* хранилище недоступно */ }
}

export function useWelcomeSteps({ uid, scope, miniAnswered, onPushed }) {
  const [seen, setSeen] = useSharedState(WELCOME_KEY + scope, loadSeen);
  const [cloud, setCloud] = useState(null);
  const [revision, refresh] = useReducer((n) => n + 1, 0);
  const pushed = useRef(onPushed);
  useEffect(() => { pushed.current = onPushed; }, [onPushed]);

  useEffect(() => {
    if (!uid || !supabase) return;
    let active = true, retry;
    async function sync() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || data?.user?.id !== uid) throw new Error();
        const meta = data.user.user_metadata || {};
        setCloud({ uid, revision, welcome: meta[welcomeField] === true, mini: meta[miniField] === true });
        // Записываем только пройденные шаги. Одновременные ответы на разных
        // устройствах не стирают друг друга и не включают сбор фраз удалённо.
        const patch = {};
        if (seen && meta[welcomeField] !== true) patch[welcomeField] = true;
        if (miniAnswered && meta[miniField] !== true) patch[miniField] = true;
        if (!Object.keys(patch).length) return;
        const saved = await supabase.auth.updateUser({ data: patch });
        if (saved.error) throw saved.error;
        if (active) pushed.current?.();
      } catch {
        if (active && navigator.onLine) retry = setTimeout(sync, 30000);
      }
    }
    if (navigator.onLine) sync();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearTimeout(retry);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [uid, revision, seen, miniAnswered]);

  const current = uid && cloud?.uid === uid ? cloud : null;
  return {
    ready: !supabase || current?.revision === revision,
    seen: seen || current?.welcome,
    miniSeen: miniAnswered || current?.mini,
    finish: () => setSeen(true),
    refresh,
  };
}
