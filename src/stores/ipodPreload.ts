/**
 * iPod default-track preloading, extracted from `useIpodStore`.
 *
 * `main.tsx` kicks this off before React mounts. Keeping it in its own thin
 * module means the entry chunk only pays for the song-metadata API client —
 * not the entire 2,600-line iPod store and its transitive dependencies.
 */
import { listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import { mapCatalogSongToTrack } from "@/stores/ipodCatalogTrackMapping";
import type { Track } from "@/shared/media/library";
import { createClientLogger } from "@/utils/logger";
import { HAS_API } from "@/config/kebronSite";

const log = createClientLogger("IpodPreload");

/**
 * Kebron's playlist. With no ryOS API (static site) this file is the whole iPod library:
 * edit `public/data/ipod-videos.json` (`{ videos: [{ id, url, title, artist, album }] }`, in play order).
 * The version is a hash of the file, so any edit replaces the library visitors have stored.
 */
const STATIC_LIBRARY_URL = "/data/ipod-videos.json";

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function loadStaticTracks(): Promise<{ tracks: Track[]; version: number }> {
  const text = await fetch(STATIC_LIBRARY_URL, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
  const data = JSON.parse(text) as { videos?: Track[] };
  const tracks: Track[] = (data.videos ?? [])
    .filter((v) => v && typeof v.id === "string" && v.id)
    .map((v) => ({
      id: v.id,
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
      artist: v.artist,
      album: v.album ?? "",
    }));
  // Never 0/1: those mean "unknown" elsewhere in the store.
  return { tracks, version: hashText(text) || 2 };
}

// In-memory cache for iPod tracks data
let cachedIpodData: { tracks: Track[]; version: number } | null = null;
let ipodDataPromise: Promise<{ tracks: Track[]; version: number }> | null =
  null;
/** Only the latest load may write `cachedIpodData` (avoids stale force-refresh overwrites). */
let ipodLoadGeneration = 0;

/**
 * Preload iPod tracks data early (can be called before React mounts).
 * This starts fetching the JSON file without blocking.
 */
export function preloadIpodData(): void {
  if (cachedIpodData || ipodDataPromise) return;
  loadDefaultTracks();
}

/**
 * Load default tracks from Redis song metadata cache.
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (used by syncLibrary)
 */
export async function loadDefaultTracks(forceRefresh = false): Promise<{
  tracks: Track[];
  version: number;
}> {
  // Return cached data immediately if available (unless force refresh)
  if (!forceRefresh && cachedIpodData) {
    return cachedIpodData;
  }

  // Return existing promise if fetch is in progress (deduplication)
  // But not if we need a force refresh
  if (!forceRefresh && ipodDataPromise) {
    return ipodDataPromise;
  }

  const thisGeneration = ++ipodLoadGeneration;

  // Start new fetch
  const fetchPromise = (async () => {
    try {
      if (!HAS_API) {
        const payload = await loadStaticTracks();
        log.debug("Loaded tracks from static playlist", { trackCount: payload.tracks.length });
        if (thisGeneration === ipodLoadGeneration) {
          cachedIpodData = payload;
          return payload;
        }
        return cachedIpodData ?? payload;
      }

      // Load from Redis song metadata cache
      // Only sync songs created by user "ryo" (the admin/curator)
      const cachedSongs = await listAllCachedSongMetadata("ryo");

      log.debug("Loaded tracks from Redis cache", {
        trackCount: cachedSongs.length,
        createdBy: "ryo",
      });
      // Songs are already sorted by createdAt (newest first) from the API
      const tracks: Track[] = cachedSongs.map(mapCatalogSongToTrack);
      // Use the latest createdAt timestamp as version (or 1 if empty)
      const version =
        cachedSongs.length > 0
          ? Math.max(...cachedSongs.map((s) => s.createdAt || 1))
          : 1;
      const payload = { tracks, version };
      if (thisGeneration === ipodLoadGeneration) {
        cachedIpodData = payload;
        return payload;
      }
      // A newer load won the race; prefer latest cache so awaiters do not apply stale tracks.
      return cachedIpodData ?? payload;
    } catch (err) {
      console.error("Failed to load tracks from cache", err);
      return { tracks: [], version: 1 };
    }
  })();

  // Only set the shared promise for non-force-refresh requests
  if (!forceRefresh) {
    ipodDataPromise = fetchPromise;
    fetchPromise.finally(() => {
      ipodDataPromise = null;
    });
  }

  return fetchPromise;
}
