---
name: ribbon-sidebar
description: Inspect and organize bb root threads across Sections, Projects, and plugin-provided Ribbon sidebar groups. Use when selecting threads by sidebar organization, checking group membership before bulk work or messaging, or moving and ordering root threads. Discover the installed CLI rather than assuming its commands.
---

# Ribbon sidebar

Start by running `bb sidebar`. Its output must identify Ribbon before relying
on that command, because another installed plugin may have registered the same
name first. If Ribbon is not identified, invoke Ribbon explicitly with
`bb plugin run ribbon-sidebar` for the rest of the task.

Discover the available operations and arguments from the CLI's own help as
needed. Do not rely on a memorized command surface.

Use Ribbon's joined thread view before selecting roots for bulk work or
messaging. It combines bb thread metadata with Section, Project, and every
plugin-provided group, so selection rules based on organization should be
applied to that complete view rather than reconstructed from separate partial
lists.

Ribbon organizes root threads. Resolve a child to its root before inspecting,
moving, ordering, or selecting the hierarchy.
