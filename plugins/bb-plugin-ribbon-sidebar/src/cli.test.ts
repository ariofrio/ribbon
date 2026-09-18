import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRibbonSidebarCli, type RibbonSidebarThread } from "./cli";
import {
  RIBBON_SIDEBAR_MIGRATIONS,
  createPlacementStore,
  type GroupingDescriptor,
} from "./placement-store";

const stages: GroupingDescriptor = {
  groupingKey: "plugin:thread-stages:stages",
  singularLabel: "Stage",
  pluralLabel: "Stages",
  defaultGroupId: "Idle",
  groups: [
    { id: "Idle", label: "Idle", acceptsAssignments: true },
    { id: "Active", label: "Active", acceptsAssignments: true },
  ],
  membership: { kind: "ribbon" },
};
const renamed: GroupingDescriptor = {
  ...stages,
  groupingKey: "plugin:thread-stages:workflow",
};
const projects: GroupingDescriptor = {
  groupingKey: "builtin:projects",
  singularLabel: "Project",
  pluralLabel: "Projects",
  defaultGroupId: "project-a",
  groups: [
    { id: "project-a", label: "Storefront", acceptsAssignments: true },
  ],
  membership: {
    kind: "external",
    writable: false,
    groupIdForThread: () => "project-a",
  },
};
const sections: GroupingDescriptor = {
  groupingKey: "builtin:sections",
  singularLabel: "Section",
  pluralLabel: "Sections",
  defaultGroupId: "section-a",
  groups: [
    { id: "section-a", label: "Ribbon Suite", acceptsAssignments: true },
  ],
  membership: {
    kind: "external",
    writable: false,
    groupIdForThread: () => "section-a",
  },
};

function thread(
  overrides: { id: string } & Partial<RibbonSidebarThread>,
): RibbonSidebarThread {
  const { id, ...values } = overrides;
  return {
    id,
    projectId: "project-a",
    environmentId: "environment-a",
    providerId: "codex",
    title: "Thread title",
    titleFallback: null,
    sectionId: "section-a",
    status: "idle",
    parentThreadId: null,
    sourceThreadId: null,
    originKind: null,
    originPluginId: null,
    visibility: "visible",
    archivedAt: null,
    pinnedAt: null,
    deletedAt: null,
    lastReadAt: 15,
    latestAttentionAt: 16,
    createdAt: 10,
    updatedAt: 20,
    activity: {
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activeGoalCount: 0,
      activePlanModeCount: 0,
      activeWorkflowCount: 0,
    },
    pinSortKey: null,
    environmentBranchName: "main",
    environmentHostId: "host-a",
    environmentName: null,
    environmentWorkspaceDisplayKind: "managed-worktree",
    hasPendingInteraction: false,
    runtime: {
      displayStatus: "idle",
      hostReconnectGraceExpiresAt: null,
    },
    ...values,
  };
}

function setup() {
  const database = new Database(":memory:");
  for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
  const store = createPlacementStore(database, {
    grouping: (key) =>
      [sections, projects, stages, renamed].find(
        ({ groupingKey }) => groupingKey === key,
      ) ?? null,
    groupings: () => [sections, projects, stages, renamed],
    now: () => 100,
  });
  store.reconcileRoots(["thread-a", "thread-b"], []);
  return {
    database,
    store,
    context: {
      store,
      groupings: () => [sections, projects, stages],
      threads: () => [
        thread({
          id: "thread-a",
          title: "Investigate wakeups",
        }),
        thread({
          id: "thread-b",
          environmentId: "environment-b",
          providerId: "claude-code",
          title: null,
          titleFallback: "Fallback title",
          status: "active",
          createdAt: 30,
          updatedAt: 40,
          runtime: {
            displayStatus: "active",
            hostReconnectGraceExpiresAt: null,
          },
        }),
      ],
      updatePlacement: (input: Parameters<typeof store.updatePlacement>[0]) =>
        store.updatePlacement(input),
    },
  };
}

