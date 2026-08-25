# bb-plugin-missing-keyboard-shortcuts

## 0.2.3

### Patch Changes

- 3606c83: Move the terminal panel's DOM probing out of the app entry into its own module,
  so the selectors this plugin assumes bb renders are written down in one place
  and covered by tests.
- 77f4e11: These plugins now use bb's documented APIs instead of private paths. Calls
  into a neighbouring plugin, a plugin's own settings, and bb's keybinding table
  go through `bb.sdk` rather than fetched routes.
  
  Stage chords ask bb to open the composer instead of arranging its stored state
  and faking a keystroke. That needs Thread stages' own list mounted: with bb's
  built-in list selected instead, emptying Idle still files the thread and opens
  a composer, but on the project you last used rather than on none.
- 3606c83: Fail the release check when a Tailwind arbitrary variant the source uses never
  reaches the built stylesheet.

## 0.2.2

### Patch Changes

- 31d676c: Reword the plugin description so bb, the marketplace listing, npm, and the
  repository README all show the same sentence.

## 0.2.1

### Patch Changes

- 4e0d644: Move each plugin's TypeScript sources under `src/`, leaving only packaging and
  tooling configuration in the plugin root. Published tarballs now ship `src/`
  without its co-located tests.
- 4e0d644: Follow the surrounding color scheme in each plugin's icon, so the marketplace's Browse screen stops painting it a fixed grey.

## 0.2.0

### Minor Changes

- e9ead62: Ship each plugin's own Hugeicons branding icon: Shapes01 for Project icons, Command for Missing keyboard shortcuts, ChatGPT for ChatGPT theme, and a folder holding ArrowRight01 for Project breadcrumbs.

## 0.1.0

### Minor Changes

- Initial release: keyboard shortcuts for common bb navigation and thread actions.
