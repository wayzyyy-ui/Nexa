/* Проверки текста без сети и интерфейса (вынесены из realtime.js, чтобы их можно было
   проверять тестами и звать из любых модулей): ссылка ли это и похоже ли на секрет.
   realtime.js отдаёт их дальше под прежними именами. */

// Ссылка, которую можно открыть: только http и https (javascript: и прочее — нет)
export function safeUrl(text) {
  const t = String(text || "").trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

/* NEXA Flow и общий буфер: похоже ли на пароль, ключ или токен. Flow такое передаёт,
   но в историю (localStorage) текст не пишет — только пометку «скрыто»; общий буфер не отправляет.
   Проверка простая и осторожная: лучше лишний раз скрыть, чем сохранить секрет */
const SENSITIVE_RE = [
  /(пароль|password|passwd|pwd|pin|пин-?код|секрет|secret|token|токен|api[_ -]?key|ключ api)\s*[:=]/i,
  /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/,          // ключи и сертификаты
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, // JWT
  /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/,     // ключи сервисов
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/,               // ключи Supabase
  /\b(ghp|gho|github_pat|glpat|xox[abp])[-_][A-Za-z0-9_-]{16,}/, // ключи Git и чатов
  /\bAKIA[0-9A-Z]{16}\b/,                                       // ключи облаков
  /\bAIza[0-9A-Za-z_-]{30,}/,
];
export function isSensitive(text) {
  const t = String(text || "");
  if (SENSITIVE_RE.some((re) => re.test(t))) return true;
  // Одно «слово» без пробелов, длинное и пёстрое (буквы разного регистра + цифры) — похоже на пароль или токен
  const one = t.trim();
  if (one.length >= 10 && one.length <= 200 && !/\s/.test(one) && !safeUrl(one) &&
      /[a-z]/.test(one) && /[A-Z]/.test(one) && /\d/.test(one)) return true;
  return false;
}
