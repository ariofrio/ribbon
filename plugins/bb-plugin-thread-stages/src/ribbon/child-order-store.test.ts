import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createChildOrderStore } from "./child-order-store";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";

function openStore() {
  const database = new Database(":memory:");
  for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
  return { database, store: createChildOrderStore(database) };
}

describe("child order store", () => {
  it("replaces one parent's order without touching another's", () => {
    const { database, store } = openStore();

    expect(store.setOrder("parent-a", ["child-b", "child-a"])).toBe(true);
    expect(store.setOrder("parent-b", ["child-c"])).toBe(true);
    expect(store.setOrder("parent-a", ["child-a", "child-b"])).toBe(true);
    expect(store.setOrder("parent-a", ["child-a", "child-b"])).toBe(false);

    expect(store.list()).toEqual([
      { parentThreadId: "parent-a", threadId: "child-a" },
      { parentThreadId: "parent-a", threadId: "child-b" },
      { parentThreadId: "parent-b", threadId: "child-c" },
    ]);
    database.close();
  });

  it("moves a child's rank when it is ordered under a new parent", () => {
    const { database, store } = openStore();
    store.setOrder("parent-a", ["child-a", "child-b"]);

    store.setOrder("parent-b", ["child-a"]);

    expect(store.list()).toEqual([
      { parentThreadId: "parent-a", threadId: "child-b" },
      { parentThreadId: "parent-b", threadId: "child-a" },
    ]);
    database.close();
  });

  it("forgets a deleted thread as a child and as a parent", () => {
    const { database, store } = openStore();
    store.setOrder("parent-a", ["child-a", "child-b"]);
    store.setOrder("child-a", ["grandchild"]);

    expect(store.deleteThread("child-a")).toBe(true);
    expect(store.deleteThread("child-a")).toBe(false);

    expect(store.list()).toEqual([
      { parentThreadId: "parent-a", threadId: "child-b" },
    ]);
    database.close();
  });

  it("rejects duplicate children", () => {
    const { database, store } = openStore();
    expect(() => store.setOrder("parent-a", ["child-a", "child-a"])).toThrow(
      /duplicate/u,
    );
    expect(() => store.setOrder("parent-a", ["parent-a"])).toThrow(
      /own child/u,
    );
    database.close();
  });
});
