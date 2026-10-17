// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRowActionCapacity } from "./use-row-action-capacity.js";

function Row({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const capacity = useRowActionCapacity(ref, {
    count,
    enabled: true,
    hasChildren: false,
    hasPrompts: false,
    hasPullRequest: false,
    isCompact: false,
    isEditing: false,
  });
  return (
    <div ref={ref}>
      <span data-ribbon-row-content>
        <span className="bb-thread-title">Thread</span>
      </span>
      <output>{capacity}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useRowActionCapacity", () => {
  it("does not observe or measure rows without quick actions", () => {
    const observer = vi.fn(
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("ResizeObserver", observer);
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    render(<Row count={0} />);
    expect(screen.getByRole("status").textContent).toBe("0");
    expect(observer).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it("disconnects measurement when actions are removed and reconnects when restored", () => {
    const observe = vi.fn(),
      disconnect = vi.fn();
    const observer = vi.fn(
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    vi.stubGlobal("ResizeObserver", observer);
    const { rerender } = render(<Row count={3} />);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
    rerender(<Row count={0} />);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("0");
    rerender(<Row count={3} />);
    expect(observer).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toBe("3");
  });
});
