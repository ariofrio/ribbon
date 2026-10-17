# Skills

Manage skills on the bb server with GitHub CLI’s `gh skill` commands. Browse skills through GitHub search and discovery shelves, preview their instructions, and install from a search result or repository. Repository discovery offers selectable skills at the chosen pin.

Browse and Installed appear in BB’s left sidebar and use its resource cards and search toolbars. Search, owner filters, and installed-name sorting survive navigation. Returning from details restores loaded search results and scroll position; more results load as you scroll, with a Load more button available too.

Installed cards show descriptions, versions, pins, and available updates. Detail pages show instructions, source information, and update status. Installed instructions omit tracking frontmatter. Remote previews render original Markdown when an exact SKILL.md path is available, using authenticated GitHub CLI on the server; other previews retain gh’s terminal output. GitHub CLI details remain available alongside formatted previews and update summaries.

Install from Ribbon:

```sh
bb plugin install git:github.com/ariofrio/ribbon@main --plugin gh-skills
```

The server needs **GitHub CLI 2.102.0 or later with `gh skill` support**, authenticated for the repositories you use. GitHub credentials stay on that server. The plugin does not install or authenticate GitHub CLI for you.

## Placement

Every installation and update uses `--dir <BB server data directory>/skills`. There is no provider, project, execution-host, or custom-directory destination. BB distributes these server skills to its agents.

The plugin adds its own Skills navigation entry. You can hide the built-in Skills entry through BB’s navigation customization. Hiding either entry does not disable skill discovery.

## GitHub CLI behavior

- Without a pin, installation selects the latest repository release, falling back to the default branch.
- Explicit pins, including branch pins, are skipped by ordinary updates. **Remove pins and include pinned skills** passes `--unpin`.
- **Force re-download** passes `--force`. Updates can overwrite local edits; the plugin does not preserve customizations, restore executable bits, or implement a separate version tracker.
- Installed pages check for updates automatically. Checks are cached for five minutes; **Check for updates** requests a fresh check. Candidate summaries reflect gh’s dry-run output, and the update command resolves the source again when applied. CLI details preserve warnings, skipped skills, and output that cannot be summarized.
- Installed skills without source metadata appear in the list; non-interactive updates skip them according to GitHub CLI’s behavior.
- Uninstall deletes the selected skill directory after confirmation. GitHub CLI currently provides no skill-removal command. Its shared lockfile is left to GitHub CLI.

Operations run on the server and are serialized within the plugin. Install and update dialogs close while the command runs; failures reopen the form with its inputs intact. Every window shows the active operation and disables conflicting actions. The latest result is retained across navigation and plugin reloads. Closing the page does not cancel an already-running command. Reloading or disabling the plugin stops its child processes; an interrupted operation is reported on the next load. Errors from GitHub CLI, including authentication and preview-API errors, appear on the page.

## Development

```sh
npm test
npm run typecheck
npm run release:check
```

Tests cover public plugin RPC operations and page interactions. Ribbon’s isolated end-to-end suite checks the rendered page with its own server, host daemon, and fixture GitHub CLI.

Sidebar navigation uses a DOM bridge until BB exposes page-owned sidebar navigation. It keeps BB’s resizing and mobile drawer controls and restores native content when the page or plugin unloads. If BB’s expected sidebar markers are unavailable, Browse and Installed fall back to tabs inside the page.
