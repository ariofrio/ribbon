// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import app from "./app";

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); vi.stubGlobal("ResizeObserver", class {
  observe() {} unobserve() {} disconnect() {}
}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("provides sidebar pages, hides the thread list, and restores native content on unmount", async () => {
  const host = document.createElement("aside");
  host.innerHTML = `<div data-sidebar="sidebar"><div data-testid="app-sidebar-body">
    <div data-testid="app-sidebar-top-reserve-row"><div data-sidebar-header-slot><button>New thread</button></div></div>
    <div data-sidebar="content"><div style="display:grid"><button>Existing thread</button></div></div>
    <div data-sidebar="footer">Native footer</div><div data-testid="app-sidebar-resize-handle">Resize</div>
  </div></div>`;
  document.body.append(host);
  const native = host.querySelector<HTMLElement>('[data-sidebar="content"] > div')!;
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
  } });
  try {
    const sidebar = await slot.findByRole("navigation", { name: "Skills navigation" });
    expect(getComputedStyle(native).display).toBe("none");
    expect(getComputedStyle(host.querySelector('[data-sidebar="footer"]')!).display).toBe("none");
    expect(getComputedStyle(host.querySelector('[data-testid="app-sidebar-resize-handle"]')!).display).not.toBe("none");
    expect(within(sidebar).getByRole("link", { name: "Installed", current: "page" })).toBeTruthy();
    expect(slot.queryByRole("tab", { name: "Browse" })).toBeNull();
    fireEvent.click(within(sidebar).getByRole("link", { name: "Browse" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "skills", options: { subPath: "browse" } });
    slot.lifecycle.unmount();
    expect(getComputedStyle(native).display).toBe("grid");
    expect(getComputedStyle(host.querySelector('[data-sidebar="footer"]')!).display).not.toBe("none");
    expect(host.querySelector('[data-gh-skills-sidebar]')).toBeNull();
  } finally { slot.lifecycle.unmount(); host.remove(); }
});

test("reattaches sidebar navigation when BB replaces its sidebar and keeps a fallback without it", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
  } });
  await slot.findByText("No skills installed");
  expect(slot.getByRole("tab", { name: "Browse" })).toBeTruthy();
  const host = document.createElement("aside");
  const nativeSidebar = '<div data-testid="app-sidebar-body"><div data-testid="app-sidebar-top-reserve-row"></div><div data-sidebar="content"><div style="display:grid">Native thread list</div></div><div data-testid="app-sidebar-resize-handle"></div></div>';
  host.innerHTML = nativeSidebar;
  document.body.append(host);
  try {
    await slot.findByRole("navigation", { name: "Skills navigation" });
    host.innerHTML = nativeSidebar;
    const native = host.querySelector<HTMLElement>('[data-sidebar="content"] > div')!;
    await waitFor(() => {
      expect(getComputedStyle(native).display).toBe("none");
      expect(within(host).getByRole("link", { name: "Installed" })).toBeTruthy();
    });
    slot.lifecycle.unmount();
    expect(getComputedStyle(native).display).toBe("grid");
  } finally { slot.lifecycle.unmount(); host.remove(); }
});

test("keeps an unfamiliar BB sidebar visible and falls back to in-page navigation", async () => {
  const host = document.createElement("aside");
  host.innerHTML = '<div data-testid="app-sidebar-body"><div data-sidebar="content"><div style="display:grid">Native thread list</div></div></div>';
  document.body.append(host);
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
  } });
  try {
    await slot.findByText("No skills installed");
    expect(getComputedStyle(host.querySelector('[data-sidebar="content"] > div')!).display).toBe("grid");
    expect(slot.getByRole("tab", { name: "Browse" })).toBeTruthy();
    expect(slot.queryByRole("navigation", { name: "Skills navigation" })).toBeNull();
  } finally { slot.lifecycle.unmount(); host.remove(); }
});

test("filters installed skills without a server search and offers a clear empty state", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [
      { id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: true, path: "/server/skills/models" },
      { id: "review", skillName: "review", sourceURL: "https://github.com/team/review", version: "v2", pinned: false, path: "/server/skills/review" },
    ] }),
  } });
  await slot.findByRole("button", { name: "Open models" });
  fireEvent.change(slot.getByRole("textbox", { name: "Search installed skills" }), { target: { value: "review" } });
  expect(slot.queryByRole("button", { name: "Open models" })).toBeNull();
  expect(slot.getByRole("button", { name: "Open review" })).toBeTruthy();
  fireEvent.change(slot.getByRole("textbox", { name: "Search installed skills" }), { target: { value: "missing" } });
  await slot.findByText('No skills match "missing".');
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.search")).toBe(false);
  slot.lifecycle.unmount();
});

