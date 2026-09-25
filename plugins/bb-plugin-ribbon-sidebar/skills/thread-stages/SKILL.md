---
name: thread-stages
description: Understand and apply the Deferred, Idle, Blocked, and Completed workflow stages supplied to Ribbon sidebar. Use when deciding which stage a root bb thread belongs in, interpreting automatic stage changes, selecting staged threads for work, or changing a root's stage or position. Child threads inherit their root parent's placement. Do not archive a thread merely to mark it Completed.
---

# Thread stages

Thread stages describe the workflow state of root threads:

- **Deferred** is intentionally set aside for later.
- **Idle** is available or waiting without a blocker.
- **Blocked** cannot progress until something external changes.
- **Completed** is finished and should be treated like archived work.

Only root threads have a stage and position. A child appears beneath its parent
and inherits that root's stage, so act on the root when moving or selecting a
thread hierarchy.

Treat **Completed** roots as out of scope by default. Exclude them from bulk
operations, messages, and notifications unless the user explicitly includes
them or intends to resume them.

## Working threads

Stages change only when someone sets them; running work never moves a root.
A working thread keeps its stage, and Ribbon shows the work by turning the
stage icon's ring on that row. A collapsed root's ring also turns for work in
its hidden descendants. A pending question or approval stops the ring, because
the thread is waiting on the user rather than working.
