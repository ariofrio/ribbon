# Thread stages

Stage mentions for Ribbon sidebar, and a compatibility bridge for existing
stage shortcuts and saved state.

[**Ribbon sidebar**](../bb-plugin-ribbon-sidebar#readme) owns the stages,
retention, and section layout. Install this plugin beside it for stage
mentions:

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install ribbon-sidebar@ribbon
bb plugin install thread-stages@ribbon
```

Type `@` and a stage name in the composer, such as `@Blocked on other agent`,
to mention a stage. The mention tells the agent what the stage means and how to
place the thread in it, so "do this, then @Blocked on other agent" asks the
agent to move the thread when it is done. Mentions of `@Idle` and `@Blocked` in
older messages still resolve: Idle is now Active, and Blocked is split into
Blocked on other agent and Blocked on third party. Ribbon's stage-change messages use the same mentions. The
menu offers the stages enabled in Ribbon settings.

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
