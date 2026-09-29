import { describe, expect, it } from "vitest";
import { sidebarThreadsFromSearchResult } from "./search-results";

function thread(id: string, archived = false) {
  return {
    id,
    projectId: "project-a",
    title: `Title ${id}`,
    titleFallback: null,
    parentThreadId: null,
    providerId: "codex",
    archivedAt: archived ? 123 : null,
  };
}

describe("sidebarThreadsFromSearchResult", () => {
  it("keeps active and archived matches in bb's group order", () => {
    expect(
      sidebarThreadsFromSearchResult({
        active: { results: [{ thread: thread("active") }] },
        archived: { results: [{ thread: thread("archived", true) }] },
      }),
    ).toMatchObject([
      { id: "active", isArchived: false },
      { id: "archived", isArchived: true },
    ]);
  });

  it("deduplicates defensive overlap between search groups", () => {
    expect(
      sidebarThreadsFromSearchResult({
        active: { results: [{ thread: thread("same") }] },
        archived: { results: [{ thread: thread("same", true) }] },
      }),
    ).toHaveLength(1);
  });
});
