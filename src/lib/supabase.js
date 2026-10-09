/* Клиент Supabase — аккаунты NEXA (вход по коду из письма).
   Адрес проекта и публичный ключ берутся из .env.local:
   VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (ключ вида sb_publishable_…).
   Этот ключ публичный — его можно отдавать в браузер, данные защищает сам Supabase.

   Если переменных нет (например, сборка без .env.local), клиента нет:
   supabase = null. Приложение работает как раньше, а вход показывает,
   что аккаунты сейчас недоступны. */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Сессию (кто вошёл) Supabase сам хранит в localStorage и сам продлевает —
// руками токены никуда не пишем
export const supabase = url && key ? createClient(url, key) : null;

// Можно ли вообще входить в аккаунт
export const authAvailable = !!supabase;
