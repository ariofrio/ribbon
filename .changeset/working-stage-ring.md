---
"bb-plugin-ribbon-sidebar": minor
"bb-plugin-thread-stages": minor
---

Remove the Active stage. A working thread keeps its stage and turns that stage
icon's ring, in the title's color, instead of showing bb's runtime spinner, so
the row's trailing slot shows its next indicator, such as a background command.
Deferred turns a dashed ring. A working row shimmers across its icon, title,
preview, and indicator, but not its background or buttons, in place of the
shimmer bb draws on single indicators. Blocked's slash now spans only the width
of Completed's dot. Threads saved as Active return to Idle, and stage automation
is gone.
