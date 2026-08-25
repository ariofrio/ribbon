// The shape of bb's terminal panel, as this plugin assumes it.
//
// These selectors are bb's markup, not ours, and nothing offline can prove they
// still match: terminal-dom.test.ts builds the fixture itself, so it pins what
// we expect rather than what bb renders. What it does buy is a single place to
// read the assumption, and a failure when our own probing regresses. Detecting
// bb moving underneath us needs a check against a running bb.
//
// A terminal that bb has rendered but not shown still answers the selector, so
// visibility is measured rather than assumed — switching panel tabs leaves the
// previous terminal in the tree at zero size.

/** bb's marker on a terminal pane. */
export const TERMINAL_SELECTOR = "[data-app-terminal]";

/**
 * xterm's off-screen textarea takes the keystrokes. The plain `textarea`
 * fallback covers a terminal that has mounted its host element before xterm has
 * attached to it.
 */
export const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea, textarea";

export function isTerminalFocused(root: Document): boolean {
  const active = root.activeElement;
  return active instanceof Element && active.closest(TERMINAL_SELECTOR) !== null;
}

export function isWithinTerminal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TERMINAL_SELECTOR) !== null;
}

/** The terminal the user can actually see, or null when none is laid out. */
export function findVisibleTerminal(root: Document): HTMLElement | null {
  // Array.from rather than iterating the NodeList: this tsconfig's lib has no
  // DOM.Iterable.
  const panes = Array.from(
    root.querySelectorAll<HTMLElement>(TERMINAL_SELECTOR),
  );
  return (
    panes.find((terminal) => {
      const bounds = terminal.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    }) ?? null
  );
}

/** Focus the visible terminal's input; returns whether one was found. */
export function focusVisibleTerminal(root: Document): boolean {
  const input = findVisibleTerminal(root)?.querySelector<HTMLElement>(
    TERMINAL_INPUT_SELECTOR,
  );
  if (!input) return false;
  input.focus({ preventScroll: true });
  return true;
}
