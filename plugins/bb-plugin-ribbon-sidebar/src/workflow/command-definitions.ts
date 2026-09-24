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
