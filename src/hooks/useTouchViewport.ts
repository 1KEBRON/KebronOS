import { useSyncExternalStore } from "react";

const serverSnapshot = () => false;

/** Cache viewport checks: React may read a store repeatedly during one commit. */
export function createTouchViewportStore(breakpoint: number, requireTouch: boolean) {
  const read = () => {
    if (typeof window === "undefined") return false;
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const small = window.innerWidth < breakpoint;
    return requireTouch ? touch && small : touch || small;
  };
  let matches = read();
  const listeners = new Set<() => void>();
  const update = () => {
    const next = read();
    if (matches === next) return;
    matches = next;
    listeners.forEach(callback => callback());
  };
  return {
    getSnapshot: () => matches,
    subscribe(callback: () => void) {
      listeners.add(callback);
      if (listeners.size === 1) {
        window.addEventListener("resize", update);
        // Catch a resize while unsubscribed or between render and subscription.
        update();
      }
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) window.removeEventListener("resize", update);
      };
    },
  };
}

// New windows share the shell's cached classification. Mounting every menu and
// dialog must not reread innerWidth and force layout during the same commit.
const stores = new WeakMap<Window, Map<string, ReturnType<typeof createTouchViewportStore>>>();
export function getTouchViewportStore(breakpoint: number, requireTouch: boolean) {
  if (typeof window === "undefined") return createTouchViewportStore(breakpoint, requireTouch);
  let viewportStores = stores.get(window);
  if (!viewportStores) {
    viewportStores = new Map();
    stores.set(window, viewportStores);
  }
  const key = `${breakpoint}:${requireTouch}`;
  let store = viewportStores.get(key);
  if (!store) {
    store = createTouchViewportStore(breakpoint, requireTouch);
    viewportStores.set(key, store);
  }
  return store;
}

export function useTouchViewport(breakpoint: number, requireTouch: boolean) {
  const store = getTouchViewportStore(breakpoint, requireTouch);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}
