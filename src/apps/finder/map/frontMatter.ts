// Document front matter and links (KEBRON-OS-SPEC.md §7).
//
// A document may start with a small YAML-style header:
//
//   ---
//   kind: thought
//   links:
//     - The best technology disappears
//     - Mastery is freedom
//   ---
//   Body text…
//
// Links name other documents by file name, with or without the extension,
// relative to the document's own folder (or as an absolute /path). They are
// undirected: listing a link on either document connects both. Only the subset
// of YAML used here is understood: `key: value`, `key:` followed by `- item`
// lines, and short inline lists `key: [a, b]` (use the block form when a name
// contains a comma).

export type FrontMatterValue = string | string[];

export interface ParsedDocument {
  /** Header fields, lower-cased keys. */
  meta: Record<string, FrontMatterValue>;
  /** The raw `links` entries (unresolved file names). */
  links: string[];
  /** The text after the header. */
  body: string;
  hasFrontMatter: boolean;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  // An unquoted value ends at a ` #` comment (quote values that need a #, like colours).
  return v.replace(/\s+#.*$/, "");
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().slice(1, -1);
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ",") {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function parseFrontMatter(text: string): ParsedDocument {
  const source = (text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const empty: ParsedDocument = { meta: {}, links: [], body: source, hasFrontMatter: false };
  if (!source.startsWith("---\n")) return empty;
  const end = source.indexOf("\n---", 3);
  if (end < 0) return empty;
  const afterFence = source.slice(end + 4);
  // The closing fence must be a line of its own.
  if (afterFence.length && afterFence[0] !== "\n") return empty;

  const meta: Record<string, FrontMatterValue> = {};
  let listKey: string | null = null;
  for (const raw of source.slice(4, end).split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const item = raw.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      (meta[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const pair = raw.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const rawValue = pair[2].trim();
    // `#` starts a comment unless the value is quoted (as colours must be).
    const value = /^["']/.test(rawValue) ? rawValue : rawValue.replace(/(^|\s+)#.*$/, "").trim();
    if (!value) {
      meta[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = parseInlineList(value).map(unquote);
      listKey = null;
    } else {
      meta[key] = unquote(value);
      listKey = null;
    }
  }

  const rawLinks = meta.links;
  const links = Array.isArray(rawLinks) ? rawLinks : rawLinks ? [rawLinks] : [];
  return {
    meta,
    links: links.filter(Boolean),
    body: afterFence.replace(/^\n+/, ""),
    hasFrontMatter: true,
  };
}

/** A single string field from the header, if present. */
export function metaString(doc: ParsedDocument | undefined, key: string): string | undefined {
  const value = doc?.meta[key];
  if (typeof value === "string" && value) return value;
  return undefined;
}

const stripExtension = (name: string) => name.replace(/\.(md|markdown|txt)$/i, "");

/**
 * Resolves a link entry to a path among `candidates` (paths of items that can
 * be linked). Matching is case-insensitive, by file name with or without the
 * extension, inside `folderPath` — or by absolute path when it starts with "/".
 */
export function resolveLink(target: string, folderPath: string, candidates: Iterable<string>): string | null {
  const wanted = target.trim().replace(/^\[\[|\]\]$/g, "").trim();
  if (!wanted) return null;
  const base = folderPath === "/" ? "" : folderPath.replace(/\/$/, "");
  const full = (wanted.startsWith("/") ? wanted : `${base}/${wanted}`).toLowerCase();
  for (const path of candidates) {
    const lower = path.toLowerCase();
    if (lower === full || stripExtension(lower) === stripExtension(full)) return path;
  }
  return null;
}

/** The parent folder of a path ("/Documents/North Star/A.md" → "/Documents/North Star"). */
export function parentFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

/** A document's display title: its file name without the extension. */
export function documentTitle(name: string): string {
  return stripExtension(name);
}

/** YouTube video id from a youtu.be or youtube.com/watch URL. */
export function youTubeId(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) return u.searchParams.get("v");
  } catch {
    // not a URL
  }
  return null;
}

/** Plain text for short previews (bottom sheet, cards): drops markdown syntax. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}
