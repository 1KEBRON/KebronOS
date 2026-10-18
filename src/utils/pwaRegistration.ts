import { registerSW } from "virtual:pwa-register";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("PWA");
let hasRegistered = false;

// The first visit loaded these before a worker could control the page. Seed only
// those resources from the HTTP cache, so the next offline visit has its engine
// and open app without installing every optional app and locale.
async function cacheVisitedAssets() {
  const resources = new Set(performance.getEntriesByType("resource").map((entry) => entry.name));
  for (const resource of resources) {
    const url = new URL(resource);
    if (url.origin !== location.origin) continue;
    const path = url.pathname;
    const cacheName = path.startsWith("/assets/") && path.endsWith(".js") ? "js-resources"
      : path.endsWith(".css") ? "css-resources"
      : /\.(woff2?|ttf|otf|eot)$/.test(path) ? "fonts"
      : /^\/(assets|icons|ocean)\/.+\.(png|jpe?g|svg|webp|avif)$/.test(path) ? "images"
      : null;
    if (!cacheName || await caches.match(resource)) continue;
    try {
      const response = await fetch(resource, { cache: "force-cache" });
      if (response.ok) await (await caches.open(cacheName)).put(resource, response);
    } catch {
      // Offline during installation: retain whatever was already available.
    }
  }
}

export function initPwaRegistration(): void {
  if (hasRegistered || !("serviceWorker" in navigator)) {
    return;
  }
  hasRegistered = true;

  registerSW({
    // This module is itself imported from the idle bootstrap queue, so the
    // registration can start immediately without entering the paint path.
    immediate: true,
    onRegisteredSW(_serviceWorkerUrl, registration) {
      log.debug("Service worker registered", {
        active: Boolean(registration?.active),
      });
      void navigator.serviceWorker.ready.then(() => cacheVisitedAssets()).catch((error) => {
        log.debug("Could not cache visited assets", { error });
      });
    },
    onRegisterError(error) {
      hasRegistered = false;
      console.warn("[ryOS] Service worker registration failed:", error);
    },
  });
}
