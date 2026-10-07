---
name: thread-stages
description: Inspect and organize bb threads across sections, projects, and the Deferred, Active, Blocked on other agent, Blocked on third party, and Completed workflow stages. Use when deciding which stage a bb thread belongs in, including after asking the user something, selecting threads by sidebar organization or stage before bulk work or messaging, changing a thread's or child's stage, moving and ordering root threads, ordering children among siblings, managing saved prompt actions beside thread titles, or reading and changing the thread list's layout preferences. Discover the installed CLI rather than assuming its commands.
---

# Thread stages

Start by running `bb thread-stages`, and discover the available operations
and arguments from its help as needed. Do not rely on a memorized command
surface.

## Selecting threads

Use the joined thread view, `bb thread-stages list --json`, before selecting
roots for bulk work or messaging. It combines bb thread metadata with section,
project, and workflow stage, so selection rules based on organization should
be applied to that complete view rather than reconstructed from separate
partial lists.

Root threads are organized into groups with children nested beneath them. Use
the child's own thread ID to inspect or change its stage or sibling order;
resolve it to a root for section, project, or root-order operations. Use
`--include-children` when listing child stages.

## Stages

A stage says whose move a thread is waiting on:

| Stage | ID | Whose move |
| --- | --- | --- |
| **Deferred** | `Deferred` | Nobody's yet: intentionally set aside for later. |
| **Active** | `Active` | The user's or this thread's: available, working, or waiting on the user. |
| **Blocked on other agent** | `BlockedOnOtherAgent` | Another agent's: another bb thread must finish or deliver something this one depends on. |
| **Blocked on third party** | `BlockedOnThirdParty` | Someone or something outside bb: a reviewer, CI, a vendor, a date. |
| **Completed** | `Completed` | Nobody's: finished, and treated like archived work. |

Waiting on the user is **Active**, never a Blocked stage. Ending a turn already
hands the thread to the user, so do not move a thread because you asked the
user a question, requested approval, or finished work for them to review. The
user is not a third party.

Place a thread by stage ID:
`bb thread-stages place --self --to plugin:thread-stages:stages/BlockedOnOtherAgent`.

Each child has its own stage and remains nested beneath its parent. A child
can be reordered among its siblings, while its stage remains independent.

Treat **Completed** threads as out of scope by default. Exclude them from bulk
operations, messages, and notifications unless the user explicitly includes
them or intends to resume them. Do not archive a thread merely to mark it
Completed; Completed threads archive on their own after seven days.

Stages change only when someone sets them; running work never changes a
stage. A working thread keeps its stage, and the list shows the work by
turning the stage icon's ring on that row. A collapsed root's ring also turns
for work in its hidden descendants. A pending question or approval stops the
ring, because the thread is waiting on the user rather than working.

## Stage mentions

A mention of a stage, such as `@Active` or `@Blocked on third party`, names
that stage. A message that mentions one, in a sentence such as "do this, then
@Blocked on other agent" or on its own, asks for the thread to be placed in
that stage once the rest of the message is done. The plugin also tells a
thread when someone else changes its stage, as "Thread stage updated: @Active
→ @Blocked on third party"; that move has already happened. Older messages may
mention `@Idle`, now Active, or `@Blocked`, now split into the two Blocked
stages.

## Thread actions

Thread actions are labeled buttons beside a thread's title. Running one sends
its saved prompt to that thread, just like clicking the button.

```sh
bb thread-stages actions list [<thread>] [--self] [--json]
bb thread-stages actions set [<thread>] [--self] --actions '<json-array>' [--json]
bb thread-stages actions run <action-id> [<thread>] [--self] [--json]
```

Pass a thread ID or `--self`. `list` includes each action's ID, label, and prompt.
`run` selects by action ID, not label.

`set` replaces the entire ordered list; read the current
list first when preserving existing buttons. Each action has a unique `id`
(1–64 characters), a `label` (0–24), and a `prompt` (1–10000). Labels and
prompts are trimmed; an empty label uses the prompt as the button label. For example:

```sh
bb thread-stages actions set --self --actions '[{"id":"review","label":"Review","prompt":"Review this change."}]'
bb thread-stages actions run review --self
```

Use `--actions '[]'` to clear the buttons. `--actions-stdin` reads the JSON
array from stdin instead of an argument. Invalid input leaves the saved
actions unchanged, and archived threads reject changes. Changes appear in
every open window.

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
