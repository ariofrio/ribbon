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
              id: "Blocked",
              label: "Blocked",
              visibleWhenEmpty: true,
              acceptsAssignments: true,
              defaultCollapsed: false,
            },
            {
              id: "Completed",
              defaultPlacement: "start",
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
    expect(catalog.groupings[0]?.icon).toEqual(
      catalog.groupings[0]?.groups.find(({ id }) => id === "Completed")?.icon,
    );
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
    expect(grouping?.groups[2]).toMatchObject({
      id: "Blocked",
      visibleWhenEmpty: false,
      acceptsAssignments: false,
    });
  });

  it("draws every stage glyph on one ring size", () => {
    const groups = createGroupingCatalog({}).groupings[0]!.groups;
    const iconByStage = new Map(groups.map((group) => [group.id, group.icon]));
    const ring = expect.objectContaining({
      tag: "circle",
      attrs: expect.objectContaining({ cx: 12, cy: 12, r: 8 }),
    });

    expect(iconByStage.get("Deferred")?.children).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({ r: 8, strokeDasharray: expect.any(String) }),
      }),
    ]);
    expect(iconByStage.get("Idle")?.children).toEqual([ring]);
    // Working is drawn on each stage's ring by Ribbon, not stored as a stage.
    expect(iconByStage.has("Active")).toBe(false);
    // Lucide's Ban: the ring crossed by a diagonal.
    expect(iconByStage.get("Blocked")?.children).toEqual([
      ring,
      expect.objectContaining({
        tag: "path",
        attrs: expect.objectContaining({ d: "M6.343 6.343 17.657 17.657" }),
      }),
    ]);
    expect(iconByStage.get("Completed")?.children).toEqual([
      ring,
      expect.objectContaining({
        tag: "circle",
        attrs: { cx: 12, cy: 12, r: 5, fill: "currentColor" },
      }),
    ]);
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
