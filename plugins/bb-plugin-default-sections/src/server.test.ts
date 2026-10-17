import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "./server";

const disposeHosts: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposeHosts.splice(0).map((dispose) => dispose()));
});

type Thread = ReturnType<typeof makeThreadResponse>;

async function setup({
  sections = [
    { id: "sec_release", name: "Release" },
    { id: "sec_later", name: "Later" },
  ],
  projects = [
    { id: "proj_personal", name: "Personal" },
    { id: "proj_store", name: "Storefront" },
    { id: "proj_docs", name: "Docs" },
  ],
}: {
  sections?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; name: string }>;
} = {}) {
  const threads = new Map<string, Thread>();
  const updates: Array<{ threadId: string; sectionId: string | null }> = [];
  const state = { sections, projects };
  const host = createFakePluginHost({
    pluginId: "default-sections",
    sdk: {
      projects: { list: async () => state.projects },
      threadSections: { list: async () => state.sections },
      threads: {
        get: async ({ threadId }: { threadId: string }) => {
          const thread = threads.get(threadId);
          if (!thread) throw new Error(`no thread ${threadId}`);
          return thread;
        },
        update: async ({
          threadId,
          sectionId,
        }: {
          threadId: string;
          sectionId: string | null;
        }) => {
          if (
            sectionId !== null &&
            !state.sections.some((section) => section.id === sectionId)
          ) {
            throw Object.assign(new Error("Section not found"), {
              code: "section_not_found",
            });
          }
          updates.push({ threadId, sectionId });
          const thread = { ...threads.get(threadId)!, sectionId };
          threads.set(threadId, thread);
          return thread;
        },
      },
    } as never,
  });
  await plugin(host.bb);
  disposeHosts.push(() => host.harness.lifecycle.dispose());
  const { harness } = host;

  return {
    harness,
    state,
    updates,
    async create(overrides: Partial<Thread>) {
      const thread = makeThreadResponse({
        id: `thr_${threads.size + 1}`,
        projectId: "proj_store",
        parentThreadId: null,
        sectionId: null,
        ...overrides,
      });
      threads.set(thread.id, thread);
      const { errors } = await harness.behavior.emitThreadEvent(
        "thread.created",
        { thread },
      );
      expect(errors).toEqual([]);
      return thread;
    },
    set(projectId: string, sectionId: string | null) {
      return harness.behavior.callRpc("setDefaultV1", { projectId, sectionId });
    },
    list() {
      return harness.behavior.callRpc("listDefaultsV1", null);
    },
  };
}

describe("new threads", () => {
  it("start in their project's default section", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");

    const thread = await plugin.create({});

    expect(plugin.updates).toEqual([
      { threadId: thread.id, sectionId: "sec_release" },
    ]);
  });

  it("leave a project without a default alone", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");

    await plugin.create({ projectId: "proj_docs" });

    expect(plugin.updates).toEqual([]);
  });

  it.each<[string, Partial<Thread>]>([
    ["a section chosen at creation", { sectionId: "sec_later" }],
    ["a child, which shows its root's section", { parentThreadId: "thr_root" }],
    ["a fork, which belongs beside its source", { originKind: "fork", sourceThreadId: "thr_source" }],
    ["a hidden worker thread", { visibility: "hidden" }],
  ])("leave %s alone", async (_, overrides) => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");

    await plugin.create(overrides);

    expect(plugin.updates).toEqual([]);
  });

  it("leave a thread alone that gained a section before the rule ran", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");
    const thread = makeThreadResponse({
      id: "thr_moved",
      projectId: "proj_store",
      parentThreadId: null,
      sectionId: null,
    });
    plugin.harness.inspection.sdk.stub("threads.get", async () => ({
      ...thread,
      sectionId: "sec_later",
    }));

    await plugin.harness.behavior.emitThreadEvent("thread.created", { thread });

    expect(plugin.updates).toEqual([]);
  });

  it("drop a default whose section was removed", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");
    plugin.state.sections = [{ id: "sec_later", name: "Later" }];

    await plugin.create({});

    expect(plugin.updates).toEqual([]);
    await expect(plugin.list()).resolves.toEqual({ defaults: [] });
    expect(plugin.harness.inspection.realtimeSignals.at(-1)).toEqual({
      channel: "defaults-changed",
      payload: null,
    });
  });
});

