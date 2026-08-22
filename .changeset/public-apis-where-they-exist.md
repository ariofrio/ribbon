---
"bb-plugin-icons": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-thread-stages": patch
---

Take bb's documented APIs everywhere these plugins had been reaching around
them. Which project is the personal one now comes from bb — the SDK's
`isPersonal` on a sidebar project, or a project's `kind` on the server —
rather than from the id `proj_personal`, so a project whose id merely looks
personal keeps its icon and its route. Calls into a neighbouring plugin, this
plugin's own settings, and bb's keybinding table go through `bb.sdk` instead
of fetched routes, and a stage chord that runs out of threads asks bb to open
the composer instead of arranging bb's stored state and faking a keystroke.
Asking is only possible while Thread stages is the list bb draws. With bb's
built-in list selected instead, emptying Idle still files the thread and still
opens a composer, but on the project you last composed in rather than on no
project at all. That is the one behavior this changes, and it is now written
down beside the chords it belongs to.

Otherwise nothing here changes what the plugins do; it changes how much of
bb's insides they hold onto while doing it.
