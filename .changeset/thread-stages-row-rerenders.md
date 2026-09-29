---
"bb-plugin-thread-stages": patch
---

Redraw only the rows a change touches. Opening a thread redrew every row and heading, because the icons controller was a new object on each render of the list; and any placement reload, error, or editor redrew every row, because each read the whole of Ribbon's data. The controller now holds still while nothing in it changes, and a row subscribes to its own stage, prompt actions, and pull request number placement.
