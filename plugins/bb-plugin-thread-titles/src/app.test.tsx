// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { rpcContract, Selection } from "./server";

afterEach(() => {
  document.body.innerHTML = "";
});

const haiku: Selection = {
  providerId: "claude-code",
  model: "claude-haiku-4-5",
  reasoningLevel: "low",
};

async function render(initial: Selection | null) {
  const app = await loadPluginApp(() => import("./app"));
  expect(app.settingsSections).toHaveLength(1);
  expect(app.settingsSections[0]).toMatchObject({ id: "title-model" });
  let stored = initial;
  return renderSlot<object, typeof rpcContract>(
    app.settingsSections[0]!,
    {},
    {
      rpc: {
        "selection.get": () => ({
          selection: stored,
          suggestion: haiku,
          automaticName: "Haiku 4.5",
        }),
        "selection.set": ({ selection }) => {
          stored = selection;
          return null;
        },
      },
    },
  );
}

it("starts automatic and seeds bb's picker from the suggested model", async () => {
  const slot = await render(null);
  await screen.findByText(/^Automatic: bb's inference model, currently Haiku 4\.5\./);
  expect(screen.queryByTestId("bb-provider-model-picker")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose a model" }));
  const picker = await screen.findByTestId("bb-provider-model-picker");
  expect(picker.getAttribute("data-provider-change-allowed")).toBe("true");
  expect(screen.getByLabelText<HTMLInputElement>("Model").value).toBe(
    "claude-haiku-4-5",
  );
  expect(slot.inspection.rpcCalls.at(-1)).toMatchObject({
    method: "selection.set",
    input: { selection: haiku },
  });
});

it("saves picker changes and returns to automatic", async () => {
  const slot = await render(haiku);
  await screen.findByTestId("bb-provider-model-picker");
  fireEvent.change(screen.getByLabelText("Model"), {
    target: { value: "claude-sonnet-5" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Apply execution selection" }),
  );
  await waitFor(() =>
    expect(slot.inspection.rpcCalls.at(-1)).toMatchObject({
      method: "selection.set",
      input: { selection: { ...haiku, model: "claude-sonnet-5" } },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Use automatic" }));
  await screen.findByText(/^Automatic: bb's inference model, currently Haiku 4\.5\./);
  expect(slot.inspection.rpcCalls.at(-1)).toMatchObject({
    method: "selection.set",
    input: { selection: null },
  });
});
