---
"bb-plugin-icons": minor
"bb-plugin-ribbon-sidebar": minor
---

Deliver icons as CSS. The Icons plugin publishes every chosen icon as one
stylesheet, keyed by an attribute a consumer puts on a box it draws itself, so
drawing an icon costs a plugin nothing per row. The contract is documented in
the Icons README.

Ribbon sidebar draws its row, group header, scope filter and menu icons that
way instead of over RPC, and Icons draws its own read-only placements that way
too, keeping React only where the icon opens the picker.

Neither plugin's appearance changes.
