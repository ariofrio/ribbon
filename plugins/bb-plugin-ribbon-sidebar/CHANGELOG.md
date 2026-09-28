# bb-plugin-ribbon-sidebar

## 0.8.3

### Patch Changes

- f624869: Install the sidebar checkbox dependency in production so bb can build the plugin from its release.

## 0.8.2

### Patch Changes

- 3942ee0: Stop building thread timelines for message previews, reducing work on bb's server event loop. Previews now use small pages of message events, reuse persisted results for unchanged threads, and stop background work while "Show message previews" is off.

## 0.8.1

### Patch Changes

- 7710f1b: End a sidebar drag that bb cancels as the thread leaves the sidebar. Dragging a thread toward the main view or composer and back could leave the row hidden and the cursor grabbing until the window was reloaded.

## 0.8.0

### Minor Changes

- 8bfea6b: Rename the Idle stage to Active and split Blocked into Blocked on other agent, marked with a slash, and Blocked on third party, marked with an incoming arrow along the same line. Waiting on the user is Active, so agents no longer file a thread as Blocked after asking the user something. On upgrade, Idle threads become Active and Blocked threads become Blocked on third party. A new shortcut files a thread as Blocked on other agent (⌃⌥⌘. on macOS, Ctrl+Alt+Shift+. elsewhere), and **Enable Blocked stages** turns both Blocked stages on or off. Stage mentions follow the new names, and `@Idle` and `@Blocked` in older messages still resolve. Stage mentions no longer tell agents to place a child's root instead of the child, since children now have their own stage.

## 0.7.0

### Minor Changes

- e528e7a: Give child threads persistent, independent workflow stages in Ribbon. Show and change a child's stage in the sidebar and CLI, preserve it when the thread is reparented, and auto-archive only Completed subtrees.
- a037ffa: Add a **Child thread lines** setting that can draw child threads as a tree, whose branches reach each child's stage ring, or a small hollow node while that ring is hidden.
- 3581a02: Let each thread keep prompt buttons edited from its thread menu. Buttons align to the right of the title on one row, shrink and fade long labels when space runs out, and use the section or project color. Hovering the row pans clipped labels. The editor can hide the title while actions are present. Clicking a button sends its saved prompt to the thread.

## 0.6.0

### Minor Changes

- 5b4807e: Give each parent's child threads their own stable order. Reorder a child among its siblings by dragging it, with the move shortcuts, or with `bb sidebar place <child> --before|--after <sibling>`; `bb sidebar children` lists a thread's children in order. Children not yet reordered enter at the top, newest first.
- 4c11203: Mention a stage in the composer with Thread stages, such as `@Blocked`, to ask the agent to move the thread there. Ribbon messages a thread with "Thread stage updated: @Idle → @Blocked" when you or another thread change its stage. Turn the messages off with **Message threads when their stage changes** in Ribbon settings.

### Patch Changes

- 0930e44: Draw the line beside child threads in their own stage-ring column, so it fills the slot of a hidden Idle ring and parts around a shown one.

## 0.5.2

### Patch Changes

- 50cb3ca: Update the shared UI and Plugin SDK to bb 0.44.0 and SDK 0.5.29. These releases require bb 0.44.0 or newer.
- 2960f67: Run the working-row shimmer and the working stage ring's spin on the compositor, so working threads no longer keep bb's main thread busy every frame and delay clicks and typing.
- 3e36f42: Let sidebar display options switch between equal-width and proportional PR digits. Equal-width remains the default.
- 7c232d1: Standardized heading icons open and shut the way a book and a folder do. The
  book's top page turns over on its rounded spine to lie open beside the other,
  the spine uncurling beneath it; the folder's front falls forward from its fold
  and stands back up. Both are drawn in the icon style from a small 3D
  model, one size throughout, with whatever a nearer part covers hidden.
- 9240e2c: Keep the thread context menu open when the right mouse button is released over a menu item, so the user can choose an action with a separate click.

## 0.5.1

### Patch Changes

- 285263c: Give PR numbers equal-width digits in the sidebar without changing their font.

## 0.5.0

### Minor Changes

- 0aec62c: Click anywhere on a group heading to collapse or expand it; the group folds open
  and shut with bb's own easing. Headings are laid out like thread rows, with the
  same height, padding, and gap to the rows under them. A section or project
  heading takes its icon's color from the Icons plugin as a faint wash with
  colored text and icon, every color at one lightness and chroma per mode; every
  other heading is the same wash in gray.
- d3e5896: Replace the Show group header icons toggle with a Group header icons setting:
  On, Off, or Standardized, which draws a book for every section, Unorganized
  included, and a folder for every project: shut while the group is collapsed,
  open while it is expanded. The books are drawn as tall as the folders, and the
  shut one reads as the open one folded. The setting starts at On,
  so anyone who had turned icons off chooses Off again.

### Patch Changes

- e30ecb9: Synchronize working-row shimmer and spinning stage icons across Ribbon sidebar rows.
- 0d0be21: Keep section and project heading buttons in the heading's color family on hover,
  with an ink-tinted fill and stronger foreground contrast in both color schemes.
