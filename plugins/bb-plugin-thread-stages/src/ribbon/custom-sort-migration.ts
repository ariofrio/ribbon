import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { createPreferenceStore } from "../server.js";

export async function migrateCustomSort(
  bb: BbPluginApi,
  preferences: ReturnType<typeof createPreferenceStore>,
) {
  const key = "migration:custom-sort:v1";
  if (await bb.storage.kv.get<boolean>(key) === true) return;
  // Earlier versions always drew the saved order, whatever the sort preference.
  await preferences.write("chronologicalSort", "none");
  await bb.storage.kv.set(key, true);
}
