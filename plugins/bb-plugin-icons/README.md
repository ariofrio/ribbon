# Icons

Gives every project and every thread section an icon and an optional color, and
draws it wherever bb names a project: bb's own sidebar headers, the header
above a thread and above a project's own screens, the prompt box and the menus
it opens, and each row of the
[Thread stages](../bb-plugin-thread-stages#readme) sidebar.

Click one on a sidebar header or in the thread header to change it: search
2,532 icons by name or synonym, filter by category, and pick a color. Changes
save as you click and appear everywhere at once.

Projects default to a folder and bb's personal project to a chat bubble,
because that is what bb draws itself. Sections default to bb's own section
mark — Hugeicons has none, so the plugin composes it, which is why it is the
one glyph here that is not from the catalog.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-dark.png">
  <img src="assets/screenshot-light.png" alt="The icon picker open on the Storefront project's icon in a bb thread header">
</picture>

The icon comes from [Hugeicons](https://hugeicons.com), the same set bb itself
draws from, so it matches bb's chrome exactly. Projects default to a folder;
bb's personal project always shows a chat bubble and cannot be changed.

Choosing a color is optional. Without one the icon inherits the surrounding
text color, which keeps it themed; picking one of bb's eight favicon colors —
red, orange, yellow, green, teal, blue, purple, or pink — overrides that.

## Install

Add this repository as a bb marketplace, then install the plugin from it:

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install icons@ribbon
```

Skip the first line if you already added the marketplace for another plugin.

Update an installed copy with:

```sh
bb plugin update icons
```

## Where the catalog lives

The catalog is served by the plugin backend, not bundled into the app. The
client ships at 54 KB gzipped and fetches the full set once, the first time
the picker opens; a chosen icon travels with its drawing so other plugins can
render it without shipping the catalog themselves.

## The icon catalog

`npm run build:catalog` regenerates `src/icon-catalog.json` and
`src/icon-catalog.generated.ts` from Hugeicons' published index. It keeps the
categories that describe a project rather than interface furniture, collapses
`-01`/`-02` name variants, and drops anything the free package does not export
— 2,532 icons across 32 categories. The result is committed, so builds and CI
never reach the network.

That index is unversioned and sends no `ETag` or `Last-Modified`, and no
released package carries the tags, so regenerating silently adopts whatever
Hugeicons serves that day — it has already rewritten tags for icons this
catalog ships. `npm run check:catalog` derives the catalog again and reports
the icons whose tags or category moved, writing nothing, so drift can be read
before it is adopted.

## Where the icons appear

**bb's sidebar.** The icon sits at the head of a group's label row, where
Thread stages puts a stage icon, which is what lines the group name up with the
New thread, Extensions, and Automations labels above it. bb shows project
groups under *Organize → By project* and section groups only under *Manually*,
so which headers exist depends on that setting.

Under *By project* that includes the personal project, which bb labels
*Threads* and wraps in no id of its own. It is the same group bb relabels
*Unorganized* under *Manually* and reuses for machineless threads under *By
machine*, where it holds whatever is left rather than the personal project and
gets no icon. What tells them apart is the company the group keeps: only under
*By project* do project groups sit beside it. A bb with no projects at all
therefore gets nothing, which errs towards no icon rather than the wrong one.

**The header.** Before the project name above an open thread, as it always has
been, and now before the project's own crumb above its settings — the one
screen where bb's header names a project and no thread.

**The prompt box.** Its project control and every project in the menu that
control opens, each project in the list `@` brings up, a project mentioned in
the prompt, and the strip under an open thread that names the project the
thread runs in.

Each of the three can be turned off on its own in the plugin's settings, and
all three are on by default. Sidebars other plugins draw are their own; Thread
stages reads these icons over this plugin's RPC.

## How the icons get there

bb offers a plugin one slot in the thread header and none anywhere else, so
everything but that slot is drawn from a content script that watches the
document and portals into it. `placements.ts` is the whole list of places, one
entry each, and `decorate.ts` is the single piece of machinery behind them:
finding, inserting, cleaning up, and keeping React from remounting an icon that
did not move all live there, so a new place costs an entry rather than a
module.

Where bb already draws a folder, the plugin hides bb's and stands in its place,
wearing the classes bb had chosen so it matches that surface's size and
muting. bb gets its folder back the moment the plugin stops. Where bb draws
nothing — its sidebar headers, a project's crumb — the icon goes at the head of
the row instead.

Telling *which* project a node is about is what differs between them. A
mentioned project carries its id, and a crumb links to it; everywhere else bb
prints the name and nothing more, so the plugin resolves the name against the
project list the backend sends with the icons, and leaves bb's own folder in
place when two projects share a name.

The thread header is the one exception, portaled the way
[Breadcrumbs](../bb-plugin-breadcrumbs#readme) portals the project name:
immediately before that breadcrumb when it is installed, and before the title
when it is not.

`placements.test.ts`, `header-dom.test.ts`, and `sidebar-dom.test.ts` pin every
shape against markup captured from a running bb, so a bb that moves one fails
locally rather than dropping an icon silently.

## Development

```sh
npm run release:check
bb plugin reload icons
```

`release:check` runs the tests and typecheck, checks the committed SDK
declarations are current, builds, and installs the packed npm artifact in a
temporary directory to validate its contents. `dist/` is built, never
committed. The package is not published to npm yet, but it stays publishable
so it can be.

## License

[MIT](LICENSE)
