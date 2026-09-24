import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Thread } from "./history";

export interface Job {
  threadId: string;
  phase?: "initial" | "refinement";
  initialWorkerId?: string | null;
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
        phase: "initial",
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
            "SELECT data FROM title_jobs WHERE state NOT IN ('done','skipped') OR (json_extract(data, '$.workerId') IS NOT NULL AND json_extract(data, '$.cleaned') = 0)",
          )
          .all() as Array<{ data: string }>
      ).map((row) => JSON.parse(row.data) as Job);
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
