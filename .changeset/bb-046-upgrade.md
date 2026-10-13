---
"bb-plugin-chatgpt-theme": patch
"bb-plugin-missing-keyboard-shortcuts": patch
"bb-plugin-model-mentions": patch
"bb-plugin-thread-stages": minor
"bb-plugin-thread-titles": patch
---

Require bb 0.46.0 and Plugin SDK 0.6.37, with matching registry components
and the Thread list fork. Thread stages uses bb's shared menu and hover-action
registry, including other plugins' actions, and gains optional grouping by
read status and an inline row-action editor. Preserve Ribbon's stage bands,
section placement ranks, saved prompt editor, empty hover-action and hidden provider-icon defaults, and opaque sticky parent backgrounds. Narrow rows keep overflow hover actions in the menu so saved prompts and PR numbers stay in place.

Missing keyboard shortcuts uses public navigation for new threads and terminal
opening; bb now owns terminal tab creation and selection.
