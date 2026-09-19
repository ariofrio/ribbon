import {
  definePluginApp,
  useRpc,
  useSettings,
  useBbNavigate,
  type BbNavigate,
  type PluginCommandContext,
} from "@get-bb/plugin-sdk/app";
import { useEffect } from "react";
import type { rpcContract } from "./server";
import { toast } from "sonner";
import {
  enabledWorkflowStages,
  WORKFLOW_STAGES,
  type WorkflowStage,
} from "./workflow-stage";
import type { ReorderIntent } from "./workflow-shortcuts";

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

type WorkflowCommandAction =
  | { kind: "stage"; stage: WorkflowStage }
  | ({ kind: "reorder" } & ReorderIntent);

const WORKFLOW_COMMAND_EVENT = "bb-plugin-thread-stages:run-command";

const WORKFLOW_COMMANDS = [
  {
    action: { kind: "stage", stage: "Completed" },
    defaultShortcut: { key: ".", mod: true },
    id: "complete-thread",
    title: "File thread as Completed",
  },
  {
    action: { kind: "stage", stage: "Completed" },
    defaultShortcut: { alt: true, key: ".", mod: true },
    id: "complete-thread-alternate",
    title: "File thread as Completed (alternate shortcut)",
  },
  {
    action: { kind: "stage", stage: "Idle" },
    defaultShortcut: { key: ".", mod: true, shift: true },
    id: "idle-thread",
    title: "Return thread to Idle",
  },
  {
    action: { kind: "stage", stage: "Blocked" },
    defaultShortcut: { control: true, key: ".", mod: true, shift: true },
    id: "block-thread",
    title: "File thread as Blocked",
  },
  {
    action: { kind: "stage", stage: "Deferred" },
    defaultShortcut: { control: true, key: ".", mod: true },
    id: "defer-thread",
    title: "File thread as Deferred",
  },
  {
    action: { direction: -1, kind: "reorder", scope: "step" },
    defaultShortcut: { alt: true, key: "ArrowUp", mod: true },
    id: "move-up",
    title: "Move thread up",
  },
  {
    action: { direction: 1, kind: "reorder", scope: "step" },
    defaultShortcut: { alt: true, key: "ArrowDown", mod: true },
    id: "move-down",
    title: "Move thread down",
  },
  {
    action: { direction: -1, kind: "reorder", scope: "edge" },
    defaultShortcut: { alt: true, key: "ArrowUp", mod: true, shift: true },
    id: "move-to-start",
    title: "Move thread to the start of its stage",
  },
  {
    action: { direction: 1, kind: "reorder", scope: "edge" },
    defaultShortcut: { alt: true, key: "ArrowDown", mod: true, shift: true },
    id: "move-to-end",
    title: "Move thread to the end of its stage",
  },
  {
    action: { direction: -1, kind: "reorder", scope: "stage" },
    defaultShortcut: { control: true, key: "ArrowUp", mod: true },
    id: "move-to-previous-stage",
    title: "Move thread to the previous stage",
  },
  {
    action: { direction: 1, kind: "reorder", scope: "stage" },
    defaultShortcut: { control: true, key: "ArrowDown", mod: true },
    id: "move-to-next-stage",
    title: "Move thread to the next stage",
  },
] as const satisfies readonly {
  action: WorkflowCommandAction;
  defaultShortcut: {
    alt?: boolean;
    control?: boolean;
    key: string;
    mod: boolean;
    shift?: boolean;
  };
  id: string;
  title: string;
}[];

interface WorkflowCommandDetail {
  action: WorkflowCommandAction;
  context: PluginCommandContext;
}

let availableWorkflowStages: readonly WorkflowStage[] = WORKFLOW_STAGES;

function runWorkflowCommand(
  action: WorkflowCommandAction,
  context: PluginCommandContext,
): void {
  window.dispatchEvent(
    new CustomEvent<WorkflowCommandDetail>(WORKFLOW_COMMAND_EVENT, {
      detail: { action, context },
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

function goTo(
  destination: ChordDestination,
  navigate: BbNavigate,
): void {
  if (destination.kind === "stay") return;
  if (destination.kind === "compose") {
    navigate.toCompose({ focusPrompt: true });
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
  availableWorkflowStages = enabledWorkflowStages(settings.values);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    window.addEventListener(
      WORKFLOW_COMMAND_EVENT,
      (event) => {
        const { action, context } = (
          event as CustomEvent<WorkflowCommandDetail>
        ).detail;
        const { threadId } = context;
        if (threadId === null) return;

        const request =
          action.kind === "stage"
            ? rpc
                .call("setWorkflowStage", {
                  workflowStage: action.stage,
                  threadId,
                  scope: activeRibbonScope(),
                })
                .then(({ destination }) => {
                  goTo(destination, navigate);
                })
            : rpc.call("reorderThread", {
                threadId,
                scope: action.scope,
                direction: action.direction,
              });
        void request.catch((error: unknown) => {
          toast.error(rpcErrorMessage(error, "Failed to move the thread"));
        });
      },
      { signal },
    );
    return () => controller.abort();
  }, [rpc, navigate]);
  return null;
}

export default definePluginApp((app) => {
  const isMac = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
  for (const command of WORKFLOW_COMMANDS) {
    app.commands.register({
      // Control and Mod are the same key outside macOS. Keep the existing
      // Completed alternate on Ctrl+Alt+. and use the neighboring comma key.
      defaultShortcut:
        !isMac && (command.id === "defer-thread" || command.id === "block-thread")
          ? { key: ",", mod: true, alt: true, shift: command.id === "block-thread" }
          : command.defaultShortcut,
      id: command.id,
      isAvailable: ({ threadId }) =>
        threadId !== null &&
        (command.action.kind !== "stage" ||
          availableWorkflowStages.includes(command.action.stage)),
      run: (context) => runWorkflowCommand(command.action, context),
      title: command.title,
    });
  }

  app.slots.experimental_appOverlay({
    id: "workflow-shortcuts",
    component: WorkflowShortcuts,
  });
});
