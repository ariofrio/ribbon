import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createThreadActionsStore, THREAD_ACTIONS_MIGRATION } from "./thread-actions-store";

describe("thread actions store", () => {
  it("replaces a thread's actions in order and removes them with the thread", () => {
    const database = new Database(":memory:");
    database.exec(THREAD_ACTIONS_MIGRATION);
    const store = createThreadActionsStore(database);
    const actions = [
      { id: "review", label: "Review", prompt: "Review this change." },
      { id: "test", label: "Test", prompt: "Run the relevant tests." },
    ];

    store.save("thread-a", actions);
    store.save("thread-b", [actions[0]!]);
    expect(store.list()).toEqual([
      { threadId: "thread-a", actions },
      { threadId: "thread-b", actions: [actions[0]!] },
    ]);
    expect(store.get("thread-a", "test")).toEqual(actions[1]);

    store.save("thread-a", [actions[1]!]);
    expect(store.get("thread-a", "review")).toBeNull();
    expect(store.list()[0]?.actions).toEqual([actions[1]]);
    store.delete("thread-a");
    expect(store.list()).toEqual([{ threadId: "thread-b", actions: [actions[0]!] }]);
    database.close();
  });
});
