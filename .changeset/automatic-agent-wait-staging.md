---
"bb-plugin-thread-stages": patch
---

Give agents automatic staging instructions when their work must wait for another bb thread, without requiring a stage mention. Reassess the stage when the dependency is satisfied, keep waits on the user Active, and exclude side chats.
