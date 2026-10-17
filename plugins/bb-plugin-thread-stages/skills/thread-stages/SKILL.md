---
name: thread-stages
description: Inspect and organize bb threads across sections, projects, and the In progress, Needs user, Dependent, Blocked, Deferred, and Completed workflow stages. Use when deciding which stage a bb thread belongs in, including after asking the user something, selecting threads by sidebar organization or stage before bulk work or messaging, changing a thread's or child's stage, moving and ordering root threads, ordering children among siblings, managing saved prompt actions beside thread titles, or reading and changing the thread list's layout preferences. Discover the installed CLI rather than assuming its commands.
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

**Automatic stage updates** (`automaticStageUpdates`) is on by default.
Turning it off tells agents to change stages only when the user explicitly
requests a change. Setting changes apply when bb next constructs the agent's
provider session.

A stage describes the thread's overall workflow, including what can progress
and whose action is needed. Inspect its current stage with
`bb thread-stages show --self --json` before changing it; write only when it no
longer fits. A turn ending, a short side discussion, runtime
idleness, or a routine monitoring check does not by itself change the stage.
Respect an explicit instruction to retain a stage or let the user manage it.

| Stage | ID | Meaning |
| --- | --- | --- |
| **In progress** | `Active` | Work is available, progressing, or awaiting computation or an established condition under this thread's coordination. |
| **Needs user** | `BlockedOnUser` | The user owes input, a decision, approval, direction, or intended review, and no useful independent work remains here. |
| **Dependent** | `BlockedOnOtherAgent` | Another bb thread owns a required action or result, and no useful independent work remains here. |
| **Blocked** | `BlockedOnThirdParty` | An independent external party owns a required action or response, and no useful independent work remains here. |
| **Deferred** | `Deferred` | Intentionally set aside for later. |
| **Completed** | `Completed` | The established objective has reached a durable result and the thread can be put away, with intended review and loose ends settled or delegated. |

Use **Needs user** when the user owes input, a decision, approval,
direction, or intended review and no useful independent work remains. Continue
independent work in **In progress** before selecting Needs user. An answer
or report does not establish that the user has reviewed it; opening the thread,
read status, and silence do not establish review either.

Computation, passive observation, scheduled starts, propagation, and system
recovery remain **In progress**, as do this thread's executing workers and
managed jobs. Establish what resumes the work and how it will be noticed or
checked; do not promise automatic follow-up without an actual arrangement.
Regular checks do not require toggling the stage.

Use **Dependent** when another bb thread owns a required action or result and
no useful independent work remains here. Identify that thread in the conversation
when relevant; do not infer ownership from hierarchy, project, provider, or machine.
Use **Blocked** when an independent third party owns a required response or action,
whether a person, agent, or organization. A stage does not authorize reminders.
Continue useful independent work in **In progress** before selecting either.

### Completing a thread

Set **Completed** when the established objective has been carried through to
a finished result that is safe to put away. Check the full conversation:
intended review, open questions, delivery, and follow-ups must be **settled or
delegated**. Results belong in their lasting destination, such as a merged PR
or code saved or published where the work requires it. Delegation means the
remaining responsibility is tracked elsewhere and its receiving owner has
accepted it; notification alone is insufficient. Until acceptance is established,
arranging the handoff remains In progress; a proposed recipient does not yet own a
blocker. Work this thread still coordinates remains its responsibility,
including verification after a handoff.

Filing an issue, submitting a PR, or sending a report finishes a delivery step;
it does not by itself resolve the problem or delegate follow-up. Infer the
objective from the full conversation, not just the latest request to submit
findings. Keep unresolved findings open through resolution and verification
unless the agreed scope explicitly ends at reporting or the remaining
responsibility has been handed off. Useful investigation or an unestablished
follow-up path keeps In progress. Once no independent work remains, required
user input or intended review uses Needs user; a required fix owned by
another thread or an external party uses Dependent or Blocked.
A bounded reporting task can finish even while its filed issue remains open.

Initial questions, exploratory research, and proposals may be preparation for
broader work. Continue useful investigation in In progress; use Needs user
when the next required step is the user’s answer, decision, or intended review
and no independent work remains. A substantial report alone does not establish
closure. Standalone research can finish when its actual scope,
review, and follow-ups are fulfilled or delegated. Use the request, conversation,
and delivery evidence to infer completion after established work; a separate
explicit closing agreement is not required. Concrete loose ends or meaningful
uncertainty keep In progress, while the abstract possibility of future questions
does not. Finishing an individual request or turn is insufficient.

Place a thread by stage ID:
`bb thread-stages stage BlockedOnOtherAgent --self`.

Each child has its own stage and remains nested beneath its parent. A child
can be reordered among its siblings, while its stage remains independent.

New root threads enter at the top of their section, project, and machine.
In progress, Needs user, Dependent, and Blocked share the main band; changing
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
stage. Needs user uses a filled unread marker; Dependent an hourglass; Blocked a people
icon. Completed has a checkmark and a struck-through title; Deferred uses a
pause icon. Outside Tree mode, In progress is blank at
rest; **In progress icon on hover** chooses no icon or a hollow unread marker
on hover or keyboard focus. In Tree mode the same hollow marker uses the tree
line’s color at rest. In progress and Needs user use primary ink for their icons and titles;
other stages use secondary ink, and the selected row uses primary ink. Activity
appears on the right. **Unread indicator on the right** defaults off. A collapsed root's
activity indicator also reflects work in its hidden descendants. A pending
question or approval takes precedence over activity.

## Stage mentions

A mention of a stage, such as `@In progress` or `@Blocked`, names
that stage. A placement request, such as "do this, then @Dependent" or a stage mention on its own, asks for the thread to be placed in
that stage once the rest of the message is done. The plugin also tells a
thread when someone else changes its stage, as "Thread stage updated: @In progress
→ @Blocked"; that move has already happened. Older messages
may mention `@Idle`, `@Active`, or `@Waiting`, now In progress. Earlier blocker
names still resolve. The stored IDs stay `Active`, `BlockedOnUser`,
`BlockedOnOtherAgent`, and `BlockedOnThirdParty`; Waiting assignments migrate to
In progress without changing the containing group's order. Discussing a stage without requesting placement does not
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
