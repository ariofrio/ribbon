import type { rpcContract } from "./server";
import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  ThreadChat,
  useBbContext,
  useRpc,
  type JsonValue,
  type PluginCommandContext,
  type PluginRpcClient,
  type PluginThreadPanelProps,
  type ThreadChatMessageAction,
  useComposer,
  useComposerView,
} from "@get-bb/plugin-sdk/app";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  closePrimaryPanel,
  focusedSecondaryComposerThreadId,
  focusPrimaryComposer,
  focusSecondaryComposerWhenReady,
  hasPrimaryComposer,
  isSecondaryComposerFocused,
  registerPrimaryComposerFocus,
  registerSecondaryComposer,
  selectPrimaryPanelTabWhenReady,
} from "./composer-navigation-bridge";
import {
  PERSONAL_PROJECT_ID,
  readLastThreadProjectId,
  rememberThreadProject,
} from "./last-thread-project";
import { projectThreadTarget } from "./new-thread-target";
import {
  focusVisibleTerminal,
  isSecondaryComposerDomFocused,
  isTerminalFocused,
  isWithinTerminal,
} from "./terminal-dom";
import {
  activateTerminalPanel,
  closePanel,
  readRecentSideChatTabId,
  readRecentTerminalId,
  readSideChatPanelSnapshot,
  readTerminalPanelSnapshot,
  rememberRecentSideChatTabId,
  rememberRecentTerminalId,
  removeSideChatPanelTab,
  selectSideChatPanelTab,
  shouldCloseTerminalPanel,
  type PanelStorageChange,
} from "./terminal-panel-state";

interface OpenTerminalResult {
  created: boolean;
  terminalId: string;
}

interface CreateSideChatResult {
  threadId: string;
}

interface ValidateSideChatResult {
  reusable: boolean;
}

interface SideChatPanelParams extends Record<string, JsonValue> {
  sourceMessageText: string;
  sourceSeqEnd: number | null;
  sourceThreadId: string;
  threadId: string;
}

const SIDE_CHAT_PANEL_ACTION_ID = "side-chat";
const SIDE_CHAT_PANEL_TITLE = "Side chat";
const PLUGIN_ID = "missing-keyboard-shortcuts";

const SHORTCUT_COMMAND_EVENT =
  "bb-plugin-missing-keyboard-shortcuts:run-command";

const SHORTCUT_COMMANDS = [
  {
    id: "navigate-back",
    title: "Navigate backward",
    defaultShortcut: { key: "[", mod: true },
    requiresThread: false,
  },
  {
    id: "navigate-forward",
    title: "Navigate forward",
    defaultShortcut: { key: "]", mod: true },
    requiresThread: false,
  },
  {
    id: "new-personal-thread",
    title: "Start a personal thread",
    defaultShortcut: { key: "n", mod: true },
    requiresThread: false,
  },
  {
    id: "new-project-thread",
    title: "Start a thread in the current project",
    defaultShortcut: { key: "n", mod: true, shift: true },
    requiresThread: false,
  },
  {
    id: "focus-primary-composer",
    title: "Focus the primary composer",
    defaultShortcut: { key: "l", mod: true },
    requiresThread: true,
  },
  {
    id: "toggle-side-chat",
    title: "Toggle the active side chat",
    defaultShortcut: { key: "l", mod: true, shift: true },
    requiresThread: true,
  },
  {
    id: "toggle-terminal",
    title: "Toggle the active terminal",
    defaultShortcut: { control: true, key: "`" },
    requiresThread: true,
  },
] as const;

type ShortcutCommandId = (typeof SHORTCUT_COMMANDS)[number]["id"];

interface ShortcutCommandDetail {
  context: PluginCommandContext;
  id: ShortcutCommandId;
}