test("opens an installed skill as a deep-linked detail page with a return to the collection", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed/models" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [{ id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: true, path: "/server/skills/models" }] }),
    "skills.read": () => ({ content: "# Model guide\n\nRead model documentation here." }),
  } });
  await slot.findByText(/Read model documentation here\./);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.getByRole("heading", { name: "models" })).toBeTruthy();
  fireEvent.click(slot.getByRole("button", { name: "Back to installed skills" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "skills", options: { subPath: "installed" } });
  slot.lifecycle.unmount();
});

test("installs from a repository with explicit pinning and refreshes server inventory", async () => {
  const loaded = await loadPluginApp(async () => app);
  let installed = false;
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, {
    rpc: {
      "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: installed ? [
        { id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: true, path: "/server/skills/models" },
      ] : [] }),
      "skills.install": () => { installed = true; return { output: "Installed models" }; },
    },
  });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
  fireEvent.change(slot.getByRole("textbox", { name: "Repository" }), { target: { value: "https://github.com/example/skills" } });
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
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.list": () => ({ directory: "/server/skills", skills: removed ? [] : [{
      id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: false, path: "/server/skills/models",
    }] }),
    "skills.check": () => ({ checkedAt: 1, output: "One update available", updates: [] }),
    "skills.update": () => ({ output: "Updated models" }),
    "skills.remove": () => { removed = true; return { output: "Removed models" }; },
  } });
  await slot.findByRole("button", { name: "Open models" });
  fireEvent.pointerDown(slot.getByRole("button", { name: "Skill actions" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Check for updates" }));
  const checkDialog = await slot.findByRole("dialog", { name: "Skill update check" });
  expect(within(checkDialog).getByText("One update available")).toBeTruthy();
  fireEvent.click(within(checkDialog).getByRole("button", { name: "Done" }));
  fireEvent.pointerDown(slot.getByRole("button", { name: "Actions for models" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Update" }));
  expect(slot.inspection.rpcCalls.filter((call) => call.method === "skills.update")).toHaveLength(0);
  fireEvent.click(await slot.findByRole("button", { name: "Update skill" }));
  await slot.findByText("Updated models");
  fireEvent.pointerDown(slot.getByRole("button", { name: "Actions for models" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Uninstall" }));
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.remove")).toBe(false);
  fireEvent.click(slot.getByRole("button", { name: "Uninstall skill" }));
  await slot.findByText("No skills installed");
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.check", input: { force: true } });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.update", input: { id: "models" } });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.remove", input: { id: "models" } });
  slot.lifecycle.unmount();
});

test("searches as the user types and installs a catalog result without re-entering its source", async () => {
  const loaded = await loadPluginApp(async () => app);
  let installed = false;
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "browse" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: installed ? [{ id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: false, path: "/server/skills/models" }] : [] }),
    "skills.search": () => ({ skills: [{ skillName: "models", namespace: "", repo: "example/skills", path: "skills/models/SKILL.md", description: "Query available models", stars: 12 }] }),
    "skills.install": () => { installed = true; return { output: "Installed models" }; },
  } });
  fireEvent.change(slot.getByRole("textbox", { name: "Search GitHub skills" }), { target: { value: "models" } });
  await slot.findByText("Query available models");
  fireEvent.click(slot.getByRole("button", { name: "Open models" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "skills", options: { subPath: "browse/example/skills/skills/models/SKILL.md" } });
  fireEvent.click(slot.getByRole("button", { name: "Install models" }));
  await slot.findByLabelText("models is installed");
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.install", input: { repository: "example/skills", skill: "skills/models/SKILL.md" } });
  slot.lifecycle.unmount();
});

test("keeps the install form editable after gh reports an error", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
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

test("shows the updated document immediately after updating an installed skill", async () => {
  const loaded = await loadPluginApp(async () => app);
  let version = "v1";
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed/models" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [{ id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version, pinned: false, path: "/server/skills/models" }] }),
    "skills.read": () => ({ content: `# Model guide\n\nInstructions from ${version}.` }),
    "skills.update": () => { version = "v2"; return { output: "Updated models" }; },
  } });
  await slot.findByText(/Instructions from v1\./);
  fireEvent.pointerDown(slot.getByRole("button", { name: "Actions for models" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Update" }));
  fireEvent.click(await slot.findByRole("button", { name: "Update skill" }));
  await slot.findByText(/Instructions from v2\./);
  expect(slot.queryByText(/Instructions from v1\./)).toBeNull();
  slot.lifecycle.unmount();
});

test("keeps the installed document visible when an update fails and the dialog is dismissed", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed/models" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [{ id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: false, path: "/server/skills/models" }] }),
    "skills.read": () => ({ content: "# Model guide\n\nAvailable offline instructions." }),
    "skills.update": () => { throw new Error("Upstream unavailable"); },
  } });
  await slot.findByText(/Available offline instructions/);
  fireEvent.pointerDown(slot.getByRole("button", { name: "Actions for models" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Update" }));
  const dialog = await slot.findByRole("dialog", { name: "Update models?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Update skill" }));
  await slot.findByText("Upstream unavailable");
  const failedDialog = slot.getByRole("dialog", { name: "Update models?" });
  await slot.behavior.emitRealtime("skills.changed", null);
  expect(within(failedDialog).getByText("Upstream unavailable")).toBeTruthy();
  fireEvent.click(within(failedDialog).getByRole("button", { name: "Cancel" }));
  expect(slot.getByText(/Available offline instructions/)).toBeTruthy();
  expect(slot.queryByRole("button", { name: "Retry" })).toBeNull();
  slot.lifecycle.unmount();
});

