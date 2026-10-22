/* Запрос с пределом ожидания: при «висящей» сети (Wi-Fi без интернета, метро) fetch без него
   ждёт бесконечно. Через ms запрос обрывается ошибкой TimeoutError со словом «network» —
   синхронизация и экраны считают это обрывом связи. Свой signal вызывающего тоже работает
   (отменили сами — отменяется и запрос) */
export function fetchWithTimeout(input, init = {}, ms = 25000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException("network timeout", "TimeoutError")), ms);
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) ctl.abort(outer.reason);
    else outer.addEventListener("abort", () => ctl.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

// Это обрыв по пределу ожидания (а не отмена человеком)?
export const isTimeout = (e) => e?.name === "TimeoutError" || /network timeout/i.test(String(e?.message || ""));