function runShortcutCommand(
  id: ShortcutCommandId,
  context: PluginCommandContext,
): void {
  window.dispatchEvent(
    new CustomEvent<ShortcutCommandDetail>(SHORTCUT_COMMAND_EVENT, {
      detail: { context, id },
    }),
  );
}

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function ComposerNavigationBridge() {
  const context = useBbContext();
  const composer = useComposer();
  const view = useComposerView();
  const markerRef = useRef<HTMLSpanElement>(null);
  const composerThreadId =
    view.scope.kind === "thread" ? view.scope.threadId : null;
  useEffect(() => {
    rememberThreadProject(window.localStorage, context);
  }, [context.projectId, context.threadId]);
  useLayoutEffect(() => {
    const marker = markerRef.current;
    const composerElement = marker?.closest<HTMLElement>(
      "[data-app-composer-role]",
    );
    const role = composerElement?.getAttribute("data-app-composer-role");
    if (role === "primary") {
      if (view.scope.kind === "thread") {
        const panelRoot =
          composerElement?.closest<HTMLElement>("[data-panel-group]");
        return registerPrimaryComposerFocus(
          view.scope.threadId,
          composer.focus,
          panelRoot === null || panelRoot === undefined
            ? undefined
            : {
                createObserver(callback) {
                  const observer = new MutationObserver(callback);
                  return {
                    disconnect: () => observer.disconnect(),
                    observe: () =>
                      observer.observe(panelRoot, {
                        childList: true,
                        subtree: true,
                      }),
                  };
                },
                closePanel() {
                  const button = panelRoot.querySelector<HTMLButtonElement>(
                    'button[aria-label^="Hide right panel"]',
                  );
                  if (button === null) return false;
                  button.click();
                  return true;
                },
                root: {
                  panelTabButtons: () =>
                    Array.from(
                      panelRoot.querySelectorAll<HTMLButtonElement>(
                        '[data-testid="secondary-panel-tab-strip"] button:not([data-tab-pill-close])',
                      ),
                      (button) => ({
                        click: () => button.click(),
                        hasIcon: (icon: "SideChat" | "Terminal") =>
                          button.querySelector(`[data-icon="${icon}"]`) !==
                          null,
                      }),
                    ),
                },
              },
        );
      }
      if (view.scope.kind === "new-thread") {
        return registerPrimaryComposerFocus(null, composer.focus);
      }
      return;
    }
    if (
      role !== "secondary" ||
      context.threadId === null ||
      composerThreadId === null ||
      composerThreadId === context.threadId ||
      composerElement === null ||
      composerElement === undefined
    ) {
      return;
    }
    return registerSecondaryComposer(context.threadId, composerThreadId, {
      focus: composer.focus,
      observeReadiness(listener) {
        // The rich-text editor mounts after the shell and its plugin banners.
        const observer = new MutationObserver(listener);
        observer.observe(composerElement, { childList: true, subtree: true });
        return () => observer.disconnect();
      },
      isFocused: () => composerElement.contains(document.activeElement),
      isVisible: () => {
        const bounds = composerElement.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      },
    });
  }, [composer.focus, composerThreadId, context.threadId, view.scope.kind]);
  return createElement("span", { hidden: true, ref: markerRef });
}

type ShortcutsRpc = PluginRpcClient<typeof rpcContract>;

function openTerminal(
  rpc: ShortcutsRpc,
  threadId: string,
  preferredTerminalId: string | null,
): Promise<OpenTerminalResult> {
  return rpc.call("openTerminal", { preferredTerminalId, threadId });
}

function createSideChat(
  rpc: ShortcutsRpc,
  threadId: string,
): Promise<CreateSideChatResult> {
  return rpc.call("createSideChat", { sourceThreadId: threadId });
}

