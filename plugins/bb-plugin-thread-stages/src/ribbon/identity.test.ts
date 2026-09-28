import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin identity", () => {
  it("publishes the Thread stages identity and its skill", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const skill = readFileSync("skills/thread-stages/SKILL.md", "utf8");

    expect(manifest.name).toBe("bb-plugin-thread-stages");
    expect(manifest.bb.name).toBe("Thread stages");
    expect(manifest.bb.skills).toEqual(["skills"]);
    expect(skill).toContain("name: thread-stages");
  });
});
