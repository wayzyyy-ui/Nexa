/* Клиент Supabase — аккаунты NEXA (вход по коду из письма).
   Адрес проекта и публичный ключ берутся из .env.local:
   VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (ключ вида sb_publishable_…).
   Этот ключ публичный — его можно отдавать в браузер, данные защищает сам Supabase.

   Если переменных нет (например, сборка без .env.local), клиента нет:
   supabase = null. Приложение работает как раньше, а вход показывает,
   что аккаунты сейчас недоступны. */
import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./net.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Предел ожидания каждого запроса к Supabase (база, вход, сведения о файлах). Без него запрос
   при «висящей» сети (Wi-Fi без интернета, сеть в метро) ждал бесконечно, и синхронизация
   навсегда оставалась в «Загружаем…». Через REQUEST_TIMEOUT_MS запрос обрывается ошибкой со словом
   «network» — синхронизация считает это обрывом связи и сама повторяет (3, 10, 30 с).
   Сами файлы сюда не ходят: загрузка — XHR (files.js), скачивание — по подписанной ссылке */
export const REQUEST_TIMEOUT_MS = 25000;
const supabaseFetch = (input, init) => fetchWithTimeout(input, init, REQUEST_TIMEOUT_MS);

// Сессию (кто вошёл) Supabase сам хранит в localStorage и сам продлевает —
// руками токены никуда не пишем
export const supabase = url && key ? createClient(url, key, { global: { fetch: supabaseFetch } }) : null;

// Можно ли вообще входить в аккаунт
export const authAvailable = !!supabase;
