# bb-plugin-thread-stages

## 0.7.0

### Minor Changes

- 814341b: Adapt Thread stages to different workflows with configurable message previews,
  optional Deferred and Blocked stages, and automatic archival of Completed thread
  hierarchies after 1, 7, or 30 days. Auto-archive defaults to 7 days, preserves
  pinned hierarchies, and can be disabled. Rows without previews now shrink to the
  same height as bb's built-in thread rows.

### Patch Changes

- 1600e04: Call the section-less bucket Unorganized, the way bb calls it. The filter and the
  Move to section submenu said Uncategorized, a word bb uses nowhere — its sidebar
  group is labeled Unorganized, and its own remove-section dialog says threads
  "will move back to Unorganized", which this plugin already repeats verbatim one
  component over. Only the wording moves; the saved filter keeps its stored value,
  so a client filtered to that bucket stays filtered to it.

## 0.6.4

### Patch Changes

- d051765: Let an uncolored sidebar icon take the color of the label beside it. Both
  plugins pinned a token instead — `text-subtle-foreground` on bb's group
  headers, `text-muted-foreground/70` on a stage row — and neither token moves
  when a theme moves its ink. The icon came out brighter than its label in the
  default theme and darker in the ChatGPT one, from the same two lines. Inheriting
  matches bb's own pairing of an icon with its label, in any theme.

## Unreleased

### Minor Changes

- Derive a root thread's Active stage from its entire hierarchy. Starting any
  descendant now activates the root, which returns to Idle only after the root
  and every descendant are inactive.
- Add a setting to hide thread message previews while preserving the compact
  title-only row layout. Rows now grow from native-height title-only geometry
  only when the preview adds a second line.
- Let Deferred and Blocked be disabled. Disabled stages disappear from empty
  sidebar groups, move menus, drag destinations, and shortcuts, while a
  nonempty disabled stage remains visible until its threads are moved out.
- Add safe Completed-thread auto-archive, defaulting to 7 days with Never,
  1 day, and 30 days also available. Retention follows time in Completed
  rather than reorder time. A pinned root or descendant protects the whole
  hierarchy; otherwise every parent-linked level archives bottom-up so its
  relationships remain intact.
- Replace Backlog, To do, Working, Blocked, Done, and Canceled with Deferred,
  Idle, Active, Blocked, and Completed. Existing assignments and saved collapse
  choices migrate, with Done and Canceled combined in Completed.
- Add New project and New section to their respective filter-dropdown groups,
  after the regular choices and the Threads or Unorganized fallback. Place
  the active filter marker beside its label, and match BB's native dropdown
  group labels, dividers, and selectable-row indentation. Keep Move to section
  in the same order, without separating Unorganized from New section. Keep
  the sidebar and All choice labeled Projects and sections even before the
  first section exists.
- Bring Blocked into the progress-ring icon family with a diagonally divided,
  filled upper-right semicircle.

## 0.6.3

### Patch Changes

- 4a64b4a: Clarify the unfiltered thread filter as Projects or Projects and sections while
  retaining the All choice in its menu. The control shows the selected project or
  section icon, including the personal Threads chat fallback when Icons is absent,
  and a trailing indicator while filtering. Project and section choices expose
  BB's native settings, rename, local-path, and removal actions through hoverable
  submenus and right-click; the filter and stage headers also gain built-in-style
  display option menus.
- a49ecf7: Refresh every stage icon, include stage and section icons in thread action
  menus, show nonzero counts only in collapsed stage headers, and add an opt-in
  experimental aggregate activity indicator aligned with thread indicators.
  Use BB's registry dropdown and context-menu components so every menu shares its
  native motion, focus, hover, responsive, and portal behavior.
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
- 78424bf: Start new clients with Backlog, Done, and Canceled collapsed while preserving saved sidebar choices.

## 0.6.2

### Patch Changes

- 31d676c: Reword the plugin description so bb, the marketplace listing, npm, and the
  repository README all show the same sentence.
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

## 0.6.1

### Patch Changes

- bc4b68c: Add Move to section actions, project and section sidebar filtering with native creation controls, stage-count visibility in plugin settings, a native-style section creation dialog, and a theme-aware progress branding icon.
- 4e0d644: Move each plugin's TypeScript sources under `src/`, leaving only packaging and
  tooling configuration in the plugin root. Published tarballs now ship `src/`
  without its co-located tests.
- 4e0d644: Follow the surrounding color scheme in each plugin's icon, so the marketplace's Browse screen stops painting it a fixed grey.

## 0.6.0

### Minor Changes

- 32a4ddb: Rename Thread workflow to Thread stages and polish its project filter, stage headers, counts, spacing, hover behavior, and command labels to match BB's built-in sidebar.

## 0.5.0

### Minor Changes

- First tagged release, as Thread workflow: organizes bb root threads into manually ordered workflow stages.
