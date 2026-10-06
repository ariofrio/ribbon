// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RibbonDataProvider, useRibbonData, useRibbonThread } from "./data";
import { ribbonRpcStubs } from "./test-support";
import { THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";

const realtime = new Map<string, () => void>();
let stubs: Record<string, (input: unknown) => unknown> = {};

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({
    call: async (method: string, input: unknown) => stubs[method]!(input),
  }),
  useRealtime: (event: string, handler: () => void) => {
    realtime.set(event, handler);
  },
  useRealtimeConnectionState: () => "connected",
}));

afterEach(() => {
  cleanup();
  realtime.clear();
});

const renders = new Map<string, number>();

const Row = memo(function Row({ id }: { id: string }) {
  renders.set(id, (renders.get(id) ?? 0) + 1);
  const row = useRibbonThread(id);
  return <span data-testid={id}>{row?.stage ?? "-"}</span>;
});

function Editor() {
  const ribbon = useRibbonData();
  return (
    <button type="button" onClick={() => ribbon?.editActions("thr_a")}>
      edit
    </button>
  );
}

function stages(stageOfA: string) {
  return ribbonRpcStubs({
    stages: [
      { threadId: "thr_a", groupId: stageOfA, enteredAtMs: 1 },
      { threadId: "thr_b", groupId: "Active", enteredAtMs: 1 },
    ],
  }) as unknown as Record<string, (input: unknown) => unknown>;
}

describe("RibbonDataProvider rows", () => {
  it("shows a Completed reorder before the placement save answers", async () => {
    const initial = [
      { threadId: "thr_a", groupId: "Completed", enteredAtMs: 2 },
      { threadId: "thr_b", groupId: "Completed", enteredAtMs: 1 },
    ];
    stubs = ribbonRpcStubs({ stages: initial }) as typeof stubs;
    let finishSave!: () => void;
    const pending = new Promise<void>((resolve) => { finishSave = resolve; });
    stubs.updatePlacementV1 = async () => {
      await pending;
      stubs = ribbonRpcStubs({ stages: [...initial].reverse() }) as typeof stubs;
      return { ok: true, value: { revision: 2 } };
    };
    function CompletedOrder() {
      const ribbon = useRibbonData();
      return <>
        <button onClick={() => void ribbon?.updatePlacement(
          "thr_b", THREAD_STAGES_GROUPING_KEY, "Completed", { kind: "before", threadId: "thr_a" },
        )}>reorder</button>
        <output>{[...(ribbon?.stages.keys() ?? [])].join(",")}</output>
      </>;
    }
    render(<RibbonDataProvider><CompletedOrder /></RibbonDataProvider>);
    try {
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe("thr_a,thr_b"));
      act(() => screen.getByText("reorder").click());
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe("thr_b,thr_a"));
    } finally {
      await act(async () => { finishSave(); });
    }
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("thr_b,thr_a"));
  });

  it("re-renders a row only when what it draws from changes", async () => {
    stubs = stages("Deferred");
    render(
      <RibbonDataProvider>
        <Row id="thr_a" />
        <Row id="thr_b" />
        <Editor />
      </RibbonDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("thr_a").textContent).toBe("Deferred"));
    const a = renders.get("thr_a")!;
    const b = renders.get("thr_b")!;

    // Opening the actions editor changes the provider's value, not any row.
    act(() => screen.getByText("edit").click());
    expect(renders.get("thr_a")).toBe(a);
    expect(renders.get("thr_b")).toBe(b);

    // A stage change redraws the row it moved and no other.
    stubs = stages("Completed");
    await act(async () => {
      realtime.get("placements-changed")!();
    });
    await waitFor(() => expect(screen.getByTestId("thr_a").textContent).toBe("Completed"));
    expect(renders.get("thr_a")).toBe(a + 1);
    expect(renders.get("thr_b")).toBe(b);
  });
});
