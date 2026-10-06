import type BetterSqlite3 from "better-sqlite3";

export interface ThreadAction {
  id: string;
  label: string;
  prompt: string;
}

export interface ThreadActionsRecord {
  threadId: string;
  actions: ThreadAction[];
}

export const THREAD_ACTIONS_MIGRATION = `
  CREATE TABLE IF NOT EXISTS thread_action (
    thread_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (thread_id, action_id)
  );
  CREATE INDEX IF NOT EXISTS thread_action_order
    ON thread_action(thread_id, position);
`;

export const THREAD_ACTIONS_DISPLAY_MIGRATION = `
  CREATE TABLE IF NOT EXISTS thread_action_display (
    thread_id TEXT PRIMARY KEY,
    hide_title INTEGER NOT NULL
  );
`;

export function createThreadActionsStore(database: BetterSqlite3.Database) {
  const list = database.prepare(`
    SELECT action.thread_id, action.action_id, action.label, action.prompt
    FROM thread_action AS action
    ORDER BY action.thread_id, action.position
  `);
  const get = database.prepare(`
    SELECT action_id, label, prompt FROM thread_action
    WHERE thread_id = ? AND action_id = ?
  `);
  const remove = database.prepare(
    "DELETE FROM thread_action WHERE thread_id = ?",
  );
  const insert = database.prepare(`
    INSERT INTO thread_action(thread_id, action_id, label, prompt, position)
    VALUES (?, ?, ?, ?, ?)
  `);
  const removeDisplay = database.prepare(
    "DELETE FROM thread_action_display WHERE thread_id = ?",
  );
  const save = database.transaction(
    (threadId: string, actions: readonly ThreadAction[]) => {
      remove.run(threadId);
      actions.forEach((action, position) => {
        insert.run(threadId, action.id, action.label, action.prompt, position);
      });
      removeDisplay.run(threadId);
    },
  );
  const deleteThread = database.transaction((threadId: string) => {
    remove.run(threadId);
    removeDisplay.run(threadId);
  });

  return {
    list(): ThreadActionsRecord[] {
      const records: ThreadActionsRecord[] = [];
      for (const row of list.all() as Array<{
        thread_id: string;
        action_id: string;
        label: string;
        prompt: string;
      }>) {
        let record = records.at(-1);
        if (record?.threadId !== row.thread_id) {
          record = { threadId: row.thread_id, actions: [] };
          records.push(record);
        }
        record.actions.push({
          id: row.action_id,
          label: row.label,
          prompt: row.prompt,
        });
      }
      return records;
    },
    get(threadId: string, actionId: string): ThreadAction | null {
      const row = get.get(threadId, actionId) as
        | { action_id: string; label: string; prompt: string }
        | undefined;
      return row
        ? { id: row.action_id, label: row.label, prompt: row.prompt }
        : null;
    },
    save,
    delete: deleteThread,
  };
}
