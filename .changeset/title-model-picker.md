---
"bb-plugin-thread-titles": minor
---

Choose the title model with bb's provider, model, and reasoning picker on the plugin's settings page. The selection applies to every thread regardless of its provider. Without one, every thread is titled with the newest Codex Luna model, as bb's own titles are, instead of Luna or Haiku on the thread's provider; after a timeout or transient failure it retries once on the next Luna model. This replaces the free-text `model` setting; a value saved there is no longer read, so reselect it in the picker.
