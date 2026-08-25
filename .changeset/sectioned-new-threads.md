---
"bb-plugin-thread-stages": patch
---

Create UI threads in the section or Unorganized group selected by the sidebar
filter. New forks without an explicit section inherit the nearest section on
their fork source's ancestor chain; ordinary CLI-spawned threads remain
Unorganized. Unparented threads keep the nearest section from their former
parent hierarchy, while reparented threads continue to inherit from their new
parent.
