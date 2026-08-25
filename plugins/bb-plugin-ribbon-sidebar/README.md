# Ribbon sidebar

Ribbon sidebar is the Ribbon suite's single thread-list surface for bb. It
keeps BB's pinned threads and hierarchy, then lets a client independently
choose which project, section, or provider group to show and which grouping
divides the visible root threads.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-dark.png">
  <img src="assets/screenshot-light.png" alt="Ribbon sidebar grouping a bb thread list by workflow stage">
</picture>

Thread stages v0.8.0 is the first grouping provider. On the first mounted
Ribbon sidebar client, its existing stages and manual order migrate through the
provider's versioned snapshot and compare-and-swap acknowledgement. Installing
Ribbon sidebar without selecting it under **Settings → Appearance → Sidebar**
does not transfer placement.

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
be collapsed or used as a scope filter. Scope, grouping, and collapsed groups
are local to the current client. The Projects and sections menu retains project
and section creation plus entity actions. If the Ribbon UI cannot load, it
delegates to bb's original list.

## CLI

Every group reference has the form `<grouping-key>/<group-id>`:

```sh
bb ribbon-sidebar groupings
bb ribbon-sidebar groups <grouping>
bb ribbon-sidebar list [--scope <group-ref>] [--group-by <grouping>]
bb ribbon-sidebar show [thread] [--self]
bb ribbon-sidebar place [thread] --to <group-ref> [--before <thread>|--after <thread>]
bb ribbon-sidebar migrate thread-stages
bb ribbon-sidebar rekey --from <plugin-key> --to <plugin-key>
```

Add `--json` to any data command for machine-readable output. `migrate` is the
explicit alternative to mounting Ribbon sidebar. `rekey` atomically moves
placement when a provider intentionally changes a plugin grouping key.

## Settings

Ribbon sidebar can hide the Projects and sections control, hide message
previews, or show experimental indicators on collapsed nonempty groups.
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
