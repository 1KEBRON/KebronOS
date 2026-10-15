// Keeps the site's seeded files (README, Projects notes, North Star, desktop aliases) in step with public/data/filesystem.json.
//
// ryOS seeds its virtual filesystem only once per browser, and only stores text for /Documents, /Images and
// /Applets. So a visitor who came before the content changed — or any seeded file outside those folders —
// would see stale or missing files ("Couldn't open this file"). This runs on every load and re-applies the
// seed whenever its content changes, without touching anything the visitor created.
import { useFilesStore } from "@/stores/useFilesStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { dbOperations, STORES } from "@/utils/indexedDB";
import { OCEAN_WALLPAPER } from "@/utils/dynamicWallpaper";
import { KEBRON_DESKTOP_APPS } from "@/config/kebronSite";
import type { OsThemeId } from "@/themes/types";

type SeedItem = {
  path: string;
  name: string;
  isDirectory: boolean;
  type?: string;
  icon?: string;
  content?: string;
  aliasTarget?: string;
  aliasType?: "file" | "app";
};

const SEED_KEY = "kebron:seed";
const DEFAULTS_KEY = "kebron:defaults";
const DEFAULTS_VERSION = "4";

/** Stock ryOS sample files, removed once so the desktop only shows this site's content. */
const STOCK_PATHS = [
  "/Documents/Quick Tips.md",
  "/Images/steve-jobs.png",
  "/Images/susan-kare.png",
  "/Books/Meditations - Marcus Aurelius.epub",
  // Project notes no longer on the site.
  "/Documents/Projects/Eri Atlas.md",
  "/Documents/Projects/Adi Nfas.md",
];
const ALL_THEMES: OsThemeId[] = ["macosx", "system7", "xp", "win98"];

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const readKey = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeKey = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* best effort */
  }
};

function whenLibraryLoaded(): Promise<void> {
  return new Promise((resolve) => {
    if (useFilesStore.getState().libraryState === "loaded") return resolve();
    const unsubscribe = useFilesStore.subscribe((s) => {
      if (s.libraryState === "loaded") {
        unsubscribe();
        resolve();
      }
    });
  });
}

/** One-time defaults for browsers that visited before this site existed (stock ryOS state). */
function applyDefaultsOnce() {
  if (readKey(DEFAULTS_KEY) === DEFAULTS_VERSION) return;
  const files = useFilesStore.getState();
  for (const path of STOCK_PATHS) if (files.getItem(path)) files.removeItem(path, true);
  for (const item of Object.values(files.items)) {
    // Earlier layouts: Work notes loose in /Desktop/Work, then a Work folder (now Projects).
    if (/^\/(Desktop|Documents)\/Work(\/|$)/.test(item.path)) files.removeItem(item.path, true);
  }
  useDockStore.getState().reset();
  useDisplaySettingsStore.getState().setCurrentWallpaper(OCEAN_WALLPAPER);
  writeKey(DEFAULTS_KEY, DEFAULTS_VERSION);
}

/** Desktop app icons: only the chosen apps are visible, whatever an earlier visit stored. */
function alignDesktopAppIcons() {
  const files = useFilesStore.getState();
  for (const item of Object.values(files.items)) {
    if (item.status !== "active" || item.aliasType !== "app" || !item.path.startsWith("/Desktop/")) continue;
    const visible = KEBRON_DESKTOP_APPS.has(item.aliasTarget ?? "");
    const hidden = item.hiddenOnThemes ?? [];
    if (visible && hidden.length) files.updateItemMetadata(item.path, { hiddenOnThemes: [] });
    if (!visible && hidden.length < ALL_THEMES.length) files.updateItemMetadata(item.path, { hiddenOnThemes: ALL_THEMES });
  }
}

export async function syncKebronSeed() {
  try {
    const text = await fetch("/data/filesystem.json", { cache: "no-cache" }).then((r) => r.text());
    await whenLibraryLoaded();
    applyDefaultsOnce();
    alignDesktopAppIcons();

    const signature = hash(text);
    const data = JSON.parse(text) as { directories: SeedItem[]; files: SeedItem[] };
    const store = useFilesStore.getState();
    const missing = data.files.some((f) => store.getItem(f.path)?.status !== "active");
    if (readKey(SEED_KEY) === signature && !missing) return;

    for (const dir of data.directories) {
      const existing = store.getItem(dir.path);
      if (!existing || existing.status !== "active") store.addItem({ ...dir, isDirectory: true });
    }
    for (const file of data.files) {
      const { content, ...meta } = file;
      store.addItem({ ...meta, isDirectory: false });
      const uuid = useFilesStore.getState().getItem(file.path)?.uuid;
      if (content !== undefined && uuid && file.path.startsWith("/Documents/")) {
        await dbOperations.put(STORES.DOCUMENTS, { name: file.name, content }, uuid);
      }
    }
    writeKey(SEED_KEY, signature);
    // Open Finder windows (Map) re-read the documents' text.
    window.dispatchEvent(new Event("kebron:seed-synced"));
  } catch (error) {
    console.warn("[kebron] could not sync the seeded files", error);
  }
}
