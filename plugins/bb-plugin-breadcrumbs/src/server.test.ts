import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
});

function createPluginHarness() {
  const update = vi.fn().mockResolvedValue({});
  const deleteProject = vi.fn().mockResolvedValue({ ok: true });
  const host = createFakePluginHost({
    pluginId: "breadcrumbs",
    sdk: {
      projects: { update, delete: deleteProject },
    },
  });
  disposeHosts.push(() => host.harness.lifecycle.dispose());

  plugin(host.bb);
  return { ...host, update, deleteProject };
}

describe("project action RPC", () => {
  it("renames projects through the bb SDK", async () => {
    const { harness, update } = createPluginHarness();

    await expect(
      harness.behavior.callRpc("renameProject", {
        projectId: "proj_1",
        name: "Renamed project",
      }),
    ).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      projectId: "proj_1",
      name: "Renamed project",
    });
  });

  it("removes projects through the bb SDK", async () => {
    const { harness, deleteProject } = createPluginHarness();

    await expect(
      harness.behavior.callRpc("removeProject", { projectId: "proj_1" }),
    ).resolves.toEqual({ ok: true });
    expect(deleteProject).toHaveBeenCalledWith({ projectId: "proj_1" });
  });

  it("rejects invalid rename input at the RPC boundary", async () => {
    const { harness, update } = createPluginHarness();

    await expect(
      harness.behavior.callRpc("renameProject", {
        projectId: "proj_1",
        name: "   ",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(update).not.toHaveBeenCalled();
  });
});

function createSectionHarness() {
  const list = vi.fn().mockResolvedValue([
    { id: "sec_a", name: "Example", createdAt: 1, updatedAt: 1 },
  ]);
  const update = vi.fn().mockResolvedValue({ id: "sec_a", name: "Renamed", updatedThreadCount: 0 });
  const remove = vi.fn().mockResolvedValue({ id: "sec_a", name: "Example", updatedThreadCount: 2 });
  const host = createFakePluginHost({
    pluginId: "breadcrumbs",
    sdk: { threadSections: { list, update, delete: remove } },
  });
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  plugin(host.bb);
  return { ...host, list, update, remove };
}

describe("section action RPC", () => {
  it("serves the names bb has no app-side list for", async () => {
    const { harness } = createSectionHarness();

    await expect(
      harness.behavior.callRpc("listSections", null),
    ).resolves.toEqual({ sections: [{ id: "sec_a", name: "Example" }] });
  });

  it("renames and removes through bb's own section SDK", async () => {
    const { harness, update, remove } = createSectionHarness();

    await expect(
      harness.behavior.callRpc("renameSection", {
        sectionId: "sec_a",
        name: "Renamed",
      }),
    ).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ id: "sec_a", name: "Renamed" });

    await expect(
      harness.behavior.callRpc("removeSection", { sectionId: "sec_a" }),
    ).resolves.toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith({ id: "sec_a" });
  });

  it("rejects an empty section name before it reaches bb", async () => {
    const { harness, update } = createSectionHarness();

    await expect(
      harness.behavior.callRpc("renameSection", { sectionId: "sec_a", name: "  " }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(update).not.toHaveBeenCalled();
  });

  it("defaults the place crumbs on and the ancestors off", async () => {
    const { harness } = createSectionHarness();

    await expect(harness.behavior.callRpc("listCrumbs", null)).resolves.toEqual({
      showSection: true,
      showProject: true,
      showAncestors: false,
    });
  });
});

/** A thread graph with both of bb's relationships in it. */
function createTrailHarness() {
  const threads: Record<string, Record<string, unknown>> = {
    root: { id: "root", parentThreadId: null, sourceThreadId: null, sectionId: "sec_a", projectId: "proj_a", title: "Polish the sidebar" },
    child: { id: "child", parentThreadId: "root", sourceThreadId: null, sectionId: null, projectId: "proj_a", title: "Trace the timer" },
    // bb gives a fork a source and no parent, so it sits at the sidebar root.
    forked: { id: "forked", parentThreadId: null, sourceThreadId: "root", sectionId: null, projectId: "proj_a", title: "A fork of the first" },
    // bb lets a non-root thread carry a section of its own, so a chain can
    // hold one at more than one level.
    mid: { id: "mid", parentThreadId: "root", sourceThreadId: null, sectionId: "sec_b", projectId: "proj_a", title: "Filed apart" },
    leaf: { id: "leaf", parentThreadId: "mid", sourceThreadId: null, sectionId: null, projectId: "proj_a", title: "Under the filed one" },
  };
  const host = createFakePluginHost({
    pluginId: "breadcrumbs",
    sdk: {
      threads: {
        get: vi.fn(async ({ threadId }: { threadId: string }) => threads[threadId] ?? null),
      },
      threadSections: {
        list: vi.fn().mockResolvedValue([
          { id: "sec_a", name: "Example", createdAt: 1, updatedAt: 1 },
          { id: "sec_b", name: "Filed apart", createdAt: 1, updatedAt: 1 },
        ]),
      },
      projects: {
        get: vi.fn().mockResolvedValue({ name: "bb-plugins", kind: "standard" }),
      },
    },
  });
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  plugin(host.bb);
  return host.harness;
}

describe("the trail's ancestry", () => {
  it("walks the threads this one was spawned under, oldest first", async () => {
    const harness = createTrailHarness();

    const trail = (await harness.behavior.callRpc("trailForThread", {
      threadId: "child",
    })) as { ancestors: Array<{ id: string; title: string }>; section: unknown };

    expect(trail.ancestors).toEqual([{ id: "root", title: "Polish the sidebar" }]);
    // The section hangs off the root, which is why the walk runs first.
    expect(trail.section).toEqual({ id: "sec_a", name: "Example" });
  });

  it("takes the nearest section walking up, not the root's", async () => {
    const harness = createTrailHarness();

    const trail = (await harness.behavior.callRpc("trailForThread", {
      threadId: "leaf",
    })) as { section: { id: string; name: string } | null };

    expect(trail.section).toEqual({ id: "sec_b", name: "Filed apart" });
  });

  it("takes a thread's own section over any ancestor's", async () => {
    const harness = createTrailHarness();

    const trail = (await harness.behavior.callRpc("trailForThread", {
      threadId: "mid",
    })) as { section: { id: string; name: string } | null };

    expect(trail.section).toEqual({ id: "sec_b", name: "Filed apart" });
  });

  it("leaves a fork's source out, because bb shows that elsewhere", async () => {
    const harness = createTrailHarness();

    const trail = (await harness.behavior.callRpc("trailForThread", {
      threadId: "forked",
    })) as { ancestors: unknown[] };

    // `sourceThreadId` points at "root"; following it would put a crumb here.
    expect(trail.ancestors).toEqual([]);
  });
});
