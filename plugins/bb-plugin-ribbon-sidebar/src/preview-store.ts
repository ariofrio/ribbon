import type BetterSqlite3 from "better-sqlite3";

export interface StoredPreview {
  threadId: string;
  preview: string | null;
}

export interface PreviewSource {
  preview: string | null;
  sourceSeq: number | null;
}

export interface PreviewStore {
  list(threadIds: readonly string[]): StoredPreview[];
  get(threadId: string): PreviewSource | undefined;
  set(threadId: string, preview: string | null, sourceSeq: number): boolean;
  delete(threadId: string): boolean;
}

export const THREAD_PREVIEW_SOURCE_MIGRATION =
  "ALTER TABLE thread_preview ADD COLUMN source_seq INTEGER;";

export function createPreviewStore(database: BetterSqlite3.Database): PreviewStore {
  const get = database.prepare(
    "SELECT preview, source_seq FROM thread_preview WHERE thread_id = ?",
  );
  const list = database.prepare(
    "SELECT thread_id, preview FROM thread_preview ORDER BY thread_id",
  );
  const upsert = database.prepare(`
    INSERT INTO thread_preview(thread_id, preview, updated_at_ms, source_seq)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      preview = excluded.preview,
      updated_at_ms = excluded.updated_at_ms,
      source_seq = excluded.source_seq
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
    get(threadId) {
      const row = get.get(threadId) as
        | { preview: string | null; source_seq: number | null }
        | undefined;
      return row ? { preview: row.preview, sourceSeq: row.source_seq } : undefined;
    },
    set(threadId, preview, sourceSeq) {
      const existing = get.get(threadId) as
        | { preview: string | null }
        | undefined;
      upsert.run(threadId, preview, Date.now(), sourceSeq);
      return existing === undefined || existing.preview !== preview;
    },
    delete(threadId) {
      return remove.run(threadId).changes > 0;
    },
  };
}
