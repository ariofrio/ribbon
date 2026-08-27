# bb-plugin-project-icons

## 0.6.1

### Patch Changes

- c8e1853: Include every eligible free Hugeicons numbered variant in the icon picker.
- fca506d: Offer every eligible free Hugeicons category while reserving the six glyphs bb already uses for sections, projects, and projectless threads.
- be6a3c9: Virtualize the icon picker on compact layouts too, using the responsive number
  of columns that actually fit so opening and scrolling the full catalog stays
  fast on phones and narrow windows.
- 0dffb77: Show bb-native tooltips on icon choices and keep numbered variants distinct in labels and search.
- 3505197: Refresh the collapsed icon catalog from Hugeicons' current official index.

## 0.6.0

### Minor Changes

- 608783e: Show the thread's project where one icon stands for a thread — on a sidebar row,
  and in a header drawing no crumbs. The icon no longer falls back to the section
  the thread is filed under.
  
  A section's icon still appears where the section itself is named: beside its
  crumb in the header, and in the thread filter. What changes is the single icon
  that stands for a thread, which is now always its project's. bb's personal
  project cannot be given an icon, so a personal thread filed into a section used
  to be drawn as that section; it now keeps its own glyph.

### Patch Changes

- 56c41f0: Describe sections before projects throughout the plugin's user-facing copy.

## 0.5.0

### Minor Changes

- 64cec47: Draw the icon everywhere bb names a project, not only on its sidebar headers
  and above an open thread. That adds the prompt box's project control and the
  menu it opens, the project rows in the `@` list, a project mentioned in a
  prompt, the strip under an open thread, and the crumb above a project's own
  settings — the one header that names a project and no thread, which the
  thread-only slot could never reach.
  
  Where bb draws its own folder the plugin now stands in its place rather than
  adding beside it, wearing the classes bb chose so it matches each surface, and
  handing the folder back the moment the plugin stops. Most of those rows print
  a project's name and nothing else, so `listIcons` now carries bb's project
  list alongside the icons; a name two projects share resolves to neither and
  keeps bb's folder.
  
  A new "Show around the prompt box" setting turns the new places off on their
  own, and the thread-header setting now covers a project's header too.
- 64cec47: Let the icon on the strip under an open thread open the picker, as the sidebar
  and thread header ones do. It is the only one of the new places where bb has
  claimed the click for nothing of its own, so it is the only one that can carry
  a second meaning. The trigger lights on hover with the background bb's own
  controls beside it use, and draws it outside its own footprint, so the icon and
  the words next to it stay exactly where bb put them.
- 67b3d6b: Show a section's icon in the thread header, beside the crumb it belongs to.
  Breadcrumbs leaves an empty marked span before each crumb and Icons fills it,
  since bb's SDK gives one plugin no way to render another's component. Either
  plugin without the other is unchanged.
  
  With no crumbs to sit beside, the header keeps one icon and chooses its owner
  the way a sidebar row does: the project's, or the section's where that project
  has no icon of its own.
  
  The picker no longer offers the glyphs bb draws by default for a project and for
  the personal project. A row holding one of those looked like no choice at all
  and still outranked the section's icon.
- 64cec47: Draw the personal project's chat bubble on bb's sidebar, not only in the thread
  header. bb renders that group through a different path than the rest — it
  labels it "Threads" and wraps it in no id — so it was the one project the
  sidebar half could not find. It is recognized now by what bb lets you do from
  its header — New project and New thread are offered from that group and from
  no other — which is also what tells it from Pinned, drawn the same way and in
  the same list, and what keeps the bubble off the same group when bb relabels
  it "Unorganized" and it is no longer the personal project.

### Patch Changes

- 2ff5814: Seed the screenshots from one product in two repositories, filed under a section
  of its own. The shots now picture a section icon, a section crumb, and a sidebar
  focused on one product, none of which the previous fixture could show.
- 77f4e11: These plugins now use bb's documented APIs instead of private paths. Calls
  into a neighbouring plugin, a plugin's own settings, and bb's keybinding table
  go through `bb.sdk` rather than fetched routes.
  
  Stage chords ask bb to open the composer instead of arranging its stored state
  and faking a keystroke. That needs Thread stages' own list mounted: with bb's
  built-in list selected instead, emptying Idle still files the thread and opens
  a composer, but on the project you last used rather than on none.
- 3606c83: Move everything vendored from BB into each plugin's `src/vendor/`, so a reader
  can tell BB's code from the plugin's own by its path.
- 3606c83: Refresh every vendored BB component to the pinned registry release, so all
  three plugins share one vintage of BB's menus, overlays, and icons instead of
  two. Breadcrumbs and Icons were carrying components from an older release whose
  pin had been bumped without a re-vendor, which left their overlays a rewrite
  behind and their icon set six icons short.
  
  The four local edits those copies had accumulated are now composed rather than
  patched in, so no plugin forks BB's UI kit: menus that should stay a dropdown
  on a narrow window use BB's own compact-viewport override, destructive context
  items take the classes BB's app gives them, and the thread filter draws its own
  check and submenu chevron the way its actionable rows already did — which also
  makes its two row types finally render the same selected state.
