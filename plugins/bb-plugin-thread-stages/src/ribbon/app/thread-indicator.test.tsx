// @vitest-environment jsdom
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadIndicator } from "./thread-indicator";

afterEach(cleanup);

describe("ThreadIndicator", () => {
  it.each(["draft", "working-draft"] as const)(
    "renders the pencil edit icon for %s",
    (indicator) => {
      const { getByLabelText } = render(
        <ThreadIndicator indicator={indicator} label="Unsubmitted draft" />,
      );
      const icon = getByLabelText("Unsubmitted draft");
      expect(icon.querySelector("path")?.getAttribute("d")).toBe(
        PencilEdit01Icon[0]?.[1].d,
      );
    },
  );
});
