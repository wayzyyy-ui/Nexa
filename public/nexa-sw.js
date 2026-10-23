/* Фоновый помощник сайта NEXA — ТОЛЬКО веб-уведомления (Web Push), ничего не кэширует и запросы
   страницы не трогает (обработчика fetch нет): сайт загружается и обновляется как раньше.
   push — показать «Вышла NEXA X»; notificationclick — открыть NEXA (уже открытую вкладку — поверх). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const title = typeof d.title === "string" ? d.title.slice(0, 80) : "NEXA";
  const body = typeof d.body === "string" ? d.body.slice(0, 400) : "";
  const url = typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/";
  e.waitUntil(self.registration.showNotification(title, {
    body, tag: typeof d.tag === "string" ? d.tag : "nexa", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (same) { await same.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
