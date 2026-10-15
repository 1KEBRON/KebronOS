// Reads the text documents of a folder (for the Map's links) and parses their
// front matter.
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFilesStore } from "@/stores/useFilesStore";
import { dbOperations } from "@/utils/indexedDB";
import { getStoreForFile } from "@/utils/indexedDBOperations";
import { onDocumentContentSynced } from "@/utils/appEventBus";
import { parentFolder, parseFrontMatter, type ParsedDocument } from "./frontMatter";

/** Fired by the site seed (kebronSeed.ts) after it has written document text. */
export const SEED_SYNCED_EVENT = "kebron:seed-synced";

const TEXT_FILE = /\.(md|markdown|txt)$/i;

export function isTextDocumentName(name: string) {
  return TEXT_FILE.test(name);
}

async function readText(path: string): Promise<string | null> {
  const item = useFilesStore.getState().getItem(path);
  if (!item?.uuid || item.isDirectory) return null;
  const store = getStoreForFile(path, item);
  if (!store) return null;
  try {
    const data = await dbOperations.get<{ content?: string | Blob }>(store, item.uuid);
    const content = data?.content;
    if (typeof content === "string") return content;
    if (content instanceof Blob) return await content.text();
  } catch {
    // unreadable content: treat as no document
  }
  return null;
}

/** Parsed documents for the given paths (non-text and unreadable files are skipped). */
export async function loadDocuments(paths: string[]): Promise<Map<string, ParsedDocument>> {
  const out = new Map<string, ParsedDocument>();
  await Promise.all(
    paths
      .filter((path) => isTextDocumentName(path))
      .map(async (path) => {
        const text = await readText(path);
        if (text !== null) out.set(path, parseFrontMatter(text));
      })
  );
  return out;
}

/** Every active text document directly inside `folderPath`. */
export async function loadFolderDocuments(folderPath: string): Promise<Map<string, ParsedDocument>> {
  const items = useFilesStore.getState().getItemsInPath(folderPath);
  return loadDocuments(items.filter((item) => !item.isDirectory && item.status !== "trashed").map((item) => item.path));
}

/** Hook form: re-reads when the set of files changes or when document text is (re)written. */
export function useFolderDocuments(paths: string[]): { docs: Map<string, ParsedDocument>; ready: boolean } {
  const [state, setState] = useState<{ key: string | null; docs: Map<string, ParsedDocument> }>(() => ({
    key: null,
    docs: new Map(),
  }));
  const [revision, setRevision] = useState(0);
  const key = paths.filter(isTextDocumentName).sort().join("\n");

  useEffect(() => {
    const bump = () => setRevision((r) => r + 1);
    window.addEventListener(SEED_SYNCED_EVENT, bump);
    const unsubscribe = onDocumentContentSynced(bump);
    return () => {
      window.removeEventListener(SEED_SYNCED_EVENT, bump);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setState({ key, docs: new Map() });
      return;
    }
    void loadDocuments(key.split("\n")).then((next) => {
      if (!cancelled) setState({ key, docs: next });
    });
    return () => {
      cancelled = true;
    };
  }, [key, revision]);

  return { docs: state.docs, ready: state.key === key };
}

/**
 * Map is offered only where it means something: North Star, or any folder whose
 * documents link to each other (front matter `links:`).
 */
export function useFolderHasMap(folderPath: string, alwaysMap = false): boolean {
  const paths = useFilesStore(
    useShallow((state) =>
      Object.values(state.items)
        .filter(
          (item) =>
            !item.isDirectory &&
            item.status !== "trashed" &&
            isTextDocumentName(item.name) &&
            parentFolder(item.path) === folderPath
        )
        .map((item) => item.path)
    )
  );
  const { docs } = useFolderDocuments(alwaysMap ? [] : paths);
  return useMemo(
    () => alwaysMap || [...docs.values()].some((doc) => doc.links.length > 0),
    [alwaysMap, docs]
  );
}
