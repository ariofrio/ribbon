<h1 align="center"><img src="assets/icon.svg" alt="" width="64"><br>Ribbon Suite</h1>

<p align="center"><strong>Grow your swarm. Don't lose the thread.</strong></p>

<p align="center">A suite of <a href="https://getbb.app">bb</a> plugins for managing large amounts of agents.</p>

<p align="center">
  <a href="https://getbb.app"><img src="https://img.shields.io/badge/bb-0.45.0%2B-656D76?style=flat-square" alt="bb 0.45.0+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ariofrio/ribbon?style=flat-square&color=656D76" alt="MIT license"></a>
  <a href="https://github.com/ariofrio/ribbon/actions/workflows/plugins.yml"><img src="https://img.shields.io/github/actions/workflow/status/ariofrio/ribbon/plugins.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
</p>

<br>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.png"><img src="assets/hero-light.png" alt="bb with Thread stages, the ChatGPT theme, and Missing keyboard shortcuts at work"></picture></p>

<br>

## Plugins

<p><img src="assets/spacer.svg" alt="" width="1120" height="48" align="left"></p>

<a href="plugins/bb-plugin-thread-stages#readme"><picture><source media="(max-width: 880px) and (prefers-color-scheme: dark)" srcset="plugins/bb-plugin-thread-stages/assets/card-dark.png" width="1120"><source media="(max-width: 880px)" srcset="plugins/bb-plugin-thread-stages/assets/card-light.png" width="1120"><source media="(prefers-color-scheme: dark)" srcset="plugins/bb-plugin-thread-stages/assets/card-beside-dark.png"><img src="plugins/bb-plugin-thread-stages/assets/card-beside-light.png" alt="Thread stages organizing bb threads within sections" align="right" width="45%"></picture></a>

### <img src="assets/icons/thread-stages.svg" alt="" width="26" align="absmiddle"> &nbsp;Thread stages

bb's thread list with workflow stages, stable thread order, and section and project icons.

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-stages@ribbon
```

<a href="plugins/bb-plugin-thread-stages#readme">Read docs &rarr;</a>

<picture><source media="(min-width: 881px)" srcset="assets/blank.svg"><source media="(prefers-color-scheme: dark)" srcset="assets/rule-dark.svg"><img src="assets/rule-light.svg" alt="" width="1120" height="35" align="top"></picture><br clear="all">

### <img src="assets/icons/thread-titles.svg" alt="" width="26" align="absmiddle"> &nbsp;Thread titles

Title threads from their first message and first turn, and refine generic, inaccurate, or overlong titles on the third user message.

Use the full recorded conversation, keep renamed titles, and remember completed
updates across bb restarts.

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-titles@ribbon
```

<a href="plugins/bb-plugin-thread-titles#readme">Read docs &rarr;</a>

<picture><source media="(min-width: 881px)" srcset="assets/blank.svg"><source media="(prefers-color-scheme: dark)" srcset="assets/rule-dark.svg"><img src="assets/rule-light.svg" alt="" width="1120" height="35" align="top"></picture><br clear="all">

### <img src="assets/icons/default-sections.svg" alt="" width="26" align="absmiddle"> &nbsp;Default sections

Give each project a default section, so its new threads start there.

