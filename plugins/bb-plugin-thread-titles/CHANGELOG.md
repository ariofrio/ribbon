# bb-plugin-thread-titles

## 0.5.2

### Patch Changes

- 42d547a: Require bb 0.45.0 and Plugin SDK 0.6.15, with the matching shared UI. Sync
  Thread stages with bb's thread list: configurable hover actions, live draft
  indicators for collapsed groups, and group-aware placement of new threads.
  Use the current composer API and support provider-defined service tiers for
  title generation.
- 42d547a: Describe automatic title refinement as selecting a local Codex Luna model,
  independently of bb's AI-service selection.

## 0.5.1

### Patch Changes

- 7124d93: Use the selected title model ahead of the automatic model and its fallback, with bounded attempts and durable provider cooldowns. Recover temporarily failed first-turn titles on the third message, including eligible older untitled jobs, while preserving user-edited titles and cleaning up failed workers across restarts.

## 0.5.0

### Minor Changes

- 1a1ae8a: Turn each title pass off separately in the plugin's settings: the first-message title, the first-turn title, starting the first-turn title early on long turns, and the third-message review. All stay on by default. A pass that is off hands the thread to the next one.

## 0.4.0

### Minor Changes

- 57d7da9: Title the first message too. bb titles a new thread from the first 80 columns of its prompt, and its titles often run past 40 characters. Once bb has stored its title, or recorded that it generated none, a first pass replaces or keeps it using the whole first message and the title length limit. Because it waits for bb, the plugin's title is always the later write. With bb's own titles turned off, it starts right away. The first-turn pass and the third-message assessment still follow, and a failed first-message pass no longer stops them.

### Patch Changes

- 50cb3ca: Update the shared UI and Plugin SDK to bb 0.44.0 and SDK 0.5.29. These releases require bb 0.44.0 or newer.

## 0.3.0

### Minor Changes

- 0968979: Title long threads instead of skipping them. Tool output longer than 1,000 characters is trimmed to its start and end, and model reasoning is left out of the transcript. A transcript still over the size limit is cut off after the last entry that fits instead of being skipped. A first turn that is still running is titled once its transcript reaches a quarter of the size limit, so a long first turn no longer waits hours for its title. Titles are also capped at 40 characters by default, configurable with `maxTitleLength`. An overlong title is a reason to rename on the third user message, and a worker reply over the cap is retried once on the same model.

## 0.2.0

### Minor Changes

- c0b30f5: Choose the title model with bb's provider, model, and reasoning picker on the plugin's settings page. The selection applies to every thread regardless of its provider. Without one, every thread is titled with the newest Codex Luna model, as bb's own titles are, instead of Luna or Haiku on the thread's provider; after a timeout or transient failure it retries once on the next Luna model. This replaces the free-text `model` setting; a value saved there is no longer read, so reselect it in the picker.

## 0.1.1

### Patch Changes

- ae26f2f: Assess the title once on the third user message after initial generation. Preserve changed titles, and keep accurate, specific titles instead of rewriting them for style. Only generic or inaccurate titles qualify for a replacement.
- ae26f2f: Generate a thread title after its first turn ends, using the full recorded conversation. Recover missed completion events across restarts and keep the one-update limit.
- 47a328f: Add one-time thread title refinement on the third user message, using the full recorded conversation and persistent restart-safe jobs. Preserve titles that differ from the initial baseline.
