import { useThemeFlags } from "@/hooks/useThemeFlags";

/**
 * Whether the iPod renders as a free-standing device (no window chrome).
 * Only Kebron's own theme (macosx + aqua material "kebron") does this; the
 * other themes keep the classic brushed-metal / Windows window around it.
 */
export function useIpodFrameless(): boolean {
  return useThemeFlags().isKebron;
}
