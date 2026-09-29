import type { BbPluginApi } from "@get-bb/plugin-sdk";
import ribbonServer from "./ribbon/server.js";
import {
  migratePreferences,
  preferenceCliCommands,
  registerPreferences,
} from "./server.js";

/**
 * The plugin's server entry: bb's thread-list preferences (server.ts, from
 * upstream) and Ribbon's stages, order, actions, and icons (ribbon/server.ts).
 * A plugin registers one CLI, so the layout preference commands ride on the
 * `bb sidebar` CLI under `prefs`.
 */
export default async function plugin(bb: BbPluginApi) {
  const preferences = registerPreferences(bb);
  await ribbonServer(bb, {
    extraCommands: preferenceCliCommands(preferences),
  });
  await migratePreferences(bb);
}
