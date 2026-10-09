# Default sections

Give each project a default section, so its new threads start there.

## Install

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install default-sections@ribbon
```

Requires bb 0.45.0 or later. Installing the plugin moves no existing thread.

## Behavior

A new root thread created in a project with a default section, and in no
section, starts in that section. bb creates the thread first and the plugin
files it a moment later, so a new thread can appear under **Threads** for an
instant before it moves.

The plugin leaves these threads where bb put them:

- A thread started in a section, such as from a section heading's **+**.
- A child thread, which bb draws under its parent and which shows its root's
  section.
- A fork, which stays beside the thread it was forked from.
- A hidden thread, which plugins create as their own workers.
- A thread in the personal project, which the **Threads** heading's **+**
  creates in no section on purpose. The personal project has no default
  section for that reason.

A default never moves a thread afterward: moving one thread changes only that
thread, and changing a default changes only the threads created after it.
Removing a section forgets every default that pointed at it.

## Settings

Choose each project's default section on the plugin's settings page, or
**Threads** for none. The page lists every project once a section exists.

With [Thread stages](../bb-plugin-thread-stages#readme) as the sidebar, a
project heading's **⋯ menu → Default section** sets that project's default,
and a section heading's **⋯ menu → Default for** makes that section the
default for any project.

## CLI

```sh
bb default-sections list [--json]
bb default-sections set <project> <section>
bb default-sections clear <project>
```

Name a project or section by its id or by its name, ignoring case.

## Development

```sh
npm test --workspace bb-plugin-default-sections
npm run release:check --workspace bb-plugin-default-sections
npm run test:e2e -- --case default-sections:new-threads
```
