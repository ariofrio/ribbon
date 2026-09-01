# bb-plugin-ribbon-sidebar

## 0.2.0

### Minor Changes

- 67d812c: Deliver icons as CSS. The Icons plugin publishes every chosen icon as one
  stylesheet, keyed by an attribute a consumer puts on a box it draws itself, so
  drawing an icon costs a plugin nothing per row. The contract is documented in
  the Icons README.
  
  Ribbon sidebar draws its row, group header, scope filter and menu icons that
  way instead of over RPC, and Icons draws its own read-only placements that way
  too, keeping React only where the icon opens the picker.
  
  Neither plugin's appearance changes.
- 0af2a5b: Rename Ribbon's CLI to `bb sidebar`. Its list output now joins thread metadata
  with every sidebar grouping and can explicitly include archived or hidden
  roots. Remove the Thread Stages compatibility CLI, add a conflict-aware Ribbon
  Sidebar skill, and focus the Thread Stages skill on stage semantics, with
  Completed roots out of scope by default.
- d2dd0e9: Move Ribbon's group switcher above New thread and add sidebar display controls
  for pages, headings, hidden thread kinds, and sort order.

### Patch Changes

- 705cfbf: Keep filing-shortcut navigation within the threads displayed by Ribbon's active filter.
- be26293: Polish the top group switcher, restore native spacing around sidebar groups,
  and prevent the replacement thread list from overflowing horizontally.
- c82e4ad: Restore command-specific help, readable human output, and conventional exit codes to the Ribbon sidebar CLI.
- 25b0d40: Create threads from bb's New thread UI in the Project, Section, or writable
  provider group selected in Ribbon. Forks inherit Section and provider-group
  placement from the nearest thread on the fork source's ancestor chain.
  Unparented threads inherit from their former parent chain. Reparenting writes
  no placement, so the thread inherits from its new parent. Non-fork CLI threads
  use each grouping's default group.
- 868713f: Keep the opened pinned thread visible as the sole preview when the Pinned
  section is collapsed.

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
