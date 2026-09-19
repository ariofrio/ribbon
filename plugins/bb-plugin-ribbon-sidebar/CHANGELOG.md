# bb-plugin-ribbon-sidebar

## 0.3.0

### Minor Changes

- 384428c: Add Display options → Pages → No paging to show all groups without the page switcher, preserving headings and icons and remembering the choice across reloads.
- 479e7df: Add a client-local Display options setting to show linked PR numbers to the left or right of thread titles, or hide them. The default remains Right.
- a106217: Choose thread icons from Projects, Sections, or any available provider grouping
  in Display options, independently of Pages and Headings. The choice persists
  per client and can also hide thread icons; children inherit their root's icon.

### Patch Changes

- 5921366: Match the active thread's background to the hovered thread background, and match thread action buttons to BB's built-in sidebar sizing and interaction backgrounds.
- 9cd4186: Fix clicks on faded thread titles so they select the thread.
- 300f308: Standardize sidebar row and display-options buttons at 20×20px with visible hover backgrounds, and reduce the gap between thread titles and the indicator lane to 4px.
- 90b39c1: Place threads at the top of Completed by default when filing through shortcuts,
  the CLI, menus, or group-heading drops. Explicit positions and undo retain their
  existing behavior.
- a51bd35: Fade overflowing thread titles at the edge of the sidebar instead of showing an ellipsis.
- 300f308: Give grouping expand/collapse buttons 8px of space on each side, including the Pinned heading.
- 300f308: Give expanded parent thread titles the space occupied by hidden collapse buttons, restoring the button and its gap on hover or keyboard focus. Keep collapsed parents' expand buttons visible and reserve ellipsis space so the buttons stay in place on hover.
- 735d5e3: Update to bb 0.42.1 and Plugin SDK 0.4.47, including the matching UI components and runtime dependencies. This release requires bb 0.42.1 or newer.
  
  Icons and keyboard shortcuts now use the public app-overlay slot and SDK RPC/settings hooks. Keyboard shortcuts read the active thread and project from SDK context and open new-thread surfaces through the public sidebar action. The Side chat shortcut waits for bb's rich-text editor to mount before focusing it.
  
  Ribbon's top controls use the public sidebar-navigation slot, and its fallback uses the current `Original` API. Its new-thread project selection and archived-thread navigation now use public composer, sidebar-action, and navigation APIs.
  
  Thread stages forwards placement changes through the SDK's cross-plugin RPC client, reads the active thread from SDK context, uses SDK navigation for threads and the composer, and accepts pending threads without treating them as active.
- 4286153: Match deferred, blocked, and completed thread text to the group heading color, including child threads and other sidebar groupings.
- d8deb18: Show each thread's linked pull request number to the right of its title in a de-emphasized color.
- f461d00: Show the pull request's status icon beside its number in sidebar thread titles, matching the main view.
- 6007b90: Match bb's thread reordering interaction with a cursor-following title chip, row-sized drop previews, touch and keyboard controls, and click suppression after dragging. Keep previews stable at group boundaries and show them at the original position. Dropping on a group title or the space beneath it places the thread first; dropping between groups places it last in the preceding group.
- fd7a755: Update to bb 0.43.3 and Plugin SDK 0.4.104, including the matching UI components and runtime dependencies. This release requires bb 0.43.3 or newer.
  
  Missing keyboard shortcuts and Thread stages now register their actions through bb's public command API. Their actions appear in the command palette, and their default shortcuts can be rebound or cleared in Keyboard settings.
  
  The side-chat shortcut now opens a host-persisted plugin panel through the public command context and renders the fork through the public `ThreadChat` component.
  
  Ribbon sidebar now declares its CLI with bb's public `defineCli` and `cliCommand` APIs, so bb owns parsing, validation, help, suggestions, and structured JSON errors.
- 300f308: Give visible thread expand/collapse buttons an 8px gap after the title and a 4px gap before the ellipsis.
- 6661218: Shorten thread titles only while the hover menu is visible so the ellipsis does not overlap the text. Preserve the status indicator gap when no thread icon is shown.

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
