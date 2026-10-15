// Kebron's public desktop: what this slimmed ryOS fork shows. ryOS's server API is not deployed here,
// so anything that needs it stays hidden and its background calls are switched off.

/** No ryOS API server on this static site (no accounts, sync, AI, analytics collector). */
export const HAS_API = false;

/** Apps a visitor can find (Applications, Spotlight). All run fully in the browser. */
export const KEBRON_VISIBLE_APPS = new Set<string>([
  "finder",
  "preview",
  "ipod",
  "control-panels",
]);

/** App icons placed on the desktop next to README.md and the Projects and North Star folders. */
export const KEBRON_DESKTOP_APPS = new Set<string>(["ipod"]);

export const README_PATH = "/Documents/README.md";

/** The standard website (website mode) and this site's public source (AGPL-3.0 source offer). */
export const KEBRON_WEBSITE_URL = "https://kebron.org";
export const KEBRON_SOURCE_URL = "https://github.com/1KEBRON/KebronOS";

export const isKebronVisibleApp = (appId: string) => KEBRON_VISIBLE_APPS.has(appId);

/**
 * Placement for the README when it is the first window: a comfortable reading column on desktop,
 * and on phones a lower sheet that leaves the sea visible above it and the dock below.
 */
export function readmeWindowPlacement(
  appId: string,
  initialData: unknown,
  openInstances: number,
  isMobile: boolean
): { position: { x: number; y: number }; size: { width: number; height: number } } | null {
  const path = (initialData as { path?: string } | undefined)?.path;
  if (appId !== "preview" || path !== README_PATH || openInstances > 0 || typeof window === "undefined") return null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (isMobile) {
    const dock = 96;
    const top = Math.round(h * 0.3);
    return { position: { x: 0, y: top }, size: { width: w, height: Math.max(320, h - top - dock) } };
  }
  const width = Math.min(680, w - 240);
  const height = Math.min(620, h - 170);
  return { position: { x: Math.max(48, Math.round(w * 0.07)), y: 64 }, size: { width, height } };
}

/**
 * Where the iPod first appears. Phones: the whole space between the menu bar
 * and the dock (IpodDeviceBody scales and centres the device). Wide desktops:
 * on the sea to the right of the README.
 */
export function ipodWindowPlacement(
  appId: string,
  isMobile: boolean
): { position: { x: number; y: number }; size: { width: number; height: number } } | null {
  if (appId !== "ipod" || typeof window === "undefined") return null;
  if (!isMobile) {
    // Desktop: stand it on the sea right of the README, clear of the icon column.
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 1100) return null;
    return {
      position: { x: w - 300 - 210, y: Math.max(56, Math.round((h - 480) / 2) - 30) },
      size: { width: 300, height: 480 },
    };
  }
  const top = 28;
  const dock = 96;
  return {
    position: { x: 0, y: top },
    size: { width: window.innerWidth, height: Math.max(360, window.innerHeight - top - dock) },
  };
}
