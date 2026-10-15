// How a linked document reads on paper in Preview: the front matter becomes a
// title, a byline and a source link, and its links (both directions) become a
// "Linked" list that opens each document in Preview.
import { documentTitle, metaString, resolveLink, type ParsedDocument } from "./frontMatter";

export interface RelatedDocument {
  path: string;
  title: string;
}

/** A site path as a markdown-safe link target ("/Documents/North Star/A (b).md"). */
export function documentHref(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
}

/**
 * Every document linked to `path`, in either direction, among the folder's
 * documents. `candidates` are all linkable paths in the folder (files and folders).
 */
export function relatedDocuments(
  path: string,
  folderPath: string,
  docs: Map<string, ParsedDocument>,
  candidates: string[]
): RelatedDocument[] {
  const related = new Set<string>();
  for (const target of docs.get(path)?.links ?? []) {
    const resolved = resolveLink(target, folderPath, candidates);
    if (resolved && resolved !== path) related.add(resolved);
  }
  for (const [other, doc] of docs) {
    if (other === path) continue;
    if (doc.links.some((target) => resolveLink(target, folderPath, candidates) === path)) related.add(other);
  }
  return [...related]
    .map((p) => ({ path: p, title: metaString(docs.get(p), "title") ?? documentTitle(p.split("/").pop() ?? p) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

const SOURCE_LABEL: Record<string, string> = {
  video: "Video",
  film: "Film",
  book: "Book",
  post: "Post",
};

/** Markdown for Preview. Plain documents without front matter or links pass through unchanged. */
export function documentMarkdown(
  raw: string,
  doc: ParsedDocument,
  fileName: string,
  related: RelatedDocument[]
): string {
  if (!doc.hasFrontMatter && related.length === 0) return raw;
  const parts: string[] = [];
  const body = doc.body.trim();
  if (doc.hasFrontMatter && !/^#\s/.test(body)) {
    parts.push(`# ${metaString(doc, "title") ?? documentTitle(fileName)}`);
  }
  const kind = metaString(doc, "kind")?.toLowerCase();
  if (kind === "source") {
    const type = metaString(doc, "type")?.toLowerCase() ?? "";
    const by = metaString(doc, "by");
    const label = [SOURCE_LABEL[type] ?? "Source", by].filter(Boolean).join(" · ");
    parts.push(`*${label}*`);
    const url = metaString(doc, "url");
    if (url) {
      const where = /youtu\.?be/.test(url) ? "Watch on YouTube" : "Open";
      parts.push(`[${where} ↗](${url})`);
    }
  } else if (kind === "question") {
    parts.push("*Question*");
  }
  if (body) parts.push(body);
  if (related.length) {
    parts.push(
      "---",
      "### Linked",
      related.map((r) => `- [${r.title.replace(/[[\]]/g, "")}](${documentHref(r.path)})`).join("\n")
    );
  }
  return parts.join("\n\n");
}
