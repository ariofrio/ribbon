const FIXED_PANEL_STORAGE_PREFIX = "bb.thread.fixedPanelTabsState";
const FIXED_PANEL_STORAGE_VERSION = 1;
const RECENT_TERMINAL_STORAGE_PREFIX =
  "bb.plugin.missing-keyboard-shortcuts.recent-terminal";
const RECENT_SIDE_CHAT_STORAGE_PREFIX =
  "bb.plugin.missing-keyboard-shortcuts.recent-side-chat";
const SIDE_CHAT_PLUGIN_ID = "side-chat";
const SIDE_CHAT_ACTION_ID = "side-chat";
const SHORTCUTS_PLUGIN_ID = "missing-keyboard-shortcuts";

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredTab {
  actionId?: unknown;
  id?: unknown;
  kind?: unknown;
  paramsJson?: unknown;
  pluginId?: unknown;
  terminalId?: unknown;
  title?: unknown;
  [key: string]: unknown;
}

interface StoredPanelState {
  version: 1;
  secondary: {
    tabs: StoredTab[];
    activeTabId: string | null;
    isOpen: boolean;
    [key: string]: unknown;
  };
  lastUsedAt: number;
  [key: string]: unknown;
}

export interface TerminalPanelSnapshot {
  activeTerminalId: string | null;
  isOpen: boolean;
  terminalIds: readonly string[];
}

export interface SideChatPanelTab {
  childThreadId: string;
  id: string;
}

export interface SideChatPanelSnapshot {
  activeSideChat: SideChatPanelTab | null;
  isOpen: boolean;
  sideChats: readonly SideChatPanelTab[];
}

export interface PanelStorageChange {
  key: string;
  newValue: string;
  oldValue: string | null;
}

export function shouldCloseTerminalPanel(
  panel: TerminalPanelSnapshot,
  terminalFocused: boolean,
): boolean {
  return (
    panel.isOpen && panel.activeTerminalId !== null && terminalFocused
  );
}

function panelStorageKey(threadId: string): string {
  return `${FIXED_PANEL_STORAGE_PREFIX}-${encodeURIComponent(threadId.trim())}-${FIXED_PANEL_STORAGE_VERSION}`;
}

function recentTerminalStorageKey(threadId: string): string {
  return `${RECENT_TERMINAL_STORAGE_PREFIX}-${encodeURIComponent(threadId.trim())}`;
}

function recentSideChatStorageKey(threadId: string): string {
  return `${RECENT_SIDE_CHAT_STORAGE_PREFIX}-${encodeURIComponent(threadId.trim())}`;
}

function terminalTabId(terminalId: string): string {
  return `terminal:${encodeURIComponent(terminalId)}:none`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePanelState(value: string | null): StoredPanelState {
  if (value !== null) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        isRecord(parsed) &&
        parsed.version === FIXED_PANEL_STORAGE_VERSION &&
        typeof parsed.lastUsedAt === "number" &&
        Number.isInteger(parsed.lastUsedAt) &&
        parsed.lastUsedAt >= 0 &&
        isRecord(parsed.secondary) &&
        Array.isArray(parsed.secondary.tabs) &&
        parsed.secondary.tabs.every(isRecord) &&
        (typeof parsed.secondary.activeTabId === "string" ||
          parsed.secondary.activeTabId === null) &&
        typeof parsed.secondary.isOpen === "boolean"
      ) {
        return parsed as StoredPanelState;
      }
    } catch {
      // BB treats malformed panel state as an empty panel too.
    }
  }

  return {
    version: FIXED_PANEL_STORAGE_VERSION,
    secondary: { tabs: [], activeTabId: null, isOpen: false },
    lastUsedAt: 0,
  };
}

function terminalIdForTab(tab: StoredTab): string | null {
  return tab.kind === "terminal" && typeof tab.terminalId === "string"
    ? tab.terminalId
    : null;
}

function sideChatForTab(
  tab: StoredTab,
  parentThreadId: string,
): SideChatPanelTab | null {
  if (
    tab.kind !== "plugin-panel" ||
    (tab.pluginId !== SIDE_CHAT_PLUGIN_ID &&
      tab.pluginId !== SHORTCUTS_PLUGIN_ID) ||
    tab.actionId !== SIDE_CHAT_ACTION_ID ||
    typeof tab.id !== "string" ||
    typeof tab.paramsJson !== "string"
  ) {
    return null;
  }
  try {
    const params: unknown = JSON.parse(tab.paramsJson);
    if (
      !isRecord(params) ||
      typeof params.threadId !== "string" ||
      params.threadId.length === 0 ||
      params.sourceThreadId !== parentThreadId
    ) {
      return null;
    }
    return { childThreadId: params.threadId, id: tab.id };
  } catch {
    return null;
  }
}

