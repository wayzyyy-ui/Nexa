/* Возврат в NEXA после фона: свернули, заблокировали экран, переключились на другое приложение.
   Пока NEXA в фоне, Android её «замораживает» — таймеры и соединения стоят. Вернулись —
   нужно один раз освежить данные. Этот модуль решает, когда это действительно нужно:
   - только если NEXA была скрыта не меньше minHiddenMs (короткое переключение не считается);
   - не чаще раза в gapMs (сайт и приложение могут прислать два сигнала подряд — visibilitychange и resume).
   Логика без интерфейса — её проверяет тест tests/lifecycle.test.mjs (npm test). */
import { useEffect, useRef } from "react";

export const RETURN_MIN_HIDDEN_MS = 30000;
export const RETURN_GAP_MS = 30000;

export function returnTracker({ minHiddenMs = RETURN_MIN_HIDDEN_MS, gapMs = RETURN_GAP_MS } = {}) {
  let hiddenAt = null;   // когда ушли в фон (null — сейчас на экране)
  let lastRunAt = -Infinity;
  return {
    // Ушли в фон. Повторный сигнал не сдвигает время ухода
    hide(now) { if (hiddenAt === null) hiddenAt = now; },
    // Вернулись. true — пора освежить данные
    show(now) {
      if (hiddenAt === null) return false;          // не уходили (или сигнал «вернулись» второй раз)
      const away = now - hiddenAt;
      hiddenAt = null;
      if (away < minHiddenMs || now - lastRunAt < gapMs) return false;
      lastRunAt = now;
      return true;
    },
  };
}

// onReturn(hiddenMs) — вызывается после долгого фона. На сайте — по visibilitychange,
// в приложении ещё и по pause/resume Capacitor (сигналы могут прийти оба — сработает один раз)
export function useReturnToApp(onReturn, { native = false, appPlugin = null } = {}) {
  const cb = useRef(onReturn);
  cb.current = onReturn;
  useEffect(() => {
    const t = returnTracker();
    if (document.visibilityState === "hidden") t.hide(Date.now());
    const hide = () => t.hide(Date.now());
    const show = () => { if (t.show(Date.now())) cb.current?.(); };
    const vis = () => (document.visibilityState === "hidden" ? hide() : show());
    document.addEventListener("visibilitychange", vis);
    const subs = [];
    if (native && appPlugin) {
      subs.push(appPlugin.addListener("pause", hide));
      subs.push(appPlugin.addListener("resume", show));
    }
    return () => {
      document.removeEventListener("visibilitychange", vis);
      subs.forEach((s) => Promise.resolve(s).then((h) => h?.remove?.()).catch(() => {}));
    };
  }, [native, appPlugin]);
}