describe("defaults", () => {
  it("are set, listed, and cleared", async () => {
    const plugin = await setup();

    await expect(plugin.set("proj_store", "sec_release")).resolves.toEqual({
      defaults: [{ projectId: "proj_store", sectionId: "sec_release" }],
    });
    await plugin.set("proj_docs", "sec_release");
    await expect(plugin.list()).resolves.toEqual({
      defaults: [
        { projectId: "proj_docs", sectionId: "sec_release" },
        { projectId: "proj_store", sectionId: "sec_release" },
      ],
    });
    await expect(plugin.set("proj_store", null)).resolves.toEqual({
      defaults: [{ projectId: "proj_docs", sectionId: "sec_release" }],
    });
  });

  it("announce every change", async () => {
    const plugin = await setup();

    await plugin.set("proj_store", "sec_release");
    await plugin.set("proj_store", null);

    expect(plugin.harness.inspection.realtimeSignals).toEqual([
      { channel: "defaults-changed", payload: null },
      { channel: "defaults-changed", payload: null },
    ]);
  });

  it("refuse the personal project, whose Threads heading starts threads in no section", async () => {
    const plugin = await setup();

    await expect(plugin.set("proj_personal", "sec_release")).rejects.toThrow(
      /personal project/i,
    );
  });

  it("refuse a section or project that does not exist", async () => {
    const plugin = await setup();

    await expect(plugin.set("proj_store", "sec_gone")).rejects.toThrow(
      /section/i,
    );
    await expect(plugin.set("proj_gone", "sec_release")).rejects.toThrow(
      /project/i,
    );
  });

  it("forget sections and projects that were removed", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_release");
    await plugin.set("proj_docs", "sec_later");

    plugin.state.sections = [{ id: "sec_later", name: "Later" }];
    plugin.state.projects = [{ id: "proj_store", name: "Storefront" }];

    await expect(plugin.list()).resolves.toEqual({ defaults: [] });
  });

  it("describe the settings page's projects and sections", async () => {
    const plugin = await setup();
    await plugin.set("proj_store", "sec_later");

    await expect(
      plugin.harness.behavior.callRpc("readSettings", null),
    ).resolves.toEqual({
      defaults: [{ projectId: "proj_store", sectionId: "sec_later" }],
      projects: [
        { id: "proj_store", name: "Storefront" },
        { id: "proj_docs", name: "Docs" },
      ],
      sections: [
        { id: "sec_release", name: "Release" },
        { id: "sec_later", name: "Later" },
      ],
    });
  });
});

describe("CLI", () => {
  async function run(plugin: Awaited<ReturnType<typeof setup>>, argv: string[]) {
    return plugin.harness.behavior.runCli(argv);
  }

  it("sets and clears defaults by name or id", async () => {
    const plugin = await setup();

    const set = await run(plugin, ["set", "storefront", "Release"]);
    expect(set.exitCode).toBe(0);
    expect(set.stdout).toBe("Storefront → Release");

    await run(plugin, ["set", "proj_docs", "sec_later"]);
    const listed = await run(plugin, ["list"]);
    expect(listed.stdout).toBe("Storefront\tRelease\nDocs\tLater");

    const json = await run(plugin, ["list", "--json"]);
    expect(JSON.parse(json.stdout ?? "")).toEqual([
      { projectId: "proj_store", project: "Storefront", sectionId: "sec_release", section: "Release" },
      { projectId: "proj_docs", project: "Docs", sectionId: "sec_later", section: "Later" },
    ]);

    const cleared = await run(plugin, ["clear", "Storefront"]);
    expect(cleared.stdout).toBe("Storefront → Threads");
    expect((await run(plugin, ["list"])).stdout).toBe("Docs\tLater");
  });

  it("says so when nothing has a default", async () => {
    const plugin = await setup();

    expect((await run(plugin, ["list"])).stdout).toBe(
      "No project has a default section.",
    );
  });

  it("names what it could not find", async () => {
    const plugin = await setup();

    const result = await run(plugin, ["set", "Nowhere", "Release"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/No project named or with the id "Nowhere"/);
  });
});