- 3606c83: Fail the release check when a Tailwind arbitrary variant the source uses never
  reaches the built stylesheet.

## 0.4.2

### Patch Changes

- 0bcb893: Answer bb with the sidebar script's disposer before reading its settings. bb
  holds a plugin attributed for as long as `mount` is unresolved, and while any
  plugin is attributed it refuses to let a React-owned node into a container React
  does not own — so reading first held the whole app in that state for the length
  of a round trip, and every plugin drawing into bb's chrome in the meantime was
  refused and blamed on this one. The read still happens before a single anchor is
  placed; it just happens after bb has its disposer.

## 0.4.1

### Patch Changes

- ae326bc: Let the thread header's icon take the color of the header it sits in, the same
  way the sidebar's now does. It was pinned to `text-muted-foreground`, which
  matched none of bb's header controls — bb draws those at `--foreground` or at
  `--subtle-foreground/75`, and the icon sat between the two. Inheriting puts it
  at the weight of the thread title beside it, which is where bb's own header
  buttons are.
- d051765: Let an uncolored sidebar icon take the color of the label beside it. Both
  plugins pinned a token instead — `text-subtle-foreground` on bb's group
  headers, `text-muted-foreground/70` on a stage row — and neither token moves
  when a theme moves its ink. The icon came out brighter than its label in the
  default theme and darker in the ChatGPT one, from the same two lines. Inheriting
  matches bb's own pairing of an icon with its label, in any theme.

## 0.4.0

### Minor Changes

- a013ccc: Let each icon placement be turned off on its own.
  
  **Show in the thread header** and **Show in the sidebar** are both on by
  default, so an update never takes an icon away from anyone. The thread header
  reads them through `useSettings()`; the sidebar half runs in a content script
  where no hook reaches, so it asks the backend over `listPlacements` before it
  places a single node — an anchor left in bb's sidebar would space the group
  label out even with nothing drawn in it.
- c54050c: Let a bb thread section hold an icon the way a project does.
  
  Icons are now keyed by an owner kind and an id rather than a project id, so the
  two never collide, and the RPC contract follows: `listIcons`, `setIcon`, and
  `clearIcon` in place of their project-only spellings. Existing choices migrate
  across untouched.
  
  Sections default to bb's own section mark. Projects default to a folder and the
  personal project to a chat bubble because bb draws them that way itself, and a
  section has the same claim — but Hugeicons has no matching glyph, which is why
  Thread stages already composes its own SectionAdd. This is that mark without
  the plus.
  
  bb publishes no event when a section is created, renamed, or removed, so an
  icon whose section is gone can only be found by comparing against the live
  list. The cleanup service sweeps on start and after each write, which keeps the
  read path free of a round-trip it would otherwise pay on every header mount.
- fd9cd78: Draw the icon in bb's own sidebar, on every project and section header.
  
  The icon sits at the head of the group's label row, where Thread stages puts a
  stage icon, which is what lines the group name up with the New thread,
  Extensions, and Automations labels above it. Clicking it opens the same picker
  the thread header offers.
  
  bb has no always-mounted React slot and a thread-header action only exists on a
  thread route, so this half runs as a content script — outside bb's provider
  tree, where no SDK hook reaches, so it talks to its own backend over fetch.
  One React tree portals into every header rather than a root per header, because
  bb replaces all of them at once when the sidebar's Organize mode changes:
  project groups appear under By project and section groups only under Manually.

### Patch Changes

- c8f4fc0: Give every control this repo adds to bb's thread header the hover bb's own
  controls use: the fill snaps in and eases out, and an open menu holds the
  active fill.
  
  The ChatGPT theme also stops reaching into what plugins draw. One rule matched
  icon-only buttons by shape — `size-7` and `text-muted-foreground` — rather than
  by where they are, which caught the icon this repo adds to the header and gave
  it a dimmer fill than the button beside it, with a colour that never lifted on
  hover. It now skips anything inside a plugin's own root.
- 7e303d6: Open the icon picker whole, instead of letting it fill in afterwards.
  
  The catalog is deliberately not in the bundle, so a cold picker used to appear
  and then land its categories and icon grid a beat later — one movement answered
  by a second, which bb's own menus never do because their content is fixed. It
  is now fetched when the pointer reaches the icon rather than when it is
  clicked, so a click that follows a pointer finds it ready. Keyboard focus does
  the same.
  
  The category row also animated itself in: a chip carries `transition-colors`,
  and the first category was chosen in an effect after mount, so it faded from
  unselected to selected once the popover had settled. It is chosen while
  rendering now.
