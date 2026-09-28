# bb-plugin-thread-titles

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
