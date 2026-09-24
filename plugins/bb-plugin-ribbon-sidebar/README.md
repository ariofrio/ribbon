# Ribbon sidebar

Keep every section visible, with stable thread order and workflow stage icons.

![Ribbon sidebar](assets/screenshot.png)

Install Ribbon and select **Ribbon sidebar** under **Settings → Appearance → Sidebar** (bb 0.43.4 or newer):

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install ribbon-sidebar@ribbon
```

## Sections and ordering

Sections are the only headings. Inside each section, Idle, Active, and Blocked
share one manually ordered list, followed immediately by Deferred and Completed.
New roots enter at the top. Activity changes leave their positions unchanged.

Deferred initially shows two roots in section order; Completed shows the two
most recent completions. **Show N more deferred/completed** expands the rest,
and **Show fewer** restores the preview. The open thread's hierarchy remains
visible even outside that preview. Search reveals every matching result.

Use a section's chevron to collapse it; the label keeps bb's existing behavior.
A collapsed section previews the open thread. Its plus button creates a thread
in that section. Section names, icons, menus, row styles, and focus treatments
use Ribbon's existing bb components and theme tokens.

Drag a root to reorder it within its list, or onto another section's header to
move it there. Dragging preserves its stage. Change stages through the thread
menu, CLI, or keyboard shortcuts. Completed stays ordered by completion time.
Section rank survives stage changes, so returning a deferred or completed root
to the main list restores its place.

bb owns section membership, pins, pinned order, and lifecycle. Ribbon stores
section rank and workflow stage separately. Children inherit their root's stage
and remain nested. Forks inherit their source hierarchy's section and stage;
unparenting copies the former root's placement.

Thread status indicators retain bb's priority for errors, input requests, active
work, queued messages, unread completions, and drafts. Split-pane maps, previews,
PR numbers, thread menus, and chosen section icons remain available.

## Stages and shortcuts

Ribbon owns stage automation, shortcuts, and Completed retention. Idle roots
become Active while a turn or background command runs anywhere in the hierarchy.
A pending question or approval takes priority on that thread; work on another
descendant can still keep the root Active. Automation preserves manual Deferred,
Blocked, and Completed assignments.

Completed hierarchies auto-archive after seven days by default. Ribbon settings
can select 1 or 30 days, or Never. Completion and subsequent root or descendant
updates restart the timer. Any pinned member prevents archival.

| Shortcut | Action |
| --- | --- |
| ⌘. / ⌥⌘. | Complete and select the next main-list thread in this section |
| ⇧⌘. | Return to Idle, or undo the latest filing in this section |
| ⌃⇧⌘. | Mark Blocked |
| ⌃⌘. | Defer |
| ⌥⌘↑ / ⌥⌘↓ | Move within the main or Deferred list |
| ⌥⇧⌘↑ / ⌥⇧⌘↓ | Move to that list's edge |
| ⌃⌘↑ / ⌃⌘↓ | Move to the adjacent enabled stage |

Shortcuts can be rebound in bb. Enter opens a focused thread; Space starts a
keyboard drag. Expanding an overflow list from the keyboard focuses its first
newly revealed thread.

## Upgrades and CLI

Existing assignments and retained ranks remain in Ribbon's placement store.
Older Thread stages data is imported and verified before acknowledgment. Its
settings are copied once. The optional [Thread stages compatibility plugin](../bb-plugin-thread-stages#readme)
provides the old stage RPCs while saved keyboard bindings, including cleared
bindings, migrate to Ribbon command IDs. New installations need only Ribbon.

The placement CLI remains compatible, including the stored stage key
`plugin:thread-stages:stages`:

```sh
bb sidebar groupings
bb sidebar groups builtin:sections
bb sidebar list --scope builtin:sections/<section-id>
bb sidebar show --self
bb sidebar place --self --to plugin:thread-stages:stages/Completed
bb sidebar place <thread> --to builtin:sections/<section-id> --before <thread>
bb sidebar migrate thread-stages
```

Use `bb sidebar` to discover the full command surface. `list --json` joins
thread metadata, project, section, and stage. Archived and hidden roots are
excluded unless requested with `--include-archived` or `--include-hidden`.

## Development

```sh
npm run release:check
```

[MIT](LICENSE)
