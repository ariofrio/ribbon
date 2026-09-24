import { describe, expect, it } from "vitest";
import {
  canDropThreadBeside,
  flattenThreadHierarchy,
} from "./thread-hierarchy";

interface Thread {
  id: string;
  parentThreadId: string | null;
}

const thread = (id: string, parentThreadId: string | null = null): Thread => ({
  id,
  parentThreadId,
});

describe("flattenThreadHierarchy", () => {
  it("nests only parents present in the same workflow stage", () => {
    const rows = flattenThreadHierarchy(
      [thread("child", "parent"), thread("other"), thread("parent")],
      new Set(),
    );

    expect(rows.map(({ thread, depth }) => [thread.id, depth])).toEqual([
      ["other", 0],
      ["parent", 0],
      ["child", 1],
    ]);
    expect(rows[1]?.hasChildren).toBe(true);
  });

  it("promotes a child to a root when its parent is in another group", () => {
    expect(
      flattenThreadHierarchy(
        [thread("child", "parent-in-other-status")],
        new Set(),
      ),
    ).toMatchObject([{ thread: { id: "child" }, depth: 0 }]);
  });

  it("hides descendants behind a collapsed parent while retaining rollup data", () => {
    const rows = flattenThreadHierarchy(
      [
        thread("parent"),
        thread("child", "parent"),
        thread("grandchild", "child"),
      ],
      new Set(["parent"]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.descendants.map(({ id }) => id)).toEqual([
      "child",
      "grandchild",
    ]);
  });

  it("keeps corrupt parent cycles visible", () => {
    const rows = flattenThreadHierarchy(
      [thread("one", "two"), thread("two", "one")],
      new Set(),
    );
    expect(rows.map(({ thread }) => thread.id)).toEqual(["one", "two"]);
  });
});

describe("canDropThreadBeside", () => {
  it("allows sibling drops and rejects child-to-root drops", () => {
    const ids = new Set(["parent", "child-one", "child-two", "root"]);
    expect(
      canDropThreadBeside(
        thread("child-one", "parent"),
        thread("child-two", "parent"),
        ids,
      ),
    ).toBe(true);
    expect(
      canDropThreadBeside(thread("child-one", "parent"), thread("root"), ids),
    ).toBe(false);
  });

  it("treats a child as a root when its parent is outside the destination", () => {
    const destinationIds = new Set(["child", "root"]);
    expect(
      canDropThreadBeside(
        thread("child", "parent-in-other-status"),
        thread("root"),
        destinationIds,
      ),
    ).toBe(true);
  });
});
