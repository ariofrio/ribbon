import { describe, expect, it } from "vitest";
import {
  composerShortcutTarget,
  historyDirection,
  isTerminalShortcut,
  newThreadTarget,
} from "./shortcut-actions";

const baseChord = {
  altKey: false,
  ctrlKey: false,
  key: "",
  metaKey: true,
  repeat: false,
  shiftKey: false,
};

describe("historyDirection", () => {
  it("matches Command-[ and Command-]", () => {
    expect(historyDirection({ ...baseChord, key: "[" })).toBe(-1);
    expect(historyDirection({ ...baseChord, key: "]" })).toBe(1);
  });

  it("rejects extra modifiers and held-key repeats", () => {
    expect(historyDirection({ ...baseChord, key: "[", altKey: true })).toBeNull();
    expect(historyDirection({ ...baseChord, key: "]", ctrlKey: true })).toBeNull();
    expect(historyDirection({ ...baseChord, key: "[", shiftKey: true })).toBeNull();
    expect(historyDirection({ ...baseChord, key: "]", repeat: true })).toBeNull();
  });
});

describe("isTerminalShortcut", () => {
  const chord = {
    ...baseChord,
    ctrlKey: true,
    key: "`",
    metaKey: false,
  };

  it("matches Control-backtick", () => {
    expect(isTerminalShortcut(chord)).toBe(true);
  });

  it("rejects extra modifiers and held-key repeats", () => {
    expect(isTerminalShortcut({ ...chord, altKey: true })).toBe(false);
    expect(isTerminalShortcut({ ...chord, metaKey: true })).toBe(false);
    expect(isTerminalShortcut({ ...chord, shiftKey: true })).toBe(false);
    expect(isTerminalShortcut({ ...chord, repeat: true })).toBe(false);
  });

  it("rejects other chords", () => {
    expect(isTerminalShortcut({ ...chord, key: "~" })).toBe(false);
    expect(isTerminalShortcut({ ...chord, ctrlKey: false })).toBe(false);
  });
});

describe("composerShortcutTarget", () => {
  it("matches Command-L and Command-Shift-L", () => {
    expect(composerShortcutTarget({ ...baseChord, key: "l" })).toBe(
      "primary",
    );
    expect(
      composerShortcutTarget({ ...baseChord, key: "L", shiftKey: true }),
    ).toBe("secondary");
  });

  it("rejects extra modifiers, held-key repeats, and other keys", () => {
    const chord = { ...baseChord, key: "l" };
    expect(composerShortcutTarget({ ...chord, altKey: true })).toBeNull();
    expect(composerShortcutTarget({ ...chord, ctrlKey: true })).toBeNull();
    expect(composerShortcutTarget({ ...chord, repeat: true })).toBeNull();
    expect(composerShortcutTarget({ ...chord, key: "k" })).toBeNull();
    expect(composerShortcutTarget({ ...chord, metaKey: false })).toBeNull();
  });
});

describe("newThreadTarget", () => {
  it("targets no project for Command-N", () => {
    expect(
      newThreadTarget(
        { ...baseChord, key: "n" },
        { projectId: "proj_one", threadId: null },
      ),
    ).toEqual({ projectId: "proj_personal" });
  });

  it("targets the selected thread's project for Command-Shift-N", () => {
    const chord = { ...baseChord, key: "N", shiftKey: true };
    expect(
      newThreadTarget(chord, {
        projectId: "proj_one",
        threadId: "thr_standard",
      }),
    ).toEqual({ projectId: "proj_one" });
    expect(
      newThreadTarget(chord, { projectId: null, threadId: "thr_personal" }),
    ).toEqual({ projectId: "proj_personal" });
  });

  it("targets the last selected thread's project when no thread is selected", () => {
    expect(
      newThreadTarget(
        { ...baseChord, key: "n", shiftKey: true },
        { projectId: null, threadId: null },
        "proj_last_selected",
      ),
    ).toEqual({ projectId: "proj_last_selected" });
  });

  it("targets no project when no thread has ever been selected", () => {
    expect(
      newThreadTarget(
        { ...baseChord, key: "n", shiftKey: true },
        { projectId: null, threadId: null },
        null,
      ),
    ).toEqual({ projectId: "proj_personal" });
  });

  it("rejects extra modifiers, held-key repeats, and other keys", () => {
    const chord = { ...baseChord, key: "n" };
    const context = { projectId: "proj_one", threadId: "thr_one" };
    expect(newThreadTarget({ ...chord, altKey: true }, context)).toBeNull();
    expect(newThreadTarget({ ...chord, ctrlKey: true }, context)).toBeNull();
    expect(newThreadTarget({ ...chord, repeat: true }, context)).toBeNull();
    expect(newThreadTarget({ ...chord, key: "m" }, context)).toBeNull();
    expect(newThreadTarget({ ...chord, metaKey: false }, context)).toBeNull();
  });
});
