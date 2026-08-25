---
"bb-plugin-breadcrumbs": patch
"bb-plugin-thread-stages": patch
---

Resolve a thread's section the same way in every plugin: the nearest section
walking up, the thread's own included. Breadcrumbs took the root's section over
the thread's own, and Thread stages took the thread's own over any ancestor's,
so a chain filed at more than one level could show one section's name beside
another's icon.
