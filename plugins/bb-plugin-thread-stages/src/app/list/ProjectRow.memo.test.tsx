// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { memo } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { makeSidebarThread } from "../model/fixtures.js";
import { NO_COLLAPSED_CHILD_ACTIVITY } from "../model/thread-activity.js";
const { draw } = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock("../rows/ThreadRow.js", async (original) => ({
  ...(await original<typeof import("../rows/ThreadRow.js")>()),
  ThreadRow: memo((props: unknown) => {
    draw(props);
    return null;
  }),
}));
installTestPluginRuntime();
const { ThreadTreeNodeRow } = await import("./ProjectRow.js");
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not redraw an unchanged leaf when its surrounding tree is rebuilt", () => {
  const thread = makeSidebarThread({ id: "leaf" }),
    collapsed = new Set<string>(),
    toggle = () => {};
  const tree = (depthOffset = 0) => (
    <ThreadTreeNodeRow
      projectId={thread.projectId}
      node={{
        thread,
        children: [],
        depth: 0,
        stats: {
          childCount: 0,
          childActivity: { ...NO_COLLAPSED_CHILD_ACTIVITY },
        },
      }}
      depthOffset={depthOffset}
      isEnvGrouped={false}
      collapsedThreadIds={collapsed}
      collapsedEnvironmentIds={collapsed}
      onToggleThreadCollapsed={toggle}
      onToggleEnvironmentCollapsed={toggle}
    />
  );
  const view = render(tree());
  expect(draw).toHaveBeenCalledOnce();
  view.rerender(tree());
  expect(draw).toHaveBeenCalledOnce();
  view.rerender(tree(1));
  expect(draw).toHaveBeenCalledTimes(2);
  expect(draw.mock.calls.at(-1)![0].options.depth).toBe(1);
});
