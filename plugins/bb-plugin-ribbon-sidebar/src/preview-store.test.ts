import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { createPreviewStore } from "./preview-store";

describe("preview store", () => {
  it("persists changed previews and returns only requested threads", () => {
    const database = new Database(":memory:");
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    const store = createPreviewStore(database);

    expect(store.set("thread-a", "Latest message")).toBe(true);
    expect(store.set("thread-a", "Latest message")).toBe(false);
    expect(store.set("thread-b", null)).toBe(true);
    expect(store.list(["thread-b"])).toEqual([
      { threadId: "thread-b", preview: null },
    ]);
    expect(store.delete("thread-b")).toBe(true);
    expect(store.list(["thread-a", "thread-b"])).toEqual([
      { threadId: "thread-a", preview: "Latest message" },
    ]);
    database.close();
  });
});
