---
name: thread-stages
description: Organize root bb threads into the stages Deferred, Idle, Active, Blocked, and Completed. Activity automation switches a root between Active and Idle based on turns and background commands anywhere in its hierarchy, with pending user interactions taking priority over activity on the same thread, only while the root is already in either stage. Use when inspecting, organizing, or changing a root thread's stage or position. Child threads inherit their root parent's placement. Do not archive a thread to mark it Completed.
---

# Thread stages

Thread stages requires the Ribbon sidebar plugin, which owns all stage
placement and ordering. If a command reports a Ribbon sidebar dependency
problem, install or reload `ribbon-sidebar` before retrying.

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

- A turn or background command on the root or any descendant counts as
  **Active** work.
- A pending question or approval takes priority over both turn and background
  activity on that same thread, so that thread counts as **Idle**. Activity on
  another thread in the hierarchy still keeps the root **Active**.
- A thread in **Deferred**, **Blocked**, or **Completed** stays there regardless
  of later activity changes.

Moving a thread back to **Idle** or **Active** opts it into automation for its
next activity transition. Between transitions, a stage set by hand stays put.
