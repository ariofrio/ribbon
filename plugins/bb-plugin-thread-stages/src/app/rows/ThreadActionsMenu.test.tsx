// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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

it("autosaves actions in the compact menu and maintains one trailing empty row on unfocus", async () => {
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
  expect(screen.queryByRole("button", { name: "Add action" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save actions" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Action 1 button label" }), {
    target: { value: "Review" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Action 1 prompt" }), {
    target: { value: "Review this change." },
  });
  fireEvent.blur(screen.getByRole("textbox", { name: "Action 1 prompt" }), {
    relatedTarget: screen.getByRole("textbox", { name: "Action 2 button label" }),
  });
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({
    method: "saveThreadActionsV1",
    input: {
      threadId: makeSidebarThread().id,
      actions: [{ id: expect.any(String), label: "Review", prompt: "Review this change." }],
    },
  }));
  expect(screen.getByRole("form", { name: "Edit thread actions" })).toBe(form);
  fireEvent.change(screen.getByRole("textbox", { name: "Action 2 button label" }), { target: { value: "Draft" } });
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  fireEvent.change(screen.getByRole("textbox", { name: "Action 2 button label" }), { target: { value: "" } });
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  fireEvent.blur(form, { relatedTarget: screen.getByRole("menuitem", { name: "Back" }) });
  expect(screen.getAllByRole("textbox")).toHaveLength(4);
  fireEvent.change(screen.getByRole("textbox", { name: "Action 2 button label" }), { target: { value: "Test" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Action 2 prompt" }), { target: { value: "Run tests." } });
  fireEvent.click(screen.getByRole("menuitem", { name: "Back" }));
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({
    method: "saveThreadActionsV1",
    input: {
      threadId: makeSidebarThread().id,
      actions: [
        { id: expect.any(String), label: "Review", prompt: "Review this change." },
        { id: expect.any(String), label: "Test", prompt: "Run tests." },
      ],
    },
  }));
});

it("keeps fields editable and serializes autosaves and removal while a save is pending", async () => {
  let finishFirstSave!: (value: { ok: true }) => void;
  let calls = 0;
  const slot = renderSlot({ component: CompactMenu }, {}, {
    rpc: {
      ...ribbonRpcStubs(),
      saveThreadActionsV1: () => ++calls === 1
        ? new Promise<{ ok: true }>((resolve) => { finishFirstSave = resolve; })
        : { ok: true },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit actions" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Action 1 button label" }), { target: { value: "Review" } });
  const prompt = screen.getByRole("textbox", { name: "Action 1 prompt" });
  fireEvent.change(prompt, { target: { value: "First prompt" } });
  fireEvent.blur(prompt);
  await waitFor(() => expect(calls).toBe(1));
  expect((prompt as HTMLTextAreaElement).disabled).toBe(false);
  fireEvent.change(prompt, { target: { value: "Latest prompt" } });
  fireEvent.blur(prompt);
  await act(async () => { await Promise.resolve(); });
  expect(calls).toBe(1);
  await act(async () => finishFirstSave({ ok: true }));
  await waitFor(() => expect(calls).toBe(2));
  expect(slot.inspection.rpcCalls.filter(({ method }) => method === "saveThreadActionsV1").at(-1)?.input).toEqual({
    threadId: makeSidebarThread().id,
    actions: [{ id: expect.any(String), label: "Review", prompt: "Latest prompt" }],
  });
  const label = screen.getByRole("textbox", { name: "Action 1 button label" });
  fireEvent.change(label, { target: { value: "" } });
  fireEvent.blur(label);
  await act(async () => { await Promise.resolve(); });
  expect(calls).toBe(2);
  fireEvent.change(label, { target: { value: "Review again" } });
  fireEvent.blur(label);
  await waitFor(() => expect(calls).toBe(3));
  fireEvent.click(screen.getByRole("button", { name: "Remove action 1" }));
  await waitFor(() => expect(calls).toBe(4));
  expect(slot.inspection.rpcCalls.filter(({ method }) => method === "saveThreadActionsV1").at(-1)?.input).toEqual({
    threadId: makeSidebarThread().id,
    actions: [],
  });
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  const emptyLabel = screen.getByRole("textbox", { name: "Action 1 button label" });
  fireEvent.click(screen.getByRole("button", { name: "Clear action 1" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  expect(screen.getByRole("textbox", { name: "Action 1 button label" })).toBe(emptyLabel);
  expect(document.activeElement).toBe(emptyLabel);
  await act(async () => { await Promise.resolve(); });
  expect(calls).toBe(4);
});
