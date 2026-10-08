import type { WorkflowStage } from "./workflow-stage";
import type { ReorderIntent } from "./workflow-shortcuts";
export type WorkflowCommandAction =
  | { kind: "stage"; stage: WorkflowStage }
  | ({ kind: "reorder" } & ReorderIntent);

export const WORKFLOW_COMMANDS = [
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
  // Command IDs outlive stage names: saved bindings refer to them.
  {
    action: { kind: "stage", stage: "Active" },
    defaultShortcut: { key: ".", mod: true, shift: true },
    id: "idle-thread",
    title: "Return thread to Active",
  },
  {
    action: { kind: "stage", stage: "Waiting" },
    defaultShortcut: { key: ",", mod: true, shift: true },
    id: "wait-thread",
    title: "File thread as Waiting",
  },
  {
    action: { kind: "stage", stage: "BlockedOnOtherAgent" },
    defaultShortcut: { alt: true, control: true, key: ".", mod: true },
    id: "block-thread-on-agent",
    title: "File thread as Blocked on another thread",
  },
  {
    action: { kind: "stage", stage: "BlockedOnThirdParty" },
    defaultShortcut: { control: true, key: ".", mod: true, shift: true },
    id: "block-thread",
    title: "File thread as Blocked on external party",
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
    title: "Move thread to the start of its list",
  },
  {
    action: { direction: 1, kind: "reorder", scope: "edge" },
    defaultShortcut: { alt: true, key: "ArrowDown", mod: true, shift: true },
    id: "move-to-end",
    title: "Move thread to the end of its list",
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

// Control and Mod are the same key outside macOS; comma avoids the Completed chords.
export function workflowShortcut(
  command: (typeof WORKFLOW_COMMANDS)[number],
  isMac: boolean,
) {
  if (isMac) return command.defaultShortcut;
  if (command.id === "defer-thread" || command.id === "block-thread") {
    return { key: ",", mod: true, alt: true, shift: command.id === "block-thread" };
  }
  if (command.id === "block-thread-on-agent") {
    return { key: ".", mod: true, alt: true, shift: true };
  }
  return command.defaultShortcut;
}
