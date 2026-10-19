// Give the inline dawn background one rendering opportunity before Vite inserts
// the UI's stylesheets. Neither import waits for graphics or ocean readiness.
requestAnimationFrame(() => requestAnimationFrame(() => {
  void import("./main");
  void import("./oceanBoot").then(({ hasOceanWallpaper, startOcean }) => {
    // NAGI's photo textures must not compete with the phone UI's download.
    // Its DesktopOceanHost starts the island after the desktop has mounted.
    const compact = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
    if (hasOceanWallpaper() && !compact && "gpu" in navigator) startOcean();
  }).catch((error) => console.warn("[ocean] still image fallback:", error));
}));
