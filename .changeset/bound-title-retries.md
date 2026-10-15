---
"bb-plugin-thread-titles": patch
---

Back off unexpected title-job failures with jitter and permanently stop titling after five failed attempts, preserving the budget across restarts and recording the terminal reason in plugin logs. Keep worker cleanup queued with its own backoff.
