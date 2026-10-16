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
  const previousRowActions = fixture.runJson(["thread-stages", "prefs", "get", "rowActions"]).value;
  const setRowActions = (value) => fixture.run(["thread-stages", "prefs", "set", "rowActions", JSON.stringify(value)]);
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
    setRowActions([]);
    await page.goto(new URL(`/projects/${project.id}/threads/${thread.id}`, stack.serverUrl).href);
    const target = row(sidebar(page), thread.id);
    await target.waitFor();
    assert.ok(sockets.length > 0, "The client has an active realtime connection");

    for (const labels of [["Release", "Update to 0.46.1"], ["Review"]]) {
      await context.setOffline(true);
      for (const socket of sockets.splice(0)) socket.close({ code: 1012, reason: "Reconnect regression" });
      const previous = await target.getByRole("button", { name: / in / }).allTextContents();
      await saveActions(labels);
      const quickAction = labels.length === 2 ? "Copy thread link" : "Rename";
      setRowActions([labels.length === 2 ? "bb--core/copyLink" : "bb--core/rename"]);
      assert.deepEqual(await target.getByRole("button", { name: / in / }).allTextContents(), previous,
        "The disconnected client misses the action change");
      assert.equal(await target.getByRole("button", { name: quickAction, exact: true }).count(), 0,
        "The disconnected client misses the preference change");

      await context.setOffline(false);
      for (const label of labels) {
        await target.getByRole("button", { name: `${label} in ${thread.title}`, exact: true }).waitFor();
      }
      assert.deepEqual(await target.getByRole("button", { name: / in / }).allTextContents(), labels,
        "Reconnect replaces stale action buttons without reloading the page");
      await target.hover();
      await target.getByRole("button", { name: quickAction, exact: true }).waitFor();
    }
  } finally {
    try {
      await context.setOffline(false);
      await saveActions([]);
      setRowActions(previousRowActions);
    } finally {
      await browser.close();
    }
  }
}
