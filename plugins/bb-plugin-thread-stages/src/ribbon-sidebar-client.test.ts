import { describe, expect, it, vi } from "vitest";
import {
  RibbonSidebarDependencyError,
  createRibbonSidebarClient,
} from "./ribbon-sidebar-client";

function rpcResponse(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Ribbon sidebar forwarding client", () => {
  it("forwards a strict placement update to Ribbon sidebar", async () => {
    const fetcher = vi.fn(async () =>
      rpcResponse({
        ok: true,
        value: {
          placement: {
            groupingKey: "plugin:thread-stages:stages",
            groupId: "Completed",
            threadId: "thr_1",
            enteredAtMs: 123,
            previousGroupId: "Idle",
            origin: "ui",
          },
          revision: 8,
        },
      }),
    );
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher,
    });

    await expect(
      client.updatePlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Completed",
        threadId: "thr_1",
        anchor: { kind: "end" },
        origin: "ui",
      }),
    ).resolves.toMatchObject({ ok: true, value: { revision: 8 } });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:38886/api/v1/plugins/ribbon-sidebar/rpc/updatePlacementV1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          groupingKey: "plugin:thread-stages:stages",
          groupId: "Completed",
          threadId: "thr_1",
          anchor: { kind: "end" },
          origin: "ui",
        }),
      }),
    );
  });

  it("validates successful RPC output instead of trusting the dependency", async () => {
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher: async () => rpcResponse({ ok: true, value: { revision: "8" } }),
    });

    await expect(
      client.updatePlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Idle",
        threadId: "thr_1",
        origin: "auto",
      }),
    ).rejects.toThrow("invalid output");
  });

  it("rejects domain errors that do not belong to the called operation", async () => {
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher: async () =>
        rpcResponse({
          ok: false,
          error: {
            code: "MEMBERSHIP_NOT_WRITABLE",
            message: "not a getPlacementV1 error",
          },
        }),
    });

    await expect(
      client.getPlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thr_1",
      }),
    ).rejects.toThrow("invalid output");
  });

  it("reports missing and failed dependencies with one stable error type", async () => {
    const failures = [
      async () => new Response("not found", { status: 404 }),
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "handler_error", message: "offline" },
          }),
          { status: 500 },
        ),
      async () => {
        throw new TypeError("fetch failed");
      },
    ];

    for (const fetcher of failures) {
      const client = createRibbonSidebarClient({
        baseUrl: "http://127.0.0.1:38886",
        fetcher,
      });
      await expect(
        client.invalidateGroupingCatalogV1({
          providerPluginId: "thread-stages",
        }),
      ).rejects.toBeInstanceOf(RibbonSidebarDependencyError);
    }
  });

  it("tells users how to restore the missing Ribbon dependency", async () => {
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher: async () => new Response("not found", { status: 404 }),
    });

    await expect(
      client.invalidateGroupingCatalogV1({
        providerPluginId: "thread-stages",
      }),
    ).rejects.toThrow("Install and enable Ribbon sidebar");
  });

  it("tells users how to restore a disabled or starting Ribbon dependency", async () => {
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher: async () => new Response("unavailable", { status: 503 }),
    });

    await expect(
      client.invalidateGroupingCatalogV1({
        providerPluginId: "thread-stages",
      }),
    ).rejects.toThrow("Enable Ribbon sidebar or wait for it to finish starting");
  });

  it("retries one placement revision conflict with the returned revision", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        rpcResponse({
          ok: false,
          error: {
            code: "REVISION_CONFLICT",
            message: "stale revision",
            revision: 9,
          },
        }),
      )
      .mockResolvedValueOnce(
        rpcResponse({
          ok: true,
          value: {
            placement: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Active",
              threadId: "thr_1",
              enteredAtMs: 123,
              origin: "ui",
            },
            revision: 10,
          },
        }),
      );
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher,
    });

    await expect(
      client.updatePlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thr_1",
        expectedRevision: 8,
        origin: "ui",
      }),
    ).resolves.toMatchObject({ ok: true, value: { revision: 10 } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      expectedRevision: 9,
    });
  });

  it("does not retry an automated placement whose precondition became stale", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      rpcResponse({
        ok: false,
        error: {
          code: "REVISION_CONFLICT",
          message: "stale lifecycle observation",
          revision: 9,
        },
      }),
    );
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher,
    });

    await expect(
      client.updatePlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        groupId: "Active",
        threadId: "thr_1",
        expectedRevision: 8,
        origin: "auto",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT", revision: 9 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads authoritative placements for compatibility policy", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        rpcResponse({
          ok: true,
          value: {
            placement: {
              groupingKey: "plugin:thread-stages:stages",
              groupId: "Idle",
              threadId: "thr_1",
              enteredAtMs: 100,
              origin: "auto",
            },
            revision: 5,
          },
        }),
      )
      .mockResolvedValueOnce(
        rpcResponse({
          ok: true,
          value: {
            groupingKey: "plugin:thread-stages:stages",
            revision: 5,
            items: [
              {
                groupingKey: "plugin:thread-stages:stages",
                groupId: "Completed",
                threadId: "thr_2",
                enteredAtMs: 200,
                previousGroupId: "Idle",
                origin: "ui",
              },
            ],
          },
        }),
      );
    const client = createRibbonSidebarClient({
      baseUrl: "http://127.0.0.1:38886",
      fetcher,
    });

    await expect(
      client.getPlacementV1({
        groupingKey: "plugin:thread-stages:stages",
        threadId: "thr_1",
      }),
    ).resolves.toMatchObject({ ok: true, value: { revision: 5 } });
    await expect(
      client.listPlacementsV1({
        groupingKey: "plugin:thread-stages:stages",
        groupIds: ["Completed"],
        origins: ["ui"],
        enteredBeforeMs: 300,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { items: [{ threadId: "thr_2" }] },
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("/getPlacementV1"),
      expect.stringContaining("/listPlacementsV1"),
    ]);
  });
});
