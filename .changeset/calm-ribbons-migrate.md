---
"bb-plugin-thread-stages": minor
---

Prepare Thread stages for an ownership-safe Ribbon sidebar migration. Publish
the strict stage catalog and migration snapshot/acknowledgement RPCs, freeze a
versioned compatibility baseline, and persist installation, revision, retained
order, and ownership metadata. After acknowledgement, keep source placement
read-only while legacy UI, CLI, shortcuts, automation, undo, and retention use
Ribbon's authoritative placement or report and reconcile dependency failures.
