// Turns a Finder folder into Map nodes: one node per item, edges from the
// documents' `links:` front matter (see frontMatter.ts).
import {
  documentTitle,
  metaString,
  plainText,
  resolveLink,
  type ParsedDocument,
} from "./frontMatter";
import { buildGraph, pickStart, type Graph, type MapNode, type MapNodeKind } from "./layout";

export interface FolderMapItem {
  path: string;
  name: string;
  isDirectory: boolean;
}

const SOURCE_TYPES = new Set<MapNodeKind>(["video", "film", "book", "post"]);

/** The Map kind of an item, from its front matter `kind`/`type` or its file type. */
export function mapKind(item: FolderMapItem, doc?: ParsedDocument): MapNodeKind {
  if (item.isDirectory) return "folder";
  const kind = metaString(doc, "kind")?.toLowerCase();
  if (kind === "question" || kind === "topic") return "question";
  if (kind === "thought" || kind === "belief") return "thought";
  if (kind === "source") {
    const type = metaString(doc, "type")?.toLowerCase() as MapNodeKind | undefined;
    return type && SOURCE_TYPES.has(type) ? type : "link";
  }
  if (/\.(md|markdown|txt)$/i.test(item.name)) return "document";
  return "file";
}

export interface FolderMap {
  graph: Graph;
  start: string | null;
}

/**
 * Builds the folder's graph. Items nobody links to (and that link nowhere) hang
 * off a hub for the folder itself, so a folder with no links still reads as a
 * map: the folder in the centre with its contents around it.
 */
export function buildFolderMap(
  folderPath: string,
  folderName: string,
  items: FolderMapItem[],
  docs: Map<string, ParsedDocument>
): FolderMap {
  const paths = items.map((item) => item.path);
  const nodes: MapNode[] = items.map((item) => {
    const doc = docs.get(item.path);
    const links = (doc?.links ?? [])
      .map((target) => resolveLink(target, folderPath, paths))
      .filter((path): path is string => Boolean(path));
    const body = doc ? plainText(doc.body) : "";
    return {
      id: item.path,
      kind: mapKind(item, doc),
      title: metaString(doc, "title") ?? (item.isDirectory ? item.name : documentTitle(item.name)),
      body: body || undefined,
      by: metaString(doc, "by"),
      url: metaString(doc, "url"),
      hue: metaString(doc, "hue"),
      links,
    };
  });

  let graph = buildGraph(nodes);
  const orphans = nodes.filter((node) => (graph.adjacency.get(node.id)?.size ?? 0) === 0);
  if (orphans.length > 0 && !graph.nodes.has(folderPath)) {
    nodes.push({
      id: folderPath,
      kind: "folder",
      title: folderName,
      body: `${items.length} ${items.length === 1 ? "item" : "items"}`,
      links: orphans.map((node) => node.id),
    });
    graph = buildGraph(nodes);
  }
  return { graph, start: pickStart(graph) };
}
