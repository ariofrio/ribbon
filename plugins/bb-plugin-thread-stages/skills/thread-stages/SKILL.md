---
name: thread-stages
description: Understand and apply the Deferred, Idle, Active, Blocked, and Completed workflow stages supplied to Ribbon sidebar. Use when deciding which stage a root bb thread belongs in, interpreting automatic stage changes, selecting staged threads for work, or changing a root's stage or position. Child threads inherit their root parent's placement. Do not archive a thread merely to mark it Completed.
---

# Thread stages

Thread stages describe the workflow state of root threads:

- **Deferred** is intentionally set aside for later.
- **Idle** is available or waiting without a blocker.
- **Active** has a turn or background command running.
- **Blocked** cannot progress until something external changes.
- **Completed** is finished and should be treated like archived work.

Only root threads have a stage and position. A child appears beneath its parent
and inherits that root's stage, so act on the root when moving or selecting a
thread hierarchy.

Treat **Completed** roots as out of scope by default. Exclude them from bulk
operations, messages, and notifications unless the user explicitly includes
them or intends to resume them.

## Automatic stages

Activity automation manages a root only while its stage is **Idle** or
**Active**:

- A turn or background command on the root or any descendant counts as
  **Active** work.
- A pending question or approval takes priority over activity on that same
  thread, so that thread counts as **Idle**. Activity elsewhere in the
  hierarchy still keeps the root **Active**.
- A root in **Deferred**, **Blocked**, or **Completed** stays there regardless
  of later activity changes.

Moving a root back to **Idle** or **Active** opts it into automation for its
next activity transition. Between transitions, a stage set by hand stays put.
