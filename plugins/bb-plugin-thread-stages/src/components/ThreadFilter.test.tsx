// @vitest-environment jsdom
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadFilter } from "./ThreadFilter";
import { CompactViewportOverrideProvider } from "@/vendor/components/ui/hooks/use-compact-viewport";

afterEach(cleanup);

describe("ThreadFilter", () => {
  const rocket = [["path", { d: "M1" }]] as const;
  const projects = [
    { id: "proj_alpha", name: "Alpha", isPersonal: false },
    { id: "proj_personal", name: "Personal", isPersonal: true },
  ] as const;
  const sections = [{ id: "section_waiting", name: "Waiting" }] as const;
  const actions = {
    onAddProjectLocalPath: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onRemoveProject: vi.fn(),
    onRemoveSection: vi.fn(),
    onRenameProject: vi.fn(),
    onRenameSection: vi.fn(),
  };

  it("places the active-filter indicator immediately after the label", () => {
    const { rerender } = render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={{ kind: "project", id: "proj_alpha" }}
        onChange={() => {}}
        onHide={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    const indicator = screen.getByLabelText("Threads are filtered");
    const options = screen.getByRole("button", {
      name: "Sections and projects options",
    });
    const actionsContainer = screen.getByTestId("thread-filter-actions");
    const trigger = screen.getByRole("button", {
      name: "Sections and projects: Alpha",
    });
    const label = within(trigger).getByText("Alpha");
    expect(indicator.parentElement?.parentElement).toBe(trigger);
    expect(label.nextElementSibling).toBe(indicator);
    expect(
      indicator.querySelector('[data-icon="FilterMailCircle"]'),
    ).not.toBeNull();
    expect(actionsContainer.className).toContain("bb-sidebar-hover-actions");
    expect(
      options.querySelector('[data-icon="MoreHorizontal"]'),
    ).not.toBeNull();

    fireEvent.keyDown(options, { key: "Enter" });
    expect(
      actionsContainer.getAttribute("data-sidebar-hover-actions-open"),
    ).toBe("true");
    expect(screen.getByLabelText("Threads are filtered")).toBe(indicator);

    rerender(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onHide={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Threads are filtered")).toBeNull();
  });

  it("uses a scoped sidebar label while keeping All in the menu option", () => {
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Sections and projects",
    });
    expect(trigger.querySelector('[data-icon="FolderLibrary"]')).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "New project" })
        .querySelector('[data-icon="FolderPlus"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "New section" })
        .querySelector('[data-icon="SectionAdd"]'),
    ).not.toBeNull();
    expect(
      within(screen.getByTestId("thread-filter-actions"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "New section",
      "New project",
      "Sections and projects options",
    ]);

    fireEvent.keyDown(trigger, { key: "Enter" });

    const menu = screen.getByRole("menu");
    expect(menu.className).toContain(
      "min-w-[var(--radix-dropdown-menu-trigger-width)]",
    );
    expect(within(menu).getByText("Sections")).toBeDefined();
    expect(within(menu).getByText("Projects")).toBeDefined();
    expect(
      within(menu)
        .getAllByText(/^(Sections|Projects)$/)
        .map((heading) => heading.textContent),
    ).toEqual(["Sections", "Projects"]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(2);
    const projectsGroup = within(menu).getByRole("group", {
      name: "Projects",
    });
    const sectionsGroup = within(menu).getByRole("group", {
      name: "Sections",
    });
    expect(sectionsGroup.textContent).toBe(
      "SectionsWaitingUnorganizedNew section",
    );
    expect(projectsGroup.textContent).toBe("ProjectsAlphaThreadsNew project");
    expect(
      within(projectsGroup).getByRole("menuitem", { name: "New project" }),
    ).toBeDefined();
    expect(
      within(sectionsGroup).getByRole("menuitem", { name: "New section" }),
    ).toBeDefined();
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual([
      "All sections and projects",
      "Waiting",
      "Unorganized",
      "Alpha",
      "Threads",
    ]);
    expect(
      within(menu)
        .getByRole("menuitemradio", { name: "All sections and projects" })
        .querySelector('[data-icon="FolderLibrary"]'),
    ).not.toBeNull();
    expect(
      within(menu)
        .getByRole("menuitemradio", { name: "Threads" })
        .querySelector('[data-icon="BubbleChat"]'),
    ).not.toBeNull();
    expect(
      within(menu)
        .getByRole("menuitemradio", { name: "Unorganized" })
        .querySelector('[data-icon="ListViewOff"]'),
    ).not.toBeNull();
  });

  it("keeps section and project filtering available on compact viewports", () => {
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <ThreadFilter
          projects={projects}
          sections={sections}
          value={null}
          onChange={() => {}}
          onNewProject={() => {}}
          onNewSection={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );

    expect(
      screen.getByRole("menuitemradio", {
        name: "All sections and projects",
      }),
    ).toBeDefined();
    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeDefined();
    expect(
      screen.getByRole("menuitemradio", { name: "Waiting" }),
    ).toBeDefined();
  });

  it("shows the selected section or project icon in the trigger", () => {
    const sharedProps = {
      projects,
      sections,
      onChange: () => {},
      onNewProject: () => {},
      onNewSection: () => {},
    } as const;
    const { rerender } = render(
      <ThreadFilter
        {...sharedProps}
        projectIcons={
          new Map([
            [
              "proj_alpha",
              { name: "rocket", glyph: rocket, color: "rgb(1, 2, 3)" },
            ],
          ])
        }
        value={{ kind: "project", id: "proj_alpha" }}
      />,
    );

    let trigger = screen.getByRole("button", {
      name: "Sections and projects: Alpha",
    });
    expect(trigger.querySelector('path[d="M1"]')).not.toBeNull();
    expect(trigger.querySelector("svg")?.style.color).toBe("rgb(1, 2, 3)");

    rerender(
      <ThreadFilter
        {...sharedProps}
        value={{ kind: "project", id: "proj_alpha" }}
      />,
    );
    trigger = screen.getByRole("button", {
      name: "Sections and projects: Alpha",
    });
    expect(trigger.querySelector('[data-icon="Folder"]')).not.toBeNull();

    rerender(
      <ThreadFilter
        {...sharedProps}
        value={{ kind: "project", id: "proj_personal" }}
      />,
    );
    trigger = screen.getByRole("button", {
      name: "Sections and projects: Threads",
    });
    expect(trigger.querySelector('[data-icon="BubbleChat"]')).not.toBeNull();

    rerender(
      <ThreadFilter
        {...sharedProps}
        value={{ kind: "section", id: "section_waiting" }}
      />,
    );
    trigger = screen.getByRole("button", {
      name: "Sections and projects: Waiting",
    });
    expect(trigger.querySelector('[data-icon="ListView"]')).not.toBeNull();

    rerender(
      <ThreadFilter {...sharedProps} value={{ kind: "uncategorized" }} />,
    );
    trigger = screen.getByRole("button", {
      name: "Sections and projects: Unorganized",
    });
    expect(trigger.querySelector('[data-icon="ListViewOff"]')).not.toBeNull();
  });

  it("reports section, project, uncategorized, and clear selections", () => {
    const onChange = vi.fn();
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={{ kind: "project", id: "proj_alpha" }}
        onChange={onChange}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Sections and projects: Alpha",
    });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Waiting" }), {
      detail: 1,
    });

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Unorganized" }),
      { detail: 1 },
    );

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: "All sections and projects",
      }),
    );

    expect(onChange).toHaveBeenNthCalledWith(1, {
      kind: "section",
      id: "section_waiting",
    });
    expect(onChange).toHaveBeenNthCalledWith(2, { kind: "uncategorized" });
    expect(onChange).toHaveBeenNthCalledWith(3, null);
  });

  it("keeps each creation action in its group when no choices exist", () => {
    const sharedProps = {
      value: null,
      onChange: () => {},
      onNewProject: () => {},
      onNewSection: () => {},
    } as const;
    const { rerender } = render(
      <ThreadFilter {...sharedProps} projects={[]} sections={sections} />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    expect(screen.getByText("Projects")).toBeDefined();
    expect(screen.getByText("Sections")).toBeDefined();
    expect(
      within(screen.getByRole("group", { name: "Projects" })).getByRole(
        "menuitem",
        { name: "New project" },
      ),
    ).toBeDefined();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    rerender(
      <ThreadFilter {...sharedProps} projects={projects} sections={[]} />,
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    const projectsOnlyMenu = screen.getByRole("menu");
    expect(
      within(projectsOnlyMenu).getByRole("menuitemradio", {
        name: "All sections and projects",
      }),
    ).toBeDefined();
    expect(within(projectsOnlyMenu).getByText("Projects")).toBeDefined();
    expect(within(projectsOnlyMenu).getByText("Sections")).toBeDefined();
    expect(
      within(projectsOnlyMenu).queryByRole("menuitemradio", {
        name: "Unorganized",
      }),
    ).toBeNull();
    expect(
      within(
        within(projectsOnlyMenu).getByRole("group", { name: "Sections" }),
      ).getByRole("menuitem", { name: "New section" }),
    ).toBeDefined();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    rerender(
      <ThreadFilter
        projects={projects}
        sections={[]}
        value={{ kind: "project", id: "proj_alpha" }}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sections and projects: Alpha" }),
    ).toBeDefined();
  });

  it("runs the two creation actions without opening the filter menu", () => {
    const onNewProject = vi.fn();
    const onNewSection = vi.fn();
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={onNewProject}
        onNewSection={onNewSection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.click(screen.getByRole("button", { name: "New section" }));

    expect(onNewProject).toHaveBeenCalledOnce();
    expect(onNewSection).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs creation actions from the dropdown without changing the filter", () => {
    const onChange = vi.fn();
    const onNewProject = vi.fn();
    const onNewSection = vi.fn();
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={onChange}
        onNewProject={onNewProject}
        onNewSection={onNewSection}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Sections and projects",
    });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "New project",
      }),
    );

    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "New section",
      }),
    );

    expect(onNewProject).toHaveBeenCalledOnce();
    expect(onNewSection).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the creation actions visible while the filter menu is open", () => {
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    const creationActions = document.querySelector(
      "[data-thread-filter-actions]",
    );
    expect(creationActions?.getAttribute("data-state")).toBe("closed");

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );

    expect(creationActions?.getAttribute("data-state")).toBe("open");
  });

  it("shows built-in-style tooltips for the creation actions", async () => {
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    const newProject = screen.getByRole("button", { name: "New project" });
    fireEvent.focus(newProject);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "New project",
    );

    fireEvent.blur(newProject);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

    fireEvent.focus(screen.getByRole("button", { name: "New section" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "New section",
    );
  });

  it("keeps stage counts out of the sidebar menu", () => {
    render(
      <ThreadFilter
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Show stage counts" }),
    ).toBeNull();
  });

  it("opens the built-in project actions as a submenu without losing direct selection", () => {
    const onChange = vi.fn();
    render(
      <ThreadFilter
        {...actions}
        projectActionStates={
          new Map([["proj_alpha", { canAddLocalPath: true }]])
        }
        projects={projects}
        sections={sections}
        value={null}
        onChange={onChange}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    const alpha = screen.getByRole("menuitemradio", { name: "Alpha" });
    fireEvent.keyDown(alpha, { key: "ArrowRight" });

    const [rootMenu, submenu] = screen.getAllByRole("menu");
    expect(rootMenu.classList.contains("z-50")).toBe(true);
    expect(submenu.classList.contains("z-50")).toBe(true);
    expect(
      within(submenu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Project settings", "Rename", "Add local path", "Remove"]);
    const rename = within(submenu).getByRole("menuitem", { name: "Rename" });
    fireEvent.keyDown(rename, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(rename, {
      detail: 1,
    });
    expect(actions.onRenameProject).toHaveBeenCalledWith(projects[0]);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Alpha" }), {
      detail: 1,
    });
    expect(onChange).toHaveBeenCalledWith({
      kind: "project",
      id: "proj_alpha",
    });
  });

  it("opens project actions after the regular submenu hover delay", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ThreadFilter
          {...actions}
          projects={projects}
          sections={sections}
          value={null}
          onChange={() => {}}
          onNewProject={() => {}}
          onNewSection={() => {}}
        />,
      );
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Sections and projects" }),
        { key: "Enter" },
      );
      fireEvent.pointerMove(
        screen.getByRole("menuitemradio", { name: "Alpha" }),
        { pointerType: "mouse" },
      );
      await act(() => vi.advanceTimersByTimeAsync(110));

      expect(
        screen.getByRole("menuitem", { name: "Project settings" }),
      ).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves the hover tile from the item to its chevron while the submenu owns the pointer", () => {
    render(
      <ThreadFilter
        {...actions}
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    const alpha = screen.getByRole("menuitemradio", { name: "Alpha" });
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(false);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(true);

    fireEvent.pointerEnter(alpha, { pointerType: "mouse" });
    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(true);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(false);

    fireEvent.pointerMove(
      alpha.querySelector("[data-thread-filter-submenu-chevron]") ?? alpha,
      { pointerType: "mouse" },
    );
    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(false);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(true);

    fireEvent.pointerEnter(
      screen.getByRole("menuitem", { name: "Project settings" }),
      { pointerType: "mouse" },
    );
    fireEvent.pointerMove(
      screen.getByRole("menuitem", { name: "Project settings" }),
      { pointerType: "mouse" },
    );
    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(false);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(true);

    fireEvent.pointerMove(
      alpha.querySelector("[data-thread-filter-select-target]") ?? alpha,
      { pointerType: "mouse" },
    );
    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(true);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(false);
  });

  it("shows keyboard-focused actionable items as active", () => {
    render(
      <ThreadFilter
        {...actions}
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    const alpha = screen.getByRole("menuitemradio", { name: "Alpha" });
    fireEvent.focus(alpha);

    expect(
      alpha
        .querySelector("[data-thread-filter-select-target]")
        ?.hasAttribute("data-active"),
    ).toBe(true);
    expect(
      alpha
        .querySelector("[data-thread-filter-submenu-chevron]")
        ?.hasAttribute("data-active"),
    ).toBe(false);
  });

  it("opens section actions on right click and does not give Threads a submenu", () => {
    render(
      <ThreadFilter
        {...actions}
        projects={projects}
        sections={sections}
        value={null}
        onChange={() => {}}
        onNewProject={() => {}}
        onNewSection={() => {}}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Sections and projects" }),
      { key: "Enter" },
    );
    expect(
      screen
        .getByRole("menuitemradio", { name: "Threads" })
        .querySelector('[data-icon="ChevronRight"]'),
    ).toBeNull();
    const waiting = screen.getByRole("menuitemradio", { name: "Waiting" });
    fireEvent.contextMenu(waiting);
    const submenu = screen.getAllByRole("menu")[1];
    expect(
      within(submenu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Rename", "Remove"]);
  });
});
