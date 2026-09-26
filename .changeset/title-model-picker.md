---
"bb-plugin-thread-titles": minor
---

Choose the title model with bb's provider, model, and reasoning picker on the plugin's settings page. The selection applies to every thread regardless of its provider. Without one, titles follow bb's own inference model (`BB_INFERENCE`, then `BB_INFERENCE_FALLBACK`) instead of Luna or Haiku on the thread's provider. This replaces the free-text `model` setting; a value saved there is no longer read, so reselect it in the picker.
