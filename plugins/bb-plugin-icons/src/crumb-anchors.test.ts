// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeCrumbAnchors, readCrumbAnchors, sameAnchors } from "./crumb-anchors";

afterEach(() => {
  document.body.innerHTML = "";
});

const anchor = (kind: string, id: string) =>
  `<span data-breadcrumb-icon-anchor="${kind}" data-breadcrumb-icon-owner="${id}"></span>`;

describe("readCrumbAnchors", () => {
  it("reads an owner out of each anchor, in the order they are drawn", () => {
    document.body.innerHTML = anchor("section", "sec_a") + anchor("project", "proj_a");

    expect(readCrumbAnchors(document).map((found) => found.owner)).toEqual([
      { kind: "section", id: "sec_a" },
      { kind: "project", id: "proj_a" },
    ]);
  });

  it("ignores an anchor naming a kind it does not know", () => {
    document.body.innerHTML = anchor("machine", "host_a");

    expect(readCrumbAnchors(document)).toEqual([]);
  });

  it("finds nothing when the neighbour is not installed", () => {
    document.body.innerHTML = "<header><p>Thread title</p></header>";

    expect(readCrumbAnchors(document)).toEqual([]);
  });
});

describe("observeCrumbAnchors", () => {
  it("reports anchors that arrive after the header does", async () => {
    const seen = vi.fn();
    const stop = observeCrumbAnchors(seen);
    expect(seen).not.toHaveBeenCalled();

    document.body.innerHTML = anchor("project", "proj_a");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toEqual([
      { element: expect.anything(), owner: { kind: "project", id: "proj_a" } },
    ]);
    stop();
  });

  it("reports an anchor whose owner is rewritten in place", async () => {
    document.body.innerHTML = anchor("section", "sec_alpha");
    const seen = vi.fn();
    const stop = observeCrumbAnchors(seen);
    expect(seen).toHaveBeenCalledTimes(1);

    // React reuses the element and rewrites the attribute when the thread
    // moves to another section, so nothing is inserted or removed.
    document
      .querySelector("[data-breadcrumb-icon-anchor]")!
      .setAttribute("data-breadcrumb-icon-owner", "sec_beta");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[1]?.[0]).toEqual([
      { element: expect.anything(), owner: { kind: "section", id: "sec_beta" } },
    ]);
    stop();
  });

  it("stays quiet when the document changes around unchanged anchors", async () => {
    document.body.innerHTML = anchor("project", "proj_a");
    const seen = vi.fn();
    const stop = observeCrumbAnchors(seen);
    // Anchors already there are reported once on subscribe, so the caller does
    // not have to wait for the next mutation to learn about them.
    expect(seen).toHaveBeenCalledTimes(1);

    document.body.append(document.createElement("div"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("sameAnchors", () => {
  it("tells a moved owner from an unchanged one", () => {
    const element = document.createElement("span");
    const one = [{ element, owner: { kind: "project" as const, id: "a" } }];
    expect(sameAnchors(one, [{ element, owner: { kind: "project", id: "a" } }])).toBe(true);
    expect(sameAnchors(one, [{ element, owner: { kind: "section", id: "a" } }])).toBe(false);
  });
});
