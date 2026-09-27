import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  intentFingerprint,
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
  ).toEqual({ count: 3, firstTurnEnded: false });
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
