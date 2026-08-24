---
name: thread-stages
description: Organize root bb threads into the stages Deferred, Idle, Active, Blocked, and Completed. Active and Idle are assigned automatically when a thread hierarchy starts and pauses or ends. Use when inspecting, organizing, or changing a root thread's stage or position. Child threads inherit their root parent's placement. Do not archive a thread to mark it Completed.
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

The stage follows work anywhere in the root thread's hierarchy at lifecycle
transitions:

- Starting a turn on the root or any descendant moves the root thread to
  **Active**.
- The root returns to **Idle** only when it and every descendant are inactive,
  including when all remaining work waits on questions or approvals.
- Between transitions, a stage set by hand stays put.

Set **Active** by hand only to correct it; Thread stages assigns it.
