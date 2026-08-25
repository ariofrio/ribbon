---
"bb-plugin-ribbon-sidebar": minor
"bb-plugin-thread-stages": minor
---

Add Ribbon sidebar as the suite's exclusive thread-list provider, with
independent scope and grouping, provider discovery, generic placement RPC and
CLI, durable ordering, and parity with Thread stages' scope synchronization,
collapsed previews and activity, search behavior, and Section icons. Remove
Thread stages' legacy sidebar and placement writer while retaining its
read-only migration snapshot and acknowledgement contract. Ribbon imports and
verifies the former stage assignments, retained order, and client-local view
state before completing the one-way handoff; Thread stages continues to
provide its catalog, automation, shortcuts, retention, and compatibility CLI
through the required Ribbon sidebar.
