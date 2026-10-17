# Skills

Manage skills on the bb server with GitHub CLI’s `gh skill` commands. The **Skills** page provides GitHub search, repository discovery and preview, installation, update checks, updates, and removal.

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
- Checks show `gh skill update --dry-run` output directly. Preview and operation output also come from GitHub CLI.
- Installed skills without source metadata appear in the list; non-interactive updates skip them according to GitHub CLI’s behavior.
- Removal deletes the selected skill directory after confirmation. GitHub CLI currently provides no skill-removal command. Its shared lockfile is left to GitHub CLI.

Operations run on the server and are serialized within the plugin. Closing the page does not cancel an already-running command. Reloading or disabling the plugin stops its child processes. Errors from GitHub CLI, including authentication and preview-API errors, appear on the page.

## Development

```sh
npm test
npm run typecheck
npm run release:check
```

Tests cover public plugin RPC operations and page interactions. Ribbon’s isolated end-to-end suite checks the rendered page with its own server, host daemon, and fixture GitHub CLI.
