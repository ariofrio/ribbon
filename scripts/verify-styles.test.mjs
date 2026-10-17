import assert from "node:assert/strict";
import test from "node:test";
import { arbitraryVariants, unqualifiedGroupHas } from "./verify-styles.mjs";

const SCOPE = String.raw`:where([data-bb-plugin="example"], [data-bb-plugin-root]:not([data-bb-plugin]))`;

test("flags a group-has utility whose :has() sits inside a wildcard :is()", () => {
  const stylesheet = String.raw`@layer utilities{${SCOPE} .group-has-\[\:focus-visible\]\/row\:opacity-100:is(:where(.group\/row):has(:focus-visible) *){opacity:1}}`;
  assert.deepEqual(unqualifiedGroupHas(stylesheet), [
    String.raw`${SCOPE} .group-has-\[\:focus-visible\]\/row\:opacity-100:is(:where(.group\/row):has(:focus-visible) *)`,
  ]);
});

test("accepts a :has() that qualifies the ancestor directly", () => {
  const stylesheet = String.raw`@layer utilities{${SCOPE} .x{:where(.row):has(:focus-visible) &{opacity:1}}.y:has(:focus-visible){opacity:1}.z:is(:where(.group\/row):hover *){opacity:1}}`;
  assert.deepEqual(unqualifiedGroupHas(stylesheet), []);
});

test("reads arbitrary variants that qualify an ancestor before the element", () => {
  assert.deepEqual(
    arbitraryVariants(
      'cn("[&>svg]:hidden", "pointer-fine:[:where(.row):has(:focus-visible)_&]:w-5")',
    ),
    ["[&>svg]:hidden", "[:where(.row):has(:focus-visible)_&]:w-5"],
  );
});
