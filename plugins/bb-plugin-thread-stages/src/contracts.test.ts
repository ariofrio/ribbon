import { describe, expect, it } from "vitest";
import {
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

  it("keeps the released migration snapshot contract strict", () => {
    const snapshot = {
      sourcePluginId: "thread-stages",
      sourceSchema: 1,
      installationId: "a".repeat(32),
      revision: 1,
      placements: [
        {
          groupingId: "stages",
          threadId: "thread-a",
          groupId: "Idle",
          enteredAtMs: 1,
          updatedAtMs: 1,
          origin: "auto",
          orders: [{ groupId: "Idle", sortKey: "A", updatedAtMs: 1 }],
        },
      ],
    };
    expect(placementMigrationSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(() =>
      placementMigrationSnapshotSchema.parse({ ...snapshot, extra: true }),
    ).toThrow();
  });

});
