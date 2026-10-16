import assert from "node:assert/strict";
import { applyPluginState, FEATURED_PROJECT, FEATURED_THREAD } from "../../screenshots/fixture.mjs";
import { launch, openContext, row, sidebar } from "./sidebar.mjs";

export async function verifyRealtimeReconnect({ stack, fixture }) {
  await applyPluginState({ stack, ...fixture });
  const browser = await launch();
  const thread = fixture.threads.get(FEATURED_THREAD);
  const project = fixture.projects.get(FEATURED_PROJECT);
  const rpc = new URL("/api/v1/plugins/thread-stages/rpc/saveThreadActionsV1", stack.serverUrl).href;
  const context = await openContext(browser);
  const page = await context.newPage();
  const sockets = [];
  await page.routeWebSocket("**", (socket) => {
    socket.connectToServer();
    sockets.push(socket);
  });
  const saveActions = async (labels) => {
    const response = await page.request.post(rpc, {
      data: { threadId: thread.id, actions: labels.map((label) => ({ id: label, label, prompt: `${label}.` })) },
    });
    assert.equal(response.status(), 200, "The server saves actions and publishes thread-actions-changed");
  };
  try {
    await saveActions([]);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const target = row(sidebar(page), thread.id);
    await target.waitFor();
    assert.ok(sockets.length > 0, "The client has an active realtime connection");

    for (const labels of [["Release", "Update to 0.46.1"], ["Review"]]) {
      await context.setOffline(true);
      for (const socket of sockets.splice(0)) socket.close({ code: 1012, reason: "Reconnect regression" });
      const previous = await target.getByRole("button", { name: / in / }).allTextContents();
      await saveActions(labels);
      assert.deepEqual(await target.getByRole("button", { name: / in / }).allTextContents(), previous,
        "The disconnected client misses the action change");

      await context.setOffline(false);
      for (const label of labels) {
        await target.getByRole("button", { name: `${label} in ${thread.title}`, exact: true }).waitFor();
      }
      assert.deepEqual(await target.getByRole("button", { name: / in / }).allTextContents(), labels,
        "Reconnect replaces stale action buttons without reloading the page");
    }
  } finally {
    try {
      await context.setOffline(false);
      await saveActions([]);
    } finally {
      await browser.close();
    }
  }
}
