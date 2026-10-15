import { useEffect, useRef } from "react";
import { useOceanStore } from "@/stores/useOceanStore";

/** Shown in immersive mode: the only chrome left on screen. Escape also returns to the desktop. */
export function ImmersiveExit() {
  const immersive = useOceanStore((s) => s.immersive);
  const setImmersive = useOceanStore((s) => s.setImmersive);
  const soundOn = useOceanStore((s) => s.soundOn);
  const setSoundOn = useOceanStore((s) => s.setSoundOn);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-immersive", immersive);
    if (!immersive) return;
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [immersive, setImmersive]);

  if (!immersive) return null;
  return (
    <div className="ocean-immersive-bar" role="region" aria-label="Ocean view">
      <span className="ocean-immersive-bar__hint">Drag to look around · scroll or pinch to rise</span>
      <button type="button" onClick={() => setSoundOn(!soundOn)} aria-pressed={soundOn}>
        {soundOn ? "Sound on" : "Sound off"}
      </button>
      <button ref={buttonRef} type="button" onClick={() => setImmersive(false)}>
        Back to desktop
      </button>
    </div>
  );
}
