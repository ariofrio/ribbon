---
"bb-plugin-thread-stages": patch
---

Treat a running background command as active work when switching automatically
between Idle and Active. The thread returns to Idle only after its last
background command finishes and no foreground work remains.