Set it from Thread stages' project and section headings, the plugin's
settings, or the CLI. Threads you place yourself stay where you put them.

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install default-sections@ribbon
```

<a href="plugins/bb-plugin-default-sections#readme">Read docs &rarr;</a>

<picture><source media="(min-width: 881px)" srcset="assets/blank.svg"><source media="(prefers-color-scheme: dark)" srcset="assets/rule-dark.svg"><img src="assets/rule-light.svg" alt="" width="1120" height="35" align="top"></picture><br clear="all">

<a href="plugins/bb-plugin-missing-keyboard-shortcuts#readme"><picture><source media="(max-width: 880px) and (prefers-color-scheme: dark)" srcset="plugins/bb-plugin-missing-keyboard-shortcuts/assets/card-dark.png" width="1120"><source media="(max-width: 880px)" srcset="plugins/bb-plugin-missing-keyboard-shortcuts/assets/card-light.png" width="1120"><source media="(prefers-color-scheme: dark)" srcset="plugins/bb-plugin-missing-keyboard-shortcuts/assets/card-beside-dark.png"><img src="plugins/bb-plugin-missing-keyboard-shortcuts/assets/card-beside-light.png" alt="A bb side chat opened with the ⇧⌘L shortcut" align="right" width="45%"></picture></a>

### <img src="assets/icons/missing-keyboard-shortcuts.svg" alt="" width="26" align="absmiddle"> &nbsp;Missing keyboard shortcuts

Add shortcuts to start personal or project threads, navigate history, and reach the composer or panel tabs.

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install missing-keyboard-shortcuts@ribbon
```

<a href="plugins/bb-plugin-missing-keyboard-shortcuts#readme">Read docs &rarr;</a>

<picture><source media="(min-width: 881px)" srcset="assets/blank.svg"><source media="(prefers-color-scheme: dark)" srcset="assets/rule-dark.svg"><img src="assets/rule-light.svg" alt="" width="1120" height="35" align="top"></picture><br clear="all">

<a href="plugins/bb-plugin-chatgpt-theme#readme"><picture><source media="(max-width: 880px) and (prefers-color-scheme: dark)" srcset="plugins/bb-plugin-chatgpt-theme/assets/card-dark.png" width="1120"><source media="(max-width: 880px)" srcset="plugins/bb-plugin-chatgpt-theme/assets/card-light.png" width="1120"><source media="(prefers-color-scheme: dark)" srcset="plugins/bb-plugin-chatgpt-theme/assets/card-beside-dark.png"><img src="plugins/bb-plugin-chatgpt-theme/assets/card-beside-light.png" alt="bb wearing the ChatGPT palette, its light and dark halves meeting along the diagonal" align="right" width="45%"></picture></a>

### <img src="assets/icons/chatgpt-theme.svg" alt="" width="26" align="absmiddle"> &nbsp;ChatGPT theme

Restyle bb to match the OpenAI ChatGPT (Codex) desktop app.

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install chatgpt-theme@ribbon
```

<a href="plugins/bb-plugin-chatgpt-theme#readme">Read docs &rarr;</a>

<br clear="all">

## Updating

`bb plugin update <entry-id>` moves an installed plugin to its newest release.
Once the marketplace is added, its other plugins can also be picked in
Settings → Plugins.

## Development

Clone the repository and install every plugin at once:

```sh
git clone https://github.com/ariofrio/ribbon.git
cd ribbon
npm run install:plugins
```

Run the same command after a `git pull`: it installs whatever is missing, then
rebuilds and reloads every plugin.

To run one plugin's unreleased code without a checkout, install it from `main`
by its entry name in the collection — the entries are listed in
[.bb/plugins.json](.bb/plugins.json):

```sh
bb plugin install git:https://github.com/ariofrio/ribbon.git@main --plugin chatgpt-theme
```

That install follows the branch rather than the release tags, so
`bb plugin update <plugin-id>` moves it to the newest commit on `main`.

### Releases

Create a Changeset with `npm run changeset` for every user-visible plugin
change. After the change reaches `main`, automation opens or updates a release
pull request with version, lockfile, and changelog updates. Merging that pull
request validates the affected plugins, creates immutable `<plugin-id>/vX.Y.Z`
Git tags, and publishes a
[GitHub release](https://github.com/ariofrio/ribbon/releases) per tag
carrying that version's changelog entry. Every listing accepts any released
version, so the catalog never changes with a release. Nothing is published to
npm yet.

`npm run release:check` runs each plugin's tests, type checks, build, SDK
declaration verification, and packed artifact verification.
[CI](.github/workflows/plugins.yml) runs the same check for every plugin. Build
output in `dist/` is generated and is not committed.

## License

[MIT](LICENSE)
