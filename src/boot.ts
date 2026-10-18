import { hasOceanWallpaper, oceanReady, startOcean } from "./oceanBoot";

const ocean = hasOceanWallpaper();
if (ocean) startOcean();

// Download the desktop while the selected ocean engine initializes. main.tsx waits
// for its first presented frame; failed or unavailable graphics still allow boot.
export const wallpaperReady = ocean
  ? Promise.race([oceanReady, new Promise<void>((resolve) => setTimeout(resolve, 8000))])
  : Promise.resolve();
void import("./main");
