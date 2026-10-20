/* Поле ввода ассистента: что делает Enter.

   - компьютер: Enter — отправить, Shift+Enter (и Alt+Enter) — новая строка;
   - телефон и планшет (сенсорный ввод: pointer: coarse и ширина до 1024 px — не по user agent):
     Enter — новая строка, отправка только кнопкой;
   - Ctrl+Enter / ⌘+Enter — отправить везде;
   - пока идёт набор через экранную клавиатуру или IME (isComposing, keyCode 229) — Enter не трогаем,
     иначе ломается ввод на русском и других языках.
   Настройка «Enter отправляет сообщение» (Настройки → «ИИ — Ассистент») — nexa-enter-sends в
   localStorage: "1" / "0"; не выбрано — по устройству. */
import { useEffect, useState } from "react";

const KEY = "nexa-enter-sends";
const EVENT = "nexa-enter-sends"; // поменяли в Настройках — поле узнаёт сразу

export const touchLike = () => {
  try { return matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 1024px)").matches; } catch { return false; }
};
export function readEnterSends() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch { /* хранилище недоступно — по устройству */ }
  return !touchLike();
}
export function saveEnterSends(on) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* только на этот запуск */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useEnterSends() {
  const [on, setOn] = useState(readEnterSends);
  useEffect(() => {
    const sync = () => setOn(readEnterSends());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync); // другая вкладка
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return [on, (v) => { saveEnterSends(v); setOn(v); }];
}

/* Что сделать по нажатию клавиши в поле: "send" — отправить (сами отменяем перенос),
   null — ничего не делаем, поле ведёт себя как обычно (новая строка, набор IME, другие клавиши) */
export function enterAction(e, enterSends) {
  if (e.key !== "Enter") return null;
  const native = e.nativeEvent || e;
  if (native.isComposing || e.isComposing || e.keyCode === 229 || native.keyCode === 229) return null;
  if (e.ctrlKey || e.metaKey) return "send";
  if (e.shiftKey || e.altKey) return null;
  return enterSends ? "send" : null;
}
