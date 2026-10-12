// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, expect, it } from "vitest";
import app from "./app";

afterEach(cleanup);

async function plainText(slot: ReturnType<typeof renderSlot>) {
  await slot.findByRole("textbox", { name: "Global instructions" });
  fireEvent.mouseDown(slot.getByRole("tab", { name: "Plain text" }), { button: 0, ctrlKey: false });
  return slot.findByRole("textbox", { name: "Global instructions" });
}

async function mount(instructions = "# Rules\n\nKeep **important** details.\n") {
  const loaded = await loadPluginApp(async () => app);
  const snapshot = { instructions, revision: "original", path: "/server/AGENTS.md" };
  return renderSlot(loaded.settingsSections[0]!, {}, {
    rpc: {
      "instructions.read": () => snapshot,
      "instructions.save": (input) => ({
        status: "saved", snapshot: { ...snapshot, instructions: (input as { instructions: string }).instructions, revision: "saved" },
      }),
    },
  });
}

it("keeps exact Markdown when switching modes without editing", async () => {
  const original = "# Rules\r\n\r\nKeep **important** details.  \r\n";
  const slot = await mount(original);
  expect((await slot.findByRole("textbox", { name: "Global instructions" })).tagName).toBe("DIV");
  const source = await plainText(slot);
  expect((source as HTMLTextAreaElement).value).toBe(original.replaceAll("\r\n", "\n"));
  fireEvent.mouseDown(slot.getByRole("tab", { name: "Rich Markdown" }), { button: 0, ctrlKey: false });
  expect((await slot.findByRole("textbox", { name: "Global instructions" })).tagName).toBe("DIV");
  fireEvent.mouseDown(slot.getByRole("tab", { name: "Plain text" }), { button: 0, ctrlKey: false });
  expect(slot.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  expect(slot.inspection.rpcCalls.filter(c => c.method === "instructions.save")).toEqual([]);
  slot.lifecycle.unmount();
});

it("saves source exceeding Custom instructions' limit", async () => {
  const slot = await mount();
  const source = await plainText(slot);
  const instructions = "Rule.\n".repeat(1000);
  fireEvent.change(source, { target: { value: instructions } });
  fireEvent.click(slot.getByRole("button", { name: "Save" }));
  await slot.findByText("Saved");
  expect(slot.inspection.rpcCalls).toContainEqual({
    method: "instructions.save", input: { instructions, revision: "original" },
  });
  slot.lifecycle.unmount();
});

it("keeps the local draft when saving fails", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.settingsSections[0]!, {}, {
    rpc: {
      "instructions.read": () => ({ instructions: "Old", revision: "old", path: "/server/AGENTS.md" }),
      "instructions.save": () => { throw new Error("Disk is read-only"); },
    },
  });
  const source = await plainText(slot);
  fireEvent.change(source, { target: { value: "My draft" } });
  fireEvent.click(slot.getByRole("button", { name: "Save" }));
  await slot.findByRole("alert");
  expect((source as HTMLTextAreaElement).value).toBe("My draft");
  expect(slot.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);
  slot.lifecycle.unmount();
});

it("keeps the local draft on conflict until the user reloads the file", async () => {
  const loaded = await loadPluginApp(async () => app);
  const latest = { instructions: "External rules", revision: "external", path: "/server/AGENTS.md" };
  let changed = false;
  const slot = renderSlot(loaded.settingsSections[0]!, {}, {
    rpc: {
      "instructions.read": () => changed ? latest : { ...latest, instructions: "Old", revision: "old" },
      "instructions.save": () => { changed = true; return { status: "conflict", snapshot: latest }; },
    },
  });
  const source = await plainText(slot);
  fireEvent.change(source, { target: { value: "My draft" } });
  fireEvent.click(slot.getByRole("button", { name: "Save" }));
  await slot.findByRole("alert");
  expect((source as HTMLTextAreaElement).value).toBe("My draft");
  expect(slot.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(slot.getByRole("button", { name: "Reload latest" }));
  await waitFor(() => expect((source as HTMLTextAreaElement).value).toBe("External rules"));
  slot.lifecycle.unmount();
});
