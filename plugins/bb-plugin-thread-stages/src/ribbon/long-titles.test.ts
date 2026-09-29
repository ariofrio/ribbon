import { describe, expect, it } from "vitest";
import { longTitlesSetting } from "./long-titles";

describe("longTitlesSetting", () => {
  it("keeps each of the three choices", () => {
    expect(longTitlesSetting("Ellipsis")).toBe("Ellipsis");
    expect(longTitlesSetting("Fade")).toBe("Fade");
    expect(longTitlesSetting("Fade and pan on hover")).toBe("Fade and pan on hover");
  });

  it("fades and pans when the setting is unset or unknown", () => {
    expect(longTitlesSetting(undefined)).toBe("Fade and pan on hover");
    expect(longTitlesSetting("Marquee")).toBe("Fade and pan on hover");
    expect(longTitlesSetting(true)).toBe("Fade and pan on hover");
  });
});
