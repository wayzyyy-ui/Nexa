/* Окно проверки «не робот» поверх всего: страница public/captcha.html в прозрачной рамке на весь экран
   (задание hCaptcha с картинками нужно место — в маленькую рамку оно бы не влезло).
   onDone({ type: "token", token } | { type: "closed" | "expired" | "error", code }) — ровно один раз.
   Esc и «Назад» Android — «закрыли» (окно с role="dialog") */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset } from "./base.jsx";
import { API_BASE } from "../native.js";
import { captchaSrc, captchaOrigin, readCaptchaMessage, CAPTCHA_WAIT_MS } from "../lib/captcha.js";

export function HumanCheck({ onDone }) {
  const frame = useRef(null);
  const done = useRef(false);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const finish = (r) => { if (done.current) return; done.current = true; doneRef.current(r); };
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const src = useRef(captchaSrc({ base: API_BASE || location.origin, origin: location.origin, theme })).current;

  useEffect(() => {
    const origin = captchaOrigin(src);
    let ready = false;
    const onMsg = (e) => {
      const m = readCaptchaMessage(e, { origin, source: frame.current?.contentWindow });
      if (!m) return;
      if (m.type === "ready") { ready = true; return; }
      finish(m);
    };
    // Страница не ответила совсем (нет связи с сервером NEXA) — не ждём вечно
    const t = setTimeout(() => { if (!ready) finish({ type: "error", code: "load" }); }, CAPTCHA_WAIT_MS);
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); finish({ type: "closed" }); } };
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(t); window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey, true); };
  }, []);

  return createPortal(
    <div className="nx-human" role="dialog" aria-modal="true" aria-label="Проверка «не робот»">
      <iframe ref={frame} src={src} title="Проверка «не робот»" className="nx-human-frame" allow="clipboard-write" />
      <button type="button" className="nx-icon-btn nx-human-close" onClick={() => finish({ type: "closed" })} aria-label="Отменить проверку"
        style={{ ...btnReset, position: "absolute", top: "calc(var(--sat) + 14px)", right: 14, width: 40, height: 40, borderRadius: "50%",
          border: `1px solid ${C.borderStrong}`, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon.close({ c: C.text, s: 18 })}
      </button>
    </div>,
    document.body,
  );
}
