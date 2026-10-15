// Потоковый ответ ассистента вне истории: текст копится здесь и рисуется одним пузырём (LiveAnswer),
// в чаты пишется один раз, целиком
import { useSyncExternalStore } from "react";

/* ---------- Ответ, который сейчас печатается ----------
   Один на всё приложение и живёт отдельно от истории чатов. Каждый кусок
   потока меняет только этот маленький объект и перерисовывает только пузырь
   ответа (LiveAnswer) — не всё приложение. В историю (localStorage, другие
   вкладки, облако) ответ попадает один раз, целиком, когда поток закончился.
   Хранилище вне компонента: если уйти с экрана ассистента и вернуться,
   ответ продолжит печататься. */
export const STREAM_FLUSH_MS = 40;  // показываем новый текст пачками — примерно 25 раз в секунду

export const live = { chatId: null, text: "" };

export const liveSubs = new Set();

export const liveSet = (patch) => { Object.assign(live, patch); liveSubs.forEach((f) => f()); };

export const liveSubscribe = (f) => { liveSubs.add(f); return () => liveSubs.delete(f); };

export const useLiveChatId = () => useSyncExternalStore(liveSubscribe, () => live.chatId);

export const useLiveText = () => useSyncExternalStore(liveSubscribe, () => live.text);

// Сохранённый на всякий случай кусок ответа (см. checkpoint в streamAnswer):
// пока ответ печатается, в списке его не показываем — вместо него LiveAnswer
export const isPartial = (m) => m?.role === "ai" && m.partial;

// Остановить идущий ответ (кнопка «Остановить» вместо «Отправить»)
export let liveAbort = null;
// Ставит и снимает streamAnswer: импортированную переменную нельзя менять из другого модуля
export function setLiveAbort(fn) { liveAbort = fn; }
