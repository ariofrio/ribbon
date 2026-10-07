import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

type ModelArgs = Parameters<BbPluginApi["sdk"]["providers"]["models"]>[0];

const providers = [
  {
    id: "claude-code",
    displayName: "Claude Code",
    available: true,
    icon: { glyph: "Claude" },
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    available: true,
    icon: { glyph: "openrouter/mark" },
  },
];

function model(id: string, displayName: string) {
  return {
    id,
    model: id,
    displayName,
    description: "",
    isDefault: false,
    defaultReasoningEffort: "medium" as const,
    supportedReasoningEfforts: [
      { reasoningEffort: "medium" as const, description: "Balanced" },
    ],
  };
}

function setup() {
  const host = createFakePluginHost({
    pluginId: "model-mentions",
    sdk: {
      providers: {
        list: async () => providers,
        models: async (args) => ({
          models: [
            model(
              args?.providerId === "claude-code" ? "opus" : "anthropic/opus",
              "Opus",
            ),
          ],
          selectedOnlyModels: [],
          modelLoadError: null,
        }),
      },
    },
  });
  plugin(host.bb);
  return host.harness;
}

describe("Model mentions", () => {
  it("offers each provider's matching model and preserves the provider choice on resolve", async () => {
    const host = setup();
    const mentions = host.registrations.mentionProviders.find(
      (p) => p.id === "model",
    )!;
    const items = await mentions.search({
      trigger: "@",
      query: "Opus",
      projectId: null,
      threadId: null,
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.subtitle)).toEqual([
      "Model · Claude Code",
      "Model · OpenRouter",
    ]);
    expect(items.map((item) => item.icon)).toEqual([
      "Claude",
      "openrouter/mark",
    ]);
    expect(items[0]!.id).not.toEqual(items[1]!.id);
    const resolved = await mentions.resolve(items[1]!.id);
    expect(resolved.context).toContain('"providerId":"openrouter"');
    expect(resolved.context).toContain('"model":"anthropic/opus"');
    expect(resolved.context).toContain("task described");
    await host.lifecycle.dispose();
  });

  it("can disable model search without invalidating mentions already in drafts", async () => {
    const host = setup();
    const mentions = host.registrations.mentionProviders.find(
      (p) => p.id === "model",
    )!;
    const query = {
      trigger: "@" as const,
      query: "opus",
      projectId: null,
      threadId: null,
    };
    const [picked] = await mentions.search(query);
    await host.behavior.setSettings({ modelMentions: false });
    expect(await mentions.search(query)).toEqual([]);
    expect((await mentions.resolve(picked!.id)).context).toContain(
      '"model":"opus"',
    );
    await host.lifecycle.dispose();
  });

  it("offers provider and supported reasoning mentions only when enabled", async () => {
    const host = setup();
    const provider = host.registrations.mentionProviders.find(
      (p) => p.id === "provider",
    )!;
    const reasoning = host.registrations.mentionProviders.find(
      (p) => p.id === "reasoning",
    )!;
    const query = {
      trigger: "@" as const,
      query: "Claude",
      projectId: null,
      threadId: null,
    };
    expect(await provider.search(query)).toEqual([]);
    expect(await reasoning.search({ ...query, query: "medium" })).toEqual([]);
    await host.behavior.setSettings({
      providerMentions: true,
      reasoningMentions: true,
    });
    const [pickedProvider] = await provider.search(query);
    expect(pickedProvider).toMatchObject({
      title: "Claude Code",
      icon: "Claude",
    });
    expect((await provider.resolve(pickedProvider!.id)).context).toContain(
      '"providerId":"claude-code"',
    );
    const levels = await reasoning.search({ ...query, query: "medium" });
    expect(levels.map((level) => level.subtitle)).toEqual([
      "Reasoning · Claude Code",
      "Reasoning · OpenRouter",
    ]);
    expect((await reasoning.resolve(levels[0]!.id)).context).toContain(
      '"reasoningLevel":"medium"',
    );
    expect(await reasoning.search({ ...query, query: "ultra" })).toEqual([]);
    await host.lifecycle.dispose();
  });

  it("uses the thread environment and keeps results when another provider fails", async () => {
    const host = setup();
    host.sdk.stub("threads.get", async () =>
      makeThreadResponse({ environmentId: "env-workspace" }),
    );
    host.sdk.stub("providers.models", async (args: ModelArgs) => {
      expect(args?.environmentId).toBe("env-workspace");
      if (args?.providerId === "openrouter")
        throw new Error("Authentication required");
      return {
        models: [model("opus", "Opus")],
        selectedOnlyModels: [],
        modelLoadError: null,
      };
    });
    const mentions = host.registrations.mentionProviders.find(
      (p) => p.id === "model",
    )!;
    const items = await mentions.search({
      trigger: "@",
      query: "OPUS",
      projectId: "proj-workspace",
      threadId: "thr-workspace",
    });
    expect(items.map((item) => item.subtitle)).toEqual(["Model · Claude Code"]);
    expect(host.sdk.callsTo("providers.list")[0]).toEqual([
      { environmentId: "env-workspace", signal: expect.any(AbortSignal) },
    ]);
    await host.lifecycle.dispose();
  });

  it("matches model IDs and provider names without offering hidden or unavailable models", async () => {
    const host = setup();
    host.sdk.stub("providers.models", async (args: ModelArgs) => ({
      models: [model("anthropic/claude-opus", "Opus")],
      selectedOnlyModels: [model("hidden-model", "Hidden")],
      modelLoadError:
        args?.providerId === "claude-code" ? { code: "failed" } : null,
    }));
    const mentions = host.registrations.mentionProviders.find(
      (p) => p.id === "model",
    )!;
    const query = {
      trigger: "@" as const,
      query: "",
      projectId: null,
      threadId: null,
    };
    expect(await mentions.search(query)).toEqual([]);
    expect(await mentions.search({ ...query, query: "hidden" })).toEqual([]);
    expect(
      await mentions.search({ ...query, query: "anthropic opus" }),
    ).toHaveLength(1);
    expect(
      await mentions.search({ ...query, query: "OpenRouter" }),
    ).toHaveLength(1);
    await host.lifecycle.dispose();
  });

  it("rejects malformed mention IDs", async () => {
    const host = setup();
    for (const provider of host.registrations.mentionProviders) {
      expect(() => provider.resolve("%bad")).toThrow();
      expect(() =>
        provider.resolve(encodeURIComponent('{"providerId":"codex"}')),
      ).toThrow();
      expect(() => provider.resolve("x".repeat(8193))).toThrow();
    }
    await host.lifecycle.dispose();
  });

  it("keeps SVG provider icon aliases stable across searches and reloads", async () => {
    const host = setup();
    host.sdk.stub("providers.list", async () =>
      providers.map((p) => ({
        ...p,
        icon: undefined,
        logoUrl: `/providers/${p.id}/logo`,
      })),
    );
    const query = {
      trigger: "@" as const,
      query: "opus",
      projectId: null,
      threadId: null,
    };
    const mentions = () =>
      host.registrations.mentionProviders.find((p) => p.id === "model")!;
    const [first, concurrent] = await Promise.all([
      mentions().search(query),
      mentions().search(query),
    ]);
    expect(first.map((item) => item.icon)).toEqual([
      "model-mentions/provider-0",
      "model-mentions/provider-1",
    ]);
    expect(concurrent.map((item) => item.icon)).toEqual(
      first.map((item) => item.icon),
    );
    const reloaded = await host.lifecycle.reload(plugin);
    reloaded.harness.sdk.stub("providers.list", async () =>
      providers.map((p) => ({
        ...p,
        icon: undefined,
        logoUrl: `/providers/${p.id}/logo`,
      })),
    );
    const restored = reloaded.harness.registrations.mentionProviders.find(
      (p) => p.id === "model",
    )!;
    expect((await restored.search(query)).map((item) => item.icon)).toEqual(
      first.map((item) => item.icon),
    );
    expect(
      await reloaded.harness.behavior.callRpc("icons.directory", null),
    ).toEqual(["claude-code", "openrouter"]);
    await reloaded.harness.lifecycle.dispose();
  });

  it("uses only public SDK surfaces", async () => {
    const scan = await experimental_scanPublicSdkOnly(process.cwd(), {
      allow: [/^vitest\/config$/u, /^react$/u],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});
