---
"bb-plugin-default-sections": minor
---

Add Default sections, which gives each project a default section: a new root
thread created in that project without a section starts there. Threads started
in a section, child threads, forks, hidden threads, and the personal project
are left alone, and no existing thread moves. Set defaults on the plugin's
settings page or with `bb default-sections`. Requires bb 0.45.0.
