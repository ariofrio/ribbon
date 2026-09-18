import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin identity", () => {
  it("publishes the Ribbon sidebar identity and skill", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const skill = readFileSync("skills/ribbon-sidebar/SKILL.md", "utf8");

    expect(manifest.name).toBe("bb-plugin-ribbon-sidebar");
    expect(manifest.bb.name).toBe("Ribbon sidebar");
    expect(manifest.bb.skills).toEqual(["skills"]);
    expect(skill).toContain("name: ribbon-sidebar");
    expect(skill).toContain("bb plugin run ribbon-sidebar");
  });
});
