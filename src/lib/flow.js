// NEXA Flow: настройки, статусы отправленного, история, копирование
export const LINK_STATUS = {
  online: "На связи", connecting: "Подключаемся…", offline: "Нет связи", denied: "Канал не настроен", off: "",
};

// Время входящего: «14:05» сегодня, иначе «3 окт., 14:05»
export const inboxTime = (ts) => {
  const d = new Date(ts), today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return today ? hm : `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${hm}`;
};

// Скопировать текст: буфер обмена, а если он недоступен — старый способ
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

/* ─── NEXA Flow: общий буфер между устройствами аккаунта ───
   Работает поверх существующей связи (useDeviceLink): текст уходит событием
   text.send, получатель отвечает text.ack. Буфер обмена читается только по
   нажатию «Вставить скопированное», пишется — по «Копировать» (или сам, если
   включено «Сразу копировать полученное»). Пароли и ключи в историю не пишутся */
export const FLOW_DEFAULT = { on: true, autoCopy: false };

export const loadFlow = (key) => { try { return { ...FLOW_DEFAULT, ...(JSON.parse(localStorage.getItem(key)) || {}) }; } catch { return FLOW_DEFAULT; } };

// Подпись статуса отправленного и его цвет
export const FLOW_STATUS = {
  sending: ["Отправляем…", "muted"],
  sent: ["Ждём подтверждения…", "muted"],
  delivered: ["Доставлено", "green"],
  off: ["На устройстве выключен NEXA Flow", "red"],
  unconfirmed: ["Не подтвердило — возможно, NEXA там свёрнута", "muted"],
  error: ["Не отправилось — нет связи", "red"],
};

// Полученное и отправленное одним списком, новые сверху. who — только с этими устройствами
export function flowHistory(link, who) {
  const mine = (id) => !who || who.includes(id);
  return [
    ...link.inbox.filter((x) => mine(x.from_device)).map((x) => ({ ...x, dir: "in" })),
    ...(link.sent || []).filter((x) => !who || mine(x.to_device)).map((x) => ({ ...x, dir: "out" })),
  ].sort((a, b) => b.ts - a.ts);
}
