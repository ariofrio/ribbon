---
"bb-plugin-icons": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-thread-stages": patch
---

These plugins now take bb's documented APIs in place of the private paths they
were on: which project is personal comes from bb rather than from the id
`proj_personal`, and calls into a neighbouring plugin, into a plugin's own
settings, and into bb's keybinding table go through `bb.sdk` instead of fetched
routes.

Stage chords ask bb to open the composer instead of arranging its stored state
and faking a keystroke. That needs Thread stages' own list mounted: before the
sidebar has loaded, or with bb's built-in list selected, emptying Idle still
files the thread and opens a composer, but on the project you last used rather
than on none.