async function createSideChatOverHttp(
  sourceThreadId: string,
): Promise<CreateSideChatResult> {
  const response = await fetch(
    `/api/v1/plugins/${PLUGIN_ID}/rpc/createSideChat`,
    {
      body: JSON.stringify({ sourceThreadId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    body === null ||
    typeof body !== "object" ||
    !("ok" in body) ||
    body.ok !== true ||
    !("result" in body) ||
    body.result === null ||
    typeof body.result !== "object" ||
    !("threadId" in body.result) ||
    typeof body.result.threadId !== "string"
  ) {
    throw new Error(`createSideChat failed (HTTP ${response.status})`);
  }
  return { threadId: body.result.threadId };
}

function validateSideChat(
  rpc: ShortcutsRpc,
  parentThreadId: string,
  sideChat: { childThreadId: string; id: string },
): Promise<ValidateSideChatResult> {
  return rpc.call("validateSideChat", {
    childThreadId: sideChat.childThreadId,
    parentThreadId,
    tabId: sideChat.id,
  });
}

function sideChatPanelParams(
  sourceThreadId: string,
  threadId: string,
): SideChatPanelParams {
  return {
    sourceMessageText: "",
    sourceSeqEnd: null,
    sourceThreadId,
    threadId,
  };
}

function parseSideChatPanelParams(value: unknown): SideChatPanelParams | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.threadId !== "string" ||
    candidate.threadId.length === 0 ||
    typeof candidate.sourceThreadId !== "string" ||
    candidate.sourceThreadId.length === 0
  ) {
    return null;
  }
  return {
    sourceMessageText:
      typeof candidate.sourceMessageText === "string"
        ? candidate.sourceMessageText
        : "",
    sourceSeqEnd:
      typeof candidate.sourceSeqEnd === "number"
        ? candidate.sourceSeqEnd
        : null,
    sourceThreadId: candidate.sourceThreadId,
    threadId: candidate.threadId,
  };
}

function openSideChatPanel(
  context: Pick<PluginCommandContext, "openPanel">,
  sourceThreadId: string,
  threadId: string,
): boolean {
  return context.openPanel({
    actionId: SIDE_CHAT_PANEL_ACTION_ID,
    params: sideChatPanelParams(sourceThreadId, threadId),
    title: SIDE_CHAT_PANEL_TITLE,
  });
}

function SideChatPanel({ params }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const parsed = parseSideChatPanelParams(params);
  const sendToMain = useCallback(
    async (message: { text: string }) => {
      if (parsed === null) return;
      try {
        await rpc.call("sendToMain", {
          senderThreadId: parsed.threadId,
          sourceThreadId: parsed.sourceThreadId,
          text: message.text,
        });
        toast.success("Sent to main thread");
      } catch (error) {
        toast.error(rpcErrorMessage(error, "Failed to send to main thread"));
      }
    },
    [parsed, rpc],
  );

  if (parsed === null) {
    return createElement(
      "div",
      { className: "p-3 text-sm text-muted-foreground", role: "alert" },
      "This side chat tab is missing its thread reference.",
    );
  }

  const messageActions: readonly ThreadChatMessageAction[] = [
    {
      icon: "ArrowTurnBackward",
      id: "send-to-main",
      roles: ["assistant"],
      run: sendToMain,
      title: "Send to main thread",
    },
  ];
  return createElement(
    "div",
    { className: "flex h-full min-h-0 flex-col" },
    createElement(ThreadChat, {
      className: "min-h-0 flex-1",
      layout: "contained",
      messageActions,
      permissionPolicy: "editable",
      threadId: parsed.threadId,
      variant: "compact",
    }),
  );
}

function notifyPanelStateChanged(change: PanelStorageChange): void {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: change.key,
      newValue: change.newValue,
      oldValue: change.oldValue,
      storageArea: window.localStorage,
      url: window.location.href,
    }),
  );
}

function activateAndFocusTerminal(
  signal: AbortSignal,
  threadId: string,
  terminalId: string,
  isCurrentThread: (threadId: string) => boolean,
): () => void {
  if (!isCurrentThread(threadId)) return () => {};
  const panel = readTerminalPanelSnapshot(window.localStorage, threadId);
  if (!panel.isOpen || panel.activeTerminalId !== terminalId) {
    notifyPanelStateChanged(
      activateTerminalPanel(window.localStorage, threadId, terminalId),
    );
    return selectPrimaryPanelTabWhenReady(threadId, {
      icon: "Terminal",
      index: () =>
        readTerminalPanelSnapshot(
          window.localStorage,
          threadId,
        ).terminalIds.indexOf(terminalId),
      isCurrent: () => isCurrentThread(threadId),
      signal,
    });
  }

  focusVisibleTerminal(document);
  return () => {};
}

function focusSideChatComposer(
  signal: AbortSignal,
  parentThreadId: string,
  childThreadId: string,
  isCurrentThread: (threadId: string) => boolean,
): () => void {
  if (!isCurrentThread(parentThreadId)) {
    return () => {};
  }
  const stopSelectingTab = selectPrimaryPanelTabWhenReady(parentThreadId, {
    icon: "SideChat",
    index: () =>
      readSideChatPanelSnapshot(
        window.localStorage,
        parentThreadId,
      ).sideChats.findIndex(
        ({ childThreadId: candidate }) => candidate === childThreadId,
      ),
    isCurrent: () => isCurrentThread(parentThreadId),
    signal,
  });
  const stopFocusingComposer = focusSecondaryComposerWhenReady(
    parentThreadId,
    childThreadId,
    {
      isCurrent: () => {
        if (!isCurrentThread(parentThreadId)) {
          return false;
        }
        const currentPanel = readSideChatPanelSnapshot(
          window.localStorage,
          parentThreadId,
        );
        return (
          currentPanel.isOpen &&
          currentPanel.activeSideChat?.childThreadId === childThreadId
        );
      },
      signal,
    },
  );
  return () => {
    stopSelectingTab();
    stopFocusingComposer();
  };
}

