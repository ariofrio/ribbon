---
name: thread-stages
description: Inspect and organize bb thread workflow stages, sidebar groups, order and layout, and saved prompt actions. Use when maintaining a thread's stage, selecting threads by sidebar organization, moving or ordering roots or children, or changing sidebar preferences. Discover the installed CLI.
---

# Thread stages

Start by running `bb thread-stages`, and discover the available operations
and arguments from its help as needed. Do not rely on a memorized command
surface.

For requests to inspect, edit, or run saved prompt buttons beside thread titles,
read [Thread actions](../thread-actions/SKILL.md) and follow its instructions.
Load it when needed without asking the user to invoke it separately.

## Selecting threads

Use the joined thread view, `bb thread-stages list --json`, before selecting
roots for bulk work or messaging. It combines bb thread metadata with section,
project, machine, and workflow stage, so selection rules based on organization
should be applied to that complete view rather than reconstructed from separate
partial lists.

Root threads are organized into groups with children nested beneath them. Use
the child's own thread ID to inspect or change its stage or sibling order;
resolve it to a root for section, project, machine, or root-order operations. Use
`--include-children` when listing child stages.

## Stages

**Automatic stage updates** (`automaticStageUpdates`) defaults on. When off,
change stages only at the user's explicit request. Honor instructions to retain
a stage. Setting changes apply at the next provider session.

Use the full conversation to identify the objective and remaining responsibility.
Inspect `bb thread-stages show --self --json`; write only when the stage no
longer fits. Turns ending, side requests, and runtime idleness do not change
the workflow. Continue useful independent work before marking it Blocked.
Preserve existing authorization; an unsuccessful attempt alone does not establish
a user decision.

| Stage | ID | Meaning |
| --- | --- | --- |
| **Deferred** | `Deferred` | Intentionally set aside for later. |
| **In progress** | `Active` | Useful work remains or is executing here, including coordinated workers and jobs. |
| **Waiting** | `Waiting` | Passive observation, elapsed time, accepted queued work, or self-recovery, with an established notification or check to resume when due. |
| **Blocked on user** | `BlockedOnUser` | Required user input, decision, approval, or intended review is the only next step. |
| **Blocked on another thread** | `BlockedOnOtherAgent` | An independent bb workflow owns a required delivery. |
| **Blocked on external party** | `BlockedOnThirdParty` | An independent outside owner owes a required action, whether human, AI, or organization. |
| **Completed** | `Completed` | The objective is durably delivered; intended review and follow-ups are settled or delegated. |

Ownership, not hierarchy or runtime status, distinguishes independent workflows
from coordinated workers. Required counterpart delivery is Blocked, not Waiting;
stages do not authorize reminders. Keep In progress while establishing a
resumption path. Routine observation checks do not toggle Waiting.

### Completion

Delegation requires tracked responsibility and the receiving owner's acceptance;
notification alone does not suffice. Retain work this thread still coordinates,
including verification after a handoff.

A delivery request does not narrow the established objective without an explicit
scope change. Reporting-only tasks can finish with open issues; otherwise retain
unresolved investigation and follow-up that this thread still owns. Intended
review must actually occur; silence, read status, and opening a thread do not
establish it.
Infer closure from scope and delivery evidence without inventing a separate
closing approval. Concrete loose ends keep the workflow open; hypothetical
future questions do not.

Place a thread by stage ID:
`bb thread-stages stage BlockedOnOtherAgent --self`.

Each child has its own stage and remains nested beneath its parent. A child
can be reordered among its siblings, while its stage remains independent.

New root threads enter at the top of their section, project, and machine.
In progress, Waiting, and all three Blocked stages share the main band; changing
between those stages keeps a root's position. Deferred and Completed are subgroups of the
current organization and use its saved order. Section, project, and machine
orders are independent. Moving a root into another band defaults to the top
through either the UI or CLI. Returning from Deferred or Completed to In progress
restores the main-band position, and the undo shortcut restores the position
before a stage move.

