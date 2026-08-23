---
"bb-plugin-missing-keyboard-shortcuts": patch
---

Move the terminal panel's DOM probing out of the app entry into its own module,
so the selectors this plugin assumes bb renders are written down in one place
and covered by tests.
