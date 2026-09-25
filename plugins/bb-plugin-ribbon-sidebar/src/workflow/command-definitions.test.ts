import { expect, it } from "vitest";
import { WORKFLOW_COMMANDS, workflowShortcut } from "./command-definitions";

it.each(["MacIntel", "Linux x86_64", "Win32"])(
  "keeps stage defaults distinct on %s",
  (platform) => {
    const isMac = platform === "MacIntel";
    const shortcuts = WORKFLOW_COMMANDS.map((command) => {
      const shortcut: {
        key: string;
        mod?: boolean;
        meta?: boolean;
        control?: boolean;
        alt?: boolean;
        shift?: boolean;
      } = workflowShortcut(command, isMac);
      return [
        shortcut.key,
        Boolean(shortcut.meta || (shortcut.mod && isMac)),
        Boolean(shortcut.control || (shortcut.mod && !isMac)),
        Boolean(shortcut.alt),
        Boolean(shortcut.shift),
      ].join(":");
    });
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  },
);
