import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRibbonSidebarCli } from "./cli";
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

function setup() {
  const database = new Database(":memory:");
  for (const migration of RIBBON_SIDEBAR_MIGRATIONS) database.exec(migration);
  const store = createPlacementStore(database, {
    grouping: (key) =>
      key === stages.groupingKey
        ? stages
        : key === renamed.groupingKey
          ? renamed
          : null,
    groupings: () => [stages, renamed],
    now: () => 100,
  });
  store.reconcileRoots(["thread-a", "thread-b"], []);
  return {
    database,
    store,
    context: {
      store,
      groupings: () => [stages],
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

  it("lists groupings and groups with stable human and JSON output", async () => {
    const fixture = setup();
    databases.push(fixture.database);
    await expect(
      runRibbonSidebarCli(fixture.context, ["groupings"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: "KEY                                  LABEL\nplugin:thread-stages:stages          Stages\n",
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

  it("lists by independent scope and grouping and shows all placements", async () => {
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
      "--group-by",
      stages.groupingKey,
      "--json",
    ]);
    expect(JSON.parse(listed.stdout ?? "")).toMatchObject({
      groupingKey: stages.groupingKey,
      items: [{ threadId: "thread-b", groupId: "Active" }],
    });
    const shown = await runRibbonSidebarCli(
      fixture.context,
      ["show", "--self", "--json"],
      { threadId: "thread-a" },
    );
    expect(JSON.parse(shown.stdout ?? "")).toMatchObject([
      { placement: { threadId: "thread-a", groupId: "Idle" } },
    ]);
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

  it("rejects malformed group refs, conflicting anchors, and ambiguous self", async () => {
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
      expect((await runRibbonSidebarCli(fixture.context, argv)).exitCode).toBe(2);
    }
  });
});