describe("Ribbon sidebar CLI", () => {
  const databases: Database.Database[] = [];
  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("offers top-level and command-specific help", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const topLevel = await runRibbonSidebarCli(fixture.context, ["--help"]);
    expect(topLevel).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining(
        "Usage: bb sidebar [options] [command]",
      ),
    });
    expect(topLevel.stdout).toContain(
      "Inspect and change Ribbon sidebar placement",
    );
    expect(topLevel.stdout).toContain("help [command]");

    const placeHelp = await runRibbonSidebarCli(fixture.context, [
      "help",
      "place",
    ]);
    expect(placeHelp).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining(
        "Usage: bb sidebar place [thread] [--self] --to <group-ref>",
      ),
    });
    expect(placeHelp.stdout).toContain("--self");
    expect(placeHelp.stdout).toContain("--before <thread>");
    expect(placeHelp.stdout).toContain("--after <thread>");
    expect(placeHelp.stdout).toContain("--json");

    const listHelp = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--help",
    ]);
    expect(listHelp.stdout).toContain("--include-archived");
    expect(listHelp.stdout).toContain("--include-hidden");

    await expect(
      runRibbonSidebarCli(fixture.context, ["show", "--help"]),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Target the current thread"),
    });
    await expect(
      runRibbonSidebarCli(fixture.context, [
        "groups",
        stages.groupingKey,
        "--help",
      ]),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Arguments:\n  grouping"),
    });
  });

  it("lists groupings and groups with stable human and JSON output", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await expect(
      runRibbonSidebarCli(fixture.context, ["groupings"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout:
        "KEY                                  LABEL\nbuiltin:sections                     Sections\nbuiltin:projects                     Projects\nplugin:thread-stages:stages          Stages\n",
    });
    const groups = await runRibbonSidebarCli(fixture.context, [
      "groups",
      stages.groupingKey,
      "--json",
    ]);
    expect(groups).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(groups.stdout ?? "")).toEqual([
      { id: "Idle", label: "Idle", acceptsAssignments: true },
      { id: "Active", label: "Active", acceptsAssignments: true },
    ]);
  });

  it("orders Sections, Projects, then plugin labels alphabetically", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const descriptor = (
      groupingKey: GroupingDescriptor["groupingKey"],
      pluralLabel: string,
    ): GroupingDescriptor => ({
      ...stages,
      groupingKey,
      pluralLabel,
    });
    const result = await runRibbonSidebarCli(
      {
        ...fixture.context,
        groupings: () => [
          descriptor("plugin:zulu:queues", "Queues"),
          descriptor("builtin:projects", "Projects"),
          descriptor("plugin:alpha:alerts", "Alerts"),
          descriptor("builtin:sections", "Sections"),
        ],
      },
      ["groupings", "--json"],
    );

    expect(JSON.parse(result.stdout ?? "").map(({ groupingKey }: { groupingKey: string }) => groupingKey)).toEqual([
      "builtin:sections",
      "builtin:projects",
      "plugin:alpha:alerts",
      "plugin:zulu:queues",
    ]);
  });

  it("lists rich thread data in scope and shows all placements", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await fixture.store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-b",
      origin: "ui",
    });

    const listed = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--scope",
      `${stages.groupingKey}/Active`,
      "--json",
    ]);
    expect(JSON.parse(listed.stdout ?? "")).toEqual([
      expect.objectContaining({
        id: "thread-b",
        title: null,
        titleFallback: "Fallback title",
        status: "active",
        project: { id: "project-a", name: "Storefront" },
        section: { id: "section-a", name: "Ribbon Suite" },
        pluginGroups: [
          {
            pluginId: "thread-stages",
            groupingId: "stages",
            groupingName: "Stages",
            groupId: "Active",
            groupName: "Active",
          },
        ],
      }),
    ]);
    const shown = await runRibbonSidebarCli(
      fixture.context,
      ["show", "--self", "--json"],
      { threadId: "thread-a" },
    );
    expect(JSON.parse(shown.stdout ?? "")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placement: expect.objectContaining({
            threadId: "thread-a",
            groupId: "Idle",
          }),
        }),
      ]),
    );
  });

  it("preserves the complete SDK thread object in JSON rows", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const [sdkThread] = fixture.context.threads();

    const listed = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--json",
    ]);
    const [row] = JSON.parse(listed.stdout ?? "");

    expect(row).toEqual({
      ...sdkThread,
      project: { id: "project-a", name: "Storefront" },
      section: { id: "section-a", name: "Ribbon Suite" },
      pluginGroups: [
        {
          pluginId: "thread-stages",
          groupingId: "stages",
          groupingName: "Stages",
          groupId: "Idle",
          groupName: "Idle",
        },
      ],
    });
  });

  it("formats human thread lists as an aligned labeled table", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await fixture.store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Active",
      threadId: "thread-b",
      origin: "ui",
    });

    await expect(
      runRibbonSidebarCli(fixture.context, ["list"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout:
        "\nID        TITLE                STATUS  SECTION       PROJECT     STAGE\nthread-a  Investigate wakeups  idle    Ribbon Suite  Storefront  Idle\nthread-b  Fallback title       active  Ribbon Suite  Storefront  Active\n\n",
    });
  });

  it("includes archived and hidden roots only when requested", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const baseThreads = fixture.context.threads();
    const archived: RibbonSidebarThread = {
      ...baseThreads[0]!,
      id: "thread-archived",
      title: "Archived root",
      archivedAt: 50,
    };
    const hidden: RibbonSidebarThread = {
      ...baseThreads[0]!,
      id: "thread-hidden",
      title: "Hidden root",
      visibility: "hidden",
    };
    const threads = vi.fn(
      ({
        includeArchived,
        includeHidden,
      }: {
        includeArchived: boolean;
        includeHidden: boolean;
      }) => [
        ...baseThreads,
        ...(includeArchived ? [archived] : []),
        ...(includeHidden ? [hidden] : []),
      ],
    );
    const context = { ...fixture.context, threads };

    const defaultResult = await runRibbonSidebarCli(context, ["list", "--json"]);
    expect(JSON.parse(defaultResult.stdout ?? "").map(({ id }: { id: string }) => id))
      .toEqual(["thread-a", "thread-b"]);
    expect(threads).toHaveBeenLastCalledWith({
      includeArchived: false,
      includeHidden: false,
    });

    const archivedResult = await runRibbonSidebarCli(context, [
      "list",
      "--include-archived",
      "--json",
    ]);
    expect(JSON.parse(archivedResult.stdout ?? "")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "thread-archived",
          archivedAt: 50,
          pluginGroups: [expect.objectContaining({ groupName: "Idle" })],
        }),
      ]),
    );
    expect(JSON.parse(archivedResult.stdout ?? "").map(({ id }: { id: string }) => id))
      .not.toContain("thread-hidden");

    const hiddenResult = await runRibbonSidebarCli(context, [
      "list",
      "--include-hidden",
      "--json",
    ]);
    expect(JSON.parse(hiddenResult.stdout ?? "").map(({ id }: { id: string }) => id))
      .toContain("thread-hidden");
    expect(JSON.parse(hiddenResult.stdout ?? "").map(({ id }: { id: string }) => id))
      .not.toContain("thread-archived");

    const allResult = await runRibbonSidebarCli(context, [
      "list",
      "--include-archived",
      "--include-hidden",
      "--json",
    ]);
    expect(JSON.parse(allResult.stdout ?? "").map(({ id }: { id: string }) => id))
      .toEqual(["thread-a", "thread-b", "thread-archived", "thread-hidden"]);
  });

  it("rejects the removed --group-by option", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    await expect(
      runRibbonSidebarCli(fixture.context, [
        "list",
        "--group-by",
        stages.groupingKey,
      ]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: "Unknown option: --group-by\n",
    });
  });

  it("labels human placement details and update confirmations", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    await expect(
      runRibbonSidebarCli(fixture.context, ["show", "thread-a"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout:
        "Thread: thread-a\n  Section: Ribbon Suite\n  Project: Storefront\n  Stage: Idle\n",
    });

    await expect(
      runRibbonSidebarCli(fixture.context, [
        "place",
        "thread-a",
        "--to",
        `${stages.groupingKey}/Active`,
      ]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout:
        "Thread thread-a updated\nThread: thread-a\n  Stage: Active\n",
    });
  });

  it("places with unambiguous destination and anchor flags", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const result = await runRibbonSidebarCli(fixture.context, [
      "place",
      "thread-b",
      "--to",
      `${stages.groupingKey}/Active`,
      "--before",
      "thread-a",
    ]);
    expect(result).toEqual({
      exitCode: 1,
      stderr: "Anchor is not an eligible destination member: thread-a\n",
    });
    await expect(
      runRibbonSidebarCli(fixture.context, [
        "place",
        "thread-b",
        "--to",
        `${stages.groupingKey}/Active`,
        "--json",
      ]),
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it("explicitly migrates Thread stages placement", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const migrateThreadStages = vi.fn(async () => ({
      installationId: "a".repeat(32),
      revision: 7,
      imported: true,
    }));

    const result = await runRibbonSidebarCli(
      { ...fixture.context, migrateThreadStages },
      ["migrate", "thread-stages", "--json"],
    );

    expect(migrateThreadStages).toHaveBeenCalledOnce();
    expect(JSON.parse(result.stdout ?? "")).toEqual({
      installationId: "a".repeat(32),
      revision: 7,
      imported: true,
    });
  });

  it("rekeys with strict syntax", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const rekeyed = await runRibbonSidebarCli(fixture.context, [
      "rekey",
      "--from",
      stages.groupingKey,
      "--to",
      renamed.groupingKey,
      "--json",
    ]);
    expect(JSON.parse(rekeyed.stdout ?? "")).toEqual({
      from: stages.groupingKey,
      to: renamed.groupingKey,
      assignments: 2,
      orders: 0,
      revision: 1,
    });
  });

  it("returns failure for invalid values and usage errors for malformed invocations", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    for (const argv of [
      ["groups", "thread-stages"],
      ["place", "thread-a", "--to", "plugin:thread-stages:stages"],
      [
        "place",
        "thread-a",
        "--to",
        `${stages.groupingKey}/Idle`,
        "--before",
        "thread-b",
        "--after",
        "thread-b",
      ],
      ["show", "thread-a", "--self"],
    ]) {
      expect((await runRibbonSidebarCli(fixture.context, argv)).exitCode).toBe(1);
    }

    await expect(
      runRibbonSidebarCli(fixture.context, ["show", "thread-a", "thread-b"]),
    ).resolves.toEqual({
      exitCode: 2,
      stderr:
        "Usage: bb sidebar show [thread] [--self] [--json]\n",
    });
  });
});
