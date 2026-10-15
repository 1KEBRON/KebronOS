import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Live ocean wallpaper preferences (kebron desktop). */
type OceanState = {
  /** Ambient ocean sound; off until the visitor turns it on (browsers block autoplay anyway). */
  soundOn: boolean;
  /** Hide the desktop chrome and just look at the sea. Not persisted. */
  immersive: boolean;
  /** Freeze the waves and drift; defaults to the system reduced-motion setting. */
  motionPaused: boolean | null;
  setSoundOn: (on: boolean) => void;
  setImmersive: (on: boolean) => void;
  setMotionPaused: (paused: boolean) => void;
};

export const useOceanStore = create<OceanState>()(
  persist(
    (set) => ({
      soundOn: false,
      immersive: false,
      motionPaused: null,
      setSoundOn: (soundOn) => set({ soundOn }),
      setImmersive: (immersive) => set({ immersive }),
      setMotionPaused: (motionPaused) => set({ motionPaused }),
    }),
    {
      name: "kebron:ocean",
      partialize: (s) => ({ soundOn: s.soundOn, motionPaused: s.motionPaused }),
      // Sound must be re-enabled by a gesture on each visit; remember only the motion choice.
      merge: (persisted, current) => ({ ...current, motionPaused: (persisted as Partial<OceanState>)?.motionPaused ?? null }),
    }
  )
);
