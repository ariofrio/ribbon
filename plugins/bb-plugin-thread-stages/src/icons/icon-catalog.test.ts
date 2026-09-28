import { describe, expect, it } from "vitest";
import catalog from "./icon-catalog.json";
import { CATALOG_ICONS } from "./icon-catalog.generated";

/**
 * Tags and categories exist only behind Hugeicons' unversioned
 * https://hugeicons.com/api/icons, which has no ETag, no Last-Modified, and no
 * released metadata package to pin instead, so `npm run check:catalog` is the
 * only way to learn that upstream rewrote something. These guard the committed
 * halves it compares.
 */
describe("icon catalog", () => {
  const entries = catalog as Array<{
    name: string;
    export: string;
    category: string;
    tags: string[];
  }>;

  it("keeps the catalog and its generated glyphs in step", () => {
    const withoutGlyph = entries
      .map((entry) => entry.name)
      .filter((name) => CATALOG_ICONS[name] === undefined);
    expect(withoutGlyph).toEqual([]);
  });

  it("names every icon once", () => {
    expect(new Set(entries.map((entry) => entry.name)).size).toBe(
      entries.length,
    );
  });

  it("keeps every eligible numbered variant in the catalog", () => {
    expect(
      entries
        .map((entry) => entry.name)
        .filter((name) => /^ai-search(?:-\d+)?$/.test(name)),
    ).toEqual(["ai-search", "ai-search-01", "ai-search-02"]);
  });

  it("keeps every upstream category without duplicate metadata aliases", () => {
    expect(new Set(entries.map((entry) => entry.category)).size).toBe(60);
    expect(
      entries
        .map((entry) => entry.name)
        .filter((name) => name === "arrow-down-0-1" || name === "arrow-up-0-1"),
    ).toEqual([]);
    expect(entries.some((entry) => entry.name === "arrow-down-01")).toBe(true);
    expect(entries.some((entry) => entry.name === "arrow-up-01")).toBe(true);
  });

  it("carries the fields the picker and the drift check read", () => {
    const malformed = entries.filter(
      (entry) =>
        !entry.name ||
        !entry.category ||
        !Array.isArray(entry.tags) ||
        entry.tags.some((tag) => typeof tag !== "string"),
    );
    expect(malformed.map((entry) => entry.name)).toEqual([]);
  });
});
