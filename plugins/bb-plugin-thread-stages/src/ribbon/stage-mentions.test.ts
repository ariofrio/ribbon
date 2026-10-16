import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";
import { registerStageMentions } from "./stage-mentions";

it("offers six stages with distinct ownership", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
  registerStageMentions(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  const search = (query: string) => provider.search({
    query, trigger: "@", projectId: null, threadId: null,
  });
  expect(await search("wait")).toEqual([]);
  expect(await search("user")).toEqual([
    expect.objectContaining({ id: "blockedonuser", title: "Needs user" }),
  ]);
  expect(await search("in progress")).toEqual([
    expect.objectContaining({ id: "active", title: "In progress" }),
  ]);
  expect(await search("dependent")).toEqual([
    expect.objectContaining({ id: "blockedonotheragent", title: "Dependent" }),
  ]);
  expect(await search("blocked")).toEqual([
    expect.objectContaining({ id: "blockedonthirdparty", title: "Blocked" }),
  ]);
  await harness.lifecycle.dispose();
});

it("keeps saved mention IDs resolving with the current meanings", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
  registerStageMentions(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  for (const [id, label] of [
    ["idle", "In progress"],
    ["active", "In progress"],
    ["blockedonuser", "Needs user"],
    ["waiting", "In progress"],
    ["blockedonotheragent", "Dependent"],
    ["blockedonthirdparty", "Blocked"],
  ]) {
    expect(await provider.resolve(id!)).toMatchObject({
      context: expect.stringContaining(`@${label} is the ${label} workflow stage`),
    });
  }
  expect(await provider.resolve("blocked")).toMatchObject({
    context: expect.stringContaining("@Blocked is the Blocked workflow stage"),
  });
  await harness.lifecycle.dispose();
});

it("puts user decisions and review in Needs user only when independent work is exhausted", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "thread-stages" });
  registerStageMentions(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  for (const id of ["active", "waiting", "blockedonuser", "blocked"]) {
    const { context } = await provider.resolve(id) as { context: string };
    expect(context).toContain("Needs user");
    expect(context).toContain("independent work");
    expect(context).not.toContain("never Waiting or Blocked");
  }
  await harness.lifecycle.dispose();
});
