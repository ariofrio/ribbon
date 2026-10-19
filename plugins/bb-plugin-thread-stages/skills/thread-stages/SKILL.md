---
name: thread-stages
description: Manage bb thread stages, placement/order, sidebar preferences, and saved prompts; assess remaining work and completion.
---

# Thread stages

Start with `bb thread-stages` when CLI inspection is allowed, then follow its
help. Honor requests to discuss/propose without execution. Read [Thread actions](../thread-actions/SKILL.md)
for saved prompt buttons.

## Stages

The plugin setting `automaticStageUpdates` defaults on; off allows only explicitly
requested changes. Honor manual-stage preferences. Settings apply next provider session.

On input/results, reassess the full objective and who can advance it. Narrower
follow-ups neither cancel unresolved work nor require renewed approval.

Inspect the stage (`bb thread-stages show --self --json`) before any change;
write only when mismatched. Reinspect before independent work (including task
input/source reads) or waiting for user input; finish needed changes first. Turn endings, side
discussions, idleness, stage assessment, and routine readiness checks alone change nothing.

| Stage | ID | Meaning |
| --- | --- | --- |
| In progress | `Active` | Useful independent work or coordinated workers/computation (including scheduled/external managed jobs), ongoing observation (even for optional results), or recovery. |
| Needs user | `BlockedOnUser` | Required user input, decision, approval, direction, or intended review. |
| Dependent | `BlockedOnOtherAgent` | Another bb thread owns a required action/result. |
| Blocked | `BlockedOnThirdParty` | An independent external party owns a required action/response. |
| Deferred | `Deferred` | Intentionally set aside. |
| Completed | `Completed` | Established objective finished with a durable result. |

Waiting stages require no useful independent work. Establish missing resumption
and notification paths in In progress, including during review. Use actual ownership, not
hierarchy/project/provider/machine. Delivery, read markers, and silence don't
establish review; user feedback can.

Before Completed, settle the whole objective's review, questions, delivery and
follow-ups, or delegate with tracked responsibility and an accepting owner.
Until acceptance, arranging handoff stays In progress. Reports/proposals used to
decide broader work stay Needs user once independent work ends. Bounded
reporting/research can complete with findings open only when no broader decision,
review, or responsibility remains.
Retain coordinated verification. Neither a separate closing agreement nor
hypothetical future questions are completion requirements.

Use `bb thread-stages stage <stage-id> --self`. Placement requests, including bare
stage mentions, apply after the message's work. Discussion/already-applied moves
request no write. Legacy Active/Idle/Waiting mentions mean In progress.

## Placement and layout

Select bulk work from joined `bb thread-stages list --json`; exclude Completed
unless explicitly included/resumed. Complete by stage, not archive.

Children own their stage/sibling order; use their root for section/project/machine
and root placement. List children with `--include-children`. Active and waiting
stages share a position-preserving band; Deferred/Completed have separate orders.
Returning to Active restores main-band position. Organization orders are independent.

Order anchors must share group/band; children share one sibling order. Manual
order uses Custom sorting; `list --by` selects organization. Sections/membership
use `bb thread section`/`bb thread update`.

Discover layout keys/values/descriptions with `bb thread-stages prefs list`, then
use its `get`/`set`/`reset`. Values are JSON or bare strings. Built-in
`bb thread-list prefs` is separate and does not affect this sidebar.
