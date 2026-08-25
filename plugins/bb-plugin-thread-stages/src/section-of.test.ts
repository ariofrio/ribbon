import { describe, expect, it } from "vitest";
import { nearestSectionId } from "./section-of";

// root(sec_root) -> mid(sec_mid) -> leaf(none), plus a thread filed nowhere.
const threads = [
  { id: "root", parentThreadId: null, sectionId: "sec_root" },
  { id: "mid", parentThreadId: "root", sectionId: "sec_mid" },
  { id: "leaf", parentThreadId: "mid", sectionId: null },
  { id: "loose", parentThreadId: null, sectionId: null },
  { id: "kid", parentThreadId: "loose", sectionId: null },
];

describe("nearestSectionId", () => {
  it("takes a thread's own section", () => {
    expect(nearestSectionId("mid", threads)).toBe("sec_mid");
  });

  it("takes the nearest ancestor's, not the root's", () => {
    expect(nearestSectionId("leaf", threads)).toBe("sec_mid");
  });

  it("reaches the root when nothing nearer is filed", () => {
    expect(nearestSectionId("kid", threads)).toBe(null);
    expect(nearestSectionId("root", threads)).toBe("sec_root");
  });

  it("is null for a thread it has never heard of", () => {
    expect(nearestSectionId("ghost", threads)).toBe(null);
  });

  it("stops on a cycle rather than spinning", () => {
    const looped = [
      { id: "a", parentThreadId: "b", sectionId: null },
      { id: "b", parentThreadId: "a", sectionId: null },
    ];
    expect(nearestSectionId("a", looped)).toBe(null);
  });
});
