# bb-plugin-missing-keyboard-shortcuts

## 0.2.4

### Patch Changes

- 735d5e3: Update to bb 0.42.1 and Plugin SDK 0.4.47, including the matching UI components and runtime dependencies. This release requires bb 0.42.1 or newer.
  
  Icons and keyboard shortcuts now use the public app-overlay slot and SDK RPC/settings hooks. Keyboard shortcuts read the active thread and project from SDK context and open new-thread surfaces through the public sidebar action. The Side chat shortcut waits for bb's rich-text editor to mount before focusing it.
  
  Ribbon's top controls use the public sidebar-navigation slot, and its fallback uses the current `Original` API. Its new-thread project selection and archived-thread navigation now use public composer, sidebar-action, and navigation APIs.
  
  Thread stages forwards placement changes through the SDK's cross-plugin RPC client, reads the active thread from SDK context, uses SDK navigation for threads and the composer, and accepts pending threads without treating them as active.
- eed5619: Preserve pending side-chat focus through thread-list updates and wait for the editor to become editable and visible.
  
  Wait for a newly forked side chat to finish provisioning before opening its panel, preventing the composer from getting stuck in its initial provisioning state.
- 982bc36: Ribbon sidebar now shows queued-message, draft, and plugin-provided status indicators using bb's live sidebar state. Their priority, colors, animations, and split-pane behavior match the built-in sidebar.
  
  Update the shared UI and Plugin SDK to bb 0.43.4 and SDK 0.5.9. These releases require bb 0.43.4 or newer.
- fd7a755: Update to bb 0.43.3 and Plugin SDK 0.4.104, including the matching UI components and runtime dependencies. This release requires bb 0.43.3 or newer.
  
  Missing keyboard shortcuts and Thread stages now register their actions through bb's public command API. Their actions appear in the command palette, and their default shortcuts can be rebound or cleared in Keyboard settings.
  
  The side-chat shortcut now opens a host-persisted plugin panel through the public command context and renders the fork through the public `ThreadChat` component.
  
  Ribbon sidebar now declares its CLI with bb's public `defineCli` and `cliCommand` APIs, so bb owns parsing, validation, help, suggestions, and structured JSON errors.

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
