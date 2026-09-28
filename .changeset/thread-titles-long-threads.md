---
"bb-plugin-thread-titles": minor
---

Title long threads instead of skipping them. Tool output longer than 1,000 characters is trimmed to its start and end, and model reasoning is left out of the transcript. A transcript still over the size limit is cut off after the last entry that fits instead of being skipped. A first turn that is still running is titled once its transcript reaches a quarter of the size limit, so a long first turn no longer waits hours for its title. Titles are also capped at 40 characters by default, configurable with `maxTitleLength`. An overlong title is a reason to rename on the third user message, and a worker reply over the cap is retried once on the same model.
