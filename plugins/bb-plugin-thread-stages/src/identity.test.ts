import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin identity", () => {
  it("publishes the Thread stages compatibility bridge", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const collection = JSON.parse(
      readFileSync("../../.bb/plugins.json", "utf8"),
    );

    expect(manifest.name).toBe("bb-plugin-thread-stages");
    expect(manifest.bb.name).toBe("Thread stages");
    expect(manifest.bb.description).toBe(
      "Preserve existing stage shortcuts and migrate saved state to Ribbon sidebar.",
    );
    expect(manifest.bb.app).toBeUndefined();
    expect(manifest.bb.skills).toBeUndefined();
    expect(collection.plugins).toContainEqual({
      name: "thread-stages",
      source: "./plugins/bb-plugin-thread-stages",
    });
  });
});
