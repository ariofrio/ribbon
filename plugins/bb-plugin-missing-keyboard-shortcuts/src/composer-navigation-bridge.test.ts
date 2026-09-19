import { afterEach, describe, expect, it, vi } from "vitest";
import {
  focusedSecondaryComposerThreadId,
  focusPrimaryComposer,
  focusSecondaryComposer,
  focusSecondaryComposerWhenReady,
  hasPrimaryComposer,
  isSecondaryComposerFocused,
  registerPrimaryComposerFocus,
  registerSecondaryComposer,
  selectPrimaryPanelTabWhenReady,
} from "./composer-navigation-bridge";
import type {
  PanelTabButton,
  PanelTabObserver,
} from "./panel-tab-selection";

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
});

describe("composer navigation bridge", () => {
  it("focuses the primary composer registered for the requested thread", () => {
    const firstThread = vi.fn();
    const secondThread = vi.fn();
    disposers.push(registerPrimaryComposerFocus("thr_one", firstThread));
    disposers.push(registerPrimaryComposerFocus("thr_two", secondThread));

    expect(hasPrimaryComposer("thr_two")).toBe(true);
    expect(focusPrimaryComposer("thr_two")).toBe(true);
    expect(firstThread).not.toHaveBeenCalled();
    expect(secondThread).toHaveBeenCalledOnce();
  });

  it("uses the latest primary composer and falls back when it unmounts", () => {
    const first = vi.fn();
    const second = vi.fn();
    disposers.push(registerPrimaryComposerFocus("thr_one", first));
    const unregisterSecond = registerPrimaryComposerFocus("thr_one", second);
    disposers.push(unregisterSecond);

    expect(focusPrimaryComposer("thr_one")).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();

    unregisterSecond();
    expect(focusPrimaryComposer("thr_one")).toBe(true);
    expect(first).toHaveBeenCalledOnce();
  });

  it("reports when the thread has no primary composer", () => {
    expect(hasPrimaryComposer("thr_missing")).toBe(false);
    expect(focusPrimaryComposer("thr_missing")).toBe(false);
  });

  it("focuses the root new-thread primary composer", () => {
    const focus = vi.fn();
    disposers.push(registerPrimaryComposerFocus(null, focus));

    expect(hasPrimaryComposer(null)).toBe(true);
    expect(focusPrimaryComposer(null)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("selects a panel tab inside the requested thread pane when it appears", () => {
    const controller = new AbortController();
    const terminal: PanelTabButton = {
      click: vi.fn(),
      hasIcon: (icon) => icon === "Terminal",
    };
    let buttons: PanelTabButton[] = [];
    let notifyChanged: (() => void) | undefined;
    const observer: PanelTabObserver = {
      disconnect: vi.fn(),
      observe: vi.fn(),
    };
    disposers.push(
      registerPrimaryComposerFocus("thr_one", vi.fn(), {
        createObserver(callback) {
          notifyChanged = callback;
          return observer;
        },
        root: { panelTabButtons: () => buttons },
      }),
    );
    disposers.push(
      selectPrimaryPanelTabWhenReady("thr_one", {
        icon: "Terminal",
        index: () => 0,
        isCurrent: () => true,
        signal: controller.signal,
      }),
    );

    buttons = [terminal];
    notifyChanged?.();

    expect(terminal.click).toHaveBeenCalledOnce();
  });

  it("focuses only the requested visible secondary composer", () => {
    const hidden = vi.fn();
    let visibleFocused = false;
    const visible = vi.fn(() => {
      visibleFocused = true;
    });
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_hidden", {
        focus: hidden,
        isFocused: () => false,
        isVisible: () => false,
      }),
    );
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_visible", {
        focus: visible,
        isFocused: () => visibleFocused,
        isVisible: () => true,
      }),
    );

    expect(focusSecondaryComposer("thr_parent", "thr_hidden")).toBe(false);
    expect(focusSecondaryComposer("thr_parent", "thr_visible")).toBe(true);
    expect(hidden).not.toHaveBeenCalled();
    expect(visible).toHaveBeenCalledOnce();
  });

  it("does not report success when a focus callback leaves DOM focus elsewhere", () => {
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_side", {
        focus: vi.fn(),
        isFocused: () => false,
        isVisible: () => true,
      }),
    );

    expect(focusSecondaryComposer("thr_parent", "thr_side")).toBe(false);
  });

  it("focuses a secondary composer when its registration becomes ready", () => {
    const controller = new AbortController();
    let focused = false;
    const focus = vi.fn(() => {
      focused = true;
    });
    disposers.push(
      focusSecondaryComposerWhenReady("thr_parent", "thr_side", {
        isCurrent: () => true,
        signal: controller.signal,
      }),
    );

    expect(focus).not.toHaveBeenCalled();
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_side", {
        focus,
        isFocused: () => focused,
        isVisible: () => true,
      }),
    );

    expect(focus).toHaveBeenCalledOnce();
  });

  it("retries focus when the editor mounts after its composer shell", () => {
    const controller = new AbortController();
    let editorReady = false;
    let focused = false;
    let changed = () => {};
    const disconnect = vi.fn();
    disposers.push(
      focusSecondaryComposerWhenReady("thr_parent", "thr_side", {
        isCurrent: () => true,
        signal: controller.signal,
      }),
    );
    const unregister = registerSecondaryComposer("thr_parent", "thr_side", {
      focus: () => { focused = editorReady; },
      isFocused: () => focused,
      isVisible: () => true,
      observeReadiness(listener) {
        changed = listener;
        return disconnect;
      },
    });
    disposers.push(unregister);
    expect(focused).toBe(false);
    editorReady = true;
    changed();
    expect(focused).toBe(true);
    unregister();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("reports which exact secondary composer owns DOM focus", () => {
    let firstFocused = false;
    let secondFocused = true;
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_one", {
        focus: vi.fn(),
        isFocused: () => firstFocused,
        isVisible: () => true,
      }),
    );
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_two", {
        focus: vi.fn(),
        isFocused: () => secondFocused,
        isVisible: () => true,
      }),
    );

    expect(isSecondaryComposerFocused("thr_parent", "thr_one")).toBe(false);
    expect(isSecondaryComposerFocused("thr_parent", "thr_two")).toBe(true);
    expect(focusedSecondaryComposerThreadId("thr_parent")).toBe("thr_two");

    firstFocused = true;
    secondFocused = false;
    expect(focusedSecondaryComposerThreadId("thr_parent")).toBe("thr_one");
  });

  it("falls back to an earlier secondary registration after unmount", () => {
    let firstFocused = false;
    let secondFocused = false;
    const first = vi.fn(() => {
      firstFocused = true;
    });
    const second = vi.fn(() => {
      secondFocused = true;
    });
    disposers.push(
      registerSecondaryComposer("thr_parent", "thr_side", {
        focus: first,
        isFocused: () => firstFocused,
        isVisible: () => true,
      }),
    );
    const unregisterSecond = registerSecondaryComposer(
      "thr_parent",
      "thr_side",
      {
        focus: second,
        isFocused: () => secondFocused,
        isVisible: () => true,
      },
    );
    disposers.push(unregisterSecond);

    expect(focusSecondaryComposer("thr_parent", "thr_side")).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    unregisterSecond();
    expect(focusSecondaryComposer("thr_parent", "thr_side")).toBe(true);
    expect(first).toHaveBeenCalledOnce();
  });
});
