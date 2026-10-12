// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { draftStore } from "./draft-store";
import { mountDraftIndicator } from "./draft-indicator";

afterEach(async () => { document.body.replaceChildren(); await draftStore.clear("/server/AGENTS.md"); });

it("follows the settings entry across navigation and removes its nodes on disposal", async () => {
  const controller = new AbortController();
  const dispose = mountDraftIndicator({ pluginId: "global-instructions", generation: 1, signal: controller.signal });
  await draftStore.write({ version: 1, id: "draft", base: { path: "/server/AGENTS.md", instructions: "Base", revision: "base" }, instructions: "Changed", mode: "rich" });
  const sidebar = document.createElement("div");
  sidebar.dataset.sidebar = "sidebar";
  document.body.append(sidebar);
  const installEntry = () => {
    const link = document.createElement("a");
    link.href = "/settings/plugins/global-instructions";
    link.textContent = "Global instructions";
    sidebar.replaceChildren(link);
    return link;
  };
  const first = installEntry();
  await waitFor(() => expect(first.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull());
  const replacement = installEntry();
  delete sidebar.dataset.sidebar;
  sidebar.dataset.testid = "settings-sidebar-body";
  await waitFor(() => expect(replacement.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull());
  await draftStore.clear("/server/AGENTS.md", "draft");
  await waitFor(() => expect(replacement.querySelector('[aria-label="Unsaved changes"]')).toBeNull());
  await draftStore.write({ version: 1, id: "another", base: { path: "/server/AGENTS.md", instructions: "Base", revision: "base" }, instructions: "Changed again", mode: "rich" });
  await waitFor(() => expect(replacement.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull());
  controller.abort();
  await dispose();
  expect(replacement.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
});
