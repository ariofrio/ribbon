// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mountSidebarContentSpacing } from "./sidebar-content-spacing";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("mountSidebarContentSpacing", () => {
  it("keeps the first group inset and prevents horizontal list overflow", async () => {
    const controller = new AbortController();
    const nav = document.createElement("div");
    nav.dataset.testid = "plugin-nav-sidebar-items";
    nav.style.paddingBottom = "3px";
    const content = document.createElement("div");
    content.dataset.sidebar = "content";
    content.style.overflowX = "auto";
    const root = document.createElement("div");
    root.dataset.ribbonSidebarRoot = "";
    root.style.setProperty("--bb-sidebar-sticky-stack-padding-top", "5px");
    content.append(root);
    document.body.append(nav, content);

    const dispose = mountSidebarContentSpacing(controller.signal);
    await waitFor(() => expect(nav.style.paddingBottom).toBe("0px"));
    expect(
      getComputedStyle(root).getPropertyValue(
        "--bb-sidebar-sticky-stack-padding-top",
      ),
    ).toBe("5px");
    expect(getComputedStyle(content).overflowX).toBe("hidden");

    root.remove();
    await waitFor(() => expect(nav.style.paddingBottom).toBe("3px"));
    expect(
      getComputedStyle(root).getPropertyValue(
        "--bb-sidebar-sticky-stack-padding-top",
      ),
    ).toBe("5px");
    expect(getComputedStyle(content).overflowX).toBe("auto");

    dispose();
  });

  it("leaves bb's default top inset when plugin navigation is absent", () => {
    const controller = new AbortController();
    const content = document.createElement("div");
    content.dataset.sidebar = "content";
    const root = document.createElement("div");
    root.dataset.ribbonSidebarRoot = "";
    content.append(root);
    document.body.append(content);

    mountSidebarContentSpacing(controller.signal);
    expect(
      getComputedStyle(root).getPropertyValue(
        "--bb-sidebar-sticky-stack-padding-top",
      ),
    ).toBe("");
    controller.abort();
  });
});
