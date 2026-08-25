// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  findVisibleTerminal,
  focusVisibleTerminal,
  isTerminalFocused,
  isWithinTerminal,
} from "./terminal-dom";

/** jsdom lays nothing out, so a fixture states its own size. */
function terminal({ visible, input }: { visible: boolean; input: string | null }) {
  const pane = document.createElement("div");
  pane.dataset.appTerminal = "";
  pane.getBoundingClientRect = () =>
    ({ width: visible ? 640 : 0, height: visible ? 480 : 0 }) as DOMRect;
  if (input !== null) {
    const field = document.createElement("textarea");
    if (input !== "textarea") field.className = input;
    pane.append(field);
  }
  document.body.append(pane);
  return pane;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("bb's terminal panel, as this plugin reads it", () => {
  it("finds the laid-out terminal and skips one left behind at zero size", () => {
    const hidden = terminal({ visible: false, input: "xterm-helper-textarea" });
    const shown = terminal({ visible: true, input: "xterm-helper-textarea" });
    expect(findVisibleTerminal(document)).toBe(shown);
    expect(findVisibleTerminal(document)).not.toBe(hidden);
  });

  it("reports no terminal when every pane is collapsed", () => {
    terminal({ visible: false, input: "xterm-helper-textarea" });
    expect(findVisibleTerminal(document)).toBeNull();
  });

  it("focuses xterm's helper textarea", () => {
    terminal({ visible: true, input: "xterm-helper-textarea" });
    expect(focusVisibleTerminal(document)).toBe(true);
    expect(document.activeElement?.className).toBe("xterm-helper-textarea");
  });

  it("falls back to a plain textarea before xterm has attached", () => {
    terminal({ visible: true, input: "textarea" });
    expect(focusVisibleTerminal(document)).toBe(true);
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });

  it("reports failure rather than throwing when the pane has no input yet", () => {
    terminal({ visible: true, input: null });
    expect(focusVisibleTerminal(document)).toBe(false);
  });

  it("knows when focus is inside a terminal", () => {
    terminal({ visible: true, input: "xterm-helper-textarea" });
    expect(isTerminalFocused(document)).toBe(false);
    focusVisibleTerminal(document);
    expect(isTerminalFocused(document)).toBe(true);
  });

  it("recognises an event target nested inside a terminal", () => {
    const pane = terminal({ visible: true, input: "xterm-helper-textarea" });
    expect(isWithinTerminal(pane.querySelector("textarea"))).toBe(true);
    expect(isWithinTerminal(document.body)).toBe(false);
    expect(isWithinTerminal(null)).toBe(false);
  });
});
