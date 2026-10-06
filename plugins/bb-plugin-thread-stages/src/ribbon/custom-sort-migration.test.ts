import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createPreferenceStore } from "../server.js";
import { migrateCustomSort } from "./custom-sort-migration.js";

describe("Custom sort migration", () => {
  it.each([undefined, "updated", "alpha"])(
    "preserves the existing manual display when the old preference is %s",
    async (previous) => {
      const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
      try {
        const store = createPreferenceStore(bb);
        if (previous !== undefined) await store.write("chronologicalSort", previous);
        await migrateCustomSort(bb, store);
        expect(await store.read("chronologicalSort")).toBe("none");
        await store.write("chronologicalSort", "alpha");
        await migrateCustomSort(bb, store);
        expect(await store.read("chronologicalSort")).toBe("alpha");
      } finally {
        await harness.lifecycle.dispose();
      }
    },
  );
});
