---
"bb-plugin-thread-stages": patch
---

Keep a thread Active while one of its background commands is running, even
when its foreground turn is idle or waiting for user input. Move it back to
Idle only after the last background command finishes and no foreground work
remains.
