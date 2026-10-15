import { useEffect, useRef, useState } from "react";

interface UseIpodScaleOptions {
  isWindowOpen: boolean;
  isMinimized: boolean;
  /**
   * Frameless device: the window box *is* the device, so fill it with only a
   * small margin (close button, shadow) and allow shrinking below 1× so
   * phones can fit it.
   */
  fill?: boolean;
}

interface UseIpodScaleResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
}

/**
 * Measures the iPod container and computes a CSS scale factor so the fixed
 * 250×400 device art fills the available window space (capped at 2×, never
 * below 1×). Re-measures on resize and when the window is restored from a
 * minimized state.
 *
 * Extracted verbatim from `useIpodLogic` — behavior is unchanged.
 */
export function useIpodScale({
  isWindowOpen,
  isMinimized,
  fill = false,
}: UseIpodScaleOptions): UseIpodScaleResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prevMinimizedRef = useRef(isMinimized);

  useEffect(() => {
    let timeoutId: number;

    const handleResize = () => {
      if (!containerRef.current) return;

      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const baseWidth = 250;
        const baseHeight = 400;
        // Frameless keeps a few px for the close button and the shadow.
        const padding = fill ? 16 : 50;
        const availableWidth = containerWidth - padding;
        const availableHeight = containerHeight - padding;
        const widthScale = availableWidth / baseWidth;
        const heightScale = availableHeight / baseHeight;
        const newScale = Math.min(widthScale, heightScale, fill ? 1.32 : 2);
        const finalScale = Math.max(fill ? 0.5 : 1, newScale);

        setScale((prevScale) => {
          if (Math.abs(prevScale - finalScale) > 0.01) return finalScale;
          return prevScale;
        });
      });
    };

    timeoutId = window.setTimeout(handleResize, 10);

    if (prevMinimizedRef.current && !isMinimized) {
      [50, 100, 200, 300, 500].forEach((delay) => {
        window.setTimeout(handleResize, delay);
      });
    }
    prevMinimizedRef.current = isMinimized;

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleResize, 10);
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isWindowOpen, isMinimized, fill]);

  return { containerRef, scale };
}
