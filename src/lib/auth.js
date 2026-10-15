// Аккаунт: гость, сессия Supabase, выход (стирает данные аккаунта в браузере), тексты ошибок входа, вход по QR.
// Чаты гостя и перенос их в облако при первом входе
import { useState, useEffect } from "react";
import { API_BASE, isNative } from "../native.js";
import { supabase } from "./supabase.js";
import { DOMAIN_NOT_ALLOWED_MESSAGE } from "./allowedEmailDomains.js";
import { newId } from "./sync.js";
import { cacheClearScope } from "./files.js";

/* ═══ АККАУНТЫ (Supabase) ═══════════════════════════════════
   Вход по коду из письма, без паролей. Клиент — src/lib/supabase.js,
   разрешённые почты — src/lib/allowedEmailDomains.js.
   Пока аккаунт ни к чему не привязан: устройства и чаты живут в браузере, как раньше. */
export const GUEST_KEY = "nexa-guest";   // "1" — выбрали «Продолжить без аккаунта»

export const CHATS_KEY = "nexa-chats";   // диалоги ассистента (у аккаунта — nexa-chats@id)

export const MIGRATED_KEY = "nexa-chats-migrated"; // кому уже перенесли гостевые диалоги в облако (список id)

export const loadChats = (key = CHATS_KEY) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; }
};

/* Перенос гостевых диалогов в облако при первом входе: в облаке пусто,
   а в браузере есть диалоги «без аккаунта» — копируем их (с новыми id) один раз.
   Гостевые при этом не удаляются */
export function chatMigration(uid) {
  const done = () => { try { return JSON.parse(localStorage.getItem(MIGRATED_KEY) || "[]"); } catch { return []; } };
  return {
    // null — переносить нечего
    prepare: (local, cloudRows) => {
      if (!uid || cloudRows.length || done().includes(uid)) return null;
      const guest = loadChats(CHATS_KEY);
      if (!guest.length) return null;
      return [...local, ...guest.map((c) => ({ ...c, id: newId(), updatedAt: c.updatedAt || c.createdAt || Date.now() }))];
    },
    migrated: () => { try { localStorage.setItem(MIGRATED_KEY, JSON.stringify([...new Set([...done(), uid])])); } catch {} },
  };
}

export const RESEND_SECONDS = 60;        // пауза перед повторной отправкой кода

export const OTP_LIFETIME_MS = 60 * 60 * 1000; // сколько живёт код (как в настройках Supabase по умолчанию)

export const CODE_MIN = 6, CODE_MAX = 8; // длина кода из письма

export const readGuest = () => { try { return localStorage.getItem(GUEST_KEY) === "1"; } catch { return false; } };

export const saveGuest = (on) => { try { on ? localStorage.setItem(GUEST_KEY, "1") : localStorage.removeItem(GUEST_KEY); } catch {} };

/* Кто вошёл. Supabase сам хранит сессию и сам сообщает о входе и выходе
   (onAuthStateChange; первое событие приходит сразу — сессия из прошлого раза).
   ready — Supabase уже ответил, можно решать, показывать ли экран входа */
// Сохранённый вход из прошлого раза — только чтобы при запуске сразу знать,
// чьи данные показывать (иначе на миг мелькнут демо-устройства). Только читаем:
// сессию хранит и обновляет сам Supabase, через миг он подтвердит её или сбросит
export function storedSession() {
  if (!supabase) return null;
  try {
    const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token"));
    const s = k && JSON.parse(localStorage.getItem(k));
    return s?.user?.id ? s : null;
  } catch { return null; }
}

export function useAuth() {
  const [session, setSession] = useState(storedSession);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user || null, ready };
}

// Выйти: только на этом устройстве. Сессия стирается даже без интернета
export const signOut = () => supabase?.auth.signOut({ scope: "local" });

/* После выхода стираем из браузера копии данных аккаунта: устройства, файлы,
   чаты, входящие и служебные отметки синхронизации (ключи nexa-…@<id>).
   В облаке всё остаётся — при следующем входе вернётся. Иначе на общем
   компьютере следующий человек мог бы достать чужие чаты из памяти браузера.
   Правки, которые не успели уйти в облако без интернета, при этом пропадут */
export function clearLocalAccountData(uid) {
  if (!uid) return;
  try {
    const mine = Object.keys(localStorage).filter((k) => k.startsWith("nexa-") && k.endsWith(`@${uid}`));
    mine.forEach((k) => localStorage.removeItem(k));
  } catch {}
  cacheClearScope(uid); // копии содержимого файлов (IndexedDB)
}

/* Понятный текст ошибки Supabase.
   step — где ошиблись: "send" (отправка кода) или "verify" (проверка кода).
   Неверный и просроченный код Supabase сообщает одинаково — различаем по времени:
   если с отправки прошло больше часа, код истёк */
export function authErrorText(error, step, sentAt) {
  const code = error?.code || "";
  const msg = String(error?.message || "").toLowerCase();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // Серверная проверка почты (supabase/restrict-email-domains.sql) не пустила адрес:
  // Supabase отвечает ошибкой базы «Database error saving new user»
  if (step === "send" && (msg.includes("database error") || msg.includes("not allowed"))) {
    return DOMAIN_NOT_ALLOWED_MESSAGE;
  }
  // Запрос не дошёл до сервера вообще (у такой ошибки нет кода ответа, status 0).
  // Ошибки самого сервера Supabase приходят тем же типом, но с кодом 5xx — это не «нет интернета»
  const noAnswer = error?.name === "AuthRetryableFetchError" && !error?.status;
  if (offline || noAnswer || msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Нет интернета. Проверьте подключение и попробуйте ещё раз.";
  }
  if (error?.status === 429 || code.startsWith("over_") || msg.includes("rate limit") || msg.includes("security purposes")) {
    return "Слишком много попыток. Подождите пару минут и попробуйте снова.";
  }
  if (step === "verify" && (code === "otp_expired" || msg.includes("expired") || msg.includes("invalid"))) {
    return sentAt && Date.now() - sentAt > OTP_LIFETIME_MS
      ? "Код истёк. Запросите новый."
      : "Неверный код. Проверьте цифры в письме.";
  }
  if (code === "signup_disabled" || code === "otp_disabled" || code === "email_provider_disabled") {
    return "Вход по почте сейчас выключен. Попробуйте позже.";
  }
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

/* ═══ ВХОД ПО QR (как в Телеграме) ═══════════════════════════
   Новое устройство показывает QR и код (QrLoginView), вошедшее подтверждает
   (ApproveLoginModal). Сервер — api/qr-login.js, таблица — supabase/qr-login.sql */
export const QR_LOGIN_URL = `${API_BASE}/api/qr-login`;

export const QR_LOGIN_TTL_MS = 2 * 60 * 1000;

export const QR_POLL_MS = 2000;                  // как часто новое устройство спрашивает «разрешили?»

export const APPROVE_LOCK_KEY = "nexa-approve-lock"; // 5 неверных кодов — пауза на минуту

// Адрес для QR входа: открывает NEXA с ?login=КОД
export const loginUrl = (code) => `${isNative ? "https://nexa-link.ru" : location.origin}/?login=${code}`;

// Запрос к серверу входа по QR. token — ключ входа (для подтверждения)
export async function qrApi(action, body = {}, token) {
  const res = await fetch(QR_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...body }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}
