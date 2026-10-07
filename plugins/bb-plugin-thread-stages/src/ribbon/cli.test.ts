import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChildOrderStore } from "./child-order-store";
import { runRibbonSidebarCli, type RibbonSidebarThread } from "./cli";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
} from "./workflow/workflow-stage";
import {
  RIBBON_SIDEBAR_MIGRATIONS,
  MAIN_STAGE_ORDER_MIGRATION,
  createPlacementStore,
  type GroupingDescriptor,
} from "./placement-store";

const stages: GroupingDescriptor = {
  groupingKey: "plugin:thread-stages:stages",
  singularLabel: "Stage",
  pluralLabel: "Stages",
  defaultGroupId: "Active",
  groups: WORKFLOW_STAGES.map((id) => ({
    id,
    label: WORKFLOW_STAGE_LABELS[id],
    acceptsAssignments: true,
    defaultPlacement: "start",
  })),
  membership: { kind: "ribbon" },
};
const projects: GroupingDescriptor = {
  groupingKey: "builtin:projects",
  singularLabel: "Project",
  pluralLabel: "Projects",
  defaultGroupId: "project-a",
  groups: [{ id: "project-a", label: "Storefront", acceptsAssignments: true }],
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

const machines: GroupingDescriptor = {
  groupingKey: "builtin:machines",
  singularLabel: "Machine",
  pluralLabel: "Machines",
  defaultGroupId: "host-a",
  groups: [{ id: "host-a", label: "host-a", acceptsAssignments: true }],
  membership: {
    kind: "external",
    writable: false,
    groupIdForThread: () => "host-a",
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
    queuedWork: "none",
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
    environmentIsWorktree: true,
    environmentName: null,
    environmentPath: null,
    environmentProviderId: null,
    environmentWorkspaceDisplayKind: "managed-worktree",
    hasPendingInteraction: false,
    lifecycleOwnerThreadId: null,
    runtime: {
      displayStatus: "idle",
    },
    ...values,
  };
}

function setup() {
  const database = new Database(":memory:");
  for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
  database.exec(MAIN_STAGE_ORDER_MIGRATION);
  const store = createPlacementStore(database, {
    grouping: (key) =>
      [sections, projects, machines, stages].find(
        ({ groupingKey }) => groupingKey === key,
      ) ?? null,
    groupings: () => [sections, projects, machines, stages],
    now: () => 100,
  });
  store.reconcileRoots(["thread-a", "thread-b"], ["child-old", "child-new"]);
  const childOrder = createChildOrderStore(database);
  return {
    database,
    store,
    childOrder,
    context: {
      store,
      groupings: () => [sections, projects, machines, stages],
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
          },
        }),
      ],
      updatePlacement: (input: Parameters<typeof store.updatePlacement>[0]) =>
        store.updatePlacement(input),
      hierarchy: () => ({
        threads: [
          thread({ id: "thread-a", title: "Investigate wakeups" }),
          thread({ id: "thread-b", title: "Ship UI", createdAt: 30 }),
          thread({
            id: "child-old",
            title: "Older child",
            parentThreadId: "thread-a",
            createdAt: 11,
          }),
          thread({
            id: "child-new",
            title: "Newer child",
            parentThreadId: "thread-a",
            createdAt: 12,
          }),
        ],
        ranks: childOrder.list(),
      }),
      reorderChildren: (parentThreadId: string, threadIds: string[]) => {
        childOrder.setOrder(parentThreadId, threadIds);
      },
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
      stdout: expect.stringContaining("bb thread-stages <command> [options]"),
    });
    expect(topLevel.stdout).toContain(
      "Inspect and change thread stages, sidebar placement, and layout preferences",
    );
    expect(topLevel.stdout).not.toContain("bb thread-stages rekey");

    const placeHelp = await runRibbonSidebarCli(fixture.context, [
      "help",
      "place",
    ]);
    expect(placeHelp).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining(
        "bb thread-stages place [<thread>] [--self] [--to <group-ref>]",
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
    expect(topLevel.stdout).toContain("bb thread-stages stage");
    expect(topLevel.stdout).toContain("bb thread-stages order");
    expect(topLevel.stdout).not.toContain("bb thread-stages place");
    expect(topLevel.stdout).not.toContain("bb thread-stages groupings");
    const orderHelp = await runRibbonSidebarCli(fixture.context, [
      "order",
      "--help",
    ]);
    expect(orderHelp.stdout).toContain("--by <section|project|machine>");
    expect(orderHelp.stdout).toContain("--first");
    expect(orderHelp.stdout).toContain("--last");
  });

  it("sets a stage without a group reference and orders within one organization", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    expect(
      await runRibbonSidebarCli(
        fixture.context,
        ["stage", "completed", "--self"],
        { threadId: "thread-a" },
      ),
    ).toMatchObject({ exitCode: 0 });
    expect(
      await runRibbonSidebarCli(
        fixture.context,
        ["stage", "completed", "--self"],
        { threadId: "thread-b" },
      ),
    ).toMatchObject({ exitCode: 0 });
    expect(
      await runRibbonSidebarCli(fixture.context, [
        "order",
        "thread-a",
        "--by",
        "project",
        "--first",
      ]),
    ).toMatchObject({ exitCode: 0 });
    const ids = (groupingKey: "builtin:sections" | "builtin:projects") => {
      const result = fixture.store.listPlacements({ groupingKey });
      if (!result.ok) throw new Error(result.error.message);
      return result.value.items.map(({ threadId }) => threadId);
    };
    expect(ids("builtin:projects")).toEqual(["thread-a", "thread-b"]);
    expect(ids("builtin:sections")).toEqual(["thread-b", "thread-a"]);
    expect(
      await runRibbonSidebarCli(fixture.context, [
        "order",
        "thread-b",
        "--by",
        "machine",
        "--last",
      ]),
    ).toMatchObject({ exitCode: 0 });
    expect(ids("builtin:sections")).toEqual(["thread-b", "thread-a"]);
    const machineList = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--by",
      "machine",
      "--machine",
      "host-a",
      "--stage",
      "Completed",
      "--json",
    ]);
    expect(
      JSON.parse(machineList.stdout!).map(({ id }: { id: string }) => id),
    ).toEqual(["thread-a", "thread-b"]);
    await runRibbonSidebarCli(fixture.context, ["stage", "Active", "thread-b"]);
    expect(
      await runRibbonSidebarCli(fixture.context, [
        "order",
        "thread-a",
        "--before",
        "thread-b",
      ]),
    ).toMatchObject({ exitCode: 1 });
    expect(
      await runRibbonSidebarCli(fixture.context, [
        "order",
        "child-old",
        "--first",
      ]),
    ).toMatchObject({ exitCode: 0 });
    expect(fixture.childOrder.list().map(({ threadId }) => threadId)).toEqual([
      "child-old",
      "child-new",
    ]);
  });

  it("lists stages with composable section and project filters, including archived stage metadata", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await fixture.store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Completed",
      threadId: "thread-b",
      origin: "cli",
    });
    const args = [
      "list",
      "--stage",
      "Completed",
      "--section",
      "section-a",
      "--project",
      "project-a",
      "--json",
    ];
    const result = await runRibbonSidebarCli(fixture.context, args);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout!)).toEqual([
      expect.objectContaining({ id: "thread-b", stage: "Completed" }),
    ]);
    const threads = fixture.context.threads();
    fixture.context.threads = () =>
      threads.map((thread) =>
        thread.id === "thread-b" ? { ...thread, archivedAt: 123 } : thread,
      );
    fixture.store.reconcileRoot("thread-b", false);
    expect(
      fixture.store.reconcileRoot("thread-b", false).changedGroupingKeys,
    ).toEqual([]);
    const archived = await runRibbonSidebarCli(fixture.context, [
      ...args,
      "--include-archived",
    ]);
    expect(archived.exitCode).toBe(0);
    expect(JSON.parse(archived.stdout!)).toEqual([
      expect.objectContaining({
        id: "thread-b",
        stage: "Completed",
        archivedAt: 123,
      }),
    ]);
  });

  it("lists rich thread data in scope and shows all placements", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await fixture.store.updatePlacement({
      groupingKey: stages.groupingKey,
      groupId: "Completed",
      threadId: "thread-b",
      origin: "ui",
    });

    const listed = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--scope",
      `${stages.groupingKey}/Completed`,
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
        stage: "Completed",
        stageEnteredAtMs: 100,
      }),
    ]);
    const shown = await runRibbonSidebarCli(
      fixture.context,
      ["show", "--self", "--json"],
      { threadId: "thread-a" },
    );
    expect(JSON.parse(shown.stdout ?? "")).toMatchObject({
      id: "thread-a",
      stage: "Active",
      section: { id: "section-a", name: "Ribbon Suite" },
    });
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
      machine: { id: "host-a", name: "host-a" },
      stage: "Active",
      stageEnteredAtMs: 100,
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
        "\nID        TITLE                STATUS  SECTION       PROJECT     MACHINE  STAGE\nthread-a  Investigate wakeups  idle    Ribbon Suite  Storefront  host-a   Active\nthread-b  Fallback title       active  Ribbon Suite  Storefront  host-a   Active\n\n",
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

    const defaultResult = await runRibbonSidebarCli(context, [
      "list",
      "--json",
    ]);
    expect(
      JSON.parse(defaultResult.stdout ?? "").map(
        ({ id }: { id: string }) => id,
      ),
    ).toEqual(["thread-a", "thread-b"]);
    expect(threads).toHaveBeenLastCalledWith({
      includeArchived: false,
      includeChildren: false,
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
          stage: "Active",
          stageEnteredAtMs: null,
        }),
      ]),
    );
    expect(
      JSON.parse(archivedResult.stdout ?? "").map(
        ({ id }: { id: string }) => id,
      ),
    ).not.toContain("thread-hidden");

    const hiddenResult = await runRibbonSidebarCli(context, [
      "list",
      "--include-hidden",
      "--json",
    ]);
    expect(
      JSON.parse(hiddenResult.stdout ?? "").map(({ id }: { id: string }) => id),
    ).toContain("thread-hidden");
    expect(
      JSON.parse(hiddenResult.stdout ?? "").map(({ id }: { id: string }) => id),
    ).not.toContain("thread-archived");

    const allResult = await runRibbonSidebarCli(context, [
      "list",
      "--include-archived",
      "--include-hidden",
      "--json",
    ]);
    expect(
      JSON.parse(allResult.stdout ?? "").map(({ id }: { id: string }) => id),
    ).toEqual(["thread-a", "thread-b", "thread-archived", "thread-hidden"]);
  });

  it("rejects the removed --group-by option", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const result = await runRibbonSidebarCli(fixture.context, [
      "list",
      "--group-by",
      stages.groupingKey,
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown option '--group-by'");
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      ok: false,
      error: { code: "unknown_option" },
    });
  });

  it("uses bb's shared command suggestions", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const result = await runRibbonSidebarCli(fixture.context, [
      "stge",
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Did you mean stage?");
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      ok: false,
      error: {
        code: "unknown_command",
        hint: "Did you mean stage?",
      },
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
        "Thread: thread-a\n  Section: Ribbon Suite\n  Project: Storefront\n  Machine: host-a\n  Stage: Active\n",
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
      stdout: "Thread thread-a updated\nThread: thread-a\n  Stage: Active\n",
    });
  });

  it("rejects an incompatible legacy stage anchor without changing the stage", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const result = await runRibbonSidebarCli(fixture.context, [
      "place",
      "thread-b",
      "--to",
      `${stages.groupingKey}/Completed`,
      "--before",
      "thread-a",
    ]);
    expect(result).toEqual({
      exitCode: 1,
      stderr: "Order threads within the same stage band.\n",
    });
    expect(fixture.store.getStage("thread-b").groupId).toBe("Active");
  });

  it("files Completed threads at the top unless an explicit position is given", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const place = (threadId: string, groupId: string, ...anchor: string[]) =>
      runRibbonSidebarCli(fixture.context, [
        "place",
        threadId,
        "--to",
        `${stages.groupingKey}/${groupId}`,
        ...anchor,
      ]);
    const ids = () => {
      const result = fixture.store.listPlacements({
        groupingKey: "builtin:sections",
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value.items.map(({ threadId }) => threadId);
    };

    expect(await place("thread-a", "Completed")).toMatchObject({ exitCode: 0 });
    expect(await place("thread-b", "Completed")).toMatchObject({ exitCode: 0 });
    expect(ids()).toEqual(["thread-b", "thread-a"]);
    expect(await place("thread-a", "Completed")).toMatchObject({ exitCode: 0 });
    expect(ids()).toEqual(["thread-b", "thread-a"]);
    expect(await place("thread-a", "Active")).toMatchObject({ exitCode: 0 });
    expect(await place("thread-a", "Completed")).toMatchObject({ exitCode: 0 });
    expect(ids()).toEqual(["thread-a", "thread-b"]);
    expect(
      await place("thread-a", "Completed", "--after", "thread-b"),
    ).toMatchObject({ exitCode: 0 });
    expect(ids()).toEqual(["thread-b", "thread-a"]);
    expect(
      await place("thread-a", "Completed", "--before", "thread-b"),
    ).toMatchObject({ exitCode: 0 });
    expect(ids()).toEqual(["thread-a", "thread-b"]);
  });

  it("reorders a child among its siblings without a destination group", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const placed = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
      "--before",
      "child-new",
    ]);
    expect(placed).toEqual({
      exitCode: 0,
      stdout:
        "Thread child-old updated\nThread: child-old\n  Parent: thread-a\n  Position: 1 of 2\n",
    });
    expect(fixture.childOrder.list()).toEqual([
      { parentThreadId: "thread-a", threadId: "child-old" },
      { parentThreadId: "thread-a", threadId: "child-new" },
    ]);

    const shown = await runRibbonSidebarCli(fixture.context, [
      "show",
      "child-new",
      "--json",
    ]);
    expect(JSON.parse(shown.stdout ?? "")).toEqual({
      threadId: "child-new",
      parentThreadId: "thread-a",
      position: 2,
      siblingThreadIds: ["child-old", "child-new"],
      stage: "Active",
    });

    const children = await runRibbonSidebarCli(fixture.context, [
      "children",
      "thread-a",
      "--json",
    ]);
    expect(
      JSON.parse(children.stdout ?? "").map(({ id }: { id: string }) => id),
    ).toEqual(["child-old", "child-new"]);
    await expect(
      runRibbonSidebarCli(fixture.context, ["children", "thread-a"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout:
        "\nID         TITLE        STATUS\nchild-old  Older child  idle\nchild-new  Newer child  idle\n\n",
    });

    const after = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
      "--after",
      "child-new",
      "--json",
    ]);
    expect(JSON.parse(after.stdout ?? "")).toMatchObject({ position: 2 });
  });

  it("keeps children under their parent and roots in a group", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const toGroup = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
      "--to",
      "builtin:sections/section-a",
    ]);
    expect(toGroup.exitCode).toBe(1);
    expect(toGroup.stderr).toContain("stays under its parent thread-a");

    const noAnchor = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
    ]);
    expect(noAnchor.exitCode).toBe(1);
    expect(noAnchor.stderr).toContain("--before or --after");

    const outsider = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
      "--before",
      "thread-b",
    ]);
    expect(outsider.exitCode).toBe(1);
    expect(outsider.stderr).toContain("not a sibling");

    const root = await runRibbonSidebarCli(fixture.context, [
      "place",
      "thread-a",
    ]);
    expect(root.exitCode).toBe(1);
    expect(root.stderr).toContain("--to");
    expect(fixture.childOrder.list()).toEqual([]);
  });

  it("changes a child's stage without moving it from its parent", async () => {
    const fixture = setup();
    databases.push(fixture.database);

    const placed = await runRibbonSidebarCli(fixture.context, [
      "place",
      "child-old",
      "--to",
      `${stages.groupingKey}/Completed`,
      "--json",
    ]);
    expect(placed.exitCode).toBe(0);
    expect(JSON.parse(placed.stdout ?? "")).toMatchObject({
      placement: { threadId: "child-old", groupId: "Completed" },
    });
    const shown = await runRibbonSidebarCli(fixture.context, [
      "show",
      "child-old",
      "--json",
    ]);
    expect(JSON.parse(shown.stdout ?? "")).toMatchObject({
      parentThreadId: "thread-a",
      stage: "Completed",
    });
    expect(fixture.childOrder.list()).toEqual([]);
  });

  it("rejects provider rekeying now that the stage grouping is fixed", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    const rekeyed = await runRibbonSidebarCli(fixture.context, [
      "rekey",
      "--from",
      stages.groupingKey,
      "--to",
      "plugin:thread-stages:workflow",
      "--json",
    ]);
    expect(rekeyed.exitCode).toBe(2);
  });

  it("returns failure for invalid values and usage errors for malformed invocations", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    for (const [argv, exitCode] of [
      [["groups", "thread-stages"], 2],
      [["stage", "Unknown", "--self"], 1],
      [["order", "thread-a", "--by", "stage", "--first"], 1],
      [["order", "thread-a"], 2],
      [["order", "thread-a", "--first", "--last"], 2],
      [["place", "thread-a", "--to", "plugin:thread-stages:stages"], 1],
      [
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
        2,
      ],
      [["show", "thread-a", "--self"], 1],
    ]) {
      expect(
        (await runRibbonSidebarCli(fixture.context, argv as string[])).exitCode,
      ).toBe(exitCode);
    }

    const malformed = await runRibbonSidebarCli(fixture.context, [
      "show",
      "thread-a",
      "thread-b",
    ]);
    expect(malformed.exitCode).toBe(2);
    expect(malformed.stderr).toContain("unexpected argument 'thread-b'");
    expect(malformed.stderr).toContain("bb thread-stages show [<thread>]");
  });
});
