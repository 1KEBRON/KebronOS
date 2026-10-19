import { useTouchViewport } from "./useTouchViewport";

export function useIsPhone(breakpoint = 640) {
  return useTouchViewport(breakpoint, true);
}
