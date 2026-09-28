import { describe, expect, it } from "vitest";
import { derivePreviewFromEvents, previewMessageText } from "./preview";

const userTurn = (seq: number, text: string, extra: Record<string, unknown> = {}) => ({
  seq,
  type: "client/turn/requested",
  data: { initiator: "user", input: [{ type: "text", text }], ...extra },
});
const agentMessage = (seq: number, text: string) => ({
  seq,
  type: "item/completed",
  data: { item: { type: "agentMessage", id: `msg-${seq}`, text } },
});

describe("message previews", () => {
  it("uses the newest user or assistant message and strips markdown", () => {
    expect(
      derivePreviewFromEvents([
        userTurn(1, "old"),
        agentMessage(3, "**Shipped** [the fix](https://example.com)"),
        {
          seq: 2,
          type: "item/completed",
          data: { item: { type: "commandExecution", id: "cmd", command: "ls" } },
        },
      ]),
    ).toBe("Shipped the fix");
  });

  it.each([
    ["Open [the page](https://example.com/a(b))", "Open the page"],
    ["```ts\nconst a = 1;\n```", "const a = 1;"],
    ["See <b>this</b> and <br/>", "See this and"],
    ["This is *important* work", "This is important work"],
    ["[ ] first item", "first item"],
    ["[ref]: https://example.com\nSee the ref", "See the ref"],
  ])("preserves the released plain-text output for %s", (text, expected) => {
    expect(derivePreviewFromEvents([userTurn(1, text)])).toBe(expected);
  });

  it("reads every message-bearing event the timeline shows", () => {
    expect(
      previewMessageText({
        seq: 1,
        type: "client/turn/requested",
        data: {
          initiator: "user",
          input: [
            { type: "text", text: "hidden", visibility: "agent-only" },
            { type: "image", url: "https://example.com/a.png" },
            { type: "text", text: "Fix " },
            { type: "text", text: "the build" },
          ],
        },
      }),
    ).toBe("Fix the build");
    expect(
      previewMessageText({
        seq: 2,
        type: "system/manager/user_message",
        data: { text: "Legacy note" },
      }),
    ).toBe("Legacy note");
    expect(
      previewMessageText({
        seq: 3,
        type: "item/completed",
        data: {
          item: {
            type: "userMessage",
            id: "u",
            content: [
              { type: "text", text: "Steered " },
              { type: "localFile", path: "/tmp/a" },
              { type: "text", text: "here" },
            ],
          },
        },
      }),
    ).toBe("Steered here");
    expect(previewMessageText(agentMessage(4, "Done."))).toBe("Done.");
  });

  it("ignores events the timeline hides or that carry no message", () => {
    expect(
      previewMessageText(
        userTurn(1, "tool result", {
          initiator: "system",
          systemMessageSubject: { kind: "tool-call", suppress: true },
        }),
      ),
    ).toBeNull();
    expect(
      previewMessageText(
        userTurn(2, "visible tool result", {
          initiator: "system",
          systemMessageSubject: { kind: "tool-call", suppress: false },
        }),
      ),
    ).toBe("visible tool result");
    expect(
      previewMessageText({
        seq: 3,
        type: "client/turn/requested",
        data: { initiator: "user", input: [{ type: "text", text: "", }] },
      }),
    ).toBeNull();
    expect(previewMessageText(agentMessage(4, ""))).toBeNull();
    expect(
      previewMessageText({
        seq: 5,
        type: "item/completed",
        data: { item: { type: "reasoning", id: "r", text: "thinking" } },
      }),
    ).toBeNull();
    expect(
      previewMessageText({ seq: 6, type: "turn/completed", data: {} }),
    ).toBeNull();
    expect(derivePreviewFromEvents([])).toBeNull();
  });
});
