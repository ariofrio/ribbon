// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarqueeText } from "./thread-title";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses observed fractional widths for the title pan without synchronous measurements", () => {
  let deliver: ResizeObserverCallback = () => {};
  const targets: Element[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        deliver = callback;
      }
      observe(element: Element) {
        targets.push(element);
      }
      disconnect() {}
    },
  );
  const measure = vi.spyOn(Element.prototype, "getBoundingClientRect");
  const onMeasure = vi.fn();
  const { container } = render(<MarqueeText text="A long thread title" onMeasure={onMeasure} />);
  expect(measure).not.toHaveBeenCalled();
  const resize = (widths: number[]) =>
    act(() =>
      deliver(
        targets.map((target, index) => ({
          target,
          borderBoxSize: [{ inlineSize: widths[index]!, blockSize: 20 }],
          contentRect: new DOMRect(0, 0, widths[index], 20),
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        })),
        {} as ResizeObserver,
      ),
    );
  resize([100.25, 220.75]);
  expect((container.firstChild as HTMLElement).style.getPropertyValue("--ribbon-marquee-pan")).toBe(
    "-120.5px",
  );
  expect(onMeasure).toHaveBeenLastCalledWith(220.75);
  resize([250, 220.75]);
  expect((container.firstChild as HTMLElement).style.getPropertyValue("--ribbon-marquee-pan")).toBe(
    "0px",
  );
  expect(measure).not.toHaveBeenCalled();
});
