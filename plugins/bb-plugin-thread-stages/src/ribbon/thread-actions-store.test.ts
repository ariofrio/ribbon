import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createThreadActionsStore, THREAD_ACTIONS_DISPLAY_MIGRATION, THREAD_ACTIONS_MIGRATION } from "./thread-actions-store";

describe("thread actions store", () => {
  it("keeps saved actions without exposing retired title preferences", () => {
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
    database.exec("INSERT INTO thread_action_display VALUES ('thread-a', 1)");
    expect(createThreadActionsStore(database).list()).toEqual([{
      threadId: "thread-a",
      actions: [{ id: "review", label: "Review", prompt: "Review this." }],
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
    store.save("thread-b", []);
    expect(store.list()).toEqual([]);
    database.close();
  });
});
