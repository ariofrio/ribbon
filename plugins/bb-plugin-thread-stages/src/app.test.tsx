// @vitest-environment jsdom
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("thread stages app registration", () => {
  it("registers shortcuts without replacing the sidebar", async () => {
    const app = await loadPluginApp(() => import("./app"));

    expect(app.threadLists).toHaveLength(0);
    expect(app.contentScripts.map(({ id }) => id)).toEqual([
      "workflow-shortcuts",
    ]);
  });

  it("keeps stage shortcuts active with Ribbon as the sidebar", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/settings")) {
        return jsonResponse({ values: {} });
      }
      if (url.endsWith("/rpc/listAppKeybindings")) {
        return jsonResponse({ ok: true, result: { keybindings: [] } });
      }
      if (url.endsWith("/rpc/setWorkflowStage")) {
        return jsonResponse({
          ok: true,
          result: { destination: { kind: "stay" } },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", "/threads/thread-a");
    document.body.innerHTML = `
      <div
        data-ribbon-sidebar-root
        data-ribbon-sidebar-scope-grouping-key="builtin:projects"
        data-ribbon-sidebar-scope-group-id="project-a"
      ></div>
    `;
    const app = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(app, {
      pluginId: "thread-stages",
      generation: 1,
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Period",
        key: ".",
        metaKey: true,
      }),
    );

    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "/api/v1/plugins/thread-stages/rpc/setWorkflowStage",
        expect.objectContaining({
          body: JSON.stringify({
            workflowStage: "Completed",
            threadId: "thread-a",
            scope: {
              groupingKey: "builtin:projects",
              groupId: "project-a",
            },
          }),
        }),
      );
    });
    await mounted.lifecycle.dispose();
  });
});
