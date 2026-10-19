import { useTouchViewport } from "./useTouchViewport";

export function useIsMobile(breakpoint = 768) {
  return useTouchViewport(breakpoint, false);
}
