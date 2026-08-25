---
"bb-plugin-thread-stages": minor
---

Fall back to a thread's section icon on its sidebar row. The row still draws its
project's icon first, but a project nobody has picked an icon for now defers to
the section the thread is filed under, and falls back to the project's default
glyph only when neither was picked. A thread takes the nearest section walking up, its own included.