function MissingKeyboardShortcuts() {
  const rpc = useRpc<typeof rpcContract>();
  const contextRef = useRef<
    Pick<PluginCommandContext, "projectId" | "threadId">
  >({ projectId: null, threadId: null });
  const sidebarActions = experimental_useSidebarThreadActions();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const sideChatInFlightThreads = new Set<string>();
    const terminalInFlightThreads = new Set<string>();
    const pendingSideChatActions = new Map<string, () => void>();
    const pendingTerminalActions = new Map<string, () => void>();
    const stopPendingAction = (
      actions: Map<string, () => void>,
      threadId: string,
    ) => {
      actions.get(threadId)?.();
      actions.delete(threadId);
    };
    signal.addEventListener(
      "abort",
      () => {
        for (const stop of pendingSideChatActions.values()) stop();
        pendingSideChatActions.clear();
        for (const stop of pendingTerminalActions.values()) stop();
        pendingTerminalActions.clear();
      },
      { once: true },
    );
    const isCurrentThread = (threadId: string) =>
      contextRef.current.threadId === threadId;
    const focusExistingSideChat = (
      parentThreadId: string,
      childThreadId: string,
    ) => {
      if (!isCurrentThread(parentThreadId)) return;
      stopPendingAction(pendingSideChatActions, parentThreadId);
      pendingSideChatActions.set(
        parentThreadId,
        focusSideChatComposer(
          signal,
          parentThreadId,
          childThreadId,
          isCurrentThread,
        ),
      );
    };
    const createAndFocusSideChat = async (
      commandContext: PluginCommandContext,
    ) => {
      const parentThreadId = commandContext.threadId;
      if (parentThreadId === null) return;
      const { threadId: childThreadId } = await createSideChat(
        rpc,
        parentThreadId,
      );
      if (!isCurrentThread(parentThreadId)) return;
      if (!openSideChatPanel(commandContext, parentThreadId, childThreadId)) {
        return;
      }
      stopPendingAction(pendingSideChatActions, parentThreadId);
      pendingSideChatActions.set(
        parentThreadId,
        focusSideChatComposer(
          signal,
          parentThreadId,
          childThreadId,
          isCurrentThread,
        ),
      );
    };

    window.addEventListener(
      "focusin",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const threadId = contextRef.current.threadId;
        if (threadId === null) return;
        if (isWithinTerminal(event.target)) {
          const { activeTerminalId } = readTerminalPanelSnapshot(
            window.localStorage,
            threadId,
          );
          if (activeTerminalId !== null) {
            rememberRecentTerminalId(
              window.localStorage,
              threadId,
              activeTerminalId,
            );
          }
          return;
        }
        if (
          event.target.closest('[data-app-composer-role="secondary"]') === null
        ) {
          return;
        }
        const focusedChildThreadId = focusedSecondaryComposerThreadId(threadId);
        if (focusedChildThreadId === null) return;
        const focusedSideChat = readSideChatPanelSnapshot(
          window.localStorage,
          threadId,
        ).sideChats.find(
          ({ childThreadId }) => childThreadId === focusedChildThreadId,
        );
        if (focusedSideChat !== undefined) {
          rememberRecentSideChatTabId(
            window.localStorage,
            threadId,
            focusedSideChat.id,
          );
        }
      },
      { capture: true, signal },
    );

    window.addEventListener(
      SHORTCUT_COMMAND_EVENT,
      (event) => {
        const { context: commandContext, id } = (
          event as CustomEvent<ShortcutCommandDetail>
        ).detail;
        contextRef.current = {
          projectId: commandContext.projectId,
          threadId: commandContext.threadId,
        };

        if (id === "new-personal-thread") {
          sidebarActions.openNewThread({
            focusPrompt: true,
            projectId: PERSONAL_PROJECT_ID,
          });
          return;
        }

        if (id === "new-project-thread") {
          sidebarActions.openNewThread({
            focusPrompt: true,
            projectId: projectThreadTarget(
              commandContext,
              readLastThreadProjectId(window.localStorage),
            ).projectId,
          });
          return;
        }

        if (id === "focus-primary-composer") {
          const { threadId } = commandContext;
          if (!hasPrimaryComposer(threadId)) return;
          focusPrimaryComposer(threadId);
          return;
        }

        if (id === "toggle-side-chat") {
          const { threadId } = commandContext;
          if (threadId === null) return;
          stopPendingAction(pendingSideChatActions, threadId);
          const panel = readSideChatPanelSnapshot(
            window.localStorage,
            threadId,
          );
          if (
            panel.isOpen &&
            panel.activeSideChat !== null &&
            (isSecondaryComposerFocused(
              threadId,
              panel.activeSideChat.childThreadId,
            ) || isSecondaryComposerDomFocused(document))
          ) {
            if (!closePrimaryPanel(threadId)) {
              notifyPanelStateChanged(
                closePanel(window.localStorage, threadId),
              );
            }
            focusPrimaryComposer(threadId);
            return;
          }

          const sideChat = selectSideChatPanelTab(
            panel,
            readRecentSideChatTabId(window.localStorage, threadId),
          );
          if (sideChatInFlightThreads.has(threadId)) return;

          sideChatInFlightThreads.add(threadId);
          void (async () => {
            if (sideChat === null) {
              await createAndFocusSideChat(commandContext);
              return;
            }
            const { reusable } = await validateSideChat(
              rpc,
              threadId,
              sideChat,
            );
            if (reusable) {
              rememberRecentSideChatTabId(
                window.localStorage,
                threadId,
                sideChat.id,
              );
              if (
                openSideChatPanel(
                  commandContext,
                  threadId,
                  sideChat.childThreadId,
                )
              ) {
                focusExistingSideChat(threadId, sideChat.childThreadId);
              }
              return;
            }
            const change = removeSideChatPanelTab(
              window.localStorage,
              threadId,
              sideChat.id,
            );
            if (change !== null) notifyPanelStateChanged(change);
            await createAndFocusSideChat(commandContext);
          })()
            .catch((error: unknown) => {
              toast.error(rpcErrorMessage(error, "Failed to start side chat"));
            })
            .finally(() => {
              sideChatInFlightThreads.delete(threadId);
            });
          return;
        }

        if (id === "toggle-terminal") {
          const { threadId } = commandContext;
          if (threadId === null) return;
          stopPendingAction(pendingTerminalActions, threadId);
          const panel = readTerminalPanelSnapshot(
            window.localStorage,
            threadId,
          );
          if (shouldCloseTerminalPanel(panel, isTerminalFocused(document))) {
            if (!closePrimaryPanel(threadId)) {
              notifyPanelStateChanged(
                closePanel(window.localStorage, threadId),
              );
            }
            focusPrimaryComposer(threadId);
            return;
          }
          if (terminalInFlightThreads.has(threadId)) return;

          const rememberedTerminalId = readRecentTerminalId(
            window.localStorage,
            threadId,
          );
          const preferredTerminalId =
            panel.activeTerminalId ??
            (rememberedTerminalId !== null &&
            panel.terminalIds.includes(rememberedTerminalId)
              ? rememberedTerminalId
              : null);
          terminalInFlightThreads.add(threadId);
          void openTerminal(rpc, threadId, preferredTerminalId)
            .then(({ terminalId }) => {
              rememberRecentTerminalId(
                window.localStorage,
                threadId,
                terminalId,
              );
              pendingTerminalActions.set(
                threadId,
                activateAndFocusTerminal(
                  signal,
                  threadId,
                  terminalId,
                  isCurrentThread,
                ),
              );
            })
            .catch((error: unknown) => {
              toast.error(rpcErrorMessage(error, "Failed to open terminal"));
            })
            .finally(() => {
              terminalInFlightThreads.delete(threadId);
            });
          return;
        }

        window.history.go(id === "navigate-back" ? -1 : 1);
      },
      { signal },
    );
    setReady(true);
    return () => controller.abort();
  }, [rpc, sidebarActions]);
  return createElement("span", {
    "data-missing-keyboard-shortcuts-ready": ready ? "" : undefined,
    hidden: true,
  });
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    component: SideChatPanel,
    icon: "SideChat",
    id: SIDE_CHAT_PANEL_ACTION_ID,
    layout: "flush",
    async run({ openPanel, threadId }) {
      try {
        const { threadId: childThreadId } =
          await createSideChatOverHttp(threadId);
        openPanel({
          params: sideChatPanelParams(threadId, childThreadId),
          title: SIDE_CHAT_PANEL_TITLE,
        });
      } catch (error) {
        toast.error(rpcErrorMessage(error, "Failed to start side chat"));
      }
    },
    title: "Start shortcut side chat",
  });

  for (const command of SHORTCUT_COMMANDS) {
    app.commands.register({
      defaultShortcut: command.defaultShortcut,
      id: command.id,
      isAvailable: ({ threadId }) =>
        !command.requiresThread || threadId !== null,
      run: (context) => runShortcutCommand(command.id, context),
      title: command.title,
    });
  }

  app.composer.customize({
    id: "navigation-bridge",
    banners: [
      {
        id: "navigation-bridge",
        chrome: "bare",
        component: ComposerNavigationBridge,
      },
    ],
  });

  app.slots.experimental_appOverlay({
    id: "missing-keyboard-shortcuts",
    component: MissingKeyboardShortcuts,
  });
});
