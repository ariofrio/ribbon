# Thread stages

Provide workflow stages, automation, and shortcuts to Ribbon sidebar.

Thread stages supplies the **Deferred**, **Idle**, **Active**, **Blocked**, and
**Completed** workflow to [Ribbon sidebar](../bb-plugin-ribbon-sidebar#readme).
It owns the stage catalog, lifecycle automation, keyboard shortcuts, CLI, and
Completed retention policy. Ribbon owns the sidebar UI, placement, and manual
order.

Thread stages no longer registers a sidebar replacement. Install Ribbon
sidebar to display and organize stages:

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install ribbon-sidebar@ribbon
bb plugin install thread-stages@ribbon
```

Then select **Ribbon sidebar** under **Settings → Appearance → Sidebar**.
Without Ribbon installed, Thread stages no longer draws a replacement list,
but its former stage assignments and retained order remain stored and readable.
Installing and mounting Ribbon later imports that snapshot, verifies it, and
only then acknowledges the one-way ownership handoff. The former filter and
collapsed state migrate locally in each client, so the organized sidebar
returns without restoring Thread stages' retired UI.

## Automation and retention

Only visible root threads have a stage. Child threads inherit their root's
stage and move with it. A root hierarchy moves from **Idle** to **Active** when
a turn or background command starts anywhere in the hierarchy, and returns to
**Idle** once none are working. A thread waiting on a question or approval
counts as Idle unless a background command is still running.

Automation does not override a manual **Deferred**, **Blocked**, or
**Completed** assignment. Deferred and Blocked can be disabled in Thread
stages settings; nonempty disabled groups remain visible but stop accepting
moves.

Completed roots are auto-archived after seven days by default. Settings can
change the delay to 1 or 30 days or disable it. The timer starts when the root
enters Completed and restarts whenever bb updates the root or a descendant. A
standalone background command that does not update a thread does not restart
it. The sweep skips a hierarchy when any member is pinned and otherwise
archives descendants before ancestors.

## Keyboard shortcuts

Stage shortcuts remain active while Ribbon sidebar is selected, and also while
another sidebar is visible:

| Shortcut | Action |
| ---: | --- |
| ⌘. / ⌥⌘. | File as Completed |
| ⇧⌘. | Return to Idle, or undo the latest filing |
| ⌃⇧⌘. | File as Blocked |
| ⌃⌘. | File as Deferred |
| ⌥⌘↑ / ⌥⌘↓ | Move one position within the stage |
| ⌥⇧⌘↑ / ⌥⇧⌘↓ | Move to the stage edge |
| ⌃⌘↑ / ⌃⌘↓ | Move to the adjacent enabled stage |

The filing chords walk through Idle threads, preserve root hierarchies, reject
child thread IDs, and ignore held-key repeats. Shortcuts for disabled stages
are left unclaimed.

## CLI

The compatibility CLI remains available and reads and writes Ribbon's
authoritative placement:

```sh
bb thread-stages list [--stage <stage>] [--json]
bb thread-stages show [<thread-id> | --self] [--json]
bb thread-stages update [<thread-id> | --self] [--stage <stage>] [--after <thread-id>] [--before <thread-id>] [--json]
```

If Ribbon sidebar is missing, these commands return an actionable dependency
error instead of writing the read-only migration source.

## Development

```sh
npm run release:check
bb plugin reload thread-stages
```

## License

[MIT](LICENSE)
