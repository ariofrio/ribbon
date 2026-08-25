---
"bb-plugin-breadcrumbs": patch
"bb-plugin-icons": patch
"bb-plugin-thread-stages": patch
---

Refresh every vendored BB component to the pinned registry release, so all
three plugins share one vintage of BB's menus, overlays, and icons instead of
two. Breadcrumbs and Icons were carrying components from an older release whose
pin had been bumped without a re-vendor, which left their overlays a rewrite
behind and their icon set six icons short.

The four local edits those copies had accumulated are now composed rather than
patched in, so no plugin forks BB's UI kit: menus that should stay a dropdown
on a narrow window use BB's own compact-viewport override, destructive context
items take the classes BB's app gives them, and the thread filter draws its own
check and submenu chevron the way its actionable rows already did — which also
makes its two row types finally render the same selected state.
