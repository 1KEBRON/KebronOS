import { useCallback, useMemo } from "react";
import { useAppStore } from "@/stores/useAppStore";

type DockOffsetsParams = {
  appId: string;
  instanceId?: string;
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  measureDockOffset: boolean;
};

export type WindowGeometry = Pick<
  DockOffsetsParams,
  "windowPosition" | "windowSize"
>;

function findDockTargetElement(
  appId: string,
  instanceId?: string
): Element | null {
  // Applet-viewer windows get one dock icon per instance keyed by
  // instanceId, so prefer that over the per-app lookup.
  if (instanceId) {
    const instanceIcon = document.querySelector(
      `[data-dock-icon="${instanceId}"]`
    );
    if (instanceIcon) return instanceIcon;
  }

  const dockIcon = document.querySelector(`[data-dock-icon="${appId}"]`);
  if (dockIcon) return dockIcon;

  return instanceId
    ? document.querySelector(`[data-taskbar-item="${instanceId}"]`)
    : null;
}

/**
 * Offset from the window center to the dock icon (or taskbar item) center.
 *
 * Measured from the live DOM on every call: dock icons appear only after the
 * app has launched and shift whenever the dock re-centers, so a cached
 * position would send minimizing windows to the wrong place.
 */
export function computeDockIconOffset(
  appId: string,
  instanceId: string | undefined,
  { windowPosition, windowSize }: WindowGeometry
): { x: number; y: number } {
  const windowCenterX = windowPosition.x + windowSize.width / 2;
  const windowCenterY = windowPosition.y + windowSize.height / 2;

  const target = findDockTargetElement(appId, instanceId);
  if (target) {
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - windowCenterX,
      y: rect.top + rect.height / 2 - windowCenterY,
    };
  }

  // No dock icon or taskbar item (e.g. System 7): slide straight down
  // off the bottom of the screen.
  return { x: 0, y: window.innerHeight - windowPosition.y };
}

export function useWindowFrameDockOffsets({
  appId,
  instanceId,
  windowPosition,
  windowSize,
  measureDockOffset,
}: DockOffsetsParams) {
  // Only restore / keep-mounted minimize consume this offset. Ordinary opens
  // and typing must not force a layout to measure an unused dock position.
  const dockIconOffset = measureDockOffset
    ? computeDockIconOffset(appId, instanceId, { windowPosition, windowSize })
    : { x: 0, y: 0 };

  // Lazy getter for the exit animation, which Motion resolves when the
  // window is actually removed — after this component's last render.
  const getDockIconOffset = useCallback(
    () => computeDockIconOffset(appId, instanceId, { windowPosition, windowSize }),
    [appId, instanceId, windowPosition, windowSize]
  );

  const launchOrigin = useAppStore((state) =>
    instanceId ? state.instances[instanceId]?.launchOrigin : undefined
  );

  const launchOriginOffset = useMemo(() => {
    if (!launchOrigin) return null;

    const windowCenterX = windowPosition.x + windowSize.width / 2;
    const windowCenterY = windowPosition.y + windowSize.height / 2;
    const iconCenterX = launchOrigin.x + launchOrigin.width / 2;
    const iconCenterY = launchOrigin.y + launchOrigin.height / 2;

    return {
      x: iconCenterX - windowCenterX,
      y: iconCenterY - windowCenterY,
    };
  }, [launchOrigin, windowPosition, windowSize]);

  return { dockIconOffset, getDockIconOffset, launchOriginOffset };
}
