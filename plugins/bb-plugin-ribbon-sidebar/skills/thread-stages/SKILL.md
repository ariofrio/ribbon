---
name: thread-stages
description: Understand and apply the Deferred, Active, Blocked on other agent, Blocked on third party, and Completed workflow stages supplied to Ribbon sidebar. Use when deciding which stage a bb thread belongs in, including after asking the user something, interpreting automatic stage changes, selecting staged threads for work, or changing a thread's stage. Children have their own stage. Do not archive a thread merely to mark it Completed.
---

# Thread stages

A stage says whose move a thread is waiting on:

| Stage | ID | Whose move |
| --- | --- | --- |
| **Deferred** | `Deferred` | Nobody's yet: intentionally set aside for later. |
| **Active** | `Active` | The user's or this thread's: available, working, or waiting on the user. |
| **Blocked on other agent** | `BlockedOnOtherAgent` | Another agent's: another bb thread must finish or deliver something this one depends on. |
| **Blocked on third party** | `BlockedOnThirdParty` | Someone or something outside bb: a reviewer, CI, a vendor, a date. |
| **Completed** | `Completed` | Nobody's: finished, and treated like archived work. |

Waiting on the user is **Active**, never a Blocked stage. Ending a turn already
hands the thread to the user, so do not move a thread because you asked the
user a question, requested approval, or finished work for them to review. The
user is not a third party.

Place a thread by stage ID:
`bb sidebar place --self --to plugin:thread-stages:stages/BlockedOnOtherAgent`.
Each child has its own stage and remains nested beneath its parent. Act on the
child's ID to change or inspect its stage. A child can be reordered among its
siblings, while its stage remains independent. Use
`bb sidebar list --include-children` to list child stages.

Treat **Completed** threads as out of scope by default. Exclude them from bulk
operations, messages, and notifications unless the user explicitly includes
them or intends to resume them.

## Working threads

Stages change only when someone sets them; running work never changes a stage.
A working thread keeps its stage, and Ribbon shows the work by turning the
stage icon's ring on that row. A collapsed root's ring also turns for work in
its hidden descendants. A pending question or approval stops the ring, because
the thread is waiting on the user rather than working.

## Stage mentions

A mention of a stage from the Thread stages plugin, such as `@Active` or
`@Blocked on third party`, names that stage. A message that mentions one, in a
sentence such as "do this, then @Blocked on other agent" or on its own, asks
for the thread to be placed in that stage once the rest of the message is done.
Ribbon also tells a thread when someone else changes its stage, as "Thread
stage updated: @Active → @Blocked on third party"; that move has already
happened. Older messages may mention `@Idle`, now Active, or `@Blocked`, now
split into the two Blocked stages.
