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
const other = { ...shortcut, key: "j" };

it("copies Ribbon sidebar's bindings, cleared ones included, over the nulls its upgrade left here", () => {
  const overrides = [
    { command: "plugin:thread-stages/complete-thread" as const, shortcut: null },
    { command: "plugin:thread-stages/defer-thread" as const, shortcut: null },
    { command: "plugin:ribbon-sidebar/complete-thread" as const, shortcut },
    { command: "plugin:ribbon-sidebar/defer-thread" as const, shortcut: null },
    { command: "plugin:unrelated/command" as const, shortcut: other },
  ];
  const next = migrateShortcutOverrides(overrides, "thread-stages");
  expect(next).toEqual([
    { command: "plugin:thread-stages/complete-thread", shortcut },
    { command: "plugin:thread-stages/defer-thread", shortcut: null },
    { command: "plugin:ribbon-sidebar/complete-thread", shortcut },
    { command: "plugin:ribbon-sidebar/defer-thread", shortcut: null },
    { command: "plugin:unrelated/command", shortcut: other },
  ]);
  expect(migrateShortcutOverrides(next, "thread-stages")).toEqual(next);
});

it("drops a leftover null so the default binding applies when Ribbon never rebound the command", () => {
  const next = migrateShortcutOverrides(
    [
      { command: "plugin:thread-stages/complete-thread", shortcut: null },
      { command: "plugin:thread-stages/mark-blocked", shortcut },
    ],
    "thread-stages",
  );
  expect(next).toEqual([
    { command: "plugin:thread-stages/mark-blocked", shortcut },
  ]);
  expect(migrateShortcutOverrides([], "thread-stages")).toEqual([]);
});
