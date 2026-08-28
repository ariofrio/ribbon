# Ribbon sidebar

Ribbon sidebar is the Ribbon suite's single thread-list surface for bb. It
keeps BB's pinned threads and hierarchy, then lets a client independently
choose which project, section, or provider group to show and which grouping
divides the visible root threads.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-dark.png">
  <img src="assets/screenshot-light.png" alt="Ribbon sidebar grouping a bb thread list by workflow stage">
</picture>

Thread stages is the first grouping provider. Install it alongside Ribbon to
add workflow stages, automation, shortcuts, and Completed retention. Ribbon is
the sole owner of provider placement and manual order. On its first mounted
sync, Ribbon imports and verifies legacy Thread stages placement and retained
order before acknowledging the handoff. Thread stages keeps that source data
readable, so installing Ribbon later restores the previous organization.

## Install

Add this repository as a bb marketplace, install both the sidebar and the
provider, then select **Ribbon sidebar** under **Settings → Appearance →
Sidebar**:

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-stages@ribbon
bb plugin install ribbon-sidebar@ribbon
```

Ribbon sidebar also works without Thread stages. Its grouping picker always
includes BB Projects and Sections and discovers any compatible plugin exposing
`getGroupingCatalogV1`.

## Placement

Only visible, non-hidden root threads have placement. Child threads inherit
their root and remain attached in the rendered hierarchy. BB owns Project and
Section membership, pinned membership and order, and lifecycle; Ribbon sidebar
owns provider assignments and manual within-group order. Sections can be moved
from this release, while Projects remain read-only because bb's public SDK does
not yet expose project movement.

Drag a root before another row or onto a group's end target. Group headers can
be collapsed, while the Groups menu controls filtering and display grouping.
Filtering and grouping are local to the current client and cannot use the same
dimension at once; choosing one clears the other when necessary. Opening a
thread moves an existing Project or Section scope to that thread's root, and a
collapsed group previews only the opened thread. Search temporarily ignores
scope and collapse state. The Groups menu retains project and section creation
plus entity actions. If the Ribbon UI cannot load, it delegates to bb's
original list.

bb's New thread UI uses the selected Ribbon scope. Projects and Sections,
including Unorganized, are selected before creation through bb's composer
state. Writable provider groups are applied after bb returns the new thread ID.
Ribbon records the existing thread IDs on submission, so navigation after a
failed submission cannot place an existing thread.

Forks inherit the nearest explicit Section and provider placement on the fork
source's ancestor chain. Non-fork CLI threads use each grouping's default
group, including Unorganized. Unparenting copies placement from the former
parent chain. Reparenting writes no placement, so the thread inherits from its
new parent.

## CLI

Every group reference has the form `<grouping-key>/<group-id>`:

```sh
bb ribbon-sidebar groupings
bb ribbon-sidebar groups <grouping>
bb ribbon-sidebar list [--scope <group-ref>] [--group-by <grouping>]
bb ribbon-sidebar show [thread] [--self]
bb ribbon-sidebar place [thread] [--self] --to <group-ref> [--before <thread>|--after <thread>]
bb ribbon-sidebar migrate thread-stages
bb ribbon-sidebar rekey --from <plugin-key> --to <plugin-key>
```

Add `--json` to any data command for machine-readable output. `migrate`
explicitly retries the same idempotent import normally started by mounting the
sidebar. `rekey`
atomically moves placement when a provider intentionally changes a plugin
grouping key.

## Settings

Ribbon sidebar can hide the Groups control, message previews, group-header
icons, or experimental activity indicators for collapsed groups. Collapsed
Stages always show the highest-priority non-unread activity indicator, matching
Thread stages; collapsed nonempty groups always show their root-thread count.
Provider catalog, policy, automation, shortcuts, and retention remain in each
provider's settings.

## Development

```sh
npm run release:check
bb plugin reload ribbon-sidebar
```

The release check runs unit and UI tests, type checking, an SDK build, style
verification, and packed-artifact validation.

## License

[MIT](LICENSE)
