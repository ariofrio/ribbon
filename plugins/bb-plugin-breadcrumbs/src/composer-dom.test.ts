// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hideThreadComposerProject,
  installNewThreadBreadcrumbs,
  selectComposeSection,
} from "./composer-dom";

function installNewThreadFixture() {
  document.body.innerHTML = `
    <div id="pane">
      <header>
        <div data-testid="app-page-header-content-row">
          <div><div id="header-center"><div id="title"><p>New thread</p></div></div></div>
        </div>
      </header>
      <main>
        <div id="composer" data-app-composer="" data-app-composer-role="primary">
          <div id="options">
            <button id="project" data-promptbox-project-control="">bb-plugins</button>
            <button id="environment">Local</button>
          </div>
        </div>
      </main>
    </div>
  `;

  return {
    composer: document.querySelector<HTMLElement>("#composer")!,
    environment: document.querySelector<HTMLElement>("#environment")!,
    options: document.querySelector<HTMLElement>("#options")!,
    project: document.querySelector<HTMLElement>("#project")!,
    title: document.querySelector<HTMLElement>("#title")!,
  };
}

describe("new-thread composer breadcrumbs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("places the native project selector over its header breadcrumb without reparenting it", () => {
    const { composer, environment, options, project, title } =
      installNewThreadFixture();

    const mounted = installNewThreadBreadcrumbs(composer);

    expect(mounted).not.toBeNull();
    expect(mounted?.root.nextElementSibling).toBe(title);
    expect(Array.from(mounted?.root.children ?? [])).toEqual([
      mounted?.sectionTarget,
      mounted?.projectPlaceholder,
      mounted?.projectSeparatorTarget,
    ]);
    expect(environment.parentElement).toBe(options);
    expect(project.parentElement).toBe(options);
    expect(getComputedStyle(project).position).toBe("fixed");

    mounted?.cleanup();
    expect(project.parentElement).toBe(options);
    expect(project.nextElementSibling).toBe(environment);
    expect(getComputedStyle(project).position).not.toBe("fixed");
    expect(document.querySelector("[data-composer-breadcrumbs-root]")).toBeNull();
  });

  it("creates a New thread breadcrumb row above the pinned client's headerless composer", () => {
    document.body.innerHTML = `
      <main>
        <div id="new-thread-column">
          <div id="composer" data-app-composer="" data-app-composer-role="primary">
            <div id="options">
              <button id="project" data-promptbox-project-control="">bb-plugins</button>
              <button id="environment">Local</button>
            </div>
          </div>
          <section id="recent">Recent</section>
        </div>
      </main>
    `;
    const composer = document.querySelector<HTMLElement>("#composer")!;

    const mounted = installNewThreadBreadcrumbs(composer);

    expect(mounted).not.toBeNull();
    expect(mounted?.root.nextElementSibling).toBe(composer);
    expect(mounted?.root.textContent).toContain("New thread");
    expect(document.querySelector("#project")?.parentElement?.id).toBe("options");
    expect(document.querySelector("#recent")?.parentElement?.id).toBe(
      "new-thread-column",
    );

    mounted?.cleanup();
    expect(document.querySelector("[data-composer-breadcrumbs-root]")).toBeNull();
  });
});

describe("thread composer project summary", () => {
  it("hides the project while leaving the environment visible", () => {
    document.body.innerHTML = `
      <div id="composer" data-app-composer="">
        <div data-follow-up-composer-footer="">
          <div title="Project: bb-plugins">bb-plugins</div>
          <div title="Environment: Local">Local</div>
        </div>
      </div>
    `;
    const composer = document.querySelector<HTMLElement>("#composer")!;
    const project = document.querySelector<HTMLElement>(
      '[title="Project: bb-plugins"]',
    )!;
    const environment = document.querySelector<HTMLElement>(
      '[title="Environment: Local"]',
    )!;

    const cleanup = hideThreadComposerProject(composer);

    expect(project.hidden).toBe(true);
    expect(environment.hidden).toBe(false);
    cleanup();
    expect(project.hidden).toBe(false);
  });
});

describe("section selection", () => {
  it("sends the selected section through bb's root-compose location state", () => {
    window.history.replaceState({ idx: 4, key: "root", usr: null }, "", "/");
    const popstate = vi.fn();
    window.addEventListener("popstate", popstate, { once: true });

    selectComposeSection(window, "sec_work");

    expect(window.history.state).toEqual({
      idx: 4,
      key: "root",
      usr: { sectionId: "sec_work" },
    });
    expect(popstate).toHaveBeenCalledOnce();
  });
});
