import {
  definePluginApp,
  experimental_usePluginId,
  useBbNavigate,
  useRpc,
  type BbNavigate,
  type PluginCommandContext,
} from "@get-bb/plugin-sdk/app";
import { useEffect } from "react";
import { toast } from "sonner";
import { preferencesMirrorStorageKey } from "../../app/preferences/preferences-sync.js";
import type { threadListRpcContract } from "../../server.js";
import type { rpcContract } from "../server";
import {
  WORKFLOW_COMMANDS,
  workflowShortcut,
  type WorkflowCommandAction,
} from "../workflow/command-definitions";

type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string; projectId: string | null }
  | { kind: "compose" };

const WORKFLOW_COMMAND_EVENT = "bb-plugin-thread-stages:run-command";
interface WorkflowCommandDetail {
  action: WorkflowCommandAction;
  context: PluginCommandContext;
}

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

/**
 * The grouping a shortcut reorders within: whichever the list is organized
 * by, read from the preference mirror bb's list keeps in this window.
 */
function shortcutGroupingKey(
  storage: Pick<Storage, "getItem">,
  pluginId: string,
): "builtin:sections" | "builtin:projects" {
  try {
    const raw = storage.getItem(preferencesMirrorStorageKey(pluginId));
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    const mode =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { organizationMode?: unknown }).organizationMode
        : undefined;
    return mode === "project" ? "builtin:projects" : "builtin:sections";
  } catch {
    return "builtin:sections";
  }
}

function WorkflowShortcuts() {
  const rpc = useRpc<typeof rpcContract>();
  const preferencesRpc = useRpc<typeof threadListRpcContract>();
  const navigate = useBbNavigate();
  const pluginId = experimental_usePluginId();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    window.addEventListener(
      WORKFLOW_COMMAND_EVENT,
      (event) => {
        const { action, context } = (event as CustomEvent<WorkflowCommandDetail>).detail;
        const { threadId } = context;
        if (threadId === null) return;
        const groupingKey = shortcutGroupingKey(window.localStorage, pluginId);
        const request =
          action.kind === "stage"
            ? rpc
                .call("setWorkflowStage", {
                  groupingKey,
                  workflowStage: action.stage,
                  threadId,
                })
                .then(({ destination }) => {
                  goTo(destination, navigate);
                })
            : rpc.call("reorderThread", {
                groupingKey,
                threadId,
                scope: action.scope,
                direction: action.direction,
              }).then(async () => {
                if (action.scope !== "stage") {
                  await preferencesRpc.call("setPreference", {
                    key: "chronologicalSort",
                    value: "none",
                  });
                }
              });
        void request.catch((error: unknown) => {
          toast.error(rpcErrorMessage(error, "Failed to move the thread"));
        });
      },
      { signal },
    );
    return () => controller.abort();
  }, [navigate, pluginId, preferencesRpc, rpc]);
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
      isAvailable: ({ threadId }) => threadId !== null,
      run: (context) => runWorkflowCommand(command.action, context),
      title: command.title,
    });
  }

  app.slots.experimental_appOverlay({
    id: "workflow-shortcuts",
    component: WorkflowShortcuts,
  });
}
