import { describe, expect, it } from "vitest";
import {
  getPlacementInputSchema,
  groupingCatalogSchema,
  groupingKeySchema,
  listPlacementsInputSchema,
  threadStagesMigrationSnapshotSchema,
  updatePlacementInputSchema,
  updatePlacementOutputSchema,
} from "./contracts";

const validCatalog = {
  protocolVersion: 1,
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
          icon: {
            tag: "svg",
            attrs: { viewBox: "0 0 24 24" },
            children: [
              {
                tag: "path",
                attrs: { d: "M4 12h16", stroke: "currentColor" },
              },
            ],
          },
          visibleWhenEmpty: true,
          acceptsAssignments: true,
          defaultCollapsed: false,
        },
      ],
    },
  ],
} as const;

describe("Ribbon sidebar contracts", () => {
  it("accepts only canonical grouping keys", () => {
    expect(groupingKeySchema.parse("builtin:projects")).toBe(
      "builtin:projects",
    );
    expect(groupingKeySchema.parse("builtin:sections")).toBe(
      "builtin:sections",
    );
    expect(groupingKeySchema.parse("plugin:thread-stages:stages")).toBe(
      "plugin:thread-stages:stages",
    );
    for (const invalid of [
      "builtin:other",
      "plugin:thread-stages",
      "plugin:thread:stages:extra",
      "plugin:thread/stages:stages",
      "plugin::stages",
    ]) {
      expect(() => groupingKeySchema.parse(invalid)).toThrow();
    }
  });

  it("validates strict catalogs, unique local IDs, assignable defaults, and safe SVG", () => {
    expect(groupingCatalogSchema.parse(validCatalog)).toEqual(validCatalog);
    expect(() =>
      groupingCatalogSchema.parse({ ...validCatalog, extra: true }),
    ).toThrow();
    expect(() =>
      groupingCatalogSchema.parse({
        ...validCatalog,
        groupings: [
          validCatalog.groupings[0],
          validCatalog.groupings[0],
        ],
      }),
    ).toThrow("Duplicate grouping id");
    expect(() =>
      groupingCatalogSchema.parse({
        ...validCatalog,
        groupings: [
          {
            ...validCatalog.groupings[0],
            defaultGroupId: "missing",
          },
        ],
      }),
    ).toThrow("default group");
    for (const attrs of [
      { onClick: "alert(1)" },
      { href: "https://example.com/icon.svg" },
      { fill: "url(#paint)" },
    ]) {
      expect(() =>
        groupingCatalogSchema.parse({
          ...validCatalog,
          groupings: [
            {
              ...validCatalog.groupings[0],
              groups: [
                {
                  ...validCatalog.groupings[0].groups[0],
                  icon: { tag: "path", attrs },
                },
              ],
            },
          ],
        }),
      ).toThrow();
    }
  });

  it("keeps endpoint inputs strict and endpoint errors distinct", () => {
    expect(() =>
      getPlacementInputSchema.parse({
        groupingKey: "builtin:projects",
        threadId: "thread-a",
        extra: true,
      }),
    ).toThrow();
    expect(
      listPlacementsInputSchema.parse({
        groupingKey: "plugin:thread-stages:stages",
        threadIds: [],
        groupIds: [],
        origins: [],
      }),
    ).toEqual({
      groupingKey: "plugin:thread-stages:stages",
      threadIds: [],
      groupIds: [],
      origins: [],
    });
    expect(
      updatePlacementInputSchema.parse({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thread-a",
        anchor: { kind: "before", threadId: "thread-b" },
        expectedRevision: 3,
        origin: "ui",
      }),
    ).toMatchObject({ anchor: { kind: "before" }, origin: "ui" });
    expect(() =>
      updatePlacementOutputSchema.parse({
        ok: false,
        error: {
          code: "THREAD_INELIGIBLE",
          message: "no",
          unrelated: true,
        },
      }),
    ).toThrow();
    expect(() =>
      updatePlacementOutputSchema.parse({
        ok: false,
        error: { code: "NOT_AN_UPDATE_ERROR", message: "no" },
      }),
    ).toThrow();
  });

  it("strictly validates migration identity, uniqueness, and retained order", () => {
    const snapshot = {
      sourcePluginId: "thread-stages",
      sourceSchema: 1,
      installationId: "a".repeat(32),
      revision: 7,
      placements: [
        {
          groupingId: "stages",
          threadId: "thread-a",
          groupId: "Active",
          enteredAtMs: 200,
          updatedAtMs: 300,
          previousGroupId: "Idle",
          origin: "ui",
          orders: [
            { groupId: "Idle", sortKey: "A", updatedAtMs: 100 },
            { groupId: "Active", sortKey: "B", updatedAtMs: 300 },
          ],
        },
      ],
    };
    expect(threadStagesMigrationSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(() =>
      threadStagesMigrationSnapshotSchema.parse({
        ...snapshot,
        placements: [...snapshot.placements, snapshot.placements[0]],
      }),
    ).toThrow("Duplicate placement");
    expect(() =>
      threadStagesMigrationSnapshotSchema.parse({
        ...snapshot,
        placements: [{ ...snapshot.placements[0], orders: [] }],
      }),
    ).toThrow("current group");
  });
});
