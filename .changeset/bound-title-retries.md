---
"bb-plugin-thread-titles": patch
---

Back off unexpected title-job failures with jitter and stop remaining titling passes after a configurable window from each pass's initial attempt (24 hours by default). Preserve retry state across restarts, record the terminal reason in plugin logs, and keep worker cleanup queued with its own backoff.
