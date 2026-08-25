---
"bb-plugin-thread-stages": patch
---

Create UI threads in the section or Unorganized group selected by the sidebar
filter. New sourced threads without an explicit section, including CLI forks,
inherit the nearest section on their source thread's ancestor chain;
source-less CLI threads remain Unorganized. Unparented threads keep the nearest
section from their former parent hierarchy, while reparented threads continue
to inherit from their new parent.
