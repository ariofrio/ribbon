import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { createNativeCommandDelegate } from "./native-command-delegation";
import { notifyNativeShortcutHandled } from "./native-command-hints";
import {
  WORKFLOW_STAGES,
  enabledWorkflowStages,
  type WorkflowStage,
} from "./workflow-stage";
import {
  currentThreadId,
  workflowReorderShortcut,
  workflowStageShortcut,
} from "./workflow-shortcuts";

type RpcEnvelope<Result> =
  | { ok: true; result: Result }
  | { ok: false; error: unknown };

type ChordDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: string; projectId: string | null }
  | { kind: "compose" };

const PERSONAL_PROJECT_ID = "proj_personal";
const GROUPING_KEY = /^(?:builtin:(?:projects|sections)|plugin:[^:/]+:[^:/]+)$/u;

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

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
}

function goTo(destination: ChordDestination, openComposer: () => void): void {
  if (destination.kind === "stay") return;
  if (destination.kind === "compose") {
    openComposer();
    return;
  }
  const projectless =
    destination.projectId === null ||
    destination.projectId === PERSONAL_PROJECT_ID;
  navigate(
    projectless
      ? `/threads/${encodeURIComponent(destination.threadId)}`
      : `/projects/${encodeURIComponent(destination.projectId ?? "")}/threads/${encodeURIComponent(destination.threadId)}`,
  );
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

async function callRpc<Result>(
  pluginId: string,
  method: string,
  input: unknown,
): Promise<Result> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    },
  );
  const envelope = (await response.json()) as RpcEnvelope<Result>;
  if (!response.ok || !envelope.ok) {
    throw new Error(
      !envelope.ok
        ? rpcErrorMessage(envelope.error, `Failed to call ${method}`)
        : `${method} request failed (${response.status})`,
    );
  }
  return envelope.result;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "workflow-shortcuts",
    mount({ pluginId, signal }) {
      let shortcutStages: readonly WorkflowStage[] = WORKFLOW_STAGES;
      const refreshShortcutStages = async () => {
        try {
          const response = await fetch(
            `/api/v1/plugins/${encodeURIComponent(pluginId)}/settings`,
            { credentials: "same-origin", signal },
          );
          if (!response.ok) return;
          const body = (await response.json()) as {
            values?: Record<string, string | boolean>;
          };
          shortcutStages = enabledWorkflowStages(body.values);
        } catch {
          // Retain the last known settings while bb reconnects.
        }
      };
      void refreshShortcutStages();
      window.addEventListener("focus", () => void refreshShortcutStages(), {
        signal,
      });

      const createKeyboardEvent = (type: string, init: KeyboardEventInit) =>
        new KeyboardEvent(type, init);
      const newThreadCommand = createNativeCommandDelegate({
        command: "thread.new",
        createEvent: createKeyboardEvent,
        fetchConfig: () => callRpc(pluginId, "listAppKeybindings", null),
        isMac: /Mac|iPhone|iPad|iPod/u.test(navigator.platform),
        target: window,
      });
      void newThreadCommand.prefetch();

      window.addEventListener(
        "keydown",
        (event) => {
          if (newThreadCommand.isDelegatedEvent(event)) return;
          const workflowStage = workflowStageShortcut(event, shortcutStages);
          const reorder = workflowReorderShortcut(event);
          if (workflowStage === null && reorder === null) return;
          const threadId = currentThreadId(window.location.pathname);
          if (threadId === null) return;

          event.preventDefault();
          event.stopPropagation();
          notifyNativeShortcutHandled(window, createKeyboardEvent);
          const request =
            reorder === null
              ? callRpc<{ destination: ChordDestination }>(
                  pluginId,
                  "setWorkflowStage",
                  {
                    workflowStage,
                    threadId,
                    scope: activeRibbonScope(),
                  },
                ).then(({ destination }) => {
                  goTo(destination, () => void newThreadCommand.dispatch());
                })
              : callRpc(pluginId, "reorderThread", {
                  threadId,
                  scope: reorder.scope,
                  direction: reorder.direction,
                });
          void request.catch((error: unknown) => {
            toast.error(rpcErrorMessage(error, "Failed to move the thread"));
          });
        },
        { capture: true, signal },
      );
    },
  });
});
