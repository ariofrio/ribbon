import { describe, expect, it } from "vitest";
import { derivePreview } from "./preview";

describe("message previews", () => {
  it("uses the newest user or assistant message and strips markdown", () => {
    expect(
      derivePreview([
        { kind: "conversation", role: "user", text: "old", sourceSeqEnd: 1 },
        {
          kind: "group",
          sourceSeqEnd: 3,
          children: [
            {
              kind: "conversation",
              role: "assistant",
              text: "**Shipped** [the fix](https://example.com)",
              sourceSeqEnd: 3,
            },
          ],
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
    expect(
      derivePreview([
        { kind: "conversation", role: "user", text, sourceSeqEnd: 1 },
      ]),
    ).toBe(expected);
  });
});
