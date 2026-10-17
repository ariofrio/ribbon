// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import type { DefaultSection, defaultSectionsRpcContract } from "./server";

beforeAll(() => {
  // Radix Select scrolls the chosen option into view; jsdom lays nothing out.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(
  initial: DefaultSection[],
  sections = [
    { id: "sec_release", name: "Release" },
    { id: "sec_later", name: "Later" },
  ],
) {
  const app = await loadPluginApp(() => import("./app"));
  expect(app.settingsSections).toHaveLength(1);
  let stored = initial;
  return renderSlot<object, typeof defaultSectionsRpcContract>(
    app.settingsSections[0]!,
    {},
    {
      rpc: {
        readSettings: () => ({
          defaults: stored,
          projects: [
            { id: "proj_store", name: "Storefront" },
            { id: "proj_docs", name: "Docs" },
          ],
          sections,
        }),
        listDefaultsV1: () => ({ defaults: stored }),
        setDefaultV1: ({ projectId, sectionId }) => {
          stored = stored.filter((entry) => entry.projectId !== projectId);
          if (sectionId !== null) stored.push({ projectId, sectionId });
          return { defaults: stored };
        },
      },
    },
  );
}

function trigger(project: string) {
  return screen.getByRole("combobox", { name: `${project}'s default section` });
}

it("shows each project's default section, and Threads where there is none", async () => {
  await render([{ projectId: "proj_store", sectionId: "sec_later" }]);

  await waitFor(() => expect(trigger("Storefront").textContent).toBe("Later"));
  expect(trigger("Docs").textContent).toBe("Threads");
});

it("saves a project's new default section", async () => {
  const slot = await render([]);
  await waitFor(() => expect(trigger("Docs").textContent).toBe("Threads"));

  fireEvent.keyDown(trigger("Docs"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Release" }));

  await waitFor(() => expect(trigger("Docs").textContent).toBe("Release"));
  expect(slot.inspection.rpcCalls.at(-1)).toMatchObject({
    method: "setDefaultV1",
    input: { projectId: "proj_docs", sectionId: "sec_release" },
  });
});

it("explains what to do when there are no sections yet", async () => {
  await render([], []);

  await screen.findByText(/No sections yet/);
  expect(screen.queryByRole("combobox")).toBeNull();
});
