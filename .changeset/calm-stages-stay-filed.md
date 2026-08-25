---
"bb-plugin-thread-stages": patch
---

Keep Deferred, Blocked, and Completed threads in their assigned stage when
their lifecycle status changes. Automatic lifecycle moves now apply only to
threads already in Idle or Active.