- 2100dbd: Open the icon picker without building the whole catalog first.
  
  Every one of the 2,532 icons was rendered on open, putting over fourteen
  thousand nodes in the popover where bb's own menus hold about twenty-five. The
  cost landed where it shows: the browser built the grid before it could paint,
  so the picker was slow to arrive, and its entrance animation ran on a blocked
  thread, dropping frames until it snapped into place rather than easing.
  
  Categories are now drawn as they approach the viewport, behind placeholders
  sized to the grid they stand in for, so the scrollbar never shifts under the
  pointer. First paint is 534 nodes, the picker appears 45ms after the click
  instead of 127ms, and the entrance animation runs 133ms of its 150ms.
- 35f2fc0: Let the icon and the crumbs share bb's thread header.
  
  Both plugins put a node of their own at the head of that header, and both
  looked for bb's title at `center.firstElementChild` — so whichever arrived
  first became that child and the other found a sibling plugin's node with no
  title in it and gave up. The title is now found by what it holds, skipping
  anything marked as a plugin's root, which makes it independent of who arrives
  first.
  
  The crumbs also render in a React root of their own, scheduled on an animation
  frame. bb refuses to put a React-owned node under a container React does not
  own while any plugin is attributed on its stack, and it keeps that attribution
  across `setTimeout` and `queueMicrotask`; `requestAnimationFrame` is left
  native, so a frame callback runs unattributed.
- 877f8ee: Draw the icon catalog a row at a time rather than a category at a time.
  
  A category holds its true height whether or not its rows exist, so the
  scrollbar describes the whole catalog and never shifts under the pointer.
  Browsing the entire catalog now leaves 188 buttons in the popover rather than
  1,116 and climbing, and the scroll height holds steady where it used to move by
  several hundred pixels as categories materialised.
  
  Rows are measured from `offsetTop` and `scrollTop` rather than bounding rects:
  thirty-two categories each asking for a rect forces the browser to lay the
  scroller out again, dozens of times, in the frame the popover is trying to
  appear in. The picker's entrance now runs 132–152ms of its 150ms, against
  117–144ms for bb's own menus.
- 716aebc: Describe what each plugin now does.
  
  Icons covers projects and thread sections, on bb's own sidebar headers as well
  as the thread header, with either placement switchable. Breadcrumbs shows a
  thread's section, its project, and the threads it came from, each switchable.
  
  The screenshot fixture seeded icons through the RPC name the rename replaced,
  so a capture failed on the first project it reached.

## 0.3.0

### Minor Changes

- 14f160a: Rename Project icons to Icons and Project breadcrumbs to Breadcrumbs, ahead of
  both widening past projects to bb's thread sections.
  
  bb takes a plugin's id from its package name and namespaces routes, storage,
  settings, and CLI commands by it, so each renamed plugin installs as a new one
  and starts on an empty database. Neither is published to the BB Community
  marketplace, so nothing carries over: reinstall as `icons` and `breadcrumbs`,
  remove `project-icons` and `project-breadcrumbs`, and pick the project icons
  again.
  
  Thread stages reads these icons over the neighbouring plugin's id and hears
  edits on a shared broadcast channel; both move with the rename, to `icons` and
  `bb.icons`. The DOM markers each plugin leaves in bb's thread header follow:
  `data-icons-root` and `data-breadcrumbs-root`.

### Patch Changes

- 31d676c: Reword the plugin description so bb, the marketplace listing, npm, and the
  repository README all show the same sentence.

## 0.2.1

### Patch Changes

- a63f22b: Add `npm run check:catalog`, which derives the icon catalog from Hugeicons'
  index again and reports the icons whose tags or category moved without writing
  anything, so upstream rewrites can be read before they are adopted. Adopt
  upstream's current tags for the five icons it has rewritten since the catalog
  was first generated.
- 4e0d644: Move each plugin's TypeScript sources under `src/`, leaving only packaging and
  tooling configuration in the plugin root. Published tarballs now ship `src/`
  without its co-located tests.
- 78345a9: Drop vendored components no entry point reaches, and point the shadcn
  registry at the bb release this plugin targets.
- 4e0d644: Follow the surrounding color scheme in each plugin's icon, so the marketplace's Browse screen stops painting it a fixed grey.

## 0.2.0

### Minor Changes

- e9ead62: Ship each plugin's own Hugeicons branding icon: Shapes01 for Project icons, Command for Missing keyboard shortcuts, ChatGPT for ChatGPT theme, and a folder holding ArrowRight01 for Project breadcrumbs.

### Patch Changes

- a0bae2c: Follow the Project breadcrumbs rename when locating the breadcrumb root in the thread header.

## 0.1.2

### Patch Changes

- 548b490: Use bb's hand cursor and standard 28px control size for the project icon trigger and selector buttons, with a full-width, evenly spaced icon grid.

## 0.1.1

### Patch Changes

- 728ffc9: Replace the project icon dialog with a compact popover that groups searchable icons by category, keeps filtered category navigation visible, and improves color, reset, scrolling, and search controls.

## 0.1.0

### Minor Changes

- Initial release: an icon and optional color for each bb project.
