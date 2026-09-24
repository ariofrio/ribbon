import { describe, expect, it } from "vitest";
import {
  buildPinnedThreadState,
  sortExplicitPinnedThreadIds,
} from "./pinned-threads";

interface Thread {
  id: string;
  isPinned: boolean;
  parentThreadId: string | null;
}

const thread = (
  id: string,
  { isPinned = false, parentThreadId = null }: Partial<Thread> = {},
): Thread => ({ id, isPinned, parentThreadId });

describe("buildPinnedThreadState", () => {
  it("moves pinned roots and all descendants out of workflow-stage groups", () => {
    const threads = [
      thread("ordinary"),
      thread("child", { parentThreadId: "parent" }),
      thread("grandchild", { parentThreadId: "child" }),
      thread("parent", { isPinned: true }),
    ];

    const state = buildPinnedThreadState(threads, ["parent"]);

    expect(state.pinnedThreads.map(({ id }) => id)).toEqual([
      "parent",
      "child",
      "grandchild",
    ]);
    expect([...state.effectivePinnedThreadIds].sort()).toEqual([
      "child",
      "grandchild",
      "parent",
    ]);
    expect(
      threads
        .filter((item) => !state.effectivePinnedThreadIds.has(item.id))
        .map(({ id }) => id),
    ).toEqual(["ordinary"]);
  });

  it("uses authoritative pin order and nests a pinned child under a pinned parent", () => {
    const threads = [
      thread("later", { isPinned: true }),
      thread("child", { isPinned: true, parentThreadId: "earlier" }),
      thread("earlier", { isPinned: true }),
    ];

    const state = buildPinnedThreadState(threads, [
      "earlier",
      "child",
      "later",
    ]);

    expect(state.pinnedThreads.map(({ id }) => id)).toEqual([
      "earlier",
      "child",
      "later",
    ]);
  });

  it("keeps a pinned child with its unpinned parent task", () => {
    const pinnedChild = thread("child", {
      isPinned: true,
      parentThreadId: "ordinary-parent",
    });

    const state = buildPinnedThreadState(
      [thread("ordinary-parent"), pinnedChild],
      ["child"],
    );

    expect(state.pinnedThreads).toEqual([]);
    expect([...state.effectivePinnedThreadIds]).toEqual([]);
  });
});

describe("sortExplicitPinnedThreadIds", () => {
  it("uses fractional pin order", () => {
    expect(
      sortExplicitPinnedThreadIds([
        {
          id: "unpinned",
          pinnedAt: null,
          pinSortKey: null,
          createdAt: 100,
        },
        {
          id: "middle",
          pinnedAt: 200,
          pinSortKey: "U",
          createdAt: 100,
        },
        {
          id: "last",
          pinnedAt: 300,
          pinSortKey: "k",
          createdAt: 100,
        },
        {
          id: "first",
          pinnedAt: 100,
          pinSortKey: "F",
          createdAt: 100,
        },
      ]),
    ).toEqual(["first", "middle", "last"]);
  });

  it("falls back to newest pin time when an order key is missing", () => {
    expect(
      sortExplicitPinnedThreadIds([
        {
          id: "older",
          pinnedAt: 100,
          pinSortKey: "F",
          createdAt: 100,
        },
        {
          id: "newer-without-key",
          pinnedAt: 200,
          pinSortKey: null,
          createdAt: 100,
        },
      ]),
    ).toEqual(["newer-without-key", "older"]);
  });
});
