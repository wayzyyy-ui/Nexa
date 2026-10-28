/* Вход через Яндекс ID и Telegram — правила без интерфейса и сети (тесты в tests/ext-auth.test.mjs).
   Ход — src/lib/extAuth.js, сервер — api/auth-yandex.js, api/tg-*.js. */

export const EXT_PROVIDERS = ["yandex", "telegram"];
export const EXT_NAME = { yandex: "Яндекс ID", telegram: "Telegram" };
export const EXT_POLL_MS = 2000;               // как часто приложение спрашивает «вошли?»
export const EXT_WAIT_MS = 10 * 60 * 1000;     // дольше 10 минут не ждём (попытка на сервере тоже истекает)
export const EXT_PENDING_KEY = "nexa-ext-auth"; // sessionStorage: попытка, начатая в этой вкладке
export const EXT_RETURN_PARAM = "ext_auth";    // сайт: Яндекс вернул человека на /?ext_auth=yandex

export const EXT_TEXT = {
  offline: "Нет интернета. Проверьте связь или войдите по почте.",
  network: "Нет связи с сервером. Попробуйте ещё раз или войдите по почте.",
  not_configured: "Этот способ входа пока не настроен. Войдите по почте.",
  expired: "Время на вход вышло. Начните заново.",
  signin: "Не получилось войти. Попробуйте ещё раз.",
  cancelled: "Вход отменён.",
  server: "Не получилось. Попробуйте ещё раз.",
};

// Как открыть страницу входа: сайт — в этой же вкладке, приложения — во внешнем браузере
export const openMode = (platform) => (platform === "web" ? "same-tab" : "external");

/* Ответ опроса → что делать дальше:
   { next: "wait" } | { next: "signin", tokenHash } | { next: "linked" } | { next: "fail", text } */
export function pollOutcome(code, data = {}) {
  if (code === 429 || data.status === "slow_down") return { next: "wait" };
  if (data.status === "ready" && typeof data.token_hash === "string" && data.token_hash) return { next: "signin", tokenHash: data.token_hash };
  if (data.status === "linked") return { next: "linked" };
  if (data.status === "error") return { next: "fail", text: data.text || EXT_TEXT.server };
  if (data.status === "expired" || data.status === "used" || data.status === "not_found" || code === 404) return { next: "fail", text: data.text || EXT_TEXT.expired };
  if (data.status === "pending") return { next: "wait" };
  return code >= 500 ? { next: "wait" } : { next: "fail", text: EXT_TEXT.server };
}

// Какие сервисы привязаны к аккаунту (копию держит сервер в app_metadata — человек её не правит)
export function linkedOf(user) {
  const list = user?.app_metadata?.nexa_providers;
  return Array.isArray(list) ? EXT_PROVIDERS.filter((p) => list.includes(p)) : [];
}
// Служебная почта Telegram — не настоящий адрес (письма туда не уходят)
export const isServiceEmail = (email) => /@tg\.nexa\.invalid$/i.test(String(email || ""));

// Можно ли отвязать на этом устройстве (сервер проверяет то же самое сам)
export function canUnlinkHere(user, provider) {
  const linked = linkedOf(user);
  if (!linked.includes(provider)) return false;
  return !isServiceEmail(user?.email) || linked.some((p) => p !== provider);
}

// Сохранённая попытка вкладки: только известные поля и не старше EXT_WAIT_MS
export function readPending(raw, now = Date.now()) {
  try {
    const p = JSON.parse(raw);
    if (!p || !EXT_PROVIDERS.includes(p.provider) || typeof p.id !== "string" || !/^[0-9a-f]{64}$/.test(p.secret || "")) return null;
    if (typeof p.at !== "number" || now - p.at > EXT_WAIT_MS) return null;
    return { provider: p.provider, id: p.id, secret: p.secret, purpose: p.purpose === "link" ? "link" : "login", at: p.at };
  } catch { return null; }
}
