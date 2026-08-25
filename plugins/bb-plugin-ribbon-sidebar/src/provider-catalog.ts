import type BetterSqlite3 from "better-sqlite3";
import {
  groupingCatalogSchema,
  type GroupingCatalogV1,
} from "./contracts";
import type {
  GroupingDescriptor,
  GroupingKey,
} from "./placement-store";

export type ProviderCatalogCall = (
  providerPluginId: string,
  signal: AbortSignal,
) => Promise<unknown>;

export interface ProviderGroupingDescriptor extends GroupingDescriptor {
  providerPluginId: string;
  groupingId: string;
  available: boolean;
}

interface ProviderState {
  catalog: GroupingCatalogV1;
  available: boolean;
}

export interface ProviderCatalog {
  refresh(providerPluginIds: readonly string[]): Promise<void>;
  invalidate(providerPluginId: string): void;
  availableGroupings(): ProviderGroupingDescriptor[];
  allGroupings(): ProviderGroupingDescriptor[];
  getGrouping(groupingKey: GroupingKey): ProviderGroupingDescriptor | null;
}

function descriptors(
  providerPluginId: string,
  state: ProviderState,
): ProviderGroupingDescriptor[] {
  return state.catalog.groupings.map((grouping) => ({
    groupingKey: `plugin:${providerPluginId}:${grouping.id}`,
    providerPluginId,
    groupingId: grouping.id,
    singularLabel: grouping.singularLabel,
    pluralLabel: grouping.pluralLabel,
    defaultGroupId: grouping.defaultGroupId,
    groups: grouping.groups,
    membership: { kind: "ribbon" },
    available: state.available,
  }));
}

export function createProviderCatalog(
  database: BetterSqlite3.Database,
  {
    call,
    softTimeoutMs = 2_000,
  }: { call: ProviderCatalogCall; softTimeoutMs?: number },
): ProviderCatalog {
  const states = new Map<string, ProviderState>();
  const generations = new Map<string, number>();
  const listRows = database.prepare(`
    SELECT provider_plugin_id, catalog_json, available FROM provider_catalog
    ORDER BY provider_plugin_id
  `);
  const save = database.prepare(`
    INSERT INTO provider_catalog(provider_plugin_id, catalog_json, available)
    VALUES (?, ?, ?)
    ON CONFLICT(provider_plugin_id) DO UPDATE SET
      catalog_json = excluded.catalog_json,
      available = excluded.available
  `);
  const setAvailability = database.prepare(`
    UPDATE provider_catalog SET available = ? WHERE provider_plugin_id = ?
  `);

  for (const row of listRows.all() as Array<{
    provider_plugin_id: string;
    catalog_json: string;
    available: 0 | 1;
  }>) {
    try {
      const catalog = groupingCatalogSchema.parse(JSON.parse(row.catalog_json));
      states.set(row.provider_plugin_id, {
        catalog,
        available: row.available === 1,
      });
    } catch {
      // A corrupt cache is not a catalog. Discovery can replace it later.
    }
  }

  function markUnavailable(providerPluginId: string): void {
    const current = states.get(providerPluginId);
    if (current === undefined || !current.available) return;
    states.set(providerPluginId, { ...current, available: false });
    setAvailability.run(0, providerPluginId);
  }

  async function refreshProvider(providerPluginId: string): Promise<void> {
    const generation = (generations.get(providerPluginId) ?? 0) + 1;
    generations.set(providerPluginId, generation);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        call(providerPluginId, controller.signal).then(
          (value) => ({ kind: "value" as const, value }),
          (error: unknown) => ({ kind: "error" as const, error }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort();
            resolve({ kind: "timeout" });
          }, softTimeoutMs);
        }),
      ]);
      if (generations.get(providerPluginId) !== generation) return;
      if (outcome.kind !== "value") {
        markUnavailable(providerPluginId);
        return;
      }
      const parsed = groupingCatalogSchema.safeParse(outcome.value);
      if (!parsed.success) {
        markUnavailable(providerPluginId);
        return;
      }
      const state = { catalog: parsed.data, available: true };
      states.set(providerPluginId, state);
      save.run(providerPluginId, JSON.stringify(parsed.data), 1);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  const api: ProviderCatalog = {
    async refresh(providerPluginIds) {
      const installed = new Set(providerPluginIds);
      if (installed.size !== providerPluginIds.length) {
        throw new Error("Provider discovery returned duplicate plugin IDs.");
      }
      for (const providerPluginId of states.keys()) {
        if (!installed.has(providerPluginId)) markUnavailable(providerPluginId);
      }
      await Promise.all(providerPluginIds.map(refreshProvider));
    },
    invalidate(providerPluginId) {
      markUnavailable(providerPluginId);
    },
    availableGroupings() {
      return api.allGroupings().filter(({ available }) => available);
    },
    allGroupings() {
      return [...states.entries()].flatMap(([providerPluginId, state]) =>
        descriptors(providerPluginId, state),
      );
    },
    getGrouping(groupingKey) {
      if (!groupingKey.startsWith("plugin:")) return null;
      return (
        api
          .allGroupings()
          .find((grouping) => grouping.groupingKey === groupingKey) ?? null
      );
    },
  };
  return api;
}
