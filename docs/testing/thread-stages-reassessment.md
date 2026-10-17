# Thread stage reassessment evaluation

The approved instruction changes did **not** achieve behavioral GREEN in this
fixture. Both runtimes failed the required work ordering in both trials of both
investigation cases, with original and updated guidance. The PR remains a draft;
these results support reproducing the failure, not claiming the wording fixes it.

## Method

Executed on 2026-10-16 using Codex CLI 0.163.0 and Claude Code 2.1.302.
Claude reported `claude-opus-5-5[1m]`; Codex used its clean-config default, whose
model ID is not emitted in its JSONL. The same CLI configuration was used on both
sides. No subagents simulated target-agent behavior.

The [runner](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/run.py)
loads the skill and injected guidance from Git commit
`7b6fbf0bcb732ea6832877faf0563502e2930490` for original-guidance runs, and from the
working tree for updated runs. The
[cases and expectations](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/evals.json)
stay fixed across the comparison. Case 35 supplies user review comments that
require investigation; case 36 supplies the previously requested decision and
asks for investigation before a final proposal. Both use synthetic retry code,
receiver code, delivery probes, and two delivered drafts. They do not contain
or publish the originating thread's issue drafts.

The [isolated CLI](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/fixture.py)
serves those files and records actual stage reads, writes, source reads, their
order, and stage at each read. The
[oracle](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/oracle.py)
requires In progress before independent source work, then Needs user when only
the publication/proposal decision remains. These are two changes in outstanding
work, not a stage toggle per tool call. Expected choices are never passed to the
workers. No production BB instance, settings, or installed plugin is changed.

Portable-skill-creator routed the work through writing-great-skills, both the
Anthropic and Codex skill creators, and the eval schema reference. Its real-CLI
execution requirements controlled runtime validation; the shared creator's
subagent execution recipe was not used. Existing skill metadata was preserved;
Codex's quick validator passed. Packaging remains the repository's release check.

## Commands and provenance

From the repository root, the actual runner commands used the following shape
(`R` is `plugins/bb-plugin-thread-stages/skills/thread-stages/evals/run.py`):

```sh
python3 "$R" --runtime codex --cases 35 36 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-09 --timeout 240
python3 "$R" --runtime claude --cases 35 36 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-10 --timeout 240
python3 "$R" --runtime codex --cases 24 26 28 35 36 37 38 39 --output .scratch/work/thread-stage-evals/run-11 --timeout 240
python3 "$R" --runtime claude --cases 24 26 28 35 36 37 38 39 --output .scratch/work/thread-stage-evals/run-12 --timeout 240
python3 "$R" --runtime codex --cases 24 26 28 37 38 39 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-13 --timeout 240
python3 "$R" --runtime claude --cases 24 26 28 37 38 39 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-14 --timeout 240
python3 "$R" --runtime codex --cases 35 36 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-15 --timeout 240
python3 "$R" --runtime codex --cases 35 36 --output .scratch/work/thread-stage-evals/run-16 --timeout 240
python3 "$R" --runtime claude --cases 35 36 --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-17 --timeout 240
python3 "$R" --runtime claude --cases 35 36 --output .scratch/work/thread-stage-evals/run-18 --timeout 240
```

All ten runs record suite SHA-256
`61f98a94a2f55bde19e44d36ca4a82c486e7efe0f92481013c89b8f5a7dd8b82`.
Original skill/guidance hashes are
`81c111091a9d2c3996cf13d8e102916e7359c20ff0928a0437e716383816c7a4` /
`8dd5cbb181f06fbace4dcde082133d37a6a2db4f0c0de9f9a03a1e3c00648727`;
updated hashes are
`8fb5196a54b17f31a22e292012522c866dcd03c9f2ef72c725bd36861b99e849` /
`9f7bf85850ece81ecc50d50d0238be73f02d5a1af4f27383746f0e96bec929f6`.

Each case's `command.json` records the actual target CLI arguments. These invoke
`codex exec --json --output-last-message ...` or
`claude --print --verbose --output-format stream-json ...`, using the exact
committed case prompt and selected instruction snapshot. Outputs, source
snapshots, raw transcripts, CLI calls, and canonical `grading.json` remain in
those ignored runner workspaces. The durable observations follow below.

## Observations

`read(5)` below means reads of the [client](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/files/retry-worker.ts),
[receiver](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/files/receiver.ts),
[probes](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/files/retry-probes.json),
[exhaustion draft](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/files/exhaustion.md),
and [duplicate-delivery draft](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/files/duplicates.md),
in that order. Every one occurred in `BlockedOnUser`. All investigation runs exited successfully,
read the required skill and project files, and used valid fixture commands.

