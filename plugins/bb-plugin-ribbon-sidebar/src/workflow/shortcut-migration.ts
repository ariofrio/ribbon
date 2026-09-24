import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { WORKFLOW_COMMANDS } from "./command-definitions";

type Overrides = Awaited<
  ReturnType<BbPluginApi["sdk"]["system"]["updateKeyboardSettings"]>
>;

export function migrateShortcutOverrides(
  overrides: Overrides,
  legacyInstalled: boolean,
): Overrides {
  const commandIds = new Set<string>(
    WORKFLOW_COMMANDS.map((command) => command.id),
  );
  const legacyId = (command: string) =>
    command.startsWith("plugin:thread-stages/")
      ? command.slice("plugin:thread-stages/".length)
      : null;
  const next = overrides.filter(
    (override) => !commandIds.has(legacyId(override.command) ?? ""),
  );
  if (legacyInstalled) {
    for (const definition of WORKFLOW_COMMANDS) {
      next.push({
        command: `plugin:thread-stages/${definition.id}`,
        shortcut: null,
      });
    }
  }
  for (const definition of WORKFLOW_COMMANDS) {
    const command = `plugin:ribbon-sidebar/${definition.id}` as const;
    if (next.some((override) => override.command === command)) continue;
    const legacy = overrides.find(
      (override) =>
        override.command === `plugin:thread-stages/${definition.id}`,
    );
    if (legacy) next.push({ command, shortcut: legacy.shortcut });
    // Move defaults as well as overrides while the older app is disabled above.
    else if (legacyInstalled)
      next.push({
        command,
        shortcut: {
          key: definition.defaultShortcut.key,
          mod: true,
          meta: false,
          control:
            "control" in definition.defaultShortcut &&
            definition.defaultShortcut.control,
          alt:
            "alt" in definition.defaultShortcut &&
            definition.defaultShortcut.alt,
          shift:
            "shift" in definition.defaultShortcut &&
            definition.defaultShortcut.shift,
        },
      });
  }
  return next;
}

export async function migrateWorkflowShortcuts(
  bb: BbPluginApi,
  database: ReturnType<BbPluginApi["storage"]["database"]>,
  legacyInstalled: boolean,
) {
  if (
    database
      .prepare("SELECT key FROM ribbon_upgrade WHERE key = 'stage-shortcuts'")
      .get()
  )
    return;
  const current = (await bb.sdk.system.config()).keybindingOverrides;
  const next = migrateShortcutOverrides(current, legacyInstalled);
  if (JSON.stringify(next) !== JSON.stringify(current))
    await bb.sdk.system.updateKeyboardSettings(next);
  database
    .prepare(
      "INSERT OR IGNORE INTO ribbon_upgrade(key) VALUES ('stage-shortcuts')",
    )
    .run();
}
