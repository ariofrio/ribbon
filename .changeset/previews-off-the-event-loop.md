---
"bb-plugin-ribbon-sidebar": patch
---

Stop building thread timelines for message previews, reducing work on bb's server event loop. Previews now use small pages of message events, reuse persisted results for unchanged threads, and stop background work while "Show message previews" is off.
