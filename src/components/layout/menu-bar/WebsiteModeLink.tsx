import { useEffect } from "react";
import { Browser } from "@phosphor-icons/react";
import { KEBRON_WEBSITE_URL } from "@/config/kebronSite";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Menu-bar switch to the standard website (kebron.org), like PostHog's website/OS mode. Shift+M also switches. */
export function WebsiteModeLink({ compact }: { compact?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.code === "KeyM" && !isTyping(event.target)) {
        window.location.href = KEBRON_WEBSITE_URL;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <a
      href={KEBRON_WEBSITE_URL}
      className="flex items-center gap-1 px-1.5 py-0.5 text-inherit no-underline"
      style={{ marginRight: "4px" }}
      title="Switch to website mode (Shift+M)"
      aria-label="Switch to website mode"
    >
      <Browser aria-hidden="true" className="h-4 w-4" weight="bold" />
      {!compact && <span>Website</span>}
    </a>
  );
}
