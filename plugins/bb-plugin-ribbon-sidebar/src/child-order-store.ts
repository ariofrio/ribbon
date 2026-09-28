import type BetterSqlite3 from "better-sqlite3";
import type { ChildRank } from "./child-order";

export interface ChildOrderStore {
  /** Every saved rank, each parent's children in order. */
  list(): ChildRank[];
  /** Replace one parent's order; a child ranked elsewhere moves here. */
  setOrder(parentThreadId: string, threadIds: readonly string[]): boolean;
  deleteThread(threadId: string): boolean;
}

export function createChildOrderStore(
  database: BetterSqlite3.Database,
): ChildOrderStore {
  const list = database.prepare(`
    SELECT parent_thread_id, thread_id FROM child_order
    ORDER BY parent_thread_id, position, thread_id
  `);
  const listParent = database.prepare(`
    SELECT thread_id FROM child_order
    WHERE parent_thread_id = ? ORDER BY position, thread_id
  `);
  const clearParent = database.prepare(
    "DELETE FROM child_order WHERE parent_thread_id = ?",
  );
  const upsert = database.prepare(`
    INSERT INTO child_order(thread_id, parent_thread_id, position)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      parent_thread_id = excluded.parent_thread_id,
      position = excluded.position
  `);
  const remove = database.prepare(
    "DELETE FROM child_order WHERE thread_id = ? OR parent_thread_id = ?",
  );
  const replace = database.transaction(
    (parentThreadId: string, threadIds: readonly string[]) => {
      const current = (
        listParent.all(parentThreadId) as Array<{ thread_id: string }>
      ).map(({ thread_id }) => thread_id);
      if (current.join("\n") === threadIds.join("\n")) return false;
      clearParent.run(parentThreadId);
      threadIds.forEach((threadId, position) => {
        upsert.run(threadId, parentThreadId, position);
      });
      return true;
    },
  );

  return {
    list() {
      return (
        list.all() as Array<{ parent_thread_id: string; thread_id: string }>
      ).map(({ parent_thread_id, thread_id }) => ({
        parentThreadId: parent_thread_id,
        threadId: thread_id,
      }));
    },
    setOrder(parentThreadId, threadIds) {
      if (new Set(threadIds).size !== threadIds.length) {
        throw new Error("Child order must not contain duplicate thread IDs.");
      }
      if (threadIds.includes(parentThreadId)) {
        throw new Error("A thread cannot be its own child.");
      }
      return replace.immediate(parentThreadId, threadIds);
    },
    deleteThread(threadId) {
      return remove.run(threadId, threadId).changes > 0;
    },
  };
}
