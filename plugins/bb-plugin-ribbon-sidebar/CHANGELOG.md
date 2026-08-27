# bb-plugin-ribbon-sidebar

## 0.1.0

### Minor Changes

- babbccf: Add Ribbon sidebar as the suite's exclusive thread-list provider, with
  independent scope and grouping, provider discovery, generic placement RPC and
  CLI, durable ordering, and parity with Thread stages' scope synchronization,
  collapsed previews and activity, search behavior, and Section icons. Remove
  Thread stages' legacy sidebar and placement writer while retaining its
  read-only migration snapshot and acknowledgement contract. Ribbon imports and
  verifies the former stage assignments, retained order, and client-local view
  state before completing the one-way handoff; Thread stages continues to
  provide its catalog, automation, shortcuts, retention, and compatibility CLI
  through the required Ribbon sidebar. Preserve lifecycle edge observations
  across provider reloads and apply provider-declared collapse defaults when a
  client has no earlier collapse preference.

### Patch Changes

- babbccf: Always summarize thread activity in collapsed stage headers while omitting the ordinary unread dot, and match bb's indicator precedence and plan-mode glyph.
- babbccf: Show each section's chosen icon in the thread context menu's Move to section
  submenu.
