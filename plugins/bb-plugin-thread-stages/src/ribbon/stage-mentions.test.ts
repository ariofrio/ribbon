import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";
import { registerStageMentions } from "./stage-mentions";

it("offers Waiting independently of both blocker stages", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
  registerStageMentions(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  const search = (query: string) => provider.search({
    query, trigger: "@", projectId: null, threadId: null,
  });
  expect(await search("wait")).toEqual([
    expect.objectContaining({ id: "waiting", title: "Waiting" }),
  ]);
  expect(await search("another")).toEqual([
    expect.objectContaining({ id: "blockedonotheragent", title: "Blocked on another thread" }),
  ]);
  expect(await search("external")).toEqual([
    expect.objectContaining({ id: "blockedonthirdparty", title: "Blocked on external party" }),
  ]);
  await harness.lifecycle.dispose();
});

it("keeps saved mention IDs resolving with the current meanings", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
  registerStageMentions(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  for (const [id, label] of [
    ["idle", "Active"],
    ["waiting", "Waiting"],
    ["blockedonotheragent", "Blocked on another thread"],
    ["blockedonthirdparty", "Blocked on external party"],
  ]) {
    expect(await provider.resolve(id!)).toMatchObject({
      context: expect.stringContaining(`@${label} is the ${label} workflow stage`),
    });
  }
  expect(await provider.resolve("blocked")).toMatchObject({
    context: expect.stringContaining("Blocked on another thread"),
  });
  await harness.lifecycle.dispose();
});
