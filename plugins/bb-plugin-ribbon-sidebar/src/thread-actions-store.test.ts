import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createThreadActionsStore, THREAD_ACTIONS_DISPLAY_MIGRATION, THREAD_ACTIONS_MIGRATION } from "./thread-actions-store";

describe("thread actions store", () => {
  it("keeps actions saved before the title setting existed", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE thread_action (
        thread_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        label TEXT NOT NULL,
        prompt TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (thread_id, action_id)
      );
      INSERT INTO thread_action VALUES ('thread-a', 'review', 'Review', 'Review this.', 0);
    `);
    database.exec(THREAD_ACTIONS_MIGRATION);
    database.exec(THREAD_ACTIONS_DISPLAY_MIGRATION);
    expect(createThreadActionsStore(database).list()).toEqual([{
      threadId: "thread-a",
      actions: [{ id: "review", label: "Review", prompt: "Review this." }],
      hideTitle: false,
    }]);
    database.close();
  });

  it("replaces a thread's actions in order and removes them with the thread", () => {
    const database = new Database(":memory:");
    database.exec(THREAD_ACTIONS_MIGRATION);
    database.exec(THREAD_ACTIONS_DISPLAY_MIGRATION);
    const store = createThreadActionsStore(database);
    const actions = [
      { id: "review", label: "Review", prompt: "Review this change." },
      { id: "test", label: "Test", prompt: "Run the relevant tests." },
    ];

    store.save("thread-a", actions, true);
    store.save("thread-b", [actions[0]!], false);
    expect(store.list()).toEqual([
      { threadId: "thread-a", actions, hideTitle: true },
      { threadId: "thread-b", actions: [actions[0]!], hideTitle: false },
    ]);
    expect(store.get("thread-a", "test")).toEqual(actions[1]);

    store.save("thread-a", [actions[1]!], true);
    expect(store.get("thread-a", "review")).toBeNull();
    expect(store.list()[0]?.actions).toEqual([actions[1]]);
    store.delete("thread-a");
    expect(store.list()).toEqual([{ threadId: "thread-b", actions: [actions[0]!], hideTitle: false }]);
    store.save("thread-b", [], true);
    expect(store.list()).toEqual([]);
    database.close();
  });
});
