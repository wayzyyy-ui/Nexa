/* Переход между разделами с клавиатуры (компьютер, сайт и приложение для ПК):
   Ctrl+← — раздел выше в боковом меню, Ctrl+→ — ниже. По кругу не ходит.
   Не срабатывает: в полях ввода (там Ctrl+стрелка — переход по словам),
   при открытом окне или меню, с Alt / Shift / ⌘, при повторе от удержания клавиши.
   Чистая функция — тесты tests/keynav.test.mjs */
export function arrowNavTarget({ key, ctrlKey, altKey, shiftKey, metaKey, repeat, editable, blocked, order, tab }) {
  if (!ctrlKey || altKey || shiftKey || metaKey || repeat || editable || blocked) return null;
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (!step || !Array.isArray(order)) return null;
  const i = order.indexOf(tab);
  if (i < 0) return null;
  return order[i + step] ?? null;
}

// Фокус в поле, где стрелки нужны самому полю
export function isEditable(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  // Флажки и кнопки стрелками не управляются — там сочетание можно отдать разделам
  return !/^(checkbox|radio|button|submit|reset|color|file|image)$/i.test(el.type || "text");
}
