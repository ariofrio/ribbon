---
"bb-plugin-ribbon-sidebar": minor
"bb-plugin-thread-stages": minor
---

Remove the Active stage. A working thread keeps its stage and turns that stage
icon's ring instead of showing bb's runtime spinner, so the row's trailing slot
shows its next indicator, such as a background command. Deferred turns a dashed
ring. Threads saved as Active return to Idle, and stage automation is gone.
