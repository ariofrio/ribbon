// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { installTestPluginRuntime, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { CompactViewportOverrideProvider } from "@/components/ui/hooks/use-compact-viewport";
import { RibbonDataProvider } from "../../ribbon/app/data";
import { ribbonRpcStubs } from "../../ribbon/app/test-support";
import { makeSidebarThread } from "../model/fixtures";
import { ThreadActionsMenu } from "./ThreadActionsMenu";

installTestPluginRuntime();
afterEach(cleanup);

function CompactMenu() {
  return (
    <CompactViewportOverrideProvider isCompactViewport>
      <RibbonDataProvider>
        <ThreadActionsMenu thread={makeSidebarThread()} onRename={() => {}} />
      </RibbonDataProvider>
    </CompactViewportOverrideProvider>
  );
}

it("edits actions inside the compact menu and saves without opening another dialog", async () => {
  const slot = renderSlot({ component: CompactMenu }, {}, {
    rpc: {
      ...ribbonRpcStubs(),
      saveThreadActionsV1: () => ({ ok: true }),
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit actions" }));
  const form = await screen.findByRole("form", { name: "Edit thread actions" });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add action" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Action 1 button label" }), {
    target: { value: "Review" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Action 1 prompt" }), {
    target: { value: "Review this change." },
  });
  fireEvent.submit(form);
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({
    method: "saveThreadActionsV1",
    input: {
      threadId: makeSidebarThread().id,
      actions: [{ id: expect.any(String), label: "Review", prompt: "Review this change." }],
    },
  }));
  await waitFor(() => expect(screen.queryByRole("form", { name: "Edit thread actions" })).toBeNull());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
