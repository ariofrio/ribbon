import type BetterSqlite3 from "better-sqlite3";
import { createOrderKeyAfter, createOrderKeyBetween } from "./order-keys";
import {
  DEFAULT_WORKFLOW_STAGE,
  WORKFLOW_STAGES,
  type ThreadAssignment,
  type WorkflowStage,
} from "./workflow-stage";

type Database = BetterSqlite3.Database;

export const THREAD_WORKFLOW_MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS thread_organization (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Done', 'To Do', 'Working', 'Waiting', 'Deferred', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE TABLE IF NOT EXISTS thread_organization_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO thread_organization_meta(singleton, revision) VALUES (1, 0);
  `,
  `
    ALTER TABLE thread_organization ADD COLUMN sort_key TEXT;
    UPDATE thread_organization
      SET sort_key = printf('%016d', position)
      WHERE sort_key IS NULL;
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_task_workflow (
      thread_id TEXT PRIMARY KEY,
      is_working INTEGER NOT NULL CHECK (is_working IN (0, 1)),
      updated_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_task_preview (
      thread_id TEXT PRIMARY KEY,
      preview TEXT,
      updated_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE thread_organization_renamed (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Done', 'To do', 'Working', 'Waiting', 'Deferred', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT
    );
    INSERT INTO thread_organization_renamed(thread_id, status, position, updated_at, sort_key)
      SELECT thread_id,
        CASE status WHEN 'To Do' THEN 'To do' ELSE status END,
        position,
        updated_at,
        sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_renamed RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    ALTER TABLE thread_organization ADD COLUMN moved_by TEXT;
    ALTER TABLE thread_organization ADD COLUMN previous_status TEXT;
    ALTER TABLE thread_organization ADD COLUMN previous_sort_key TEXT;
  `,
  `
    CREATE TABLE thread_organization_backlog (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Backlog', 'To do', 'Working', 'Waiting', 'Done', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_backlog(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status WHEN 'Deferred' THEN 'Backlog' ELSE status END,
        position,
        updated_at,
        sort_key,
        moved_by,
        CASE previous_status WHEN 'Deferred' THEN 'Backlog' ELSE previous_status END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_backlog RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE thread_organization_blocked (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Backlog', 'To do', 'Working', 'Blocked', 'Done', 'Canceled')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_blocked(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status WHEN 'Waiting' THEN 'Blocked' ELSE status END,
        position,
        updated_at,
        sort_key,
        moved_by,
        CASE previous_status WHEN 'Waiting' THEN 'Blocked' ELSE previous_status END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_blocked RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE thread_organization_five_stages (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('Deferred', 'Idle', 'Active', 'Blocked', 'Completed')),
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_key TEXT,
      moved_by TEXT,
      previous_status TEXT,
      previous_sort_key TEXT
    );
    INSERT INTO thread_organization_five_stages(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
      SELECT
        thread_id,
        CASE status
          WHEN 'Backlog' THEN 'Deferred'
          WHEN 'To do' THEN 'Idle'
          WHEN 'Working' THEN 'Active'
          WHEN 'Done' THEN 'Completed'
          WHEN 'Canceled' THEN 'Completed'
          ELSE status
        END,
        position,
        updated_at,
        CASE status
          WHEN 'Done' THEN '0' || sort_key
          WHEN 'Canceled' THEN '1' || sort_key
          ELSE sort_key
        END,
        moved_by,
        CASE previous_status
          WHEN 'Backlog' THEN 'Deferred'
          WHEN 'To do' THEN 'Idle'
          WHEN 'Working' THEN 'Active'
          WHEN 'Done' THEN 'Completed'
          WHEN 'Canceled' THEN 'Completed'
          ELSE previous_status
        END,
        previous_sort_key
      FROM thread_organization;
    DROP TABLE thread_organization;
    ALTER TABLE thread_organization_five_stages RENAME TO thread_organization;
    CREATE INDEX IF NOT EXISTS thread_organization_status_position
      ON thread_organization(status, position, thread_id);
    CREATE INDEX IF NOT EXISTS thread_organization_status_sort_key
      ON thread_organization(status, sort_key, thread_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS thread_stage_entry (
      thread_id TEXT PRIMARY KEY,
      entered_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO thread_stage_entry(thread_id, entered_at)
      SELECT thread_id, updated_at FROM thread_organization;
  `,
];

interface AssignmentRow {
  thread_id: string;
  status: string;
  sort_key: string;
  updated_at: number;
}

/** Where a stage change came from. Only `app` moves are undoable. */
export type MoveSource = "app" | "cli" | "auto";

/** Stages a thread only reaches by being filed, never by automation. */
const FILED_STAGES: readonly WorkflowStage[] = [
  "Deferred",
  "Completed",
  "Blocked",
];

export interface UndoCandidate {
  threadId: string;
  previousStage: WorkflowStage | null;
  previousSortKey: string | null;
  updatedAt: number;
}

export interface WorkflowStageState {
  assignments: ThreadAssignment[];
}

export interface WorkflowStageLookup {
  threadId: string;
  workflowStage: WorkflowStage;
  sortKey: string | null;
  updatedAt: number | null;
  explicit: boolean;
}

export interface ReorderThreadInput {
  threadId: string;
  workflowStage: WorkflowStage;
  previousThreadId: string | null;
  nextThreadId: string | null;
  source?: MoveSource;
}

export interface ActiveStateObservation {
  state: WorkflowStageState;
  workflowStageChanged: boolean;
}

export interface ThreadPreview {
  threadId: string;
  preview: string | null;
}

export interface CompletedThreadCandidate {
  threadId: string;
  enteredAt: number;
}

export interface ThreadWorkflowStore {
  listState(): WorkflowStageState;
  listPreviews(): ThreadPreview[];
  listUndoCandidates(): UndoCandidate[];
  listCompletedBefore(cutoff: number): CompletedThreadCandidate[];
  get(threadId: string): WorkflowStageLookup;
  ensureThreads(threadIds: readonly string[]): WorkflowStageState;
  syncRootThreads(
    rootThreadIds: readonly string[],
    childThreadIds: readonly string[],
  ): WorkflowStageState;
  removeRootThread(threadId: string): boolean;
  setStage(
    threadId: string,
    stage: WorkflowStage,
    source?: MoveSource,
  ): WorkflowStageState;
  restoreToIdle(threadId: string, sortKey: string | null): WorkflowStageState;
  observeActiveState(
    threadId: string,
    isWorking: boolean,
  ): ActiveStateObservation;
  setPreview(threadId: string, preview: string | null): boolean;
  reorderThread(input: ReorderThreadInput): WorkflowStageState;
  delete(threadId: string): boolean;
}

function assignmentFromRow(row: AssignmentRow): ThreadAssignment {
  return {
    threadId: row.thread_id,
    workflowStage: row.status as WorkflowStage,
    sortKey: row.sort_key,
    updatedAt: row.updated_at,
  };
}

function assertThreadId(threadId: string): void {
  if (threadId.trim().length === 0 || threadId.length > 256) {
    throw new Error("Thread id must contain 1 to 256 characters.");
  }
}

export function createThreadWorkflowStore(db: Database): ThreadWorkflowStore {
  const listAssignments = db.prepare(`
    SELECT thread_id, status, sort_key, updated_at
    FROM thread_organization
    WHERE sort_key IS NOT NULL
    ORDER BY
      CASE status
        WHEN 'Deferred' THEN 0
        WHEN 'Idle' THEN 1
        WHEN 'Active' THEN 2
        WHEN 'Blocked' THEN 3
        WHEN 'Completed' THEN 4
      END,
      sort_key,
      thread_id
  `);
  const listStageAssignments = db.prepare(`
    SELECT thread_id, status, sort_key, updated_at
    FROM thread_organization
    WHERE status = ? AND sort_key IS NOT NULL
    ORDER BY sort_key, thread_id
  `);
  const getAssignment = db.prepare(`
    SELECT thread_id, status, sort_key, updated_at
    FROM thread_organization
    WHERE thread_id = ? AND sort_key IS NOT NULL
  `);
  const lastAssignment = db.prepare(`
    SELECT thread_id, status, sort_key, updated_at
    FROM thread_organization
    WHERE status = ? AND sort_key IS NOT NULL
    ORDER BY sort_key DESC, thread_id DESC
    LIMIT 1
  `);
  const upsertAssignment = db.prepare(`
    INSERT INTO thread_organization(
      thread_id, status, position, updated_at, sort_key,
      moved_by, previous_status, previous_sort_key
    )
    VALUES (?, ?, 0, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      status = excluded.status,
      updated_at = excluded.updated_at,
      sort_key = excluded.sort_key,
      moved_by = excluded.moved_by,
      previous_status = excluded.previous_status,
      previous_sort_key = excluded.previous_sort_key
  `);
  const listUndoCandidateRows = db.prepare(`
    SELECT thread_id, previous_status, previous_sort_key, updated_at
    FROM thread_organization
    WHERE moved_by = 'app'
      AND sort_key IS NOT NULL
      AND status IN (${FILED_STAGES.map(() => "?").join(", ")})
    ORDER BY updated_at DESC, thread_id
  `);
  const deleteAssignment = db.prepare(
    "DELETE FROM thread_organization WHERE thread_id = ?",
  );
  const upsertStageEntry = db.prepare(`
    INSERT INTO thread_stage_entry(thread_id, entered_at)
    VALUES (?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET entered_at = excluded.entered_at
  `);
  const listCompletedBeforeRows = db.prepare(`
    SELECT organization.thread_id, entry.entered_at
    FROM thread_organization AS organization
    JOIN thread_stage_entry AS entry ON entry.thread_id = organization.thread_id
    WHERE organization.status = 'Completed' AND entry.entered_at <= ?
    ORDER BY entry.entered_at, organization.thread_id
  `);
  const deleteStageEntry = db.prepare(
    "DELETE FROM thread_stage_entry WHERE thread_id = ?",
  );
  const getWorkingState = db.prepare(
    "SELECT is_working FROM thread_task_workflow WHERE thread_id = ?",
  );
  const upsertWorkingState = db.prepare(`
    INSERT INTO thread_task_workflow(thread_id, is_working, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      is_working = excluded.is_working,
      updated_at = excluded.updated_at
  `);
  const deleteWorkingState = db.prepare(
    "DELETE FROM thread_task_workflow WHERE thread_id = ?",
  );
  const listPreviewRows = db.prepare(`
    SELECT thread_id, preview
    FROM thread_task_preview
    ORDER BY thread_id
  `);
  const getPreview = db.prepare(
    "SELECT preview FROM thread_task_preview WHERE thread_id = ?",
  );
  const upsertPreview = db.prepare(`
    INSERT INTO thread_task_preview(thread_id, preview, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      preview = excluded.preview,
      updated_at = excluded.updated_at
  `);
  const deletePreview = db.prepare(
    "DELETE FROM thread_task_preview WHERE thread_id = ?",
  );

  function listState(): WorkflowStageState {
    return {
      assignments: (listAssignments.all() as AssignmentRow[]).map(
        assignmentFromRow,
      ),
    };
  }

  function ensureThreads(threadIds: readonly string[]): WorkflowStageState {
    if (threadIds.length > 10_000) throw new Error("Too many thread ids.");
    const uniqueIds = new Set(threadIds);
    if (uniqueIds.size !== threadIds.length) {
      throw new Error("Thread ids must be unique.");
    }
    for (const threadId of threadIds) assertThreadId(threadId);

    const last = lastAssignment.get(DEFAULT_WORKFLOW_STAGE) as
      | AssignmentRow
      | undefined;
    let previousKey = last?.sort_key ?? null;
    const now = Date.now();
    for (const threadId of threadIds) {
      if (getAssignment.get(threadId)) continue;
      const sortKey =
        previousKey === null
          ? createOrderKeyBetween({ previousKey: null, nextKey: null })
          : createOrderKeyAfter({ previousKey });
      upsertAssignment.run(
        threadId,
        DEFAULT_WORKFLOW_STAGE,
        now,
        sortKey,
        "auto",
        null,
        null,
      );
      upsertStageEntry.run(threadId, now);
      previousKey = sortKey;
    }
    return listState();
  }

  const ensureThreadsTransaction = db.transaction(ensureThreads);
  const syncRootThreadsTransaction = db.transaction(
    (
      rootThreadIds: readonly string[],
      childThreadIds: readonly string[],
    ): WorkflowStageState => {
      if (childThreadIds.length > 10_000) {
        throw new Error("Too many child thread ids.");
      }
      const rootIds = new Set(rootThreadIds);
      const childIds = new Set(childThreadIds);
      if (childIds.size !== childThreadIds.length) {
        throw new Error("Child thread ids must be unique.");
      }
      for (const threadId of childThreadIds) {
        assertThreadId(threadId);
        if (rootIds.has(threadId)) {
          throw new Error("A thread cannot be both a root and a child.");
        }
        deleteAssignment.run(threadId);
        deleteStageEntry.run(threadId);
        deleteWorkingState.run(threadId);
      }
      return ensureThreads(rootThreadIds);
    },
  );

  const removeRootThreadTransaction = db.transaction((threadId: string): boolean => {
    const assignmentDeleted = deleteAssignment.run(threadId).changes > 0;
    const stageEntryDeleted = deleteStageEntry.run(threadId).changes > 0;
    const workflowDeleted = deleteWorkingState.run(threadId).changes > 0;
    return assignmentDeleted || stageEntryDeleted || workflowDeleted;
  });

  function moveToStage(
    threadId: string,
    stage: WorkflowStage,
    source: MoveSource,
  ): boolean {
    const existing = getAssignment.get(threadId) as AssignmentRow | undefined;
    if (existing?.status === stage) return false;
    const last = lastAssignment.get(stage) as AssignmentRow | undefined;
    const sortKey = last
      ? createOrderKeyAfter({ previousKey: last.sort_key })
      : createOrderKeyBetween({ previousKey: null, nextKey: null });
    const now = Date.now();
    upsertAssignment.run(
      threadId,
      stage,
      now,
      sortKey,
      source,
      existing?.status ?? null,
      existing?.sort_key ?? null,
    );
    upsertStageEntry.run(threadId, now);
    return true;
  }

  const setStageTransaction = db.transaction(
    (
      threadId: string,
      stage: WorkflowStage,
      source: MoveSource,
    ): WorkflowStageState => {
      moveToStage(threadId, stage, source);
      return listState();
    },
  );

  const restoreToIdleTransaction = db.transaction(
    (threadId: string, sortKey: string | null): WorkflowStageState => {
      if (sortKey === null) {
        moveToStage(threadId, "Idle", "app");
        return listState();
      }
      const existing = getAssignment.get(threadId) as AssignmentRow | undefined;
      const now = Date.now();
      upsertAssignment.run(
        threadId,
        "Idle",
        now,
        sortKey,
        "app",
        existing?.status ?? null,
        existing?.sort_key ?? null,
      );
      if (existing?.status !== "Idle") {
        upsertStageEntry.run(threadId, now);
      }
      return listState();
    },
  );

  const observeActiveStateTransaction = db.transaction(
    (threadId: string, isWorking: boolean): ActiveStateObservation => {
      const previous = getWorkingState.get(threadId) as
        | { is_working: number }
        | undefined;
      const assignment = getAssignment.get(threadId) as
        | AssignmentRow
        | undefined;
      const isAutomaticallyManaged =
        assignment === undefined ||
        assignment.status === "Idle" ||
        assignment.status === "Active";
      let workflowStageChanged = false;

      if (
        isAutomaticallyManaged &&
        isWorking &&
        previous?.is_working !== 1
      ) {
        workflowStageChanged = moveToStage(threadId, "Active", "auto");
      } else if (
        isAutomaticallyManaged &&
        !isWorking &&
        previous?.is_working !== 0
      ) {
        if (assignment?.status === "Active") {
          workflowStageChanged = moveToStage(threadId, "Idle", "auto");
        }
      }

      upsertWorkingState.run(threadId, isWorking ? 1 : 0, Date.now());
      return { state: listState(), workflowStageChanged };
    },
  );

  const reorderThreadTransaction = db.transaction(
    (input: ReorderThreadInput): WorkflowStageState => {
      const moved = getAssignment.get(input.threadId) as AssignmentRow | undefined;
      if (
        moved?.status === input.workflowStage &&
        input.previousThreadId === null &&
        input.nextThreadId === null
      ) {
        return listState();
      }
      const current = listStageAssignments
        .all(input.workflowStage)
        .map((row) => assignmentFromRow(row as AssignmentRow));
      if (
        input.previousThreadId === input.threadId ||
        input.nextThreadId === input.threadId
      ) {
        throw new Error("The moved thread cannot be its own neighbor.");
      }

      const previous =
        input.previousThreadId === null
          ? null
          : current.find((item) => item.threadId === input.previousThreadId);
      const next =
        input.nextThreadId === null
          ? null
          : current.find((item) => item.threadId === input.nextThreadId);
      if (
        (input.previousThreadId !== null && !previous) ||
        (input.nextThreadId !== null && !next)
      ) {
        throw new Error("Thread order changed; refresh and try again.");
      }
      if (previous && next && previous.sortKey >= next.sortKey) {
        throw new Error("The previous thread must sort before the next thread.");
      }

      const currentIndex = current.findIndex(
        (item) => item.threadId === input.threadId,
      );
      if (
        moved?.status === input.workflowStage &&
        (current[currentIndex - 1]?.threadId ?? null) === input.previousThreadId &&
        (current[currentIndex + 1]?.threadId ?? null) === input.nextThreadId
      ) {
        return listState();
      }

      const sortKey = createOrderKeyBetween({
        previousKey: previous?.sortKey ?? null,
        nextKey: next?.sortKey ?? null,
      });
      const now = Date.now();
      upsertAssignment.run(
        input.threadId,
        input.workflowStage,
        now,
        sortKey,
        input.source ?? "app",
        moved?.status ?? null,
        moved?.sort_key ?? null,
      );
      if (moved?.status !== input.workflowStage) {
        upsertStageEntry.run(input.threadId, now);
      }
      return listState();
    },
  );

  return {
    listState,
    listPreviews() {
      return (
        listPreviewRows.all() as Array<{
          thread_id: string;
          preview: string | null;
        }>
      ).map((row) => ({ threadId: row.thread_id, preview: row.preview }));
    },
    get(threadId) {
      assertThreadId(threadId);
      const row = getAssignment.get(threadId) as AssignmentRow | undefined;
      if (!row) {
        return {
          threadId,
          workflowStage: DEFAULT_WORKFLOW_STAGE,
          sortKey: null,
          updatedAt: null,
          explicit: false,
        };
      }
      const assignment = assignmentFromRow(row);
      return { ...assignment, explicit: true };
    },
    ensureThreads(threadIds) {
      return ensureThreadsTransaction.immediate(threadIds);
    },
    syncRootThreads(rootThreadIds, childThreadIds) {
      return syncRootThreadsTransaction.immediate(
        rootThreadIds,
        childThreadIds,
      );
    },
    removeRootThread(threadId) {
      assertThreadId(threadId);
      return removeRootThreadTransaction.immediate(threadId);
    },
    setStage(threadId, stage, source = "app") {
      assertThreadId(threadId);
      if (!WORKFLOW_STAGES.includes(stage)) {
        throw new Error("Unknown stage.");
      }
      return setStageTransaction.immediate(threadId, stage, source);
    },
    restoreToIdle(threadId, sortKey) {
      assertThreadId(threadId);
      return restoreToIdleTransaction.immediate(threadId, sortKey);
    },
    listUndoCandidates() {
      return (
        listUndoCandidateRows.all(...FILED_STAGES) as Array<{
          thread_id: string;
          previous_status: string | null;
          previous_sort_key: string | null;
          updated_at: number;
        }>
      ).map((row) => ({
        threadId: row.thread_id,
        previousStage: (row.previous_status as WorkflowStage | null) ?? null,
        previousSortKey: row.previous_sort_key,
        updatedAt: row.updated_at,
      }));
    },
    listCompletedBefore(cutoff) {
      if (!Number.isFinite(cutoff)) throw new Error("Cutoff must be finite.");
      return (
        listCompletedBeforeRows.all(cutoff) as Array<{
          thread_id: string;
          entered_at: number;
        }>
      ).map((row) => ({
        threadId: row.thread_id,
        enteredAt: row.entered_at,
      }));
    },
    observeActiveState(threadId, isWorking) {
      assertThreadId(threadId);
      return observeActiveStateTransaction.immediate(threadId, isWorking);
    },
    setPreview(threadId, preview) {
      assertThreadId(threadId);
      if (preview !== null && preview.length > 500) {
        throw new Error("Thread preview must contain at most 500 characters.");
      }
      const existing = getPreview.get(threadId) as
        | { preview: string | null }
        | undefined;
      if (existing && existing.preview === preview) return false;
      upsertPreview.run(threadId, preview, Date.now());
      return true;
    },
    reorderThread(input) {
      assertThreadId(input.threadId);
      if (input.previousThreadId) assertThreadId(input.previousThreadId);
      if (input.nextThreadId) assertThreadId(input.nextThreadId);
      if (!WORKFLOW_STAGES.includes(input.workflowStage)) {
        throw new Error("Unknown stage.");
      }
      return reorderThreadTransaction.immediate(input);
    },
    delete(threadId) {
      assertThreadId(threadId);
      return db
        .transaction(() => {
          const assignmentDeleted = deleteAssignment.run(threadId).changes > 0;
          const stageEntryDeleted = deleteStageEntry.run(threadId).changes > 0;
          const workflowDeleted = deleteWorkingState.run(threadId).changes > 0;
          const previewDeleted = deletePreview.run(threadId).changes > 0;
          return (
            assignmentDeleted ||
            stageEntryDeleted ||
            workflowDeleted ||
            previewDeleted
          );
        })
        .immediate();
    },
  };
}
