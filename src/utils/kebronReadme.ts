import { useAppStore } from "@/stores/useAppStore";
import { loadDefaultFilesystemText } from "./defaultFilesystem";
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
  const open = (content?: string) => {
    // A deliberate early app launch takes priority over the welcome document.
    if (useAppStore.getState().foregroundInstanceId) return;
    requestAppLaunch({ appId: "preview", initialData: { path: README_PATH, content } });
  };
  void loadDefaultFilesystemText()
    .then((text) => JSON.parse(text))
    .then((data: { files?: Array<{ path: string; content?: string }> }) => {
      const readme = data.files?.find((f) => f.path === README_PATH);
      // Allow the first desktop interaction before the welcome window mounts.
      // This is independent of live-wallpaper readiness.
      setTimeout(() => open(readme?.content), 500);
    })
    .catch(() => setTimeout(() => open(), 500));
}