test("restores search and loaded results when reopening Skills and records the query in the URL", async () => {
  window.history.replaceState(null, "", "/plugins/gh-skills/skills/browse");
  const loaded = await loadPluginApp(async () => app);
  const options = { pluginId: "gh-skills", rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.search": () => ({ skills: [{ skillName: "models", namespace: "", repo: "example/skills", path: "skills/models/SKILL.md", description: "Search result to return to", stars: 12 }] }),
  } };
  const first = renderSlot(loaded.navPanels[0]!, { subPath: "browse" }, options);
  fireEvent.change(first.getByRole("textbox", { name: "Search GitHub skills" }), { target: { value: "restorable" } });
  await first.findByText("Search result to return to");
  expect(new URL(window.location.href).searchParams.get("query")).toBe("restorable");
  first.lifecycle.unmount();
  window.history.replaceState(null, "", "/");
  const reopened = renderSlot(loaded.navPanels[0]!, { subPath: "browse" }, options);
  expect((reopened.getByRole("textbox", { name: "Search GitHub skills" }) as HTMLInputElement).value).toBe("restorable");
  expect(reopened.getByText("Search result to return to")).toBeTruthy();
  reopened.lifecycle.unmount();
});

test("shows a command started in another window and restores its completion details", async () => {
  const loaded = await loadPluginApp(async () => app);
  let state = "running";
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.operation": () => ({ id: "operation-1", kind: "update", target: "models", state, startedAt: 1, ...(state === "succeeded" ? { output: "Updated models" } : {}) }),
  } });
  await slot.findByText("Updating models on the BB server…");
  expect((slot.getByRole("button", { name: "Install skill" }) as HTMLButtonElement).disabled).toBe(true);
  state = "succeeded";
  await slot.behavior.emitRealtime("skills.operation", null);
  await slot.findByText("Updated models");
  expect((slot.getByRole("button", { name: "Install skill" }) as HTMLButtonElement).disabled).toBe(false);
  slot.lifecycle.unmount();
});

