import {
  definePluginApp,
  useRpc,
  useSettings,
  useBbNavigate,
  type BbNavigate,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useRef } from "react";
import type { rpcContract } from "./server";
import { toast } from "sonner";
import { createNativeCommandDelegate } from "./native-command-delegation";
import { notifyNativeShortcutHandled } from "./native-command-hints";
import { enabledWorkflowStages } from "./workflow-stage";
import {
  currentThreadId,
  workflowReorderShortcut,
  workflowStageShortcut,
} from "./workflow-shortcuts";

type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string; projectId: string | null }
  | { kind: "compose" };

const GROUPING_KEY =
  /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;

interface RibbonScope {
  groupingKey: string;
  groupId: string;
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

function goTo(
  destination: ChordDestination,
  navigate: BbNavigate,
  openComposer: () => void,
): void {
  if (destination.kind === "stay") return;
  if (destination.kind === "compose") {
    openComposer();
    return;
  }
  navigate.toThread(destination.threadId);
}

function activeRibbonScope(): RibbonScope | null {
  const sidebar = document.querySelector<HTMLElement>(
    "[data-ribbon-sidebar-root]",
  );
  const groupingKey = sidebar?.dataset.ribbonSidebarScopeGroupingKey;
  const groupId = sidebar?.dataset.ribbonSidebarScopeGroupId;
  return groupingKey !== undefined &&
    GROUPING_KEY.test(groupingKey) &&
    groupId !== undefined &&
    groupId.length > 0
    ? { groupingKey, groupId }
    : null;
}

function WorkflowShortcuts() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const settings = useSettings();
  const shortcutStages = useRef(enabledWorkflowStages(settings.values));
  shortcutStages.current = enabledWorkflowStages(settings.values);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const createKeyboardEvent = (type: string, init: KeyboardEventInit) =>
      new KeyboardEvent(type, init);
    const newThreadCommand = createNativeCommandDelegate({
      command: "thread.new",
      createEvent: createKeyboardEvent,
      fetchConfig: () => rpc.call("listAppKeybindings", null),
      isMac: /Mac|iPhone|iPad|iPod/u.test(navigator.platform),
      target: window,
    });
    void newThreadCommand.prefetch();

    window.addEventListener(
      "keydown",
      (event) => {
        if (newThreadCommand.isDelegatedEvent(event)) return;
        const workflowStage = workflowStageShortcut(
          event,
          shortcutStages.current,
        );
        const reorder = workflowReorderShortcut(event);
        if (workflowStage === null && reorder === null) return;
        const threadId = currentThreadId(window.location.pathname);
        if (threadId === null) return;

        event.preventDefault();
        event.stopPropagation();
        notifyNativeShortcutHandled(window, createKeyboardEvent);
        const request =
          workflowStage !== null
            ? rpc
                .call("setWorkflowStage", {
                  workflowStage,
                  threadId,
                  scope: activeRibbonScope(),
                })
                .then(({ destination }) => {
                  goTo(
                    destination,
                    navigate,
                    () => void newThreadCommand.dispatch(),
                  );
                })
            : reorder !== null
              ? rpc.call("reorderThread", {
                  threadId,
                  scope: reorder.scope,
                  direction: reorder.direction,
                })
              : Promise.resolve();
        void request.catch((error: unknown) => {
          toast.error(rpcErrorMessage(error, "Failed to move the thread"));
        });
      },
      { capture: true, signal },
    );
    return () => controller.abort();
  }, [rpc, navigate]);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "workflow-shortcuts",
    component: WorkflowShortcuts,
  });
});
