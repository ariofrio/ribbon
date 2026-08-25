---
name: thread-stages
description: Organize root bb threads into the stages Deferred, Idle, Active, Blocked, and Completed. Lifecycle automation switches between Active and Idle only while a root thread is already in either stage. Use when inspecting, organizing, or changing a root thread's stage or position. Child threads inherit their root parent's placement. Do not archive a thread to mark it Completed.
---

# Thread stages

Use `bb thread-stages list` to list organized threads, `bb thread-stages
show [<thread-id> | --self]` to inspect one, and `bb thread-stages update
[<thread-id> | --self] --stage <stage>` to change it. Add `--after
<thread-id>` or `--before <thread-id>` to position it.

Only root threads have a stage and position. A child thread always
appears beneath its parent in the root parent's stage. Target the root parent
when the user intends to move the whole thread hierarchy.

## Automatic stages

Lifecycle automation manages a root thread only while its stage is **Idle** or
**Active**:

- Starting a turn moves an **Idle** root thread to **Active**.
- Ending a turn moves an **Active** root thread back to **Idle**, including
  when it waits on a question or approval.
- A thread in **Deferred**, **Blocked**, or **Completed** stays there regardless
  of later lifecycle status changes.

Moving a thread back to **Idle** or **Active** opts it into automation for its
next lifecycle transition. Between transitions, a stage set by hand stays put.
