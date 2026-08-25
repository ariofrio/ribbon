---
"bb-plugin-breadcrumbs": patch
"bb-plugin-icons": patch
"bb-plugin-thread-stages": patch
---

Move everything vendored from BB into each plugin's `src/vendor/`, so a reader
can tell BB's code from the plugin's own by its path.
