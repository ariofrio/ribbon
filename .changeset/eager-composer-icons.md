---
"bb-plugin-icons": minor
---

Draw the icon everywhere bb names a project, not only on its sidebar headers
and above an open thread. That adds the prompt box's project control and the
menu it opens, the project rows in the `@` list, a project mentioned in a
prompt, the strip under an open thread, and the crumb above a project's own
settings — the one header that names a project and no thread, which the
thread-only slot could never reach.

Where bb draws its own folder the plugin now stands in its place rather than
adding beside it, wearing the classes bb chose so it matches each surface, and
handing the folder back the moment the plugin stops. Most of those rows print
a project's name and nothing else, so `listIcons` now carries bb's project
list alongside the icons; a name two projects share resolves to neither and
keeps bb's folder.

A new "Show around the prompt box" setting turns the new places off on their
own, and the thread-header setting now covers a project's header too.
