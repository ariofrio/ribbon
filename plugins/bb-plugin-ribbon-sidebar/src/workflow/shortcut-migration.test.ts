import { expect, it } from "vitest";
import { migrateShortcutOverrides } from "./shortcut-migration";
const shortcut = {
  key: "k",
  mod: true,
  meta: false,
  control: false,
  alt: true,
  shift: true,
};
it("preserves custom and cleared bindings, unrelated overrides, and newer Ribbon choices", () => {
  const overrides = [
    { command: "plugin:thread-stages/complete-thread" as const, shortcut },
    { command: "plugin:thread-stages/defer-thread" as const, shortcut: null },
    {
      command: "plugin:ribbon-sidebar/complete-thread" as const,
      shortcut: null,
    },
    { command: "plugin:unrelated/command" as const, shortcut },
  ];
  const next = migrateShortcutOverrides(overrides, false);
  expect(next).toEqual([
    { command: "plugin:ribbon-sidebar/complete-thread", shortcut: null },
    { command: "plugin:unrelated/command", shortcut },
    { command: "plugin:ribbon-sidebar/defer-thread", shortcut: null },
  ]);
  expect(migrateShortcutOverrides(next, false)).toEqual(next);
});
it("prevents old plugin defaults from conflicting while an upgrade is in progress", () => {
  const next = migrateShortcutOverrides([], true);
  expect(
    next.filter((row) => row.command.startsWith("plugin:ribbon-sidebar/")),
  ).toHaveLength(11);
  expect(
    next.filter((row) => row.command.startsWith("plugin:thread-stages/")),
  ).toEqual(
    expect.arrayContaining([
      { command: "plugin:thread-stages/complete-thread", shortcut: null },
    ]),
  );
  expect(
    next.find((row) => row.command === "plugin:ribbon-sidebar/complete-thread")
      ?.shortcut?.key,
  ).toBe(".");
  expect(migrateShortcutOverrides([], false)).toEqual([]);
});

it("keeps legacy commands disabled during a staggered upgrade, including customized and cleared bindings", () => {
  const next = migrateShortcutOverrides(
    [
      { command: "plugin:thread-stages/complete-thread", shortcut },
      { command: "plugin:thread-stages/defer-thread", shortcut: null },
    ],
    true,
  );
  expect(next).toEqual(
    expect.arrayContaining([
      { command: "plugin:ribbon-sidebar/complete-thread", shortcut },
      { command: "plugin:ribbon-sidebar/defer-thread", shortcut: null },
      { command: "plugin:thread-stages/complete-thread", shortcut: null },
      { command: "plugin:thread-stages/defer-thread", shortcut: null },
    ]),
  );
});
