import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server";

const threadStagesCatalog = {
  protocolVersion: 1 as const,
  groupings: [
    {
      id: "stages",
      singularLabel: "Stage",
      pluralLabel: "Stages",
      defaultGroupId: "Idle",
      groups: [
        {
          id: "Idle",
          label: "Idle",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
        {
          id: "Active",
          label: "Active",
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
  ],
};

function setup({ includeThreadStages = true } = {}) {
  const threads = [
    makeThreadResponse({
      id: "thread-a",
      projectId: "project-a",
      sectionId: "section-a",
      parentThreadId: null,
      visibility: "visible",
      archivedAt: null,
    }),
    makeThreadResponse({
      id: "thread-child",
      projectId: "project-a",
      parentThreadId: "thread-a",
      visibility: "visible",
      archivedAt: null,
    }),
  ];
  const callRpc = vi.fn(async ({ pluginId, method }: {
    pluginId: string;
    method: string;
  }) => {
    if (pluginId !== "thread-stages") throw new Error("unknown provider");
    if (method === "getGroupingCatalogV1") return threadStagesCatalog;
    throw new Error(`unexpected method: ${method}`);
  });
  const host = createFakePluginHost({
    pluginId: "ribbon-sidebar",
    sdk: {
      threads: {
        list: async () => threads,
        update: async ({ threadId, sectionId }) =>
          makeThreadResponse({
            ...threads.find(({ id }) => id === threadId),
            id: threadId,
            sectionId: sectionId ?? null,
          }),
      },
      projects: {
        list: async () => [
          {
            id: "project-a",
            name: "Storefront",
            kind: "standard" as const,
            createdAt: 1,
            updatedAt: 1,
            gitRemoteUrl: null,
            sources: [],
          },
          {
            id: "project-b",
            name: "Back office",
            kind: "standard" as const,
            createdAt: 1,
            updatedAt: 1,
            gitRemoteUrl: null,
            sources: [],
          },
        ],
      },
      threadSections: {
        list: async () => [
          { id: "section-a", name: "Release", createdAt: 1, updatedAt: 1 },
        ],
      },
      plugins: {
        list: async () => ({
          plugins: [
            { id: "ribbon-sidebar", status: "running" },
            ...(includeThreadStages
              ? [{ id: "thread-stages", status: "running" as const }]
              : []),
          ],
        }),
        callRpc,
      },
    },
  });
  return { ...host, callRpc };
}

describe("Ribbon sidebar server", () => {
  it("registers the exact public placement RPC and generic CLI", async () => {
    const { bb, harness } = setup();
    await plugin(bb);

    expect(harness.inspection.registrations.rpcMethods).toEqual([
      "createProjectV1",
      "createSectionV1",
      "deleteEntityV1",
      "getPlacementV1",
      "invalidateGroupingCatalogV1",
      "listPlacementsV1",
      "listPreviewsV1",
      "renameEntityV1",
      "sidebarSnapshotV1",
      "synchronizeV1",
      "updatePlacementV1",
    ]);
    expect(harness.inspection.registrations.cli).toMatchObject({
      name: "ribbon-sidebar",
    });
    await expect(
      harness.behavior.runCli(["groupings", "--json"]),
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it("discovers providers, reconciles roots, and serves schema-validated placements", async () => {
    const { bb, harness, callRpc } = setup();
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("synchronizeV1", {
        migrateThreadStages: false,
      }),
    ).resolves.toMatchObject({
      groupings: [
        { groupingKey: "builtin:projects" },
        { groupingKey: "builtin:sections" },
        { groupingKey: "plugin:thread-stages:stages" },
      ],
    });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "thread-stages",
        method: "getGroupingCatalogV1",
      }),
    );

    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-a",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "Idle", origin: "auto" } },
    });
    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thread-child",
      }),
    ).toMatchObject({ ok: false, error: { code: "THREAD_INELIGIBLE" } });
    expect(
      await harness.behavior.callRpc("getPlacementV1", {
        groupingKey: "plugin:missing:grouping",
        threadId: "thread-a",
      }),
    ).toMatchObject({ ok: false, error: { code: "GROUPING_NOT_FOUND" } });
  });

  it("mounts without migration when Thread stages is not installed", async () => {
    const { bb, harness, callRpc } = setup({ includeThreadStages: false });
    await plugin(bb);

    await expect(
      harness.behavior.callRpc("synchronizeV1", {
        migrateThreadStages: true,
      }),
    ).resolves.toMatchObject({
      groupings: [
        { groupingKey: "builtin:projects" },
        { groupingKey: "builtin:sections" },
      ],
    });
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("keeps project membership read-only and moves Section membership", async () => {
    const { bb, harness } = setup();
    await plugin(bb);
    await harness.behavior.callRpc("synchronizeV1", {
      migrateThreadStages: false,
    });

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:projects",
        groupId: "project-a",
        threadId: "thread-a",
        anchor: { kind: "start" },
        origin: "ui",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:projects",
        groupId: "project-b",
        threadId: "thread-a",
        origin: "ui",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "MEMBERSHIP_NOT_WRITABLE" },
    });

    expect(
      await harness.behavior.callRpc("updatePlacementV1", {
        groupingKey: "builtin:sections",
        groupId: "unsectioned",
        threadId: "thread-a",
        origin: "ui",
      }),
    ).toMatchObject({
      ok: true,
      value: { placement: { groupId: "unsectioned", enteredAtMs: null } },
    });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [expect.objectContaining({ threadId: "thread-a", sectionId: null })],
    ]);
  });
});
