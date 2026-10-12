// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, expect, it } from "vitest";
import app from "./app";
import { draftStore } from "./draft-store";

afterEach(async () => { cleanup(); await draftStore.clear("/server/AGENTS.md"); });

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

it("restores an unsaved draft after the settings page is unmounted", async () => {
  const first = await mount();
  const source = await plainText(first);
  fireEvent.change(source, { target: { value: "Keep this unsaved draft." } });
  first.lifecycle.unmount();
  const reopened = await mount();
  const restored = await plainText(reopened);
  expect((restored as HTMLTextAreaElement).value).toBe("Keep this unsaved draft.");
  expect(reopened.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);
  reopened.lifecycle.unmount();
});

it("restores a stale draft without allowing it to overwrite the newer server file", async () => {
  await draftStore.write({ version: 1, id: "stale", mode: "plain", instructions: "My draft",
    base: { path: "/server/AGENTS.md", instructions: "Before", revision: "before" } });
  const slot = await mount("External update");
  const source = await slot.findByRole("textbox", { name: "Global instructions" });
  expect((source as HTMLTextAreaElement).value).toBe("My draft");
  expect((await slot.findByRole("alert")).textContent).toContain("File changed elsewhere");
  expect(slot.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(slot.getByRole("button", { name: "Reload latest" }));
  await waitFor(() => expect((source as HTMLTextAreaElement).value).toBe("External update"));
  expect(await draftStore.read("/server/AGENTS.md")).toBeNull();
  slot.lifecycle.unmount();
});

it("clears the checkpoint after saving so navigation opens the saved file", async () => {
  const slot = await mount();
  const source = await plainText(slot);
  fireEvent.change(source, { target: { value: "New rules" } });
  fireEvent.click(slot.getByRole("button", { name: "Save" }));
  await slot.findByText("Saved");
  await waitFor(async () => expect(await draftStore.read("/server/AGENTS.md")).toBeNull());
  slot.lifecycle.unmount();
  const reopened = await mount("New rules");
  await reopened.findByRole("textbox", { name: "Global instructions" });
  expect(reopened.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  reopened.lifecycle.unmount();
});
