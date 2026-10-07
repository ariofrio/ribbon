---
name: thread-actions
description: Manage and run saved prompt buttons beside bb thread titles, including replacing or clearing buttons. Use when the user asks to inspect, edit, or run a thread's saved prompt actions.
---

# Thread actions

Start by running `bb thread-stages`, and discover the available action
operations and arguments from its help as needed. Do not rely on a memorized
command surface.

For selecting threads by sidebar organization or stage before bulk action
work, or deciding whether a thread's stage should change, use
[Thread stages](../thread-stages/SKILL.md). It owns stage meanings and the
default scope for Completed threads.

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
