import { useLayoutEffect, useRef } from "react";
import { attachOcean } from "@/oceanBoot";

export function DesktopOceanHost() {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host.current) return attachOcean(host.current);
  }, []);
  return <div ref={host} className="absolute inset-0 z-[-10]" aria-hidden="true" />;
}
