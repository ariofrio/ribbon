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
});
