// Stüdyo arka plan dosyası: yalnız telefon bildirimi (25 Ekim 2026). Önbellek tutmaz; uygulama her zaman sunucudan yüklenir.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let v = {};
  try { v = e.data ? e.data.json() : {}; } catch { v = { metin: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(v.baslik || "Updated Stüdyo", {
    body: v.metin || "Yeni bildirim",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: v.id ? "bildirim-" + v.id : undefined,
    data: { link: v.link || "" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hedef = new URL("./" + (e.notification.data?.link || ""), self.registration.scope).href;
  e.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const p of pencereler) { if ("focus" in p) { await p.focus(); if ("navigate" in p) await p.navigate(hedef); return; } }
    await self.clients.openWindow(hedef);
  })());
});
