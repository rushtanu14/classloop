const CACHE_NAME = "classloop-mobile-shell-v5";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/classloop-downloads.json",
  "/classloop-app-icon.svg",
  "/classloop-app-icon-192.png",
  "/classloop-app-icon-512.png",
  "/classroom-background.svg",
  "/screenshots/classloop-import-review.svg",
  "/screenshots/classloop-student-dashboard.svg",
  "/screenshots/classloop-analytics.svg",
  "/abyssal-hero.png",
  "/abyssal-landscape.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (event.request.method === "GET" && response.ok) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
      }
      return response;
    }))
  );
});
