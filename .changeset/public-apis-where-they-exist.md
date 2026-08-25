---
"bb-plugin-icons": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-thread-stages": patch
---

These plugins now use bb's documented APIs instead of private paths. Calls
into a neighbouring plugin, a plugin's own settings, and bb's keybinding table
go through `bb.sdk` rather than fetched routes.

Stage chords ask bb to open the composer instead of arranging its stored state
and faking a keystroke. That needs Thread stages' own list mounted: with bb's
built-in list selected instead, emptying Idle still files the thread and opens
a composer, but on the project you last used rather than on none.
