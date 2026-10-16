// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RibbonDataProvider, useRibbonData, useRibbonThread } from "./data";
import { ribbonRpcStubs } from "./test-support";
import { THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";

const realtime = new Map<string, () => void>();
let stubs: Record<string, (input: unknown) => unknown> = {};
let connection = "connected";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({
    call: async (method: string, input: unknown) => stubs[method]!(input),
  }),
  useRealtime: (event: string, handler: () => void) => {
    realtime.set(event, handler);
  },
  useRealtimeConnectionState: () => connection,
}));

afterEach(() => {
  cleanup();
  realtime.clear();
  connection = "connected";
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
    <button type="button" onClick={() => ribbon?.saveThreadActions("thr_other", [
      { id: "review", label: "Review", prompt: "Review this." },
    ])}>
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
  it("recovers actions and child order changed while disconnected on every reconnect", async () => {
    stubs = ribbonRpcStubs() as typeof stubs;
    function ReconnectedRow() {
      const ribbon = useRibbonData();
      const row = useRibbonThread("thr_a");
      return <>
        <output>{ribbon?.ready ? "ready" : "loading"}</output>
        {row?.actions?.actions.map((action) => <button key={action.id}>{action.label}</button>)}
        <ol>{ribbon?.childRanks.map((child) => <li key={child.threadId}>{child.threadId}</li>)}</ol>
      </>;
    }
    const client = () => <RibbonDataProvider><ReconnectedRow /></RibbonDataProvider>;
    const { rerender } = render(client());
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("ready"));

    for (const labels of [["Release", "Update to 0.46.1"], ["Review"]]) {
      connection = "reconnecting";
      rerender(client());
      const previous = screen.queryAllByRole("button").map((button) => button.textContent);
      // The server changes while its realtime notifications cannot reach this client.
      stubs = ribbonRpcStubs({
        threadActions: [{ threadId: "thr_a", actions: labels.map((label) => ({ id: label, label, prompt: label })) }],
        childRanks: labels.map((_, index) => ({ parentThreadId: "thr_a", threadId: `thr_child_${labels.length - index}` })),
      }) as typeof stubs;
      expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(previous);

      connection = "connected";
      rerender(client());
      await waitFor(() => {
        expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(labels);
        expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
          labels.map((_, index) => `thr_child_${labels.length - index}`),
        );
      });
    }
  });

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
    stubs.saveThreadActionsV1 = () => ({ ok: true });
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

    // Editing another thread's actions changes the provider's value, not either row.
    await act(async () => screen.getByText("edit").click());
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
