// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IconsRpc } from "./icons-client";
import { useIcons } from "./use-icons";

afterEach(cleanup);

const STATE: Awaited<ReturnType<IconsRpc["list"]>> = {
  icons: [],
  defaults: { project: [], personal: [], section: [] },
  projects: [],
  projectsRead: true,
};

function rpc(): IconsRpc {
  return {
    list: vi.fn(async () => STATE),
    listCatalog: vi.fn(async () => ({ icons: [] })),
    set: vi.fn(async () => null),
    clear: vi.fn(async () => null),
  };
}

describe("useIcons", () => {
  it("returns the same controller while nothing it holds has changed", async () => {
    const client = rpc();
    const hook = renderHook(() => useIcons(client));
    await waitFor(() => expect(hook.result.current.state).not.toBeNull());
    const settled = hook.result.current;
    hook.rerender();
    hook.rerender();
    expect(hook.result.current).toBe(settled);
  });
});