Use `bb thread-stages order <thread> --by section|project|machine` with
`--before <thread>`, `--after <thread>`, `--first`, or `--last`; `--by` defaults
to section. Anchors must be in the same group and stage band. Children use
one sibling order across all organizations. `list --by` reads that
organization's order; filter with `--section`, `--project`, `--machine`, and
`--stage`. Change section membership with `bb thread update`, then use
`order` if another position is needed. Saved group order appears with Custom
sorting; automatic sorting keeps its selected order.

Treat **Completed** threads as out of scope by default. Exclude them from bulk
operations, messages, and notifications unless the user explicitly includes
them or intends to resume them. Do not archive a thread merely to mark it
Completed; Completed threads archive on their own after the configured retention period
(seven days by default).

Stages change only when someone sets them; thread activity alone never changes a
stage. A working thread keeps its stage, and the list shows the work by
turning the stage icon's ring on that row. A collapsed root's ring also turns
for work in its hidden descendants. A pending question or approval stops the
ring, because the thread is waiting on the user rather than working.

## Stage mentions

A mention of a stage, such as `@In progress` or `@Blocked on external party`, names
that stage. A placement request, such as "do this, then @Blocked on another
thread" or a stage mention on its own, asks for the thread to be placed in
that stage once the rest of the message is done. The plugin also tells a
thread when someone else changes its stage, as "Thread stage updated: @In progress
→ @Blocked on external party"; that move has already happened. Older messages
may mention `@Idle` or `@Active`, now In progress, or `@Blocked`,
now split into Blocked on another thread and Blocked on external party. Earlier
names still resolve; In progress keeps the stored `Active` ID, and Blocked on
user uses `BlockedOnUser`. Discussing a stage without requesting placement does not
ask for a stage change.

## Layout preferences

The plugin also owns the list's layout state, such as how threads are
organized and sorted, which groups are hidden, and which are collapsed.
`bb thread-stages prefs list`, without `--json`, prints every key with its
current value and description; read it rather than assuming which keys exist.

bb's built-in thread list keeps its own copy of these preferences under
`bb thread-list prefs`. This plugin draws the sidebar instead, so a change
made there never reaches it: use `bb thread-stages prefs`.

```sh
bb thread-stages prefs list [--json]
bb thread-stages prefs get <key> [--json]
bb thread-stages prefs set <key> <value> [--json]
bb thread-stages prefs reset <key> [--json]
```

`set` takes JSON; a bare word is read as a string, so
`bb thread-stages prefs set organizationMode project` and
`bb thread-stages prefs set manualSectionOrder '["pinned","sections","threads"]'`
both work. A value the key's schema rejects fails with
`invalid_preference_value` and leaves the stored value alone. Every open
window applies a change immediately. Sections themselves and a thread's
section are bb core state: use `bb thread section` and `bb thread update`.

`rowActions` picks up to three quick-action buttons a thread row shows on
hover, left to right before its actions menu. They use thread action keys:
`bb--core/split`, `bb--core/copyLink`, `bb--core/read`, `bb--core/pin`,
`bb--core/rename`, `bb--core/archive`, `bb--core/delete`, Ribbon's
`thread-stages/move`, or another plugin's `<pluginId>/<actionId>`. Bare legacy
ids such as `archive` still work. The default is `'[]'`, which leaves only the
menu. For example,
`bb thread-stages prefs set rowActions '["bb--core/pin","bb--core/archive"]'`.
Customize row actions edits three slots on the row; each slot picks an action,
filled slots can Hide or drag to reorder, and Done, Escape, or a click elsewhere
finishes. Narrow rows keep overflow actions in their menu so saved prompts and
PR numbers stay in place.

Organize → Groups → By read status lists unread threads above the rest within
each stage band, preserving the selected sort. `groupByReadStatus` defaults to
`false`; use `bb thread-stages prefs set groupByReadStatus true` to enable it.
Parents start collapsed without changing saved collapse state, environment
grouping is suspended, and the open thread keeps its place until another opens.

New threads inherit the sidebar group where creation was invoked. Pinned
creates pinned threads; custom sections supply their section; project, machine,
and general thread groups start unsectioned and unpinned. Environment rows
reuse their environment and the containing group's placement. In Pinned,
they retain the group's common underlying section for unpinning; mixed-section
groups use no underlying section.
