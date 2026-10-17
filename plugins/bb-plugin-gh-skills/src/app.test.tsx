// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import app from "./app";

beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {} unobserve() {} disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("installs from a repository with explicit pinning and refreshes server inventory", async () => {
  const loaded = await loadPluginApp(async () => app);
  let installed = false;
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "" }, {
    rpc: {
      "skills.list": () => ({ directory: "/server/skills", skills: installed ? [
        { id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: true, path: "/server/skills/models" },
      ] : [] }),
      "skills.install": () => { installed = true; return { output: "Installed models" }; },
    },
  });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
  fireEvent.change(slot.getByRole("textbox", { name: "Repository" }), { target: { value: "example/skills" } });
  fireEvent.change(slot.getByRole("textbox", { name: "Skill name or path" }), { target: { value: "models" } });
  fireEvent.change(slot.getByRole("textbox", { name: "Pin to tag, branch, or SHA" }), { target: { value: "v1" } });
  fireEvent.click(slot.getByRole("button", { name: "Install" }));
  await slot.findByRole("button", { name: "Open models" });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.install", input: {
    repository: "example/skills", skill: "models", pin: "v1", all: false, force: false, allowHidden: false,
  } });
  slot.lifecycle.unmount();
});

test("checks updates, updates a skill, and requires confirmation before removal", async () => {
  const loaded = await loadPluginApp(async () => app);
  let removed = false;
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "" }, { rpc: {
    "skills.list": () => ({ directory: "/server/skills", skills: removed ? [] : [{
      id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: false, path: "/server/skills/models",
    }] }),
    "skills.update": (input) => ({ output: (input as { dryRun?: boolean }).dryRun ? "One update available" : "Updated models" }),
    "skills.remove": () => { removed = true; return { output: "Removed models" }; },
  } });
  await slot.findByRole("button", { name: "Open models" });
  fireEvent.click(slot.getByRole("button", { name: "Check for updates" }));
  await slot.findByText("One update available");
  fireEvent.click(slot.getByRole("button", { name: "Update models" }));
  await slot.findByText("Updated models");
  fireEvent.click(slot.getByRole("button", { name: "Remove models" }));
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.remove")).toBe(false);
  fireEvent.click(slot.getByRole("button", { name: "Remove skill" }));
  await slot.findByText("No skills installed");
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.update", input: { all: true, dryRun: true } });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.update", input: { id: "models" } });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.remove", input: { id: "models" } });
  slot.lifecycle.unmount();
});

test("searches GitHub and previews a result before opening its install form", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "" }, { rpc: {
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.search": () => ({ skills: [{ skillName: "models", namespace: "", repo: "example/skills", path: "skills/models/SKILL.md", description: "Query available models", stars: 12 }] }),
    "skills.preview": () => ({ output: "Skill documentation before installation" }),
  } });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("tab", { name: "Browse" }));
  fireEvent.change(slot.getByRole("textbox", { name: "Search GitHub skills" }), { target: { value: "models" } });
  fireEvent.click(slot.getByRole("button", { name: "Search" }));
  await slot.findByText("Query available models");
  fireEvent.click(slot.getByRole("button", { name: "Preview models" }));
  await slot.findByText("Skill documentation before installation");
  fireEvent.click(slot.getByRole("button", { name: "Close" }));
  fireEvent.click(slot.getByRole("button", { name: "Install models" }));
  await waitFor(() => expect((slot.getByRole("textbox", { name: "Repository" }) as HTMLInputElement).value).toBe("example/skills"));
  expect((slot.getByRole("textbox", { name: "Skill name or path" }) as HTMLInputElement).value).toBe("skills/models/SKILL.md");
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.install")).toBe(false);
  slot.lifecycle.unmount();
});

test("keeps the install form editable after gh reports an error", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "" }, { rpc: {
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.install": () => { throw new Error("Run gh auth login on the BB server"); },
  } });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
  fireEvent.change(slot.getByRole("textbox", { name: "Repository" }), { target: { value: "example/private-skills" } });
  fireEvent.change(slot.getByRole("textbox", { name: "Skill name or path" }), { target: { value: "models" } });
  fireEvent.click(slot.getByRole("button", { name: "Install" }));
  expect((await slot.findByRole("alert")).textContent).toBe("Run gh auth login on the BB server");
  expect((slot.getByRole("textbox", { name: "Repository" }) as HTMLInputElement).value).toBe("example/private-skills");
  expect((slot.getByRole("button", { name: "Install" }) as HTMLButtonElement).disabled).toBe(false);
  slot.lifecycle.unmount();
});
