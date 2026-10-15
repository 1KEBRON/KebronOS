import { describe, expect, test } from "bun:test";
import {
  documentTitle,
  parentFolder,
  parseFrontMatter,
  plainText,
  resolveLink,
  youTubeId,
} from "@/apps/finder/map/frontMatter";
import { documentHref, documentMarkdown, relatedDocuments } from "@/apps/finder/map/documentMarkdown";

describe("front matter", () => {
  test("parses scalars, quoted values and block lists (names may contain commas)", () => {
    const doc = parseFrontMatter(
      ["---", "kind: thought", 'hue: "#ff9f0a"', "links:", "  - Mastery, not competition", "  - On Focus", "---", "", "Body text."].join("\n")
    );
    expect(doc.hasFrontMatter).toBe(true);
    expect(doc.meta.kind).toBe("thought");
    expect(doc.meta.hue).toBe("#ff9f0a");
    expect(doc.links).toEqual(["Mastery, not competition", "On Focus"]);
    expect(doc.body).toBe("Body text.");
  });

  test("parses inline lists and CRLF line endings", () => {
    const doc = parseFrontMatter("---\r\nlinks: [A, \"B, c\"]\r\nby: Apple\r\n---\r\nHi");
    expect(doc.links).toEqual(["A", "B, c"]);
    expect(doc.meta.by).toBe("Apple");
    expect(doc.body).toBe("Hi");
  });

  test("leaves documents without a header alone", () => {
    const text = "Hi, I'm Kebron.\n\n---\n\nMore";
    const doc = parseFrontMatter(text);
    expect(doc.hasFrontMatter).toBe(false);
    expect(doc.links).toEqual([]);
    expect(doc.body).toBe(text);
    expect(parseFrontMatter("---\nkind: thought\nno closing fence").hasFrontMatter).toBe(false);
  });

  test("drops trailing comments but keeps quoted #", () => {
    const doc = parseFrontMatter('---\nkind: thought   # question | thought | source\nhue: "#0a84ff"\n---\n');
    expect(doc.meta.kind).toBe("thought");
    expect(doc.meta.hue).toBe("#0a84ff");
  });

  test("keeps a URL's colons in a value", () => {
    expect(parseFrontMatter("---\nurl: https://youtu.be/0pP3ZjMDzF4\n---\n").meta.url).toBe(
      "https://youtu.be/0pP3ZjMDzF4"
    );
  });
});

describe("link resolution", () => {
  const folder = "/Documents/North Star";
  const candidates = [`${folder}/On Focus.md`, `${folder}/Mastery, not competition.md`, "/Documents/Projects"];

  test("matches file names with or without the extension, case-insensitively", () => {
    expect(resolveLink("On Focus", folder, candidates)).toBe(`${folder}/On Focus.md`);
    expect(resolveLink("on focus.md", folder, candidates)).toBe(`${folder}/On Focus.md`);
    expect(resolveLink("[[Mastery, not competition]]", folder, candidates)).toBe(
      `${folder}/Mastery, not competition.md`
    );
  });

  test("accepts absolute paths and rejects unknown names", () => {
    expect(resolveLink("/Documents/Projects", folder, candidates)).toBe("/Documents/Projects");
    expect(resolveLink("Nowhere", folder, candidates)).toBeNull();
    expect(resolveLink("  ", folder, candidates)).toBeNull();
  });

  test("path and text helpers", () => {
    expect(parentFolder(`${folder}/On Focus.md`)).toBe(folder);
    expect(parentFolder("/README.md")).toBe("/");
    expect(documentTitle("On Focus.md")).toBe("On Focus");
    expect(youTubeId("https://youtu.be/0pP3ZjMDzF4")).toBe("0pP3ZjMDzF4");
    expect(youTubeId("https://www.youtube.com/watch?v=1YmO7p0aK0g")).toBe("1YmO7p0aK0g");
    expect(youTubeId("https://kebron.org")).toBeNull();
    expect(plainText("# Title\n\nSee [this](x) and **that**.")).toBe("See this and that.");
  });
});

describe("linked documents in Preview", () => {
  const folder = "/Documents/North Star";
  const a = `${folder}/A.md`;
  const b = `${folder}/B (2013).md`;
  const docs = new Map([
    [a, parseFrontMatter("---\nkind: thought\nlinks:\n  - B (2013)\n---\nIdea.")],
    [b, parseFrontMatter("---\nkind: source\ntype: video\nby: Apple\nurl: https://youtu.be/xyz\n---\n")],
  ]);

  test("links show in both directions", () => {
    expect(relatedDocuments(a, folder, docs, [a, b])).toEqual([{ path: b, title: "B (2013)" }]);
    expect(relatedDocuments(b, folder, docs, [a, b])).toEqual([{ path: a, title: "A" }]);
  });

  test("renders a title, byline, source link and a navigable Linked list", () => {
    const md = documentMarkdown("", docs.get(b)!, "B (2013).md", [{ path: a, title: "A" }]);
    expect(md).toContain("# B (2013)");
    expect(md).toContain("*Video · Apple*");
    expect(md).toContain("[Watch on YouTube ↗](https://youtu.be/xyz)");
    expect(md).toContain("- [A](/Documents/North%20Star/A.md)");
    expect(documentHref(b)).toBe("/Documents/North%20Star/B%20%282013%29.md");
  });

  test("plain documents pass through unchanged", () => {
    const text = "Hi, I'm Kebron.";
    expect(documentMarkdown(text, parseFrontMatter(text), "README.md", [])).toBe(text);
  });
});
