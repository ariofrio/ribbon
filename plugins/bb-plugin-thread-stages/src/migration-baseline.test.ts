import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THREAD_WORKFLOW_MIGRATIONS } from "./store";

const baselinePath = fileURLToPath(
  new URL("./migration-baseline.v1.json", import.meta.url),
);
const pluginRoot = fileURLToPath(new URL("..", import.meta.url));

function readBaseline() {
  return JSON.parse(readFileSync(baselinePath, "utf8")) as {
    manifestVersion: number;
    frozenRelease: string;
    sourceSchema: number;
    legacyMigrationCount: number;
    ui: Array<{ id: string }>;
    state: Array<{ id: string; owner: string; disposition: string }>;
    placementPaths: Array<{ id: string; postHandoff: string }>;
    preferences: Array<{ id: string; ownerAfterHandoff: string }>;
    policyDependencies: Array<{ id: string }>;
    qa: string[];
    packaging: string[];
    screenshots: string[];
  };
}

describe("Thread stages migration baseline v1", () => {
  it("freezes the released UI, state, and every placement path", () => {
    const baseline = readBaseline();

    expect(baseline).toMatchObject({
      manifestVersion: 1,
      frozenRelease: "0.7.0",
      sourceSchema: 1,
      legacyMigrationCount: THREAD_WORKFLOW_MIGRATIONS.length - 1,
    });
    expect(baseline.ui.map(({ id }) => id)).toEqual([
      "exclusive-thread-list",
      "stages",
      "root-hierarchy",
      "pinned-threads",
      "project-section-filter",
      "search",
      "drag-and-order",
      "stage-actions-and-shortcuts",
      "message-previews",
      "collapse-state-and-indicators",
      "bb-list-fallback",
    ]);
    expect(baseline.state.map(({ id }) => id)).toEqual([
      "thread_organization",
      "thread_stage_entry",
      "thread_task_workflow",
      "thread_task_preview",
      "retained-stage-order",
      "pinned-order",
      "migration-meta",
    ]);
    expect(baseline.placementPaths.map(({ id }) => id)).toEqual([
      "rpc-sync",
      "rpc-move",
      "rpc-stage-chord",
      "rpc-reorder",
      "cli-update",
      "lifecycle-active",
      "lifecycle-idle",
      "thread-created",
      "thread-deleted",
      "completed-retention",
      "undo",
      "provider-settings",
    ]);
    expect(
      baseline.placementPaths.every(
        ({ postHandoff }) =>
          postHandoff === "forward" ||
          postHandoff === "reconcile" ||
          postHandoff === "read-ribbon",
      ),
    ).toBe(true);
  });

  it("records local preferences, policy dependencies, QA, and package assets", () => {
    const baseline = readBaseline();

    expect(baseline.preferences.map(({ id }) => id)).toEqual([
      "collapsed-stages",
      "collapsed-threads",
      "thread-filter",
      "project-filter",
      "legacy-project-filter",
      "show-sidebar-filter",
      "show-collapsed-stage-indicators",
      "show-thread-previews",
      "show-deferred-stage",
      "show-blocked-stage",
      "auto-archive-completed-after",
    ]);
    expect(baseline.policyDependencies.map(({ id }) => id)).toEqual([
      "workflow-automation",
      "manual-interaction-guard",
      "completed-retention",
      "ui-origin-undo",
      "child-root-ownership",
      "disabled-stage-recovery",
    ]);
    for (const relativePath of [
      ...baseline.qa,
      ...baseline.packaging,
      ...baseline.screenshots,
    ]) {
      expect(existsSync(resolve(pluginRoot, relativePath))).toBe(true);
    }
    expect(pluginRoot).toContain("bb-plugin-thread-stages");
  });
});
