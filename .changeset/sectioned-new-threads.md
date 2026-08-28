---
"bb-plugin-ribbon-sidebar": patch
---

Create UI threads in the Project, Section, or writable provider group selected
by Ribbon's sidebar filter. New forks inherit Section and provider-group
placements from the nearest eligible thread on their fork source's ancestor
chain; ordinary CLI-spawned threads keep each grouping's default placement.
Unparented threads keep placements from their former parent hierarchy, while
reparented threads continue to inherit from their new parent.