- 65867b0: Let each working-row shimmer wave span twice the row's width, matching bb's proportional shine.
- d3e5896: Label bb's personal project "Personal", its own name, instead of "Chats".
- 0e22ccf: Match the new-thread icon on section and project headings to bb's thread list.
- e574bf8: Show thread row hover highlights immediately while moving through the Ribbon sidebar.
- 67f0540: Make sidebar thread stage rings 13 pixels across, and show unselected, non-working Idle icons on hover or keyboard focus instead of at rest.
- 7e39faf: Use the same foreground color for hovered thread-row controls.

## 0.4.0

### Minor Changes

- ba5c6d4: Remove the Active stage. A working thread keeps its stage and turns that stage
  icon's ring, in the title's color, instead of showing bb's runtime spinner, so
  the row's trailing slot shows its next indicator, such as a background command.
  Deferred turns a dashed ring. A working row shimmers across its icon, title,
  preview, and indicator, but not its background or buttons, in place of the
  shimmer bb draws on single indicators; the Shimmer working rows setting turns
  this off. Blocked's slash now spans only the width of Completed's dot. Threads
  saved as Active return to Idle, and stage automation is gone.

## 0.3.0

### Minor Changes

- d11245a: Show all sections or projects together with stable manual order, stage icons, and two-row Deferred and Completed previews. Remove sidebar pages; choose Section or Project in a heading’s ⋯ menu. Each grouping retains its own order and collapsed headings. Put New section and display options in heading menus, matching bb’s built-in sidebar. New roots enter at the top; activity changes keep their position. Parent-thread expansion survives reloads. Drag previews stay stable across stage groups, expanded hierarchies, and sticky headings. Successive drops save in gesture order, and stale placement responses cannot undo newer ordering.
  
  Move stage automation, retention, and shortcuts into Ribbon. Preserve existing assignments, settings, section ranks, and customized Thread stages shortcuts through a compatibility bridge.
- 384428c: Add Display options → Pages → No paging to show all groups without the page switcher, preserving headings and icons and remembering the choice across reloads.
- 479e7df: Add a client-local Display options setting to show linked PR numbers to the left or right of thread titles, or hide them. The default remains Right.
- 010cb50: Show what each thread's pull request is waiting on. The PR icon turns amber when auto-merge is on or the PR is queued to merge, and the status indicator adds GitHub's red ✗, amber ●, and green ✓ marks, ranked against bb's own indicators. Auto-merge, reviewers, and check counts come from the GitHub CLI on the bb server; without it, marks follow bb's pull request status.
- a106217: Choose thread icons from Projects, Sections, or any available provider grouping
  in Display options, independently of Pages and Headings. The choice persists
  per client and can also hide thread icons; children inherit their root's icon.
- 687e001: Draw stage icons on a smaller ring: Blocked becomes a standard ban sign, and
  Active becomes a loader arc that spins in thread rows.

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
- 687e001: Draw every thread row's stage icon in the muted color of deferred and completed threads.
- 4286153: Match deferred, blocked, and completed thread text to the group heading color, including child threads and other sidebar groupings.
- e3dba6f: Pan a truncated thread title to its end while its row is hovered or focused, and snap it back when the pointer leaves.
- 32caafb: Keep a right-aligned PR number clear of the indicator lane at rest, so it lines up with rows that have an indicator and no longer shifts on hover.
- d8deb18: Show each thread's linked pull request number to the right of its title in a de-emphasized color.
- 8283f31: Right-align PR numbers shown to the right of thread titles, so they line up down the sidebar instead of following each title's length.
- f461d00: Show the pull request's status icon beside its number in sidebar thread titles, matching the main view.
- 982bc36: Ribbon sidebar now shows queued-message, draft, and plugin-provided status indicators using bb's live sidebar state. Their priority, colors, animations, and split-pane behavior match the built-in sidebar.
  
  Update the shared UI and Plugin SDK to bb 0.43.4 and SDK 0.5.9. These releases require bb 0.43.4 or newer.
- 6007b90: Match bb's thread reordering interaction with a cursor-following title chip, row-sized drop previews, touch and keyboard controls, and click suppression after dragging. Keep previews stable at group boundaries and show them at the original position. Dropping on a group title or the space beneath it places the thread first; dropping between groups places it last in the preceding group.
- fd7a755: Update to bb 0.43.3 and Plugin SDK 0.4.104, including the matching UI components and runtime dependencies. This release requires bb 0.43.3 or newer.
  
  Missing keyboard shortcuts and Thread stages now register their actions through bb's public command API. Their actions appear in the command palette, and their default shortcuts can be rebound or cleared in Keyboard settings.
  
  The side-chat shortcut now opens a host-persisted plugin panel through the public command context and renders the fork through the public `ThreadChat` component.
  
  Ribbon sidebar now declares its CLI with bb's public `defineCli` and `cliCommand` APIs, so bb owns parsing, validation, help, suggestions, and structured JSON errors.
- 687e001: Style group headings with the same text size and color as thread titles.
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
