import { cn } from "@/lib/utils";

const MASK = "url(/kebron-mark.svg) center / contain no-repeat";

/** The Kebron mark, painted in the current text colour (`public/kebron-mark.svg`). */
export function KebronMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block bg-current", className)}
      style={{ mask: MASK, WebkitMask: MASK }}
    />
  );
}
