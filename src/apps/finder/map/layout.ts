// Finder's Map view engine (formerly the Constellation prototype).
//
// The visual language follows Apple's 2013 "Designed by Apple – Intention"
// film: a flat canvas, solid colour dots, hairlines and thin type. The focused
// item sits in the centre with only its direct links around it; second-degree
// items show as faint dots; everything else waits off-stage.

export type MapNodeKind =
  | "folder"
  | "question"
  | "thought"
  | "video"
  | "film"
  | "book"
  | "post"
  | "link"
  | "document"
  | "file";

export interface MapNode {
  id: string;
  kind: MapNodeKind;
  title: string;
  /** Short body shown when the node is in focus. */
  body?: string;
  /** Who made it (sources). */
  by?: string;
  /** Where the source lives (sources). */
  url?: string;
  /** Ids of linked nodes; undirected. */
  links?: string[];
  /** Optional colour; otherwise a stable colour from the palette. */
  hue?: string;
}

export type Tier = "focus" | "near" | "far" | "hidden";

export interface Placement {
  x: number;
  y: number;
  tier: Tier;
}

export interface Graph {
  nodes: Map<string, MapNode>;
  adjacency: Map<string, Set<string>>;
  edges: Array<[string, string]>;
}

/** Links are undirected: listing a link on either node connects both. */
export function buildGraph(list: MapNode[]): Graph {
  const nodes = new Map(list.map((n) => [n.id, n]));
  const adjacency = new Map<string, Set<string>>(list.map((n) => [n.id, new Set<string>()]));
  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const node of list) {
    for (const target of node.links ?? []) {
      if (!nodes.has(target) || target === node.id) continue;
      const key = [node.id, target].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      adjacency.get(node.id)!.add(target);
      adjacency.get(target)!.add(node.id);
      edges.push([node.id, target]);
    }
  }
  return { nodes, adjacency, edges };
}

export const KIND_ORDER: Record<MapNodeKind, number> = {
  folder: 0,
  question: 1,
  thought: 2,
  document: 3,
  video: 4,
  film: 5,
  book: 6,
  post: 7,
  link: 8,
  file: 9,
};

/** Half-width of the empty wedge above the focus, where its caption sits. */
const CAPTION_WEDGE = (40 * Math.PI) / 180;

/** On phones: the empty wedges above (caption) and below (labels) the focus. */
const COMPACT_TOP_WEDGE = (50 * Math.PI) / 180;
const COMPACT_BOTTOM_WEDGE = (26 * Math.PI) / 180;

/** Height of the bottom sheet that holds the focused node's text. */
export const SHEET_HEIGHT = 132;

/** A bright, varied palette (Apple's 2013 "Intention" film). */
export const PALETTE = ["#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#0a84ff", "#bf5af2", "#ff375f"];
export const FALLBACK_HUE = "#bf5af2";

/** Every node gets its own colour (or the palette's stable pick), so the map reads as many bright dots. */
export function nodeHues(graph: Graph): Map<string, string> {
  const hues = new Map<string, string>();
  for (const [id, node] of graph.nodes) {
    hues.set(id, node.hue ?? PALETTE[Math.floor(hash(id + "hue") * PALETTE.length)] ?? FALLBACK_HUE);
  }
  return hues;
}

/** Small stable hash in [0, 1], so each id gets its own resting spot and colour. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** The best place to start: the most connected node (ties: kind, then title). */
export function pickStart(graph: Graph): string | null {
  let best: string | null = null;
  let bestDegree = -1;
  for (const [id, node] of graph.nodes) {
    const degree = graph.adjacency.get(id)?.size ?? 0;
    if (best === null || degree > bestDegree) {
      best = id;
      bestDegree = degree;
      continue;
    }
    if (degree === bestDegree) {
      const current = graph.nodes.get(best)!;
      const order = KIND_ORDER[node.kind] - KIND_ORDER[current.kind] || node.title.localeCompare(current.title);
      if (order < 0) best = id;
    }
  }
  return best;
}

/** Narrow canvases (phones) label dots underneath instead of beside them. */
export function isCompact(width: number) {
  return width < 640;
}

