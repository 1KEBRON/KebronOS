import { ArrowsOutSimple, Waves } from "@phosphor-icons/react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { isOceanWallpaper } from "@/utils/dynamicWallpaper";
import { useOceanStore } from "@/stores/useOceanStore";

/** Menu-bar controls for the live ocean wallpaper: ambient sound and immersive (ocean-only) view. */
export function OceanControls() {
  const { currentWallpaper } = useWallpaper();
  const soundOn = useOceanStore((s) => s.soundOn);
  const setSoundOn = useOceanStore((s) => s.setSoundOn);
  const setImmersive = useOceanStore((s) => s.setImmersive);
  if (!isOceanWallpaper(currentWallpaper)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setSoundOn(!soundOn)}
        className="flex items-center justify-center px-1.5 py-0.5"
        style={{ marginRight: "2px", opacity: soundOn ? 1 : 0.55 }}
        aria-pressed={soundOn}
        title={soundOn ? "Ocean sound: on" : "Ocean sound: off"}
        aria-label="Ocean sound"
        data-ocean-sound
      >
        <Waves aria-hidden="true" className="h-4 w-4" weight={soundOn ? "bold" : "regular"} />
      </button>
      <button
        type="button"
        onClick={() => setImmersive(true)}
        className="flex items-center justify-center px-1.5 py-0.5"
        style={{ marginRight: "4px" }}
        title="Just the ocean"
        aria-label="Hide the desktop and explore the ocean"
        data-ocean-immersive
      >
        <ArrowsOutSimple aria-hidden="true" className="h-4 w-4" weight="bold" />
      </button>
    </>
  );
}
