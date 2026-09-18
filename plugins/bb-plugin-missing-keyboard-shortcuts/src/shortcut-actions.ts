import { PERSONAL_PROJECT_ID } from "./last-thread-project";

export interface ShortcutKeyEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
}

export interface NewThreadTarget {
  projectId: string;
}

export interface ShortcutContext {
  projectId: string | null;
  threadId: string | null;
}

export type ComposerShortcutTarget = "primary" | "secondary";

function exactCommandChord(event: ShortcutKeyEvent): boolean {
  return (
    event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.repeat
  );
}

export function historyDirection(event: ShortcutKeyEvent): -1 | 1 | null {
  if (!exactCommandChord(event) || event.shiftKey) {
    return null;
  }

  if (event.key === "[") return -1;
  if (event.key === "]") return 1;
  return null;
}

export function isTerminalShortcut(event: ShortcutKeyEvent): boolean {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.repeat &&
    event.key === "`"
  );
}

export function composerShortcutTarget(
  event: ShortcutKeyEvent,
): ComposerShortcutTarget | null {
  if (!exactCommandChord(event) || event.key.toLowerCase() !== "l") {
    return null;
  }
  return event.shiftKey ? "secondary" : "primary";
}

export function newThreadTarget(
  event: ShortcutKeyEvent,
  context: ShortcutContext,
  lastThreadProjectId: string | null = null,
): NewThreadTarget | null {
  if (!exactCommandChord(event) || event.key.toLowerCase() !== "n") {
    return null;
  }

  if (!event.shiftKey) {
    return { projectId: PERSONAL_PROJECT_ID };
  }

  if (context.threadId === null) {
    return { projectId: lastThreadProjectId ?? PERSONAL_PROJECT_ID };
  }
  if (context.projectId === null) {
    return { projectId: PERSONAL_PROJECT_ID };
  }
  return { projectId: context.projectId };
}
