# Thread stages

Compatibility bridge for existing Ribbon stage shortcuts and saved state.

[**Ribbon sidebar**](../bb-plugin-ribbon-sidebar#readme) now owns the five stages,
automation, retention, and section layout. New installations need only Ribbon:

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install ribbon-sidebar@ribbon
```

Ribbon migrates customized and explicitly cleared shortcut bindings to its own
command IDs through bb's keyboard-settings API. This bridge retains the old
stage and reorder RPCs for callers and older installation data. It registers no
sidebar, commands, stage automation, or archival jobs.

Ribbon imports and verifies older placement data before acknowledging the
handoff, and copies stage settings once. Existing stage keys remain compatible
with the CLI. Changes made through the bridge's settings are forwarded to Ribbon;
use Ribbon settings for new configuration.

See [Ribbon's stages and shortcuts](../bb-plugin-ribbon-sidebar#stages-and-shortcuts)
for behavior and default bindings.

## Development

```sh
npm run release:check
```

[MIT](LICENSE)
