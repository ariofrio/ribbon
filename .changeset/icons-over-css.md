---
"bb-plugin-icons": minor
"bb-plugin-thread-stages": minor
---

Deliver icons as CSS. The Icons plugin now publishes every chosen icon as one
stylesheet, keyed by an attribute a consumer puts on a box it draws itself, so
drawing an icon costs a plugin nothing per row: no fetch, no subscription, no
node. That contract is documented in the Icons README as an extension point.

Thread stages draws its row and filter icons that way, and no longer reads them
over RPC. Icons draws its own read-only placements that way too, leaving React
only where the icon has to answer a click and open the picker.

Neither plugin's appearance changes. A Thread stages sidebar without the Icons
plugin installed still lays out as it did before there were icons.
