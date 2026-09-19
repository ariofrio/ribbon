# bb-plugin-chatgpt-theme

## 0.2.4

### Patch Changes

- 735d5e3: Update to bb 0.42.1 and Plugin SDK 0.4.47, including the matching UI components and runtime dependencies. This release requires bb 0.42.1 or newer.
  
  Icons and keyboard shortcuts now use the public app-overlay slot and SDK RPC/settings hooks. Keyboard shortcuts read the active thread and project from SDK context and open new-thread surfaces through the public sidebar action. The Side chat shortcut waits for bb's rich-text editor to mount before focusing it.
  
  Ribbon's top controls use the public sidebar-navigation slot, and its fallback uses the current `Original` API. Its new-thread project selection and archived-thread navigation now use public composer, sidebar-action, and navigation APIs.
  
  Thread stages forwards placement changes through the SDK's cross-plugin RPC client, reads the active thread from SDK context, uses SDK navigation for threads and the composer, and accepts pending threads without treating them as active.
- 5921366: Preserve the selected thread's full foreground color when Ribbon's row background changes by identifying selection from the current-page link.
- fd7a755: Update to bb 0.43.3 and Plugin SDK 0.4.104, including the matching UI components and runtime dependencies. This release requires bb 0.43.3 or newer.
  
  Missing keyboard shortcuts and Thread stages now register their actions through bb's public command API. Their actions appear in the command palette, and their default shortcuts can be rebound or cleared in Keyboard settings.
  
  The side-chat shortcut now opens a host-persisted plugin panel through the public command context and renders the fork through the public `ThreadChat` component.
  
  Ribbon sidebar now declares its CLI with bb's public `defineCli` and `cliCommand` APIs, so bb owns parsing, validation, help, suggestions, and structured JSON errors.

## 0.2.3

### Patch Changes

- c8f4fc0: Give every control this repo adds to bb's thread header the hover bb's own
  controls use: the fill snaps in and eases out, and an open menu holds the
  active fill.
  
  The ChatGPT theme also stops reaching into what plugins draw. One rule matched
  icon-only buttons by shape — `size-7` and `text-muted-foreground` — rather than
  by where they are, which caught the icon this repo adds to the header and gave
  it a dimmer fill than the button beside it, with a colour that never lifted on
  hover. It now skips anything inside a plugin's own root.

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

- 4b5b235: Rename Codex theme to ChatGPT theme, following OpenAI's rename of the desktop app it matches, and rename its theme to `chatgpt`.
- e9ead62: Ship each plugin's own Hugeicons branding icon: Shapes01 for Project icons, Command for Missing keyboard shortcuts, ChatGPT for ChatGPT theme, and a folder holding ArrowRight01 for Project breadcrumbs.

## 0.1.0

### Minor Changes

- Initial release: a light-and-dark bb theme that matches the OpenAI ChatGPT desktop palette.
