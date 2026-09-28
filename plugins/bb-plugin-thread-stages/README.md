# Thread stages

bb's thread list with workflow stages, stable thread order, and section and
project icons.

Install Ribbon and select **Thread stages** under **Settings → Appearance →
Sidebar** (bb 0.44.0 or newer):

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-stages@ribbon
```

## Where it comes from

This plugin is a fork of bb's own sidebar thread list, the built-in
[`plugins/thread-list`](https://github.com/get-bb/bb/tree/desktop-v0.44.0/plugins/thread-list),
so it keeps everything bb's list does — pinned threads, custom sections,
projects, machines, nested threads, drag to reorder, inline rename, and bb's
own status glyphs — and adds Ribbon's workflow stages, stable manual order,
and icons on top.

The upstream files keep their upstream-relative paths under `src/`, and
[`fork.json`](../../fork.json) in the repository root pins the bb release they
are in step with. `npm run fork:sync -- desktop-v<version>` merges a newer
release three-way; `npm run fork:diff` prints the fork's own changes in
upstream paths, so a fix that belongs to bb can travel there as a patch. bb's
UI components under `src/components/`, `src/lib/`, and `src/hooks/` are
vendored from bb's component registry by `npm run build:ui`.

## Preferences and CLI

The list's layout preferences — organization mode, sort, section order,
hidden groups, and collapsed groups — are stored by the plugin and synced to
every open window:

```sh
bb thread-stages prefs list [--json]
bb thread-stages prefs get <key> [--json]
bb thread-stages prefs set <key> <value> [--json]
bb thread-stages prefs reset <key> [--json]
```

## Development

```sh
npm run release:check
```

[MIT](LICENSE)
