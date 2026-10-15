import { requestAppLaunch } from "@/utils/appEventBus";
import { README_PATH } from "@/config/kebronSite";

/**
 * Opens README.md in Preview the first time someone visits. The text is read straight from the
 * filesystem seed so it does not race the first-boot library initialisation.
 */
let opened = false;

export function openReadmeOnFirstVisit() {
  if (opened) return; // React StrictMode runs first-boot effects twice in development
  opened = true;
  void fetch("/data/filesystem.json")
    .then((r) => r.json())
    .then((data: { files?: Array<{ path: string; content?: string }> }) => {
      const readme = data.files?.find((f) => f.path === README_PATH);
      // Give the desktop a moment to settle so the window opens over the sea, not over a blank screen.
      setTimeout(() => {
        requestAppLaunch({ appId: "preview", initialData: { path: README_PATH, content: readme?.content } });
      }, 900);
    })
    .catch(() => requestAppLaunch({ appId: "preview", initialData: { path: README_PATH } }));
}
