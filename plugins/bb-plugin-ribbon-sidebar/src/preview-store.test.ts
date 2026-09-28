import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import { createPreviewStore, THREAD_PREVIEW_SOURCE_MIGRATION } from "./preview-store";

describe("preview store", () => {
  it("persists changed previews and returns only requested threads", () => {
    const database = new Database(":memory:");
    for (const migration of [...RIBBON_SIDEBAR_MIGRATIONS, THREAD_PREVIEW_SOURCE_MIGRATION])
      database.exec(migration);
    const store = createPreviewStore(database);

    expect(store.set("thread-a", "Latest message", 5)).toBe(true);
    expect(store.set("thread-a", "Latest message", 7)).toBe(false);
    expect(store.get("thread-a")).toEqual({ preview: "Latest message", sourceSeq: 7 });
    expect(store.set("thread-b", null, 1)).toBe(true);
    expect(store.list(["thread-b"])).toEqual([
      { threadId: "thread-b", preview: null },
    ]);
    expect(store.delete("thread-b")).toBe(true);
    expect(store.get("thread-b")).toBeUndefined();
    expect(store.list(["thread-a", "thread-b"])).toEqual([
      { threadId: "thread-a", preview: "Latest message" },
    ]);
    database.close();
  });

  it("treats previews recorded before the source column as stale", () => {
    const database = new Database(":memory:");
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    database
      .prepare("INSERT INTO thread_preview(thread_id, preview, updated_at_ms) VALUES (?, ?, ?)")
      .run("thread-a", "Old", 1);
    database.exec(THREAD_PREVIEW_SOURCE_MIGRATION);
    const store = createPreviewStore(database);
    expect(store.get("thread-a")).toEqual({ preview: "Old", sourceSeq: null });
    database.close();
  });
});
