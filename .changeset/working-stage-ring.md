---
"bb-plugin-ribbon-sidebar": minor
"bb-plugin-thread-stages": minor
---

Remove the Active stage. A working thread keeps its stage and turns that stage
icon's ring instead of showing bb's runtime spinner: an arc in the title's color
turns with the rest of the ring in the icon's color, and Deferred turns its
dashes. The row's trailing slot shows its next indicator, such as a background
command. Blocked's slash now spans only the width of Completed's dot. Threads
saved as Active return to Idle, and stage automation is gone.
