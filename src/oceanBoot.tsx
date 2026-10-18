import { createRoot, type Root } from "react-dom/client";
import { OceanWallpaperLayer } from "./components/layout/desktop/DesktopOceanWallpaperLayer";

let container: HTMLDivElement | undefined;
let root: Root | undefined;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
let resolveReady: () => void;
export const oceanReady = new Promise<void>((resolve) => { resolveReady = resolve; });
const ready = () => resolveReady();

export function startOcean() {
  clearTimeout(releaseTimer);
  if (container) return container;
  container = document.createElement("div");
  container.id = "ocean-root";
  container.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
  document.body.prepend(container);
  root = createRoot(container);
  root.render(<OceanWallpaperLayer onReady={ready} />);
  return container;
}

/** Adopt the already-running renderer; moving its root never recreates the GPU context. */
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