test("selects a discovered skill at a pin and previews it inline before installing", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.check": () => ({ checkedAt: 1, output: "All skills are up to date.", updates: [] }),
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.discover": () => ({ output: "models\tQuery models", skills: [{ name: "models", description: "Query models" }] }),
    "skills.preview": () => ({ output: "Terminal preview", content: "# Model guide\n\nFormatted instructions.", ref: "v1", sourcePath: "skills/models/SKILL.md" }),
  } });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
  const dialog = slot.getByRole("dialog", { name: "Install skill" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Repository" }), { target: { value: "example/skills" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Pin to tag, branch, or SHA" }), { target: { value: "v1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "List repository skills" }));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Use models" }));
  expect((within(dialog).getByRole("textbox", { name: "Skill name or path" }) as HTMLInputElement).value).toBe("models");
  fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
  await within(dialog).findByText(/Formatted instructions/);
  expect(slot.getAllByRole("dialog")).toHaveLength(1);
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.discover", input: { repository: "example/skills", pin: "v1", allowHidden: false } });
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "skills.preview", input: { repository: "example/skills", skill: "models@v1", allowHidden: false } });
  slot.lifecycle.unmount();
});

test("checks updates automatically and shows the candidate before confirmation", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.list": () => ({ directory: "/server/skills", skills: [{ id: "models", skillName: "models", sourceURL: "https://github.com/example/skills", version: "v1", pinned: false, path: "/server/skills/models", description: "Compare model providers" }] }),
    "skills.check": () => ({ checkedAt: 1, output: "One update available", updates: [{ skillName: "models", repository: "example/skills", from: "abc1234", to: "def5678", ref: "v2" }] }),
  } });
  await slot.findByText("Compare model providers");
  fireEvent.click(await slot.findByRole("button", { name: "Update models" }));
  const dialog = slot.getByRole("dialog", { name: "Update models?" });
  expect(within(dialog).getByText(/def5678/)).toBeTruthy();
  expect(within(dialog).getByText(/v2/)).toBeTruthy();
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.update")).toBe(false);
  slot.lifecycle.unmount();
});

test("offers discovery shelves before searching and opens a topic's full results", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "browse" }, { rpc: {
    "skills.operation": () => null,
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.search": (input) => ({ skills: [{ skillName: (input as { query: string }).query === "review" ? "review-guide" : "writing-guide", namespace: "", repo: "example/discovery", path: "skills/guide/SKILL.md", description: "A skill from GitHub", stars: 10 }] }),
  } });
  await slot.findByRole("heading", { name: "Code review" });
  await slot.findByRole("button", { name: "Open review-guide" });
  fireEvent.click(slot.getByRole("button", { name: "See all code review skills" }));
  expect((slot.getByRole("textbox", { name: "Search GitHub skills" }) as HTMLInputElement).value).toBe("review");
  await slot.findByRole("button", { name: "Open review-guide" });
  expect(slot.queryByRole("heading", { name: "Code review" })).toBeNull();
  slot.lifecycle.unmount();
});

test("closes the install dialog while the server continues installing", async () => {
  const loaded = await loadPluginApp(async () => app);
  let finish!: (value: { output: string }) => void;
  const pending = new Promise<{ output: string }>((resolve) => { finish = resolve; });
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
    "skills.install": () => pending,
  } });
  try {
    await slot.findByText("No skills installed");
    fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
    fireEvent.change(slot.getByRole("textbox", { name: "Repository" }), { target: { value: "example/skills" } });
    fireEvent.change(slot.getByRole("textbox", { name: "Skill name or path" }), { target: { value: "models" } });
    fireEvent.click(slot.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(slot.queryByRole("dialog", { name: "Install skill" })).toBeNull());
    await slot.findByText("Running on the BB server…");
  } finally { finish({ output: "Installed models" }); await slot.findByText("Installed models"); slot.lifecycle.unmount(); }
});

test("explains invalid repository input before starting an installation", async () => {
  const loaded = await loadPluginApp(async () => app);
  const slot = renderSlot(loaded.navPanels[0]!, { subPath: "installed" }, { rpc: {
    "skills.operation": () => null,
    "skills.list": () => ({ directory: "/server/skills", skills: [] }),
  } });
  await slot.findByText("No skills installed");
  fireEvent.click(slot.getByRole("button", { name: "Install skill" }));
  fireEvent.change(slot.getByRole("textbox", { name: "Repository" }), { target: { value: "https://example.com/not-github" } });
  fireEvent.change(slot.getByRole("textbox", { name: "Skill name or path" }), { target: { value: "models" } });
  fireEvent.click(slot.getByRole("button", { name: "Install" }));
  await slot.findByText("Enter OWNER/REPO or a GitHub repository URL.");
  expect(slot.inspection.rpcCalls.some((call) => call.method === "skills.install")).toBe(false);
  slot.lifecycle.unmount();
});
