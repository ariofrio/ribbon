---
"bb-plugin-ribbon-sidebar": patch
---

End a sidebar drag that bb's split gesture cancels as the thread leaves the sidebar. Previously a quick drag toward the main view or composer could leave the row hidden and the cursor grabbing until the window was reloaded.
