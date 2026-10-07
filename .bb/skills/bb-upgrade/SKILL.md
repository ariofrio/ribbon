---
name: bb-upgrade
description: Upgrade Ribbon for a new bb release, migrate private integrations to public APIs, sync plugin forks, or audit an upgrade for missed compatibility and feature-parity changes.
---

# Upgrade Ribbon

Treat an upgrade as a coverage audit across this repository, not a dependency
bump. Follow the repository's `AGENTS.md` for fork ownership, UI generation,
commit boundaries, installation, screenshots and rendered verification.
For an audit-only request, produce the coverage report and findings without
implementing changes or publishing anything.

## Establish the range

Read every plugin manifest and lockfile under `plugins/`, the root workspace
lockfile, harness dependencies, `vendor-ui.json`, and `fork.json`/its lock.
Reconcile that inventory with `.bb/plugins.json` and `marketplace.json`.
Derive the plugin and fork inventory from these files; do not assume the list
from the previous upgrade is still complete. Record the current bb and SDK
versions and any inconsistent pins before changing them.

Identify the requested target from upstream releases and its bundled SDK
version. Inspect previous upgrade PRs and commits for repository-specific
decisions and unresolved gaps; verify their conclusions against current source.

Completion: the baseline, target, complete plugin inventory, and declared forks
are accounted for, including packages with no frontend or behavioral migration.

## Audit release changes before choosing migrations

Read release notes and changelog entries for every intervening release, plus
the SDK's release/migration notes where present. If the tag's notes are missing
or stale, check the official changelog and upstream default branch for notes
published after the tag; record their commit separately from the runtime pin.
Record any remaining omissions and use the release-tagged source diff to cover
what the notes omit.

Inspect the complete changed public surface: plugin SDK exports and contracts,
the SDK areas/types they expose, API audit documentation, manifests, registry
components, and each fork's upstream tree. Follow changed contracts into host
implementations and native consumers where semantics matter. In particular,
check defaults, automatic selection, ownership, scope, focus, error handling,
and persistence, not just signatures. Inspect published declarations when
internal stripping or runtime-only aliases can conceal a breaking change.
Compare changed host defaults with each plugin's documented policy. A native
default changing does not by itself require changing a deliberate plugin
default; correct stale parity claims and propose policy changes separately.

For each plugin, trace its public API consumers and its private coupling:
internal imports, raw host routes, browser storage keys, DOM selectors/events,
native styling and copied upstream behavior. Distinguish documented plugin RPC
routes, plugin-owned storage and experimental public APIs from private host
implementation details.

Maintain a coverage report with one row per plugin and a decision for each
changed API/behavior family: migrate, adopt parity, already handled by the host,
not applicable, blocked by an SDK gap, or propose separately. Link decisions
to exact source or release evidence. Before retaining a workaround, verify that
the new API supports the same workflow, including hidden panels and focus.
Before claiming no omissions, reconcile the report against the full change list.

Completion: every plugin and changed family has an evidenced decision; missing
notes and surviving private integrations are explicit.

## Implement the applicable changes

Update plugin engine requirements, SDK/bb dependencies and lockfiles, harness
pins, and affected documentation together. Get the SDK version from the target
release rather than selecting the newest independently published SDK.
Add changesets for user-visible plugin changes as described in `README.md`;
the repository's release automation owns version and changelog updates.

Generate shared UI with `npm run build:ui` from the updated registry pin, then
sync every declared fork using `npm run fork:sync -- desktop-v<version>`.
Review both merge conflicts and owned files the sync skips. Preserve Ribbon's
behavior at composition seams, and keep fork sync separate from upstream fixes
and Ribbon-only changes as required by `AGENTS.md`.

Replace private integrations where the public contract covers their behavior.
Adopt newly available parity within the upgrade's scope. Remove obsolete paths
and update tests/fixtures to the actual native semantics. A retained fallback
needs evidence of the missing capability or detail, not just an unchanged test.

Keep new product proposals separate from compatibility fixes. Describe their
user benefit and exact enabling API, including the limits that affect feasibility.

Completion: the report matches the final implementation, all pins agree, and
every retained workaround and deferred proposal has a concrete explanation.

## Verify and hand off

Run root tests and layout, UI, heading-icon and fork checks. Run each plugin's
`release:check`, including unchanged-behavior plugins, and the affected isolated
E2E cases plus integration with the other plugins. Check the rendered result for
native parity, keyboard/pointer behavior, compact/touch layouts and portal CSS
where affected. Use the repository harness; CI owns screenshot recapture.

Install/reload changes in the appropriate bb instance and record where they
were verified. For tests that change server state, use an isolated server/host.
Do not silently replace another checkout's installed plugin source. Follow the
repository's commit/push workflow and inspect all PR checks, not only the checks
GitHub currently marks required.

Return a concise result with the PR and coverage report links, per-plugin
outcomes, validation and installation status, remaining SDK gaps, and proposed
next work. Distinguish completed local checks from pending CI; do not claim an
upgrade is complete while a required migration or verification remains open.

Completion: the changes, source coverage, verification and remaining limits are
reviewable without reading the conversation.
