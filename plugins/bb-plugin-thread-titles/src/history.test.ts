import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  intentFingerprint,
  opening,
  transcript,
  userActivity,
  type Event,
} from "./history";

function event(seq: number, type: string, data: unknown): Event {
  return {
    id: String(seq),
    threadId: "source",
    scope: { kind: "turn", turnId: "turn" },
    seq,
    createdAt: seq * 1000,
    type,
    data,
  } as Event;
}

it("counts accepted user submissions, including grouped messages, without retries or agent input", () => {
  const request = (seq: number, extra = {}) =>
    event(seq, "client/turn/requested", {
      initiator: "user",
      requestId: String(seq),
      input: [],
      ...extra,
    });
  expect(
    userActivity([
      request(1),
      request(2, { retryOfRequestId: "1" }),
      request(3, { initiator: "agent" }),
      request(4),
      event(5, "client/turn/rejected", { requestId: "4" }),
      request(6, { inputGroups: [[], []] }),
    ]),
  ).toEqual({ count: 3, firstTurnEnded: false, titleStep: "pending" });
});

it("reads whether bb generated a title from its provisioning step", () => {
  const step = (seq: number, titleGenerated: boolean) =>
    event(seq, "system/thread-provisioning", {
      entries: [{ type: "step", key: "metadata-completed", status: "completed", metadata: { titleGenerated } }],
    });
  const started = event(1, "system/thread-provisioning", {
    entries: [{ type: "step", key: "metadata-started", status: "started" }],
  });
  expect(userActivity([started]).titleStep).toBe("pending");
  expect(userActivity([started, step(2, true)]).titleStep).toBe("generated");
  expect(userActivity([started, step(2, false)]).titleStep).toBe("none");
});

it("includes streamed assistant text and command output before completion", () => {
  const history = transcript([
    event(1, "item/started", {
      item: { id: "a", type: "agentMessage", text: "" },
    }),
    event(2, "item/agentMessage/delta", { itemId: "a", delta: "Working" }),
    event(3, "item/started", {
      item: { id: "c", type: "commandExecution", command: "ls" },
    }),
    event(4, "item/commandExecution/outputDelta", {
      itemId: "c",
      delta: "calendar.ts",
    }),
  ]);
  expect(history).toContain("Working");
  expect(history).toContain("calendar.ts");
  expect(history).toContain('"partial":true');
});

it("trims long tool output but keeps messages in full", () => {
  const long = (label: string) => `${label}-start ${"x".repeat(20_000)} ${label}-end`;
  const history = transcript([
    event(1, "client/turn/requested", { initiator: "user", input: long("request") }),
    event(2, "item/completed", {
      item: { id: "c", type: "commandExecution", command: "npm install", aggregatedOutput: long("output") },
    }),
    event(3, "item/started", { item: { id: "s", type: "commandExecution", command: "npm test" } }),
    event(4, "item/commandExecution/outputDelta", { itemId: "s", delta: long("stream") }),
    event(5, "item/completed", { item: { id: "a", type: "agentMessage", text: long("answer") } }),
  ]);
  expect(history).toContain("npm install");
  for (const label of ["output", "stream"]) {
    expect(history).toContain(`${label}-start`);
    expect(history).toContain(`${label}-end`);
  }
  expect(history).toContain("characters trimmed");
  expect(history).toContain(long("request"));
  expect(history).toContain(long("answer"));
  expect(history.length).toBeLessThan(45_000);
});

it("leaves out model reasoning", () => {
  const history = transcript([
    event(1, "item/started", { item: { id: "r", type: "reasoning", text: "" } }),
    event(2, "item/reasoning/textDelta", { itemId: "r", delta: "private thought" }),
    event(3, "item/completed", { item: { id: "r", type: "reasoning", text: "private thought" } }),
    event(4, "item/completed", { item: { id: "a", type: "agentMessage", text: "Done" } }),
  ]);
  expect(history).not.toContain("private thought");
  expect(history).toContain("Done");
});

it("takes the longest opening of whole lines that fits", () => {
  const history = ["first", "second", "third"].join("\n");
  expect(opening(history, 1_000)).toBe(history);
  expect(opening(history, 14)).toBe("first\nsecond");
  expect(opening(history, 4)).toBe("");
  expect(opening("é\nb", 2)).toBe("é");
});

it("ignores new appended turns but detects context clearing after a snapshot", () => {
  const initial = [event(1, "client/turn/requested", { input: "First" })];
  const hash = intentFingerprint(initial, 1);
  expect(
    intentFingerprint(
      [...initial, event(2, "client/turn/requested", { input: "Next" })],
      1,
    ),
  ).toBe(hash);
  expect(
    intentFingerprint(
      [
        ...initial,
        event(2, "system/operation", { operation: "context_clear" }),
      ],
      1,
    ),
  ).not.toBe(hash);
});

it("uses only public plugin APIs", () => {
  const scan = experimental_scanPublicSdkOnly(
    fileURLToPath(new URL("..", import.meta.url)),
    {
      allow: [
        /^zod$/,
        /^vitest\/config$/,
        /^react$/,
        /^@testing-library\/react$/,
        // bb's own vendored UI and what it imports.
        /^@\/vendor\//,
        /^@radix-ui\/react-slot$/,
        /^class-variance-authority$/,
        /^clsx$/,
        /^tailwind-merge$/,
      ],
    },
  );
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});