function snapshotFromState(state: StoredPanelState): TerminalPanelSnapshot {
  const terminalIds = state.secondary.tabs.flatMap((tab) => {
    const terminalId = terminalIdForTab(tab);
    return terminalId === null ? [] : [terminalId];
  });
  const activeTab = state.secondary.tabs.find(
    (tab) => tab.id === state.secondary.activeTabId,
  );
  return {
    activeTerminalId:
      activeTab === undefined ? null : terminalIdForTab(activeTab),
    isOpen: state.secondary.isOpen,
    terminalIds,
  };
}

function writePanelState(
  storage: StringStorage,
  threadId: string,
  state: StoredPanelState,
): PanelStorageChange {
  const key = panelStorageKey(threadId);
  const oldValue = storage.getItem(key);
  const newValue = JSON.stringify(state);
  storage.setItem(key, newValue);
  return { key, newValue, oldValue };
}

export function readTerminalPanelSnapshot(
  storage: StringStorage,
  threadId: string,
): TerminalPanelSnapshot {
  return snapshotFromState(
    parsePanelState(storage.getItem(panelStorageKey(threadId))),
  );
}

export function readSideChatPanelSnapshot(
  storage: StringStorage,
  threadId: string,
): SideChatPanelSnapshot {
  const state = parsePanelState(storage.getItem(panelStorageKey(threadId)));
  const sideChats = state.secondary.tabs.flatMap((tab) => {
    const sideChat = sideChatForTab(tab, threadId);
    return sideChat === null ? [] : [sideChat];
  });
  const activeSideChat =
    sideChats.find(({ id }) => id === state.secondary.activeTabId) ?? null;
  return { activeSideChat, isOpen: state.secondary.isOpen, sideChats };
}

export function removeSideChatPanelTab(
  storage: StringStorage,
  threadId: string,
  tabId: string,
  now = Date.now(),
): PanelStorageChange | null {
  const state = parsePanelState(storage.getItem(panelStorageKey(threadId)));
  const tab = state.secondary.tabs.find(({ id }) => id === tabId);
  if (tab === undefined || sideChatForTab(tab, threadId) === null) return null;
  return writePanelState(storage, threadId, {
    ...state,
    secondary: {
      ...state.secondary,
      tabs: state.secondary.tabs.filter(({ id }) => id !== tabId),
      activeTabId:
        state.secondary.activeTabId === tabId
          ? null
          : state.secondary.activeTabId,
    },
    lastUsedAt: now,
  });
}

export function selectSideChatPanelTab(
  panel: SideChatPanelSnapshot,
  recentTabId: string | null,
): SideChatPanelTab | null {
  return (
    panel.activeSideChat ??
    panel.sideChats.find(({ id }) => id === recentTabId) ??
    panel.sideChats.at(-1) ??
    null
  );
}

export function activateTerminalPanel(
  storage: StringStorage,
  threadId: string,
  terminalId: string,
  now = Date.now(),
): PanelStorageChange {
  const state = parsePanelState(storage.getItem(panelStorageKey(threadId)));
  const id = terminalTabId(terminalId);
  const tabs = state.secondary.tabs.some((tab) => tab.id === id)
    ? state.secondary.tabs
    : [...state.secondary.tabs, { id, kind: "terminal", terminalId }];
  return writePanelState(storage, threadId, {
    ...state,
    secondary: {
      ...state.secondary,
      tabs,
      activeTabId: id,
      isOpen: true,
    },
    lastUsedAt: now,
  });
}

export function closePanel(
  storage: StringStorage,
  threadId: string,
  now = Date.now(),
): PanelStorageChange {
  const state = parsePanelState(storage.getItem(panelStorageKey(threadId)));
  return writePanelState(storage, threadId, {
    ...state,
    secondary: { ...state.secondary, isOpen: false },
    lastUsedAt: now,
  });
}

export function readRecentSideChatTabId(
  storage: StringStorage,
  threadId: string,
): string | null {
  return storage.getItem(recentSideChatStorageKey(threadId));
}

export function rememberRecentSideChatTabId(
  storage: StringStorage,
  threadId: string,
  tabId: string,
): void {
  storage.setItem(recentSideChatStorageKey(threadId), tabId);
}

export function readRecentTerminalId(
  storage: StringStorage,
  threadId: string,
): string | null {
  return storage.getItem(recentTerminalStorageKey(threadId));
}

export function rememberRecentTerminalId(
  storage: StringStorage,
  threadId: string,
  terminalId: string,
): void {
  storage.setItem(recentTerminalStorageKey(threadId), terminalId);
}
