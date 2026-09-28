---
"bb-plugin-ribbon-sidebar": patch
---

Stop building thread timelines for message previews. The preview service now reads the newest message events directly, skips threads whose stored preview already covers their latest event, and does not run at all while "Show message previews" is off. Before this, every plugin load rebuilt a full timeline for every thread and every tool call in an active thread rebuilt its timeline again, on bb's single server event loop, even with previews hidden; on a busy machine this was most of the time bb spent stalled.
