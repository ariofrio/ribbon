// Screenshot-only state: the end-to-end suites keep their original fixture.
// Real plugin APIs and scripted ACP catalogs exercise the same interactions
// without reaching a model service or depending on the capturing host's login.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT, FEATURED_THREAD } from "./fixture.mjs";
import { fetchFromStack } from "./fetch.mjs";

export const TITLE_SHOWCASE = {
  title: "Repair webhook retry backoff",
  prompt: "Investigate https://github.com/atlas/atlas-api/issues/214",
  reply: "The third retry stalls because the backoff timer is never reset.\n\nI reset the timer after each delivery attempt and added a regression test for recovery after the third failure. All 12 webhook tests pass.",
};

async function rpc(stack, plugin, method, data) {
  const response = await fetchFromStack(new URL(`/api/v1/plugins/${plugin}/rpc/${method}`, stack.serverUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`${plugin}.${method}: ${JSON.stringify(body)}`);
  return body.result;
}

export async function prepareShowcase({ fixture, stack }) {
  // Native providers can discover the host's CLIs and accounts even in an
  // empty bb data directory. Only scripted providers belong in this catalog.
  for (const provider of fixture.runJson(["provider", "list", "--all"])) {
    if (provider.id !== `acp-${AGENT.id}`) fixture.run(["provider", "disable", provider.id]);
  }
  const providerDir = join(stack.dataDir, "fixture-provider");
  const original = readFileSync(join(providerDir, "server.ts"), "utf8");
  const declaration = JSON.parse(original.match(/bb\.providers\.register\((.+)\);/u)[1]);
  const builtins = fileURLToPath(new URL("../../node_modules/bb-app/server/dist/builtin-plugins/", import.meta.url));
  for (const [id, displayName, icon] of [
    ["claude-code", "Claude Code", "claude-code"],
    ["pi", "Pi", "pi"],
  ]) {
    const directory = join(stack.dataDir, `showcase-${id}`);
    mkdirSync(directory, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(providerDir, "package.json"), "utf8"));
    manifest.name = `bb-plugin-showcase-${id}`;
    manifest.bb.name = `Showcase ${displayName}`;
    manifest.bb.branding.icon = "./icon.svg";
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    copyFileSync(join(providerDir, "host.ts"), join(directory, "host.ts"));
    copyFileSync(join(builtins, `provider-${id}`, "icons", `${icon}.svg`), join(directory, "icon.svg"));
    const provider = structuredClone(declaration);
    provider.id = `acp-showcase-${id}`;
    provider.displayName = displayName;
    provider.icon = "./icon.svg";
    provider.experimental_bridgeOptions.acpLaunchSpec.env.BB_SCREENSHOT_MODELS = JSON.stringify([
      { modelId: "opus", name: "Opus" },
      { modelId: "sonnet", name: "Sonnet" },
    ]);
    provider.experimental_bridgeOptions.acpLaunchSpec.env.BB_SCREENSHOT_MODEL_ID = "sonnet";
    writeFileSync(join(directory, "server.ts"), `export default function(bb) { bb.providers.register(${JSON.stringify(provider)}); }\n`);
    fixture.run(["plugin", "install", directory, "--yes"]);
  }

  await rpc(stack, "thread-stages", "saveThreadActionsV1", {
    threadId: fixture.threads.get(FEATURED_THREAD).id,
    actions: [{ id: "review", label: "Review", prompt: "Review the dashboard changes and address any findings.", steer: false }],
    hideTitle: false,
  });
  const project = fixture.projects.get("atlas-api");
  const child = fixture.runJson([
    "thread", "spawn", "--project", project.id, "--machine", "screenshots",
    "--environment", project.root, "--parent-thread", fixture.threads.get("Investigate webhook retries").id,
    "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--title", "Trace the backoff timer", "--permission-mode", "accept-edits",
    "--prompt", "Trace the retry backoff timer.",
  ]);
  fixture.run(["thread", "wait", child.id, "--status", "idle"]);
  fixture.run(["thread-stages", "stage", "Active", child.id]);
  fixture.showcaseChild = child;
  // Keep the working threads first, with quieter blocked work underneath.
  fixture.run(["thread-stages", "order", fixture.threads.get(FEATURED_THREAD).id, "--by", "section", "--first"]);
  fixture.run(["thread-stages", "order", fixture.threads.get("Investigate webhook retries").id, "--by", "section", "--after", fixture.threads.get(FEATURED_THREAD).id]);
}

export async function seedTitleShowcase({ fixture, stack }) {
  const path = join(stack.dataDir, "transcripts.json");
  const transcripts = JSON.parse(readFileSync(path, "utf8"));
  transcripts.unshift(
    { prompt: TITLE_SHOWCASE.prompt, updates: [chunk(TITLE_SHOWCASE.reply)] },
    { prompt: "Generate a concise sentence-case title*", updates: [chunk(JSON.stringify({ title: TITLE_SHOWCASE.title }))] },
  );
  writeFileSync(path, JSON.stringify(transcripts));
  fixture.run(["plugin", "config", "thread-titles", "set", "titleFirstMessage", "false"]);
  await rpc(stack, "thread-titles", "selection.set", {
    selection: { providerId: `acp-${AGENT.id}`, model: AGENT.modelId, reasoningLevel: "low" },
  });
  const project = fixture.projects.get("atlas-api");
  const thread = fixture.runJson([
    "thread", "spawn", "--project", project.id, "--machine", "screenshots",
    "--environment", project.root, "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
    "--permission-mode", "accept-edits", "--prompt", TITLE_SHOWCASE.prompt,
  ]);
  fixture.run(["thread", "wait", thread.id, "--status", "idle"]);
  fixture.run(["thread", "update", thread.id, "--section", fixture.section.id]);
  fixture.run(["thread-stages", "stage", "Active", thread.id]);
  fixture.run(["thread", "read", thread.id]);
  fixture.titleShowcase = thread;
}

function chunk(text) {
  return { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
}