| Runtime | Guidance | Trial | Case | Actual operation order | Case grade |
| --- | --- | --- | --- | --- | --- |
| Codex | original | 1 | 35 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | original | 1 | 36 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | updated | 1 | 35 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | updated | 1 | 36 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | original | 2 | 35 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | original | 2 | 36 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | updated | 2 | 35 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Codex | updated | 2 | 36 | show → read(5) → stage Active → stage BlockedOnUser | FAIL |
| Claude | original | 1 | 35 | show → read(5) | FAIL |
| Claude | original | 1 | 36 | read(5) → show | FAIL |
| Claude | updated | 1 | 35 | show → read(5) | FAIL |
| Claude | updated | 1 | 36 | read(5) → show | FAIL |
| Claude | original | 2 | 35 | show → read(5) | FAIL |
| Claude | original | 2 | 36 | read(5) → show | FAIL |
| Claude | updated | 2 | 35 | show → read(5) | FAIL |
| Claude | updated | 2 | 36 | show → read(5) | FAIL |

Codex's only failed check was **Stage fit before independent source work
resumed**: both stage writes happened after the source reads. Claude made no
stage writes, also failing **Exactly the required stage writes were made**;
three of its four original/updated case-36 sessions inspected the stage only
after source work. A correct final Needs user value therefore cannot pass.

Representative actual commands from Codex run-11/case-35:

```text
bb thread-stages show --self --json       # stage: BlockedOnUser
bb files read src/retry-worker.ts         # before: BlockedOnUser
bb files read src/receiver.ts             # before: BlockedOnUser
bb files read logs/retry-probes.json       # before: BlockedOnUser
bb files read drafts/exhaustion.md        # before: BlockedOnUser
bb files read drafts/duplicates.md        # before: BlockedOnUser
bb thread-stages stage Active --self      # after source work
bb thread-stages stage BlockedOnUser --self
```

The answers themselves correctly found four sends (one initial send plus three
retries), retries for thrown errors and 5xx responses, no retry for 408, and
repeated committed rows when a 503 follows insertion. For example, run-09/case-35
returned: “The receiver inserts the event **before** returning the simulated 503
and contains no event-ID deduplication.” The source/probe interpretation was
reviewed separately; it cannot override the programmatic ordering failure.

The six controls (24, 26, 28, 37, 38, 39) passed on both runtimes with both
versions: **24/24 case passes**, each with zero stage writes. They cover routine
monitoring, disabled automatic updates, genuine pending review, acknowledgment
without review, an explicit manual-stage preference during investigation, and
disabled updates during investigation. Core investigations were **0/4 per
runtime per version**. This sample establishes no improvement and no GREEN.
It does not reproduce the original elapsed investigation time or production
provider-session integration.

All saved runs were regraded with `python3 "$R" --grade <run-directory>`; the
core-only runs returned `Passed 0/2`, updated full selections `Passed 6/8`, and
original control selections `Passed 6/6`. Their process exit codes were 1, 1,
and 0 respectively. Nonzero core results are behavioral failures, not timeouts
or missing completion events.

Earlier pilot workspaces are excluded from these totals: comparison labels in
initial output paths were removed, a single-lookup task was expanded into a
substantive investigation, draft artifacts were supplied, and fixture file-help
and manual-stage grading gaps were corrected. Runs 09–18 all used the same
frozen suite. No failed updated runs from that suite were discarded.

## Software verification

- `npm run check:evals --workspace=bb-plugin-thread-stages`: 20 grader/fixture tests passed.
- `npm test`: 127 repository tests passed.
- `npm run check:layout`, `check:ui`, `check:heading-icons`, `check:fork`: passed.
- Codex `quick_validate.py` with PyYAML: passed.
- The Thread stages `release:check` passed with the repository-pinned BB CLI:
  887 plugin tests, typecheck, SDK declarations, build, stylesheet verification,
  production-only build, and packed artifact verification.

For the release check, from `plugins/bb-plugin-thread-stages`:

```sh
BB_CLI="$PWD/node_modules/bb-app/host-daemon/dist/bb" npm run release:check
```

The installed host CLI initially failed `verify:types` because its SDK is
0.6.50 while the repository pins 0.6.37. Using the repository's bb-app 0.46.0
CLI matches CI and passed without changing either pin or production settings.
No local screenshot recapture, install, merge, or deployment was performed.

Written by Codex