/** The map fills the canvas above the bottom sheet. */
export function mapCentre(width: number, height: number) {
  const mapHeight = Math.max(height - SHEET_HEIGHT, 200);
  return { x: width / 2, y: mapHeight * 0.52 };
}

/**
 * Focus in the centre, its direct links evenly around it, second-degree links
 * as faint dots just beyond their parent, everything else waiting off-stage.
 */
export function layout(graph: Graph, focusId: string, width: number, height: number): Map<string, Placement> {
  const { x: cx, y: cy } = mapCentre(width, height);
  // Wide canvases keep ~200px beside each neighbour for its label; narrow ones put labels under the dots.
  const rx = isCompact(width) ? width * 0.34 : Math.max(140, Math.min(width / 2 - 210, 320));
  const ry = Math.min(Math.max(height - SHEET_HEIGHT, 200) * (isCompact(width) ? 0.38 : 0.36), 230);
  const placements = new Map<string, Placement>();
  placements.set(focusId, { x: cx, y: cy, tier: "focus" });

  const near = [...(graph.adjacency.get(focusId) ?? [])].sort((a, b) => {
    const na = graph.nodes.get(a)!;
    const nb = graph.nodes.get(b)!;
    return KIND_ORDER[na.kind] - KIND_ORDER[nb.kind] || na.title.localeCompare(nb.title);
  });
  // Neighbours go around the focus but leave a narrow wedge above it for its caption.
  const arcStart = -Math.PI / 2 + CAPTION_WEDGE;
  const arcSpan = Math.PI * 2 - CAPTION_WEDGE * 2;
  const angles = new Map<string, number>();
  // Phones label dots underneath (or above), so neighbours sit in two columns,
  // left and right of the focus, clear of the caption and of each other.
  const compact = isCompact(width);
  const rightCount = Math.ceil(near.length / 2);
  near.forEach((id, i) => {
    let angle: number;
    if (near.length === 1) {
      angle = Math.PI / 2;
    } else if (compact) {
      const side = i < rightCount ? 0 : 1;
      const index = side === 0 ? i : i - rightCount;
      const count = side === 0 ? rightCount : near.length - rightCount;
      const t = (index + 0.5) / count;
      angle =
        side === 0
          ? -Math.PI / 2 + COMPACT_TOP_WEDGE + t * (Math.PI - COMPACT_TOP_WEDGE - COMPACT_BOTTOM_WEDGE)
          : Math.PI / 2 + COMPACT_BOTTOM_WEDGE + t * (Math.PI - COMPACT_TOP_WEDGE - COMPACT_BOTTOM_WEDGE);
    } else {
      angle = arcStart + ((i + 0.5) * arcSpan) / near.length;
    }
    angles.set(id, angle);
    placements.set(id, {
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
      tier: "near",
    });
  });

  // Second degree: fan out just beyond the first neighbour that reaches them.
  const fanned = new Map<string, number>();
  for (const parent of near) {
    for (const id of graph.adjacency.get(parent) ?? []) {
      if (placements.has(id)) continue;
      const index = fanned.get(parent) ?? 0;
      fanned.set(parent, index + 1);
      const angle = angles.get(parent)! + (index % 2 ? 1 : -1) * (0.16 + 0.12 * Math.floor(index / 2));
      placements.set(id, {
        x: cx + Math.cos(angle) * rx * 1.4,
        y: cy + Math.sin(angle) * ry * 1.22,
        tier: "far",
      });
    }
  }

  // The rest rests outside the canvas, so it glides in when it becomes relevant.
  for (const id of graph.nodes.keys()) {
    if (placements.has(id)) continue;
    const angle = hash(id) * Math.PI * 2;
    placements.set(id, {
      x: cx + Math.cos(angle) * width,
      y: cy + Math.sin(angle) * height,
      tier: "hidden",
    });
  }
  return placements;
}

/** Scattered starting positions for the opening "gathering" motion. */
export function scatter(graph: Graph, width: number, height: number) {
  const out = new Map<string, { x: number; y: number }>();
  for (const id of graph.nodes.keys()) {
    out.set(id, {
      x: width * (0.12 + 0.76 * hash(id + "x")),
      y: height * (0.1 + 0.6 * hash(id + "y")),
    });
  }
  return out;
}
