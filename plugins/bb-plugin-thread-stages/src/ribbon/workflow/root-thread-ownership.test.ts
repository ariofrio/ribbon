import { describe, expect, it } from "vitest";
import {
  partitionWorkflowThreads,
  rootThreadIdByThreadId,
  withThreadAncestors,
} from "./root-thread-ownership";

interface Thread {
  id: string;
  parentThreadId: string | null;
}

const thread = (id: string, parentThreadId: string | null = null): Thread => ({
  id,
  parentThreadId,
});

describe("task ownership", () => {
  it("assigns task ownership only to root threads", () => {
    const threads = [
      thread("root"),
      thread("child", "root"),
      thread("grandchild", "child"),
      thread("other"),
    ];

    expect([...rootThreadIdByThreadId(threads)]).toEqual([
      ["root", "root"],
      ["child", "root"],
      ["grandchild", "root"],
      ["other", "other"],
    ]);
    expect(partitionWorkflowThreads(threads)).toEqual({
      rootThreads: [threads[0], threads[3]],
      childThreads: [threads[1], threads[2]],
    });
  });

  it("does not invent task owners for missing parents or cycles", () => {
    const threads = [
      thread("orphan", "missing"),
      thread("cycle-a", "cycle-b"),
      thread("cycle-b", "cycle-a"),
    ];

    expect([...rootThreadIdByThreadId(threads).values()]).toEqual([
      null,
      null,
      null,
    ]);
    expect(partitionWorkflowThreads(threads).rootThreads).toEqual([]);
  });

  it("adds ancestor chains to child-only search results", () => {
    const all = [
      thread("unrelated"),
      thread("root"),
      thread("child", "root"),
      thread("grandchild", "child"),
    ];

    expect(withThreadAncestors([all[3]!], all).map(({ id }) => id)).toEqual([
      "root",
      "child",
      "grandchild",
    ]);
  });
});
