---
name: thread-stages
description: Organize root bb threads into the stages Deferred, Idle, Active, Blocked, and Completed. Activity automation switches between Active and Idle only while a root thread is already in either stage, and a running background command counts as active work. Use when inspecting, organizing, or changing a root thread's stage or position. Child threads inherit their root parent's placement. Do not archive a thread to mark it Completed.
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

Activity automation manages a root thread only while its stage is **Idle** or
**Active**:

- Starting a turn or background command moves an **Idle** root thread to
  **Active**.
- An **Active** root thread moves back to **Idle** once neither its turn nor a
  background command is working. Waiting on a question or approval counts as
  **Idle** only when no background command is running.
- A thread in **Deferred**, **Blocked**, or **Completed** stays there regardless
  of later activity changes.

Moving a thread back to **Idle** or **Active** opts it into automation for its
next activity transition. Between transitions, a stage set by hand stays put.
