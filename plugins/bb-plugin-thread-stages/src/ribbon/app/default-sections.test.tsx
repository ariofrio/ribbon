// @vitest-environment jsdom
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { makeSidebarProject } from "../../app/model/fixtures.js";
import {
  DefaultSectionsProvider,
  ProjectDefaultSectionMenu,
  SectionDefaultProjectsMenu,
} from "./default-sections";

type Defaults = Array<{ projectId: string; sectionId: string }>;

let defaults: Defaults;
let installed: boolean;
const calls: Array<{ method: string; input: unknown }> = [];

beforeEach(() => {
  defaults = [];
  installed = true;
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = url.split("/rpc/")[1]!;
      expect(url).toBe(`/api/v1/plugins/default-sections/rpc/${method}`);
      const input = JSON.parse(String(init.body)) as unknown;
      calls.push({ method, input });
      if (!installed) {
        return new Response(JSON.stringify({ ok: false, error: "unknown plugin" }), {
          status: 404,
        });
      }
      if (method === "setDefaultV1") {
        const { projectId, sectionId } = input as {
          projectId: string;
          sectionId: string | null;
        };
        defaults = defaults.filter((entry) => entry.projectId !== projectId);
        if (sectionId !== null) defaults.push({ projectId, sectionId });
      }
      return new Response(JSON.stringify({ ok: true, result: { defaults } }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sections = [
  { id: "sec_release", name: "Release", createdAt: 1, updatedAt: 1 },
  { id: "sec_later", name: "Later", createdAt: 2, updatedAt: 2 },
];
const projects = [
  makeSidebarProject({ id: "proj_personal", name: "Personal" }),
  makeSidebarProject({ id: "proj_store", name: "Storefront" }),
  makeSidebarProject({ id: "proj_docs", name: "Docs" }),
];

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <DefaultSectionsProvider>
      <DropdownMenu open>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>{children}</DropdownMenuContent>
      </DropdownMenu>
    </DefaultSectionsProvider>
  );
}

function render(children: React.ReactNode) {
  return renderSlot(
    { component: () => <Menu>{children}</Menu> },
    {},
    { sidebarThreads: { sections, projects } },
  );
}

async function openSubmenu(name: string) {
  fireEvent.keyDown(await screen.findByRole("menuitem", { name }), {
    key: "ArrowRight",
  });
}

it("sets a project's default section from its heading menu", async () => {
  defaults = [{ projectId: "proj_store", sectionId: "sec_later" }];
  render(<ProjectDefaultSectionMenu surface="dropdown" projectId="proj_store" />);

  await openSubmenu("Default section");
  expect(
    (await screen.findAllByRole("menuitemradio")).map((item) => [
      item.textContent,
      item.getAttribute("aria-checked"),
    ]),
  ).toEqual([
    ["Threads", "false"],
    ["Release", "false"],
    ["Later", "true"],
  ]);

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Release" }));
  await waitFor(() =>
    expect(calls.at(-1)).toEqual({
      method: "setDefaultV1",
      input: { projectId: "proj_store", sectionId: "sec_release" },
    }),
  );
});

it("clears a project's default by choosing Threads", async () => {
  defaults = [{ projectId: "proj_store", sectionId: "sec_later" }];
  render(<ProjectDefaultSectionMenu surface="dropdown" projectId="proj_store" />);

  await openSubmenu("Default section");
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "Threads" }));

  await waitFor(() =>
    expect(calls.at(-1)).toEqual({
      method: "setDefaultV1",
      input: { projectId: "proj_store", sectionId: null },
    }),
  );
});

it("toggles the projects a section is the default for", async () => {
  defaults = [{ projectId: "proj_docs", sectionId: "sec_release" }];
  render(<SectionDefaultProjectsMenu sectionId="sec_release" />);

  await openSubmenu("Default for");
  expect(
    (await screen.findAllByRole("menuitemcheckbox")).map((item) => [
      item.textContent,
      item.getAttribute("aria-checked"),
    ]),
  ).toEqual([
    ["Storefront", "false"],
    ["Docs", "true"],
  ]);

  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Storefront" }));
  await waitFor(() =>
    expect(calls.at(-1)).toEqual({
      method: "setDefaultV1",
      input: { projectId: "proj_store", sectionId: "sec_release" },
    }),
  );
});

it("draws nothing for the personal project, which has no default", async () => {
  render(
    <>
      <ProjectDefaultSectionMenu surface="dropdown" projectId="proj_personal" />
      <span role="menuitem">Rename</span>
    </>,
  );

  await screen.findByRole("menuitem", { name: "Rename" });
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(screen.queryByRole("menuitem", { name: "Default section" })).toBeNull();
});

it("draws nothing while Default sections is not installed", async () => {
  installed = false;
  render(
    <>
      <ProjectDefaultSectionMenu surface="dropdown" projectId="proj_store" />
      <SectionDefaultProjectsMenu sectionId="sec_release" />
    </>,
  );

  await waitFor(() => expect(calls).toHaveLength(1));
  expect(screen.queryByRole("menuitem", { name: "Default section" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Default for" })).toBeNull();
});
