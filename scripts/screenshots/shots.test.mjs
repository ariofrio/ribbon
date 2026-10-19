import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHOTS } from "./shots.mjs";

test("every marketplace plugin has light and dark screenshots and README cards", () => {
  const collection = JSON.parse(readFileSync(new URL("../../.bb/plugins.json", import.meta.url), "utf8"));
  for (const entry of collection.plugins) {
    const plugin = entry.source.split("/").at(-1);
    const shot = SHOTS.find((candidate) => candidate.plugin === plugin);
    assert.ok(shot, `${plugin} has no showcase`);
    for (const theme of ["light", "dark"]) {
      for (const prefix of ["screenshot", "card", "card-beside"]) {
        assert.ok(shot.outputs.includes(`${prefix}-${theme}.png`), `${plugin}: ${prefix}-${theme}`);
      }
    }
  }
});
