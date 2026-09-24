import {
  WORKFLOW_COMMANDS,
  workflowShortcut,
  type WorkflowCommandAction,
} from "./command-definitions";
import {
  definePluginApp,
  useBbNavigate,
  useRpc,
  useSettings,
  type BbNavigate,
  type PluginCommandContext,
} from "@get-bb/plugin-sdk/app";
import { useEffect } from "react";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import {
  enabledWorkflowStages,
  WORKFLOW_STAGES,
  type WorkflowStage,
} from "./workflow-stage";

type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string; projectId: string | null }
  | { kind: "compose" };

const WORKFLOW_COMMAND_EVENT = "bb-plugin-ribbon-sidebar:run-command";
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

function goTo(destination: ChordDestination, navigate: BbNavigate): void {
  if (destination.kind === "stay") return;
  if (destination.kind === "compose") {
    navigate.toCompose({ focusPrompt: true });
    return;
  }
  navigate.toThread(destination.threadId);
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

export function registerWorkflowCommands(
  app: Parameters<Parameters<typeof definePluginApp>[0]>[0],
) {
  const isMac = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
  for (const command of WORKFLOW_COMMANDS) {
    app.commands.register({
      defaultShortcut: workflowShortcut(command, isMac),
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
}
