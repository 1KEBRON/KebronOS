import { createRoot, type Root } from "react-dom/client";

let container: HTMLDivElement | undefined;
let root: Root | undefined;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
export function startOcean() {
  clearTimeout(releaseTimer);
  if (container) return container;
  container = document.createElement("div");
  container.id = "ocean-root";
  container.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
  document.body.prepend(container);
  root = createRoot(container);
  const island = container;
  const islandRoot = root;
  // A frame followed by a task lets the still paint and dispatch input before
  // importing the renderer. A wallpaper change during loading cancels the mount.
  requestAnimationFrame(() => setTimeout(() => {
    if (container !== island) return;
    void import("./components/layout/desktop/DesktopOceanWallpaperLayer").then(
      ({ OceanWallpaperLayer }) => {
        if (container === island) islandRoot.render(<OceanWallpaperLayer />);
      },
      (error) => console.warn("[ocean] still image fallback:", error)
    );
  }, 0));
  return container;
}

/** Mount the independent ocean island; reconnecting never recreates its GPU context. */
export function attachOcean(host: HTMLElement) {
  const island = startOcean();
  island.style.position = "absolute";
  host.appendChild(island);
  const desktop = host.closest<HTMLElement>(".desktop-background");
  const previousTouchAction = desktop?.style.touchAction;
  if (desktop) desktop.style.touchAction = "none";
  return () => {
    if (desktop) desktop.style.touchAction = previousTouchAction ?? "";
    // React StrictMode reconnects immediately; a real wallpaper change releases the renderer.
    releaseTimer = setTimeout(() => {
      root?.unmount();
      island.remove();
      root = undefined;
      container = undefined;
    }, 0);
  };
}

export function hasOceanWallpaper() {
  try {
    const saved = JSON.parse(localStorage.getItem("ryos:display-settings") ?? "null");
    return !saved?.state?.currentWallpaper || saved.state.currentWallpaper === "dynamic://ocean";
  } catch {
    return true;
  }
}
