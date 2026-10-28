/* Проверка «не робот» перед отправкой кода на почту (hCaptcha через Supabase Auth).
   Ключ сайта (публичный) — VITE_HCAPTCHA_SITEKEY; нет ключа — проверки нет, вход как раньше.
   Сама проверка — страница public/captcha.html нашего сайта, окно поверх NEXA (src/ui/humanCheck.jsx):
   в приложениях адрес страницы localhost, а hCaptcha работает только на настоящих адресах сайта.
   Пропуск одноразовый: Supabase сверяет его с секретом hCaptcha сам (Auth → Bot and Abuse Protection). */
export const CAPTCHA_SITEKEY = String(import.meta.env?.VITE_HCAPTCHA_SITEKEY || "").trim();
export const captchaOn = () => /^[0-9a-f-]{20,40}$/i.test(CAPTCHA_SITEKEY);
export const CAPTCHA_WAIT_MS = 30000; // столько ждём, пока страница проверки ответит «готово»

// Кому страница проверки отдаёт пропуск (тот же список — PARENTS в public/captcha.js)
export const CAPTCHA_PARENTS = ["https://nexa-link.ru", "https://nexaru-ecosystem.vercel.app", "https://nexahub.ru", "http://localhost:3000", "http://localhost:5173", "https://localhost", "capacitor://localhost", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];

// Адрес страницы проверки: на сайте — свой, в приложениях — сервер NEXA
export function captchaSrc({ base, sitekey = CAPTCHA_SITEKEY, theme, origin }) {
  const q = new URLSearchParams({ k: sitekey, o: origin, t: theme === "light" ? "light" : "dark" });
  return `${base}/captcha.html?${q}`;
}
export const captchaOrigin = (src) => { try { return new URL(src).origin; } catch { return ""; } };

/* Сообщение от страницы проверки → { type, token?, code? } или null (чужое / неверное).
   Принимаем только от своей страницы (origin) и только из своего окна (source) */
export function readCaptchaMessage(e, { origin, source }) {
  if (!e || e.origin !== origin || (source && e.source !== source)) return null;
  const d = e.data;
  if (!d || d.nx !== "captcha" || typeof d.type !== "string") return null;
  if (d.type === "token") return typeof d.token === "string" && d.token.length > 10 && d.token.length < 8000 ? { type: "token", token: d.token } : null;
  if (["ready", "closed", "expired", "error"].includes(d.type)) return { type: d.type, code: typeof d.code === "string" ? d.code.slice(0, 40) : undefined };
  return null;
}

export const CAPTCHA_TEXT = {
  closed: "Проверку закрыли. Нажмите «Получить код» ещё раз.",
  expired: "Время на проверку вышло. Нажмите «Получить код» ещё раз.",
  load: "Проверка «не робот» не загрузилась. Проверьте интернет или войдите по QR.",
  failed: "Проверка «не робот» не прошла. Попробуйте ещё раз.",
};
