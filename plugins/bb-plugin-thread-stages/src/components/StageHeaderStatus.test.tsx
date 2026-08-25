// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageHeaderStatus } from "./StageHeaderStatus";

afterEach(cleanup);

describe("stage header status", () => {
  it("shows a nonzero count only while collapsed", () => {
    const { rerender } = render(
      <StageHeaderStatus collapsed count={3} activityThread={null} />,
    );
    expect(screen.getByLabelText("3 threads")).toBeDefined();

    rerender(
      <StageHeaderStatus collapsed={false} count={3} activityThread={null} />,
    );
    expect(screen.queryByLabelText("3 threads")).toBeNull();

    rerender(
      <StageHeaderStatus collapsed count={0} activityThread={null} />,
    );
    expect(screen.queryByLabelText("0 threads")).toBeNull();
  });

  it("shows an aggregate indicator when supplied", () => {
    const activityThread = {
      indicator: "runtime" as const,
      indicatorLabel: "Thread working",
    };
    const { rerender } = render(
      <StageHeaderStatus collapsed count={2} activityThread={null} />,
    );
    expect(
      document.querySelector("[data-sidebar-stage-trailing-indicator]"),
    ).toBeNull();

    rerender(
      <StageHeaderStatus
        collapsed
        count={2}
        activityThread={activityThread}
      />,
    );
    expect(
      document.querySelector("[data-sidebar-stage-trailing-indicator]"),
    ).not.toBeNull();
    expect(screen.getByLabelText("Thread working")).toBeDefined();
    expect(screen.getByLabelText("2 threads")).toBeDefined();
  });
});
