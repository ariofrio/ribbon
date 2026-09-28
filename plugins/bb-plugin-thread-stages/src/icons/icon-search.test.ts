import { describe, expect, it } from "vitest";
import { categoryLabel, iconLabel, searchIcons } from "./icon-search";
import type { CatalogEntry } from "./icon-search";

// searchIcons is generic over CatalogEntry, so the fixture carries the extra
// field real catalog entries ship with.
const catalog: Array<CatalogEntry & { export: string }> = [
  { name: "book-02", export: "Book02Icon", category: "education", tags: ["read", "library"] },
  { name: "bookmark-01", export: "Bookmark01Icon", category: "bookmark", tags: ["save"] },
  { name: "rocket", export: "RocketIcon", category: "space", tags: ["launch", "ship", "startup"] },
  { name: "coffee-01", export: "Coffee01Icon", category: "foods", tags: ["cup", "drink"] },
  { name: "ai-search", export: "AiSearchIcon", category: "ai", tags: ["find"] },
  { name: "ai-search-01", export: "AiSearch01Icon", category: "ai", tags: ["find"] },
  { name: "ai-search-02", export: "AiSearch02Icon", category: "ai", tags: ["find"] },
];

describe("searchIcons", () => {
  it("returns everything when the query is empty", () => {
    expect(searchIcons(catalog, "  ", null).total).toBe(7);
  });

  it("ranks an exact name above a prefix and a tag", () => {
    expect(
      searchIcons(catalog, "book", null).results.map((entry) => entry.name),
    ).toEqual(["book-02", "bookmark-01"]);
  });

  it("finds icons by synonym", () => {
    expect(
      searchIcons(catalog, "launch", null).results.map((entry) => entry.name),
    ).toEqual(["rocket"]);
  });

  it("requires every term to match", () => {
    expect(searchIcons(catalog, "rocket coffee", null).results).toEqual([]);
    expect(
      searchIcons(catalog, "rocket startup", null).results.map((e) => e.name),
    ).toEqual(["rocket"]);
  });

  it("scopes to a category", () => {
    const scoped = searchIcons(catalog, "", "foods");
    expect(scoped.results.map((entry) => entry.name)).toEqual(["coffee-01"]);
    expect(scoped.total).toBe(1);
  });

  it("returns every matching icon", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      name: `star-${String(index).padStart(3, "0")}`,
      export: `Star${index}Icon`,
      category: "shapes",
      tags: [],
    }));
    const found = searchIcons(many, "star", null);
    expect(found.results).toHaveLength(400);
    expect(found.total).toBe(400);
  });

  it("reads names and categories as words", () => {
    expect(iconLabel("bubble-chat-01")).toBe("bubble chat 01");
    expect(categoryLabel("files-folders")).toBe("files folders");
  });

  it("keeps numbered variants distinguishable and searchable by raw suffix", () => {
    expect(iconLabel("ai-search")).toBe("ai search");
    expect(iconLabel("ai-search-01")).toBe("ai search 01");
    expect(iconLabel("ai-search-02")).toBe("ai search 02");
    expect(
      searchIcons(catalog, "01", "ai").results.map((entry) => entry.name),
    ).toEqual(["ai-search-01"]);
    expect(
      searchIcons(catalog, "ai search 02", null).results.map(
        (entry) => entry.name,
      ),
    ).toEqual(["ai-search-02"]);
  });
});
