import { useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";

export function LazyLoadSignal({ instanceId }: { instanceId?: string }) {
  const markInstanceAsLoaded = useAppStore((state) => state.markInstanceAsLoaded);

  // Clear the dock loading indicator after commit. The content is already
  // visible; this bookkeeping must not force a nested synchronous render.
  useEffect(() => {
    if (instanceId) {
      const timer = setTimeout(() => markInstanceAsLoaded(instanceId), 0);
      return () => clearTimeout(timer);
    }
  }, [instanceId, markInstanceAsLoaded]);

  return null;
}
