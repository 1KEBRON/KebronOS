import { describe, expect, test } from "bun:test";
import { defaultViewTypeForPath, NORTH_STAR_PATH } from "@/stores/useFinderStore";

describe("Finder default views", () => {
  test("North Star opens as a map; other folders as a list or icons", () => {
    expect(defaultViewTypeForPath(NORTH_STAR_PATH)).toBe("map");
    expect(defaultViewTypeForPath("/Documents")).toBe("list");
    expect(defaultViewTypeForPath("/Documents/Projects")).toBe("list");
    expect(defaultViewTypeForPath("/Desktop")).toBe("list");
    expect(defaultViewTypeForPath("/Applications")).toBe("large");
  });
});
