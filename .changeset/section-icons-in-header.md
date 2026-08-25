---
"bb-plugin-icons": minor
"bb-plugin-breadcrumbs": minor
---

Show a section's icon in the thread header, beside the crumb it belongs to.
Breadcrumbs leaves an empty marked span before each crumb and Icons fills it,
since bb's SDK gives one plugin no way to render another's component. Either
plugin without the other is unchanged.

With no crumbs to sit beside, the header keeps one icon and chooses its owner
the way a sidebar row does: the project's, or the section's where that project
has no icon of its own.

The picker no longer offers the glyphs bb draws by default for a project and for
the personal project. A row holding one of those looked like no choice at all
and still outranked the section's icon.
