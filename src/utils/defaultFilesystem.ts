import { abortableFetch } from "./abortableFetch";

let filesystemText: Promise<string> | undefined;

/** One fresh seed per page load, shared by library hydration, README and sync. */
export function loadDefaultFilesystemText(): Promise<string> {
  filesystemText ??= abortableFetch("/data/filesystem.json", {
    credentials: "same-origin",
    cache: "no-cache",
    priority: "high",
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  }).then(response => response.text()).catch(error => {
    filesystemText = undefined;
    throw error;
  });
  return filesystemText;
}
