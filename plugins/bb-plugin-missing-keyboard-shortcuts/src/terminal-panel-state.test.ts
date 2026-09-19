import { describe, expect, it } from "vitest";
import {
  activateTerminalPanel,
  closePanel,
  readRecentSideChatTabId,
  readRecentTerminalId,
  readSideChatPanelSnapshot,
  readTerminalPanelSnapshot,
  removeSideChatPanelTab,
  rememberRecentSideChatTabId,
  rememberRecentTerminalId,
  selectSideChatPanelTab,
  shouldCloseTerminalPanel,
  type StringStorage,
} from "./terminal-panel-state";

class MemoryStorage implements StringStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function sideChatTab(
  parentThreadId: string,
  childThreadId: string,
  pluginId = "missing-keyboard-shortcuts",
) {
  return {
    actionId: "side-chat",
    id: `${pluginId}:${childThreadId}`,
    kind: "plugin-panel",
    paramsJson: JSON.stringify({
      sourceMessageText: "",
      sourceSeqEnd: null,
      sourceThreadId: parentThreadId,
      threadId: childThreadId,
    }),
    pluginId,
    title: "Side chat",
  };
}

function storePanel(
  storage: StringStorage,
  threadId: string,
  tabs: readonly Record<string, unknown>[],
  activeTabId: string | null,
) {
  storage.setItem(
    `bb.thread.fixedPanelTabsState-${threadId}-1`,
    JSON.stringify({
      lastUsedAt: 1,
      secondary: { activeTabId, isOpen: true, tabs },
      version: 1,
    }),
  );
}

