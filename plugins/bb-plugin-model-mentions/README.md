# Model mentions

Type `@Opus`, `@Sonnet`, or another model name to find matching models from
your available providers. Choose a result to insert a mention with that
provider's icon. The same model offered by different providers has separate
results, with the provider's name underneath.

Type `@model:` to browse models without a name filter, or `@model:opus` to
search within models. You can include a provider name, such as
`@model:opus claude`. The prefix is case-insensitive. Up to 50 available
models are shown; narrow the query to find more.

Mentions carry exact provider and model IDs as agent context. For example,
“start a subthread with @Opus” tells the receiving agent which provider and
model to use for that subthread. They work in new threads, follow-ups, and
queued-message editors. They leave the composer's provider and model unchanged.

## Install

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install model-mentions@ribbon
```

## Settings

Settings → Plugins → Model mentions:

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable model mentions | On | Match model names, model IDs, and provider names. |
| Enable provider mentions | Off | Mention a provider such as `@Codex` or `@Claude Code`. |
| Enable reasoning mentions | Off | Mention a supported level such as `@high`, qualified by provider. |

Reasoning suggestions come from the providers' model catalogs. Models on the
same provider may support different levels; the receiving agent checks the
chosen model before applying the level.

Disabling suggestions keeps existing mentions readable and sendable. Mention
context preserves the chosen IDs even if the catalog changes later. The agent
must report an unavailable choice rather than silently substitute another.

Search uses the thread's environment when one is attached; otherwise it uses
bb's default host. A provider whose catalog cannot load contributes no model
or reasoning suggestions. Only models offered for selection are suggested.

SVG provider icons use bb's native provider renderer. Their aliases persist
across reloads so saved mentions retain the right icon. Up to 256 distinct
providers with SVG logos can be recorded; named provider glyphs need no aliases.

## Development

```sh
npm ci
npm run release:check
```

From the repository root, `npm run test:e2e -- --case model-mentions:composer`
verifies selection, icons, and message context against an isolated bb server.
