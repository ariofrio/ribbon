import { describe, expect, it } from "vitest";
import {
  acknowledgePlacementMigrationInputSchema,
  createGroupingCatalog,
  groupingCatalogSchema,
  placementMigrationSnapshotSchema,
} from "./contracts";

describe("Thread stages provider contracts", () => {
  it("publishes the complete ordered stages catalog", () => {
    const catalog = createGroupingCatalog({
      showBlockedStage: true,
      showDeferredStage: true,
    });

    expect(catalog).toMatchObject({
      protocolVersion: 1,
      groupings: [
        {
          id: "stages",
          singularLabel: "Stage",
          pluralLabel: "Stages",
          defaultGroupId: "Idle",
          groups: [
            {
              id: "Deferred",
              label: "Deferred",
              visibleWhenEmpty: true,
              acceptsAssignments: true,
              defaultCollapsed: true,
            },
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
            {
              id: "Blocked",
              label: "Blocked",
              visibleWhenEmpty: true,
              acceptsAssignments: true,
              defaultCollapsed: false,
            },
            {
              id: "Completed",
              label: "Completed",
              visibleWhenEmpty: true,
              acceptsAssignments: true,
              defaultCollapsed: true,
            },
          ],
        },
      ],
    });
    expect(() => groupingCatalogSchema.parse(catalog)).not.toThrow();
    expect(
      catalog.groupings[0]?.groups.every((group) => group.icon !== undefined),
    ).toBe(true);
  });

  it("reflects provider-owned optional-stage settings", () => {
    const [grouping] = createGroupingCatalog({
      showBlockedStage: false,
      showDeferredStage: false,
    }).groupings;

    expect(grouping?.groups[0]).toMatchObject({
      id: "Deferred",
      visibleWhenEmpty: false,
      acceptsAssignments: false,
    });
    expect(grouping?.groups[3]).toMatchObject({
      id: "Blocked",
      visibleWhenEmpty: false,
      acceptsAssignments: false,
    });
  });

  it("rejects duplicate and invalid local IDs", () => {
    const catalog = createGroupingCatalog({});
    const duplicateGroups = structuredClone(catalog);
    duplicateGroups.groupings[0]!.groups[1]!.id = "Deferred";
    expect(() => groupingCatalogSchema.parse(duplicateGroups)).toThrow();

    const invalidGrouping = structuredClone(catalog);
    invalidGrouping.groupings[0]!.id = "bad:id";
    expect(() => groupingCatalogSchema.parse(invalidGrouping)).toThrow();

    const invalidGroup = structuredClone(catalog);
    invalidGroup.groupings[0]!.groups[0]!.id = "bad/group";
    expect(() => groupingCatalogSchema.parse(invalidGroup)).toThrow();
  });

  it("rejects handlers, URL-bearing attributes, and unknown SVG attributes", () => {
    const catalog = createGroupingCatalog({});
    const unsafeAttributes: Array<Record<string, string | number>> = [
      { onClick: "alert(1)" },
      { fill: "url(https://example.com/icon.svg#paint)" },
      { href: "https://example.com/icon.svg" },
    ];
    for (const attrs of unsafeAttributes) {
      const unsafe = structuredClone(catalog);
      unsafe.groupings[0]!.groups[0]!.icon = {
        tag: "path",
        attrs,
      };
      expect(() => groupingCatalogSchema.parse(unsafe)).toThrow();
    }
  });

  it("strictly validates migration identity, provenance, placement, and order", () => {
    const snapshot = {
      sourcePluginId: "thread-stages" as const,
      sourceSchema: 1 as const,
      installationId: "a".repeat(32),
      revision: 3,
      placements: [
        {
          groupingId: "stages",
          threadId: "thr_1",
          groupId: "Completed",
          enteredAtMs: 100,
          updatedAtMs: 100,
          previousGroupId: "Idle",
          origin: "ui" as const,
          orders: [
            { groupId: "Idle", sortKey: "a0", updatedAtMs: 50 },
            { groupId: "Completed", sortKey: "b0", updatedAtMs: 100 },
          ],
        },
      ],
    };
    expect(() => placementMigrationSnapshotSchema.parse(snapshot)).not.toThrow();

    const duplicatePlacement = structuredClone(snapshot);
    duplicatePlacement.placements.push(structuredClone(snapshot.placements[0]!));
    expect(() =>
      placementMigrationSnapshotSchema.parse(duplicatePlacement),
    ).toThrow();

    const duplicateOrder = structuredClone(snapshot);
    duplicateOrder.placements[0]!.orders.push({
      groupId: "Idle",
      sortKey: "a1",
      updatedAtMs: 75,
    });
    expect(() => placementMigrationSnapshotSchema.parse(duplicateOrder)).toThrow();

    expect(() =>
      placementMigrationSnapshotSchema.parse({ ...snapshot, extra: true }),
    ).toThrow();
    expect(() =>
      acknowledgePlacementMigrationInputSchema.parse({
        installationId: snapshot.installationId,
        revision: snapshot.revision,
        extra: true,
      }),
    ).toThrow();
  });
});
