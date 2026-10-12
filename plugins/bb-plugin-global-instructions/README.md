<h1 align="center"><img src="assets/icon.svg" alt="" width="64"><br>Global instructions</h1>

Edit the instructions bb gives agents across every project and connected machine,
using plain text or rich Markdown, without a character limit.

## Install

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install global-instructions@ribbon
```

Requires bb 0.45.0 or later. Open **Settings → Global instructions**. The editor
loads the server's existing `AGENTS.md`; installing the plugin never creates or
replaces it. Choose **Plain text** to edit Markdown source, or **Rich Markdown**
for headings, emphasis, lists, blockquotes, and code with the composer's Tiptap
editing engine. Tables, task lists, images, and links also render in the rich
editor. Formatting shortcuts and undo/redo work there.

Click **Save** to apply changes. Switching modes without editing preserves the
original source. Rich edits normalize Markdown formatting; use plain text for
exact source, raw HTML, or custom Markdown syntax. Clear the text and save to
remove these instructions. **Discard changes** restores the file on the server.
If the file changed elsewhere, saving keeps your draft and asks you to reload
the latest file; copy any edits you want to keep before reloading.

## What this edits

The file is `<server dataDir>/AGENTS.md`, located using the public
`bb.server.experimental_dataDir` API. The editor displays its exact server path.
It is shared by all projects and execution hosts connected to that server,
including remote hosts. It does not edit a checkout's `AGENTS.md` or a
provider's own global instructions. The file remains effective if the plugin
is disabled or uninstalled.

bb [reads the file when building each turn's instructions](https://github.com/get-bb/bb/blob/desktop-v0.45.0/apps/server/src/services/threads/thread-runtime-config.ts#L216),
[trims outer whitespace and skips empty files](https://github.com/get-bb/bb/blob/desktop-v0.45.0/apps/server/src/services/threads/workspace-agent-instructions.ts#L16),
and appends it after plugin instructions and before workspace `.bb/AGENTS.md`.
New agent sessions receive saved changes without a server restart. Existing
sessions may keep their original instructions: the [ACP bridge injects instructions
only on the first prompt](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/provider-bridge-acp/src/bridge/bridge.ts#L1291),
and the live test verifies this behavior. Start a new thread to ensure the new
instructions are applied. A turn already running is unaffected.

Unlike [Custom instructions](https://github.com/get-bb/bb/blob/desktop-v0.45.0/plugins/custom-instructions/server.ts),
this plugin neither stores instructions in plugin settings nor contributes
another copy to the prompt. Its editor, RPC schemas, and the server file reader
have no character cap. Provider context windows and bb's normal transport and
runtime constraints still apply.

Saves use a content revision to detect stale drafts, serialize competing saves,
stage a file beside the destination, and atomically replace it. Existing file
permissions and symlink targets are preserved; new files are private (`0600`).

## Development

```sh
npm install --workspaces=false
npm run release:check
```

From the repository root, `npm run test:e2e -- --case global-instructions:editor`
checks the rendered editor and instruction delivery against an isolated bb
server and host daemon.
