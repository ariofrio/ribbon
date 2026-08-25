// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { publishIconStylesheet } from "./icon-sheet";

const glyph = [["path", { d: "M1" }]] as const;
const defaults = { project: glyph, personal: glyph };
const view = {
  icons: [{ kind: "project" as const, id: "proj_a", icon: "rocket", color: null, glyph }],
  defaults,
};

describe("publishIconStylesheet", () => {
  it("publishes what consumers read, and says when it is there", async () => {
    const stop = publishIconStylesheet({ load: async () => view });

    await vi.waitFor(() => {
      expect(document.documentElement.dataset.ribbonIconsReady).toBe("");
    });
    expect(document.head.textContent).toContain('[data-ribbon-icons-project="proj_a"]');

    stop();
  });

  it("takes the sheet and the marker away with it", async () => {
    const stop = publishIconStylesheet({ load: async () => view });
    await vi.waitFor(() =>
      expect(document.documentElement.dataset.ribbonIconsReady).toBe(""),
    );

    stop();

    expect(document.documentElement.dataset.ribbonIconsReady).toBeUndefined();
    expect(document.head.textContent).not.toContain("ribbon-icons-project-glyph");
  });

  it("says nothing at all when the read fails", async () => {
    const stop = publishIconStylesheet({ load: async () => null });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.documentElement.dataset.ribbonIconsReady).toBeUndefined();
    stop();
  });

  it("rewrites the sheet when an edit is announced", async () => {
    let icons = view.icons;
    const stop = publishIconStylesheet({
      load: async () => ({ icons, defaults }),
      subscribe: (onChange) => {
        queueMicrotask(() => {
          icons = [{ ...view.icons[0]!, id: "proj_b" }];
          onChange();
        });
        return () => {};
      },
    });

    await vi.waitFor(() =>
      expect(document.head.textContent).toContain('[data-ribbon-icons-project="proj_b"]'),
    );
    stop();
  });
});
