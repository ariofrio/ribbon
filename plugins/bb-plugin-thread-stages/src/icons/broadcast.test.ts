// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ICONS_CHANNEL, announceIconsChanged } from "./broadcast";

describe("announceIconsChanged", () => {
  it("reaches a listener in the same window", async () => {
    const listener = new BroadcastChannel(ICONS_CHANNEL);
    const heard = vi.fn();
    listener.onmessage = heard;

    announceIconsChanged();
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());

    listener.close();
  });

  it("uses the channel name Thread stages listens on", () => {
    // Mirrored in bb-plugin-thread-stages/src/icons.ts.
    expect(ICONS_CHANNEL).toBe("bb.icons");
  });
});
