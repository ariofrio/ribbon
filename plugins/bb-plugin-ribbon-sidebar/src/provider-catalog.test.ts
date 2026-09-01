import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIBBON_SIDEBAR_MIGRATIONS } from "./placement-store";
import {
  createProviderCatalog,
  type ProviderCatalogCall,
} from "./provider-catalog";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });
  return { promise, resolve, reject };
}

function catalog(label: string) {
  return {
    protocolVersion: 1 as const,
    groupings: [
      {
        id: "stages",
        singularLabel: "Stage",
        pluralLabel: "Stages",
        icon: {
          tag: "svg" as const,
          attrs: { viewBox: "0 0 24 24" },
          children: [
            {
              tag: "path" as const,
              attrs: { d: "M8 5v14l11-7z", fill: "currentColor" },
            },
          ],
        },
        defaultGroupId: "Idle",
        groups: [
          {
            id: "Idle",
            label,
            visibleWhenEmpty: true,
            acceptsAssignments: true,
            defaultCollapsed: false,
          },
        ],
      },
    ],
  };
}

describe("provider catalog discovery", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const database of databases.splice(0)) database.close();
  });

  function setup(call: ProviderCatalogCall, softTimeoutMs = 100) {
    const database = new Database(":memory:");
    databases.push(database);
    for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
    return createProviderCatalog(database, { call, softTimeoutMs });
  }

  it("keeps the last valid catalog recoverable while hiding an invalid provider", async () => {
    const call = vi.fn<ProviderCatalogCall>();
    call.mockResolvedValueOnce(catalog("Idle"));
    const providers = setup(call);

    await providers.refresh(["thread-stages"]);
    expect(providers.availableGroupings()).toMatchObject([
      {
        groupingKey: "plugin:thread-stages:stages",
        icon: expect.objectContaining({ tag: "svg" }),
        groups: [{ label: "Idle" }],
        available: true,
      },
    ]);

    call.mockResolvedValueOnce({
      ...catalog("Corrupt"),
      groupings: [
        catalog("Corrupt").groupings[0],
        catalog("Corrupt").groupings[0],
      ],
    });
    await providers.refresh(["thread-stages"]);
    expect(providers.availableGroupings()).toEqual([]);
    expect(
      providers.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ groups: [{ label: "Idle" }], available: false });

    const database = databases.at(-1)!;
    const reloaded = createProviderCatalog(database, {
      call,
      softTimeoutMs: 100,
    });
    expect(
      reloaded.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ groups: [{ label: "Idle" }], available: false });
  });

  it("ignores a stale response after a newer refresh wins", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const call = vi
      .fn<ProviderCatalogCall>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const providers = setup(call, 10_000);

    const oldRefresh = providers.refresh(["thread-stages"]);
    const newRefresh = providers.refresh(["thread-stages"]);
    second.resolve(catalog("New"));
    await newRefresh;
    first.resolve(catalog("Old"));
    await oldRefresh;

    expect(
      providers.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ groups: [{ label: "New" }], available: true });
  });

  it("keeps a cached catalog available while a targeted refresh resolves", async () => {
    const call = vi.fn<ProviderCatalogCall>().mockResolvedValue(catalog("Idle"));
    const providers = setup(call);
    await providers.refresh(["thread-stages"]);
    const refreshed = deferred<unknown>();
    call.mockReturnValueOnce(refreshed.promise);

    const refresh = providers.refreshProvider("thread-stages");

    expect(providers.availableGroupings()).toMatchObject([
      {
        groupingKey: "plugin:thread-stages:stages",
        groups: [{ label: "Idle" }],
        available: true,
      },
    ]);
    refreshed.resolve(catalog("Active"));
    await refresh;
  });

  it("refreshes one provider without marking unrelated providers unavailable", async () => {
    const call = vi.fn<ProviderCatalogCall>(async (providerPluginId) =>
      catalog(providerPluginId),
    );
    const providers = setup(call);
    await providers.refresh(["provider-a", "provider-b"]);
    call.mockClear();

    await providers.refreshProvider("provider-a");

    expect(call).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith("provider-a", expect.any(AbortSignal));
    expect(
      providers.getGrouping("plugin:provider-b:stages"),
    ).toMatchObject({ available: true });
  });

  it("coalesces bursts into one active and one trailing provider refresh", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const call = vi
      .fn<ProviderCatalogCall>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const providers = setup(call, 10_000);

    const initial = providers.refreshProvider("thread-stages");
    const trailingA = providers.refreshProvider("thread-stages");
    const trailingB = providers.refreshProvider("thread-stages");
    expect(call).toHaveBeenCalledOnce();

    first.resolve(catalog("Old"));
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    second.resolve(catalog("New"));
    await Promise.all([initial, trailingA, trailingB]);

    expect(
      providers.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ groups: [{ label: "New" }], available: true });
  });

  it("soft-times out without discarding a valid cache and marks removal unavailable", async () => {
    vi.useFakeTimers();
    const call = vi.fn<ProviderCatalogCall>();
    call.mockResolvedValueOnce(catalog("Cached"));
    const providers = setup(call, 50);
    await providers.refresh(["thread-stages"]);

    call.mockReturnValueOnce(new Promise(() => undefined));
    const refresh = providers.refresh(["thread-stages"]);
    await vi.advanceTimersByTimeAsync(50);
    await refresh;
    expect(providers.availableGroupings()).toEqual([]);
    expect(
      providers.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ groups: [{ label: "Cached" }], available: false });

    await providers.refresh([]);
    expect(
      providers.getGrouping("plugin:thread-stages:stages"),
    ).toMatchObject({ available: false });
  });
});
