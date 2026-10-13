// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  experimental_useThreadActions,
  type PluginThreadActionEntry,
} from "@get-bb/plugin-sdk/app";
import { makeSidebarThread } from "../../app/model/fixtures.js";
import { useThreadSectionMove } from "../../app/rows/ThreadSectionMoveProvider.js";
import {
  RIBBON_MOVE_ACTION_KEY,
  useRibbonThreadActions,
} from "./row-actions.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_THREAD_ACTION_GROUPS: { organize: "2_organize" },
  experimental_useThreadActions: vi.fn(),
  experimental_useThreadActionRegistrations: vi.fn(() => []),
}));
vi.mock("../../app/rows/ThreadSectionMoveProvider.js", () => ({
  useThreadSectionMove: vi.fn(),
}));

const thread = makeSidebarThread();
const nativeEntries: PluginThreadActionEntry[] = [
  "bb--core/copyLink",
  "thread-list/move",
  "bb--core/rename",
].map((key) => ({
  key,
  pluginId: key.split("/")[0]!,
  group: "2_organize",
  action: { label: key, icon: "Copy", run: async () => {} },
}));
const moveThread = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useThreadSectionMove).mockReturnValue({
    destinations: [{ sectionId: "sec_other", label: "Other" }],
    moveThread,
  });
  vi.mocked(experimental_useThreadActions).mockImplementation(
    (_thread, options) =>
      options?.keys === undefined
        ? nativeEntries
        : options.keys.flatMap((key) =>
            nativeEntries.filter((entry) => entry.key === key),
          ),
  );
});

describe("useRibbonThreadActions", () => {
  it("requests no host actions when no quick actions are configured", () => {
    const { result } = renderHook(() =>
      useRibbonThreadActions(thread, { keys: [] }),
    );
    expect(result.current).toEqual([]);
    expect(experimental_useThreadActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: thread.id }),
      expect.objectContaining({ keys: [] }),
    );
  });

  it("requests only configured host actions", () => {
    const { result } = renderHook(() =>
      useRibbonThreadActions(thread, { keys: ["bb--core/copyLink"] }),
    );
    expect(result.current.map((entry) => entry.key)).toEqual([
      "bb--core/copyLink",
    ]);
    expect(experimental_useThreadActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: thread.id }),
      expect.objectContaining({ keys: ["bb--core/copyLink"] }),
    );
  });

  it("preserves Ribbon's local move action and the requested order", async () => {
    const keys = [RIBBON_MOVE_ACTION_KEY, "bb--core/copyLink"];
    const { result } = renderHook(() =>
      useRibbonThreadActions(thread, { keys }),
    );
    expect(result.current.map((entry) => entry.key)).toEqual(keys);
    await result.current[0]!.action.run("sec_other");
    expect(moveThread).toHaveBeenCalledWith(thread, "sec_other");
  });

  it("keeps all menu actions when keys are omitted", () => {
    const { result } = renderHook(() => useRibbonThreadActions(thread));
    expect(result.current.map((entry) => entry.key)).toEqual([
      "bb--core/copyLink",
      RIBBON_MOVE_ACTION_KEY,
      "bb--core/rename",
    ]);
  });
});
