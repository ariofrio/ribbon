---
"bb-plugin-thread-stages": patch
---

Keep stage shortcuts distinct on Linux and Windows so bb does not disable Completed, Idle, Blocked, and Deferred as conflicting bindings. Deferred now uses Ctrl+Alt+, and Blocked uses Ctrl+Alt+Shift+, on those platforms; macOS shortcuts are unchanged.
