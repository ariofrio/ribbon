import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Thread } from "./history";

export interface Job {
  threadId: string;
  // "message" titles the first message once bb's own title has landed;
  // "initial" titles the first turn; "refinement" assesses the third message.
  // Jobs saved without a phase are "initial".
  phase?: "message" | "initial" | "refinement";
  initialWorkerId?: string | null;
  // Workers of earlier phases, never recovered as a later phase's worker.
  pastWorkerIds?: string[];
  baseline: string | null;
  fallback: string | null;
  captured: boolean;
  count: number;
  state: "waiting" | "claimed" | "running" | "applying" | "done" | "skipped";
  workerId: string | null;
  reason: string | null;
  cleaned: boolean;
  startedAt: number | null;
  proposed: string | null;
  snapshotSeq: number;
  intentHash: string | null;
  // The worker ran on the automatic model rather than a selected one.
  automatic?: boolean;
  model?: string | null;
  // Snapshot the phase's model stack and cursor before spawning a worker.
  choices?: import("./server").Selection[];
  choiceIndex?: number;
  // Provider cooldowns survive phase handoff as well as process restart.
  cooldowns?: Record<string, number>;
  recoverableFailure?: boolean;
  legacyRecoveryChecked?: boolean;
  // Legacy jobs used this flag for their sole fallback/length retry.
  onFallback?: boolean;
  lengthRetry?: boolean;
  // The over-long title that prompted a length retry, if a worker wrote one.
  rejectedTitle?: string | null;
  // Failed workers, never recovered as a later worker in any phase.
  failedWorkerIds?: string[];
}

// Old selected-model failures were terminal even for a temporary rate limit.
export function legacyFailure(job: Job): boolean {
  return (
    job.state === "skipped" &&
    !job.legacyRecoveryChecked &&
    !job.choices &&
    job.automatic === false &&
    (job.phase ?? "initial") === "initial" &&
    job.baseline === null &&
    job.proposed === null &&
    job.reason === "Title worker failed"
  );
}

export function createStore(bb: BbPluginApi) {
  const db = () => bb.storage.database();
  bb.storage.migrate(db(), [
    "CREATE TABLE title_jobs (thread_id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL)",
  ]);
  const get = (id: string): Job | undefined => {
    const row = db()
      .prepare("SELECT data FROM title_jobs WHERE thread_id = ?")
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Job) : undefined;
  };
  const save = (job: Job) => {
    db()
      .prepare("UPDATE title_jobs SET state = ?, data = ? WHERE thread_id = ?")
      .run(job.state, JSON.stringify(job), job.threadId);
  };
  return {
    get,
    save,
    enroll(thread: Thread) {
      if (
        thread.visibility === "hidden" ||
        thread.originPluginId === bb.pluginId ||
        thread.archivedAt !== null ||
        thread.deletedAt !== null
      )
        return;
      const job: Job = {
        threadId: thread.id,
        phase: "message",
        initialWorkerId: null,
        baseline: thread.title,
        fallback: thread.titleFallback,
        captured: thread.title !== null,
        count: 0,
        state: thread.title ? "skipped" : "waiting",
        workerId: null,
        cleaned: false,
        startedAt: null,
        proposed: null,
        snapshotSeq: 0,
        intentHash: null,
        reason: thread.title ? "Title supplied at creation" : null,
      };
      db()
        .prepare("INSERT OR IGNORE INTO title_jobs VALUES (?, ?, ?)")
        .run(thread.id, job.state, JSON.stringify(job));
    },
    pending(): Job[] {
      return (
        db()
          .prepare(
            "SELECT data FROM title_jobs WHERE state NOT IN ('done','skipped') OR (json_extract(data, '$.workerId') IS NOT NULL AND json_extract(data, '$.cleaned') = 0) OR (state = 'skipped' AND json_extract(data, '$.automatic') = 0 AND json_extract(data, '$.choices') IS NULL AND json_extract(data, '$.legacyRecoveryChecked') IS NULL)",
          )
          .all() as Array<{ data: string }>
      )
        .map((row) => JSON.parse(row.data) as Job)
        .filter(
          (job) =>
            !["done", "skipped"].includes(job.state) ||
            (job.workerId && !job.cleaned) ||
            legacyFailure(job),
        );
    },
    claim(job: Job): boolean {
      job.state = "claimed";
      return (
        db()
          .prepare(
            "UPDATE title_jobs SET state = ?, data = ? WHERE thread_id = ? AND state = 'waiting'",
          )
          .run(job.state, JSON.stringify(job), job.threadId).changes === 1
      );
    },
  };
}
