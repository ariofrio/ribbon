// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupBody } from "./group-body";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
});

/** Every element given a height to fold, in the order they start. */
const folding: Element[] = [];
beforeEach(() => {
  folding.length = 0;
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  ) {
    if (Array.isArray(keyframes) && "height" in keyframes[0]!) folding.push(this);
    return {
      finished: new Promise(() => {}),
      cancel: () => {},
    } as unknown as Animation;
  };
});

// bb draws a thread row as a div, inside plain divs rather than a list.
function Rows() {
  return (
    <div>
      <div data-thread-id="a">a</div>
      <div data-thread-id="b">b</div>
      <div data-wrapper="">
        <div data-thread-id="c">c</div>
      </div>
    </div>
  );
}

function renderBody(open: boolean) {
  return (
    <GroupBody open={open} keepThreadId="b" folded={<div data-folded="" />}>
      <Rows />
    </GroupBody>
  );
}

it("folds the rows around the open thread's row rather than snapping shut", () => {
  const view = render(renderBody(true));
  view.rerender(renderBody(false));

  expect(view.container.querySelector("[data-folded]")).toBeNull();
  expect(folding).toEqual([
    view.container.querySelector("[data-thread-id='a']"),
    view.container.querySelector("[data-wrapper]"),
  ]);
});

it("unfolds the rows back around the open thread's row", () => {
  const view = render(renderBody(false));
  view.rerender(renderBody(true));

  expect(view.container.querySelector("[data-thread-id='b']")).not.toBeNull();
  expect(folding).toEqual([
    view.container.querySelector("[data-thread-id='a']"),
    view.container.querySelector("[data-wrapper]"),
  ]);
});
