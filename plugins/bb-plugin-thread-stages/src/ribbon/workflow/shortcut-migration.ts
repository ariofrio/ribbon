import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { WORKFLOW_COMMANDS } from "./command-definitions";

type Overrides = Awaited<
  ReturnType<BbPluginApi["sdk"]["system"]["updateKeyboardSettings"]>
>;

/**
 * The stage commands were Ribbon sidebar's, and before that the retired
 * Thread stages sidebar's, which used this plugin's id. Ribbon's own upgrade
 * cleared the retired bindings with explicit null overrides under this id,
 * so a binding the user set in Ribbon has to be copied here, and a null left
 * behind for a command Ribbon never rebound has to go so the default applies.
 */
export function migrateShortcutOverrides(
  overrides: Overrides,
  pluginId: string,
): Overrides {
  const next = [...overrides];
  for (const definition of WORKFLOW_COMMANDS) {
    const command = `plugin:${pluginId}/${definition.id}` as const;
    const ribbon = overrides.find(
      (override) =>
        override.command === `plugin:ribbon-sidebar/${definition.id}`,
    );
    const index = next.findIndex((override) => override.command === command);
    if (ribbon) {
      const override = { command, shortcut: ribbon.shortcut };
      if (index === -1) next.push(override);
      else next[index] = override;
    } else if (index !== -1 && next[index]?.shortcut === null) {
      next.splice(index, 1);
    }
  }
  return next;
}

export async function migrateWorkflowShortcuts(
  bb: BbPluginApi,
  database: ReturnType<BbPluginApi["storage"]["database"]>,
) {
  if (
    database
      .prepare("SELECT key FROM ribbon_upgrade WHERE key = 'stage-shortcuts-v2'")
      .get()
  )
    return;
  const current = (await bb.sdk.system.config()).keybindingOverrides;
  const next = migrateShortcutOverrides(current, bb.pluginId);
  if (JSON.stringify(next) !== JSON.stringify(current))
    await bb.sdk.system.updateKeyboardSettings(next);
  database
    .prepare(
      "INSERT OR IGNORE INTO ribbon_upgrade(key) VALUES ('stage-shortcuts-v2')",
    )
    .run();
}
