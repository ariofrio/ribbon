import type BetterSqlite3 from "better-sqlite3";

export interface StoredPreview {
  threadId: string;
  preview: string | null;
}

export interface PreviewStore {
  list(threadIds: readonly string[]): StoredPreview[];
  set(threadId: string, preview: string | null): boolean;
  delete(threadId: string): boolean;
}

export function createPreviewStore(database: BetterSqlite3.Database): PreviewStore {
  const get = database.prepare(
    "SELECT preview FROM thread_preview WHERE thread_id = ?",
  );
  const list = database.prepare(
    "SELECT thread_id, preview FROM thread_preview ORDER BY thread_id",
  );
  const upsert = database.prepare(`
    INSERT INTO thread_preview(thread_id, preview, updated_at_ms)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      preview = excluded.preview,
      updated_at_ms = excluded.updated_at_ms
  `);
  const remove = database.prepare(
    "DELETE FROM thread_preview WHERE thread_id = ?",
  );

  return {
    list(threadIds) {
      const requested = new Set(threadIds);
      return (
        list.all() as Array<{ thread_id: string; preview: string | null }>
      )
        .filter(({ thread_id }) => requested.has(thread_id))
        .map(({ thread_id, preview }) => ({ threadId: thread_id, preview }));
    },
    set(threadId, preview) {
      const existing = get.get(threadId) as
        | { preview: string | null }
        | undefined;
      if (existing?.preview === preview) return false;
      upsert.run(threadId, preview, Date.now());
      return true;
    },
    delete(threadId) {
      return remove.run(threadId).changes > 0;
    },
  };
}
