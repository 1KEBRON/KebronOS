import { describe, expect, test } from "bun:test";
import seed from "../../../public/data/filesystem.json";
import { buildGraph, layout, mapCentre, nodeHues, pickStart, type MapNode } from "@/apps/finder/map/layout";
import { buildFolderMap, mapKind } from "@/apps/finder/map/folderGraph";
import { parseFrontMatter, type ParsedDocument } from "@/apps/finder/map/frontMatter";

const NORTH_STAR = "/Documents/North Star";
const at = (name: string) => `${NORTH_STAR}/${name}.md`;

// The seeded North Star folder, read the same way Finder reads it.
const northStarFiles = seed.files.filter((f) => f.path.startsWith(`${NORTH_STAR}/`));
const northStarDocs = new Map<string, ParsedDocument>(
  northStarFiles.map((f) => [f.path, parseFrontMatter(f.content ?? "")])
);
const northStar = buildFolderMap(
  NORTH_STAR,
  "North Star",
  northStarFiles.map((f) => ({ path: f.path, name: f.name, isDirectory: false })),
  northStarDocs
);

describe("Map engine", () => {
  const nodes: MapNode[] = [
    { id: "a", kind: "question", title: "A", links: ["b", "c"] },
    { id: "b", kind: "thought", title: "B", links: ["d", "missing", "b"] },
    { id: "c", kind: "video", title: "C", links: ["a"] },
    { id: "d", kind: "thought", title: "D" },
    { id: "e", kind: "film", title: "E" },
  ];
  const graph = buildGraph(nodes);

  test("links are undirected, deduplicated, and ignore unknown or self targets", () => {
    expect(graph.adjacency.get("b")!.has("a")).toBe(true);
    expect(graph.adjacency.get("d")!.has("b")).toBe(true);
    expect(graph.edges.length).toBe(3);
  });

  test("focus sits at the map centre, links near, second degree far, the rest hidden", () => {
    const placements = layout(graph, "a", 800, 600);
    expect(placements.get("a")).toMatchObject({ ...mapCentre(800, 600), tier: "focus" });
    expect(placements.get("b")!.tier).toBe("near");
    expect(placements.get("c")!.tier).toBe("near");
    expect(placements.get("d")!.tier).toBe("far");
    expect(placements.get("e")!.tier).toBe("hidden");
    expect(placements.size).toBe(nodes.length);
  });

  test("on phones, neighbours sit in left and right columns below the caption", () => {
    const hub = buildGraph([
      { id: "hub", kind: "question", title: "Hub", links: ["1", "2", "3", "4", "5", "6"] },
      ...["1", "2", "3", "4", "5", "6"].map((id) => ({ id, kind: "thought" as const, title: id })),
    ]);
    const placements = layout(hub, "hub", 390, 700);
    const centre = mapCentre(390, 700);
    const near = [...placements.values()].filter((p) => p.tier === "near");
    expect(near.filter((p) => p.x > centre.x).length).toBe(3);
    expect(near.filter((p) => p.x < centre.x).length).toBe(3);
    // Nothing straight above the focus, where its caption sits.
    for (const p of near) expect(Math.abs(p.x - centre.x)).toBeGreaterThan(60);
  });

  test("starts at the most connected node and keeps a hue per node", () => {
    expect(pickStart(graph)).toBe("a");
    const hues = nodeHues(buildGraph([{ id: "x", kind: "question", title: "X", hue: "#123456" }]));
    expect(hues.get("x")).toBe("#123456");
  });
});

describe("North Star folder as a map", () => {
  test("has the garden: 3 questions, 11 thoughts, 8 sources", () => {
    const kinds = northStarFiles.map((f) => mapKind({ ...f, isDirectory: false }, northStarDocs.get(f.path)));
    expect(kinds.filter((k) => k === "question").length).toBe(3);
    expect(kinds.filter((k) => k === "thought").length).toBe(11);
    expect(kinds.filter((k) => k === "video").length).toBe(7);
    expect(kinds.filter((k) => k === "film").length).toBe(1);
  });

  test("every link resolves to a real document", () => {
    for (const [path, doc] of northStarDocs) {
      const node = northStar.graph.nodes.get(path)!;
      expect(node.links!.length).toBe(doc.links.length);
    }
  });

  test("every document is connected, so no folder hub is needed", () => {
    expect(northStar.graph.nodes.has(NORTH_STAR)).toBe(false);
    for (const id of northStar.graph.nodes.keys()) {
      expect(northStar.graph.adjacency.get(id)!.size).toBeGreaterThan(0);
    }
  });

  test("opens on the success question with its nine links around it", () => {
    const start = at("What does success look like in design and technology?");
    expect(northStar.start).toBe(start);
    expect(northStar.graph.adjacency.get(start)!.size).toBe(9);
    const placements = layout(northStar.graph, start, 900, 640);
    expect(placements.get(at("Kon-Tiki (2012)"))!.tier).toBe("hidden");
  });

  test("videos keep their YouTube links, including the corrected Intention film", () => {
    const intention = northStar.graph.nodes.get(at("Designed by Apple – Intention (2013)"))!;
    expect(intention.url).toBe("https://www.youtube.com/watch?v=1YmO7p0aK0g");
    expect(intention.by).toBe("Apple");
    const thought = northStar.graph.nodes.get(at("The best technology disappears"))!;
    expect(thought.body).toStartWith("The ultimate product");
  });
});

describe("Any folder as a map", () => {
  test("unlinked items hang off a hub for the folder, which becomes the start", () => {
    const items = ["Delalos.md", "SporaQuest.md", "Eri Atlas.md"].map((name) => ({
      path: `/Documents/Projects/${name}`,
      name,
      isDirectory: false,
    }));
    const map = buildFolderMap("/Documents/Projects", "Projects", items, new Map());
    expect(map.start).toBe("/Documents/Projects");
    expect(map.graph.adjacency.get("/Documents/Projects")!.size).toBe(3);
    expect(map.graph.nodes.get("/Documents/Projects/Delalos.md")!.title).toBe("Delalos");
  });
});