describe("terminal panel state", () => {
  it("closes only when a terminal is selected, visible, and focused", () => {
    expect(
      shouldCloseTerminalPanel(
        {
          activeTerminalId: "term_one",
          isOpen: true,
          terminalIds: ["term_one"],
        },
        true,
      ),
    ).toBe(true);
    expect(
      shouldCloseTerminalPanel(
        {
          activeTerminalId: "term_one",
          isOpen: true,
          terminalIds: ["term_one"],
        },
        false,
      ),
    ).toBe(false);
    expect(
      shouldCloseTerminalPanel(
        {
          activeTerminalId: "term_one",
          isOpen: false,
          terminalIds: ["term_one"],
        },
        true,
      ),
    ).toBe(false);
    expect(
      shouldCloseTerminalPanel(
        { activeTerminalId: null, isOpen: true, terminalIds: [] },
        true,
      ),
    ).toBe(false);
  });

  it("opens an empty panel with a selected terminal tab", () => {
    const storage = new MemoryStorage();
    const change = activateTerminalPanel(storage, "thr/one", "term/one", 42);

    expect(change.key).toBe("bb.thread.fixedPanelTabsState-thr%2Fone-1");
    expect(readTerminalPanelSnapshot(storage, "thr/one")).toEqual({
      activeTerminalId: "term/one",
      isOpen: true,
      terminalIds: ["term/one"],
    });
    expect(JSON.parse(change.newValue)).toMatchObject({ lastUsedAt: 42 });
  });

  it("selects an existing terminal without duplicating or losing other tabs", () => {
    const storage = new MemoryStorage();
    activateTerminalPanel(storage, "thr_one", "term_one", 10);
    const firstChange = activateTerminalPanel(
      storage,
      "thr_one",
      "term_two",
      11,
    );
    const state = JSON.parse(firstChange.newValue);
    state.secondary.tabs.unshift({
      id: "thread-info:thread-info:none",
      kind: "thread-info",
    });
    state.extra = "preserved";
    storage.setItem(firstChange.key, JSON.stringify(state));

    const change = activateTerminalPanel(storage, "thr_one", "term_one", 12);
    const updated = JSON.parse(change.newValue);
    expect(updated.secondary.tabs).toHaveLength(3);
    expect(updated.secondary.tabs[0]).toEqual({
      id: "thread-info:thread-info:none",
      kind: "thread-info",
    });
    expect(updated.extra).toBe("preserved");
    expect(readTerminalPanelSnapshot(storage, "thr_one")).toEqual({
      activeTerminalId: "term_one",
      isOpen: true,
      terminalIds: ["term_one", "term_two"],
    });
  });

  it("closes the panel while preserving the selected terminal", () => {
    const storage = new MemoryStorage();
    activateTerminalPanel(storage, "thr_one", "term_one", 10);
    closePanel(storage, "thr_one", 20);

    expect(readTerminalPanelSnapshot(storage, "thr_one")).toEqual({
      activeTerminalId: "term_one",
      isOpen: false,
      terminalIds: ["term_one"],
    });
  });

  it("remembers the most recently focused terminal per thread", () => {
    const storage = new MemoryStorage();
    rememberRecentTerminalId(storage, "thr_one", "term_one");
    rememberRecentTerminalId(storage, "thr_two", "term_two");

    expect(readRecentTerminalId(storage, "thr_one")).toBe("term_one");
    expect(readRecentTerminalId(storage, "thr_two")).toBe("term_two");
  });

  it("treats malformed native panel state as empty", () => {
    const storage = new MemoryStorage();
    storage.setItem("bb.thread.fixedPanelTabsState-thr_one-1", "not json");

    expect(readTerminalPanelSnapshot(storage, "thr_one")).toEqual({
      activeTerminalId: null,
      isOpen: false,
      terminalIds: [],
    });
  });

  it("reads side-chat tabs opened through the public plugin panel API", () => {
    const storage = new MemoryStorage();
    const tab = sideChatTab("thr_parent", "thr_side");
    storePanel(storage, "thr_parent", [tab], tab.id);

    expect(readSideChatPanelSnapshot(storage, "thr_parent")).toEqual({
      activeSideChat: { childThreadId: "thr_side", id: tab.id },
      isOpen: true,
      sideChats: [{ childThreadId: "thr_side", id: tab.id }],
    });
  });

  it("continues to recognize side-chat tabs from the built-in plugin", () => {
    const storage = new MemoryStorage();
    const tab = sideChatTab("thr_parent", "thr_side", "side-chat");
    storePanel(storage, "thr_parent", [tab], tab.id);

    expect(readSideChatPanelSnapshot(storage, "thr_parent")).toEqual({
      activeSideChat: { childThreadId: "thr_side", id: tab.id },
      isOpen: true,
      sideChats: [{ childThreadId: "thr_side", id: tab.id }],
    });
  });

  it("ignores malformed and wrong-parent side-chat tabs", () => {
    const storage = new MemoryStorage();
    const valid = sideChatTab("thr_other", "thr_side");
    const key = "bb.thread.fixedPanelTabsState-thr_parent-1";
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        secondary: {
          tabs: [
            valid,
            {
              id: "plugin-panel:broken:none",
              kind: "plugin-panel",
              pluginId: "side-chat",
              actionId: "side-chat",
              paramsJson: "not json",
              title: "Side chat",
            },
          ],
          activeTabId: valid.id,
          isOpen: true,
        },
        lastUsedAt: 1,
      }),
    );

    expect(readSideChatPanelSnapshot(storage, "thr_parent")).toEqual({
      activeSideChat: null,
      isOpen: true,
      sideChats: [],
    });
  });

  it("chooses the active, recent, then latest side chat", () => {
    const first = { childThreadId: "thr_first", id: "tab_first" };
    const second = { childThreadId: "thr_second", id: "tab_second" };
    const panel = { activeSideChat: null, isOpen: true, sideChats: [first, second] };

    expect(selectSideChatPanelTab(panel, first.id)).toBe(first);
    expect(selectSideChatPanelTab(panel, "missing")).toBe(second);
    expect(
      selectSideChatPanelTab({ ...panel, activeSideChat: first }, second.id),
    ).toBe(first);
    expect(
      selectSideChatPanelTab(
        { activeSideChat: null, isOpen: false, sideChats: [] },
        null,
      ),
    ).toBeNull();
  });

  it("remembers the most recently focused side-chat tab per thread", () => {
    const storage = new MemoryStorage();
    rememberRecentSideChatTabId(storage, "thr_one", "tab_one");
    rememberRecentSideChatTabId(storage, "thr_two", "tab_two");

    expect(readRecentSideChatTabId(storage, "thr_one")).toBe("tab_one");
    expect(readRecentSideChatTabId(storage, "thr_two")).toBe("tab_two");
  });

  it("removes a stale side-chat tab without losing sibling tabs", () => {
    const storage = new MemoryStorage();
    const stale = sideChatTab("thr_parent", "thr_stale");
    const live = sideChatTab("thr_parent", "thr_live");
    const terminal = {
      id: "terminal:term_one:none",
      kind: "terminal",
      terminalId: "term_one",
    };
    storePanel(storage, "thr_parent", [live, stale, terminal], terminal.id);

    removeSideChatPanelTab(storage, "thr_parent", stale.id, 13);

    expect(readSideChatPanelSnapshot(storage, "thr_parent")).toEqual({
      activeSideChat: null,
      isOpen: true,
      sideChats: [{ childThreadId: "thr_live", id: live.id }],
    });
    expect(readTerminalPanelSnapshot(storage, "thr_parent")).toEqual({
      activeTerminalId: "term_one",
      isOpen: true,
      terminalIds: ["term_one"],
    });
  });
});
