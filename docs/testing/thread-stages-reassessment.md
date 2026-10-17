# Thread stage reassessment evaluation

The earlier **40/40** result is a diagnostic result, not acceptance evidence for
forty autonomous tasks. An audit found that sixteen cases ask for recommendations,
nineteen supply workflow conclusions, and five perform source investigations
without grading their requested deliverables. A static counterexample replaced
case 35's final answer with `Done.` while preserving its real tool trace; the
old oracle still passed. That probe is not a new agent run.

The new [native-conversation acceptance suite](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/README.md#task-acceptance)
addresses those limitations with seventeen scenarios and thirty-one turns.
Its [native comparison](thread-stages-native-conversations.md) is recorded
separately from the historical diagnostic comparisons below. Passing diagnostic cases or a previously passing baseline
does not establish behavioral improvement.

## Method

The comparisons through run 76 were executed on 2026-10-16–17 using
Codex CLI 0.163.0 and Claude Code 2.1.302. Claude reported `claude-opus-5-5[1m]`; Codex used its clean-config default, whose
model ID is not emitted in its JSONL. The same CLI configuration was used on both
sides. No subagents simulated target-agent behavior.

For the initial investigation-before-work comparison, the
[runner](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/run.py) loads the skill and injected guidance from Git commit
`7b6fbf0bcb732ea6832877faf0563502e2930490` for original-guidance runs, and from the
then-working tree (now commit `69ae0e5`) for updated runs. The
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

## Initial observations

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

## Unresolved proposal and next actor

The second change qualifies the broad instruction that concrete loose ends or
meaningful uncertainty keep a thread In progress. It now says:

> Concrete loose ends or meaningful uncertainty keep In progress while this
> thread can advance them independently or coordinates an established wait.
> Otherwise, use the stage for whoever must act next. The abstract possibility
> of future questions does not keep In progress.

This replaces the overbroad sentence in Completing a thread; it does not add
parallel rules in the introduction or injected reminder. It distinguishes an
unfinished objective from work this thread can advance, while preserving
coordinated waits and the existing completion requirements.

Case 40 reconstructs the question/report boundary around the
[16-PNG recapture commit](https://github.com/ariofrio/ribbon/commit/230212acf5fba96c096cf92ae77059dfa27055ad),
[restarted screenshot run](https://github.com/ariofrio/ribbon/actions/runs/38988301794),
[plugin/E2E run](https://github.com/ariofrio/ribbon/actions/runs/38988301786), and
[PR-wide relevance implementation](https://github.com/ariofrio/ribbon/blob/119d80b/scripts/changes.mjs#L79).
The job snapshots are the original tool observations at
2026-10-17 00:53:48 UTC, when capture, Thread stages validation, and all four E2E
groups were still running. Those jobs belong to other PR work: this discussion
has no implementation changes, owned jobs, or monitoring arrangement. The
worker receives neither the user's later stage correction nor the agent's
retrospective diagnosis. It must inspect the evidence, report its analysis and
proposal, and perform a real Needs user write when user direction is next.

The baseline is the existing PR at `69ae0e5`; the revised source changes only
the quoted qualification. The injected reminder is identical on both sides.
Both use the same target CLI configurations described above. Codex's model ID
remains unreported by its JSONL, so the comparison controls its clean-config
CLI invocation rather than claiming a verified production model/effort match.
Claude again reported `claude-opus-5-5[1m]`.

| Runtime | Baseline case 40 | Revised case 40 | Interpretation |
| --- | --- | --- | --- |
| Codex | 2/2 pass | 2/2 pass | No reproduced omission or measured fix. |
| Claude | 2/2 pass | 2/2 pass | No reproduced omission or measured fix. |

The exact commands use the same `R` as above and `--timeout 240`:

| Output run | Runtime | Cases | Source option |
| --- | --- | --- | --- |
| run-23 | codex | 17 19 22 27 31 | `--ref 69ae0e5` |
| run-24 | claude | 17 19 22 27 31 | `--ref 69ae0e5` |
| run-25 | codex | 17 19 22 27 31 35 36 40 | working tree |
| run-26 | claude | 17 19 22 27 31 35 36 40 | working tree |
| run-29 | codex | 40 | `--ref 69ae0e5` |
| run-30 | claude | 40 | `--ref 69ae0e5` |
| run-31 | codex | 40 | working tree |
| run-32 | claude | 40 | working tree |
| run-33 | codex | 40 | `--ref 69ae0e5` |
| run-34 | claude | 40 | `--ref 69ae0e5` |
| run-35 | codex | 40 | working tree |
| run-36 | claude | 40 | working tree |

For example:

```sh
python3 "$R" --runtime codex --cases 40 --ref 69ae0e5 --output .scratch/work/thread-stage-evals/run-29 --timeout 240
python3 "$R" --runtime codex --cases 40 --output .scratch/work/thread-stage-evals/run-31 --timeout 240
```

Every final case-40 run exited 0, completed the required skill/file reads, and
made exactly one `bb thread-stages stage BlockedOnUser --self` write after the
four evidence reads. Each write was preceded by
`bb thread-stages show --self --json`, which returned `Active`. Codex inspected
before its evidence reads; Claude inspected after them. This case grades the
missing post-investigation write; cases 35–36 own the separate before-work
ordering contract. A verbal recommendation without a write fails the oracle.

Run-31's answer explained: “Earlier implementation changes therefore remain
relevant after an image-only push.” It ended: “Whether to pursue that gate is
your decision; this discussion hasn't taken on monitoring the runs.” These
statements agree with its recorded stage operation. Prose review confirmed the
PR-wide trigger and proposal-only boundary; the stage grade does not validate
every CI recommendation or replace investigation of a future implementation.

Controls 17 (established observation), 19 (coordinated computation), 22 (report
awaiting direction), 27 (independent work despite pending review), and 31
(finished bounded reporting) all passed on both runtimes with both versions:
**20/20 case passes**. Cases 35–36 still failed on the revised wording in
run-25/run-26, **0/2 per runtime**, with source reads preceding the needed Active
write. Those failures kept the PR in draft pending the further iteration below.

The case manifest hash is
`0a0372189527d62dc2ca80e0200f68b9e8d29e1a7dcd4e7716216235c8da0a02`.
The baseline skill hash is the previous comparison's updated hash; the new
skill hash is
`aaef1780ba62ecbabc2d1f1da183e0fb8f125aace53f160f025fff5dc5631fdc`.
Runs 29–36 additionally record SHA-256 hashes for each input file in `run.json`.

Earlier runs 19–22 and 25–28 used later, completed-job snapshots. Case 40 passed
all eight of those trials too. Inspection of the original first-turn tool log
identified that fidelity gap; the final eight trials use its historical
in-progress snapshots instead. The earlier passing trials are retained, not
counted as RED or silently discarded. Control cases and the case-35/36 reruns
have unchanged inputs across that correction. All runs were regraded from
saved transcripts; no baseline omission was observed in either snapshot set.

## Aligning the stage before work

Further iteration kept cases 35–40 and their stage-order grading unchanged.
The source reads are the requested independent investigation: the user has
already supplied review feedback or the requested choice. The later
publication/proposal decision does not block that investigation. Updating
In progress only after reading the source therefore fails the intended
contract. This is separate from a turn ending or a routine observation check.

The final skill retains inspection before every stage change, including explicit
changes while automatic updates are disabled. The automatic guidance makes stage alignment a prerequisite to investigation or
implementation, and places the explicit manual-stage exception before that
sequence in both the skill and injected reminder. Automatic updates disabled
still use the original explicit-request-only reminder. The qualified
uncertainty rule from the CI-proposal change remains intact.

### Iteration and fidelity checks

- Revision 1 said to change before doing the work, but Claude still wrote
  In progress late in run-40/case-36. It passed a repeat with the same wording;
  that variability is retained rather than selecting only the passing run.
- Revision 2 made the tool-call ordering explicit. Investigation ordering
  passed, but run-51/case-38 violated the user's manual-stage preference with
  two writes. This led to co-locating the exception before the automatic rule
  in revision 3, rather than weakening the manual-stage control.
- Run-48/case-39 respected disabled updates but failed on `bb thread show`
  without a target. The pinned real CLI requires an ID or `--self`; that
  failure is retained. The disabled-mode reminder was not changed.
- Run-54/case-36 had correct stage ordering but the fixture rejected the valid
  discovery command `bb thread --help`. The pinned CLI confirmed the gap.
  A read-only fixture help response and a regression test were added. The test
  first failed with `AssertionError: 2 != 0`, then passed. This is a harness
  correction, not evidence of a behavioral RED. Bare `bb thread` was also
  checked against the pinned CLI and kept invalid. An interim fixture accepted
  that unused form; no comparison worker issued it.

The final matched comparison (67–68 and 71–76) uses the same corrected fixture bytes,
case manifest, input files, grader, and native CLI configuration on both sides.
Earlier runs and their per-case fixture copies remain in the evidence archive.
No prior behavioral run or original model grade was overwritten.

### Results

| Runtime | Matched baseline cases 35–36 | Final cases 35–36 | Manual control 38, both versions |
| --- | --- | --- | --- |
| Codex | 0/4 pass | 4/4 pass | pass; zero writes |
| Claude | 0/4 pass | 4/4 pass | pass; zero writes |

The full fourteen-case selection passed **14/14 on each runtime** in runs
73–74. This covers established observation and computation, a report awaiting
direction, routine monitoring, disabled updates, independent work despite
pending review, genuine pending review, bounded completion, the two resumed
investigations, explicit manual staging, and the CI-proposal boundary.
The final comparison is two trials per case/runtime; the preceding repetitions
and rejected revisions are disclosed above rather than implying universal
reliability.

The baseline reads the source while still in Needs user. Codex changes to
In progress only afterward; Claude makes no stage writes. The revised runs
inspect, write In progress, read the source in that stage, and write Needs user
when only the user's decision remains. The manual-stage control makes zero
writes, including during source access.

Representative actual revised operations:

```text
bb thread-stages show --self --json       # BlockedOnUser
bb thread-stages stage Active --self
bb files read src/retry-worker.ts         # Active
bb files read src/receiver.ts             # Active
bb files read logs/retry-probes.json       # Active
bb files read drafts/exhaustion.md        # Active
bb files read drafts/duplicates.md        # Active
bb thread-stages stage BlockedOnUser --self
```

All required skill/file reads, final stage, write count, inspection ordering,
and valid-command checks must pass for a case to pass. A verbal recommendation
or a correct final Needs user value cannot compensate for late stage writes.
The plain outputs still explain four sends, thrown-error/5xx retries, no 408
retry, and post-commit duplicate rows. Their full prose is retained separately
from the stage verdicts; the oracle does not validate every delivery-guarantee
claim in the answers.

### Commands and provenance

With `R` as defined above, every launch used:

```sh
python3 "$R" --runtime <runtime> --cases <selection> [--ref 9e705000] --output .scratch/work/thread-stage-evals/run-<number> --timeout 240
```

The paired run numbers below are Codex / Claude respectively. `P` means
`35 36`, `T` means `35 36 38`, and `S` means
`17 19 22 24 26 27 28 31 35 36 37 38 39 40`.

| Runs | Selection | Source |
| --- | --- | --- |
| 37 / 38 | P | `--ref 9e705000` |
| 39 / 40 | P | revision 1 working tree |
| 41 / 42 | S | `--ref 9e705000` |
| 43 / 44 | S | revision 1 working tree |
| 45 / 46 | P | revision 2 working tree |
| 47 / 48 | S | revision 2 working tree |
| 49 / 50 | P | revision 2 working tree |
| 51 / 52 | S | revision 2 working tree |
| 53 / 54 | T | revision 3 working tree |
| 55 / 56 | S | revision 3 working tree |
| 57 / 58 | T | revision 3 working tree |
| 59 / 60 | P | `--ref 9e705000`, help correction |
| 61 / 62 | S | revision 3 working tree, help correction |
| 63 / 64 | P | `--ref 9e705000`, help correction |
| 65 / 66 | T | revision 3 working tree, help correction |
| 67 / 68 | T | `--ref 9e705000`, final fixture |
| 69 / 70 | T | revision 3 working tree, final fixture |
| 71 / 72 | `35 36 38 39` | final working tree, final fixture |
| 73 / 74 | S | final working tree, final fixture |
| 75 / 76 | P | `--ref 9e705000`, final fixture |

The final source SHA-256 values are:

- Skill: `b701665ac3cbeb52eb462e89105780ceee833bd2fa63e58c543b040a0cebf0dc`.
- Injected guidance: `462ed3df9374771dfc3ebd5f212844ec8867272f48fec62f4416eeee0d050c70`.
- Corrected fixture: `e359177ea4a381eb4095ea6e5ffc260f865edda271bdf2643f4aeb524fd34b85`.
- Unchanged oracle: `d6472d07ea9dded3a3304893636b99d7f142f31aa27a519c2a84a6566cd7df68`.

The suite hash remains `0a0372189527d62dc2ca80e0200f68b9e8d29e1a7dcd4e7716216235c8da0a02`;
all shared input-file hashes match. Each case records the exact target CLI
arguments, plain output, raw events, stage operations, source snapshots, and
canonical grading evidence. Runs 37–76, source snapshots for rejected revisions,
and a summary recording per-case fixture hashes are archived in this BB
thread's storage as `thread-stages-evidence/before-work-runs.zip` and
`before-work-summary.json`. Static output/grade viewers use the skill creator's
review generator. Saved transcripts were also regraded with `--grade`.

These are finite native-CLI observations with reconstructed BB context, not a
claim that production provider sessions or every future run will behave the
same. The CLI/model reporting limits in Method still apply. Case 40 already
passed before the qualification and continues as a control; no RED→GREEN
improvement is attributed to it.

## Full-suite validation with explicit models

The fourteen-case selection omitted twenty-six cases. The subsequent comparison covers
all **40 distinct cases: 16 recommendations and 24 automatic updates**, on both
CLIs and both guidance versions. This phase explicitly requests:

- Codex CLI 0.163.0: `gpt-6.1-sol`, reasoning effort `low`.
- Claude Code 2.1.302: `claude-opus-5-5[1m]`, effort `high`.

Claude reports the requested model. Codex JSONL still does not report a model ID;
its exact `--model` and `model_reasoning_effort` arguments are saved in each
`command.json`. The runner records requested and reported settings separately
and freezes the fixture once per invocation.

### Full-suite diagnostics and fixture repairs

The first full runs used the original suite and explicitly pinned configurations.
They used the same command shape as runs 85–88 below, with output names 77–80:
77–78 selected `--ref 7b6fbf0`; 79–80 read the working tree at `e67f4839`.

| Runs | Runtime | Original guidance `7b6fbf0` | PR snapshot `e67f4839` |
| --- | --- | --- | --- |
| 77 / 79 | Codex | 29/40 pass | 31/40 pass |
| 78 / 80 | Claude | 37/40 pass | 39/40 pass |

The PR snapshot passed all 24 automatic-update cases on both CLIs. The original
source failed the before-investigation ordering in cases 35–36 on both CLIs.
Codex also issued invalid `bb thread show` without a target in case 34; its
correct stage does not excuse that invalid call. These results and their original
grades are retained. The aggregate recommendation failures cannot all be treated
as guidance failures:

- Case 4 required an exact preference key while forbidding its discovery. The
  skill deliberately delegates key discovery to the installed CLI. Claude
  declined to invent the key; Codex sometimes guessed an invalid one. Case 4 now
  permits read-only help and preference discovery, while still forbidding
  settings, thread-state, and message writes.
- The generated JSON schema omitted the `reason` field that its grader required.
  It now includes that field's type, without supplying expected values.
- The preference fixture now returns the actual layout-key descriptions and
  JSON `get` shape from `preferenceCliCommands` in
  [server.ts](../../plugins/bb-plugin-thread-stages/src/server.ts) and
  [preferences.ts](../../plugins/bb-plugin-thread-stages/src/shared/preferences.ts).
  It no longer advertises the plugin setting `automaticStageUpdates` as a layout
  preference. Its regression test failed before the correction and passed after.

Runs 81–84 started with those corrections. A later Codex case chose the correct
stage but skipped reading the skill: its prompt forbade *all commands*, while
Codex reads files using a shell command. The grader prohibited BB execution but
allowed file reads, so the prompt and grading boundary did not match. These runs
were stopped rather than continuing that conflict:

| Run | Configuration | Completed cases | Passed completed cases |
| --- | --- | --- | --- |
| 81 | Codex, interim guidance | 16/40 | 13/16 |
| 82 | Claude, interim guidance | 22/40 | 22/22 |
| 83 | Codex, original guidance | 11/40 | 8/11 |
| 84 | Claude, original guidance | 17/40 | 16/17 |

Their completed results, partial transcripts, and interruption reasons remain
in the archive. They are not full-suite passes. The interim broader skill-read
reminder was removed after identifying the prompt conflict; the automatic-off
reminder remains unchanged from the original source. Recommendation prompts now
forbid **BB commands**, allowing skill-file reads on both runtimes. Case 3 still
rejects actual help calls through BB. The skill opening now makes CLI discovery
conditional on permission to execute it, preserving command-only proposals.

### Portable recommendation prompts

Runs 85–88 use the same corrected case manifest, input files, fixture, oracle,
CLI versions, and explicit model/effort configuration on each side. Only the skill
and injected instruction snapshots differ. With `R` as defined above:

```sh
python3 "$R" --runtime codex --model gpt-6.1-sol --effort low --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-85 --timeout 240
python3 "$R" --runtime claude --model 'claude-opus-5-5[1m]' --effort high --ref 7b6fbf0 --output .scratch/work/thread-stage-evals/run-86 --timeout 240
python3 "$R" --runtime codex --model gpt-6.1-sol --effort low --output .scratch/work/thread-stage-evals/run-87 --timeout 240
python3 "$R" --runtime claude --model 'claude-opus-5-5[1m]' --effort high --output .scratch/work/thread-stage-evals/run-88 --timeout 240
```

The corrected suite SHA-256 is
`875c36bf4fa12e59809a91f9a3462b3da20515c5876dca8e09c032226455e369`;
the fixture is
`523a9ba18834839c9393e848720aaf4ecfa9a90036c44b4772d7f1471ea30489`.
The skill is
`f359a5618e555a2ce810518c2d7e0bed53955c1e788726e9288ce02972d7bc19`;
the injection and oracle hashes remain those recorded in the before-work
comparison. All original and interrupted runs remain separate from this comparison.

Runs 85–88 finished with Codex **37/40 → 39/40** and Claude **37/40 → 40/40**.
Both revised investigations passed, and both original-guidance investigations
failed their stage ordering. Codex's remaining failure was case 29: it called
`bb thread show` without a target on both sides. The stage remained correctly
In progress; the oracle still rejected the invalid call. Claude's other original
failure was case 8: it invented a need for renewed deployment permission despite
the original request already including deployment.

### Root-help fidelity and final comparison

The fixture's root help advertised `thread show` without its target. The pinned
BB CLI's root quick-start instead shows `bb thread show <id>`; its selector
requires an ID or `--self` and rejects the bare command. This was verified from
its `--help` and the bundled thread-selector implementation, without contacting
production thread state. The fixture now preserves that usage in its root help,
and its regression test failed before the correction and passed after. Bare
`bb thread show` remains invalid. This corrects a misleading discovery response;
it does not turn the prior invalid calls into passes or change stage policy.

Runs 89–92 repeat all forty cases with that final frozen fixture. Their command
lines are the four commands above with output numbers 89, 90, 91, and 92,
respectively. Models, efforts, original source ref, revised source, input files,
suite, and oracle are unchanged. The final fixture SHA-256 is
`3d53bb0bd33eef74e459af53253a30a5e42c26f6e705e9e758354ec95d10387e`.
Earlier complete and interrupted outputs remain in the evidence.

| Runtime | Original guidance, full suite | Revised guidance, full suite |
| --- | --- | --- |
| Codex | 40/40 | 40/40 |
| Claude | 38/40 | 40/40 |

The final full suite therefore shows no measured Codex improvement. Its earlier
ordering failures in runs 77 and 85 were real: successful sessions made the
source reads in Needs user before writing In progress. Runs 79 and 87 passed the
same investigation contracts with matching fixtures. Those observations remain
valid but do not establish a consistent effect across the later fixture change.

After seeing the Codex baseline pass, two additional trials per investigation
case and configuration were selected in advance. They used the exact command
shape above with `--cases 35 36`, the same model/effort settings, and the following
source and output selections:

| Runs | Runtime | Source |
| --- | --- | --- |
| 93, 97 | Codex | `--ref 7b6fbf0` |
| 94, 98 | Claude | `--ref 7b6fbf0` |
| 95, 99 | Codex | working tree |
| 96, 100 | Claude | working tree |

Including the full-suite trial gives three trials per case/configuration:

| Runtime | Original cases 35–36 | Revised cases 35–36 |
| --- | --- | --- |
| Codex | 6/6 pass | 6/6 pass |
| Claude | 0/6 pass | 6/6 pass |

Codex makes `show → stage Active → read(5) → stage BlockedOnUser` in the final
baseline and revised trials. Claude's baseline reads all five source files in
`BlockedOnUser` and makes no stage writes; revised Claude inspects, writes
`Active`, reads all five files in `Active`, and returns to `BlockedOnUser` for
the remaining user decision. All revised manual/disabled-update and no-churn
controls pass in the full suite. Case 40 passes both versions, preserving the
non-reproduction limit of the original CI-proposal comparison.

The final full runs and repetitions used matching suite, fixture, common input,
and runtime-configuration hashes across both sides, with one consistent guidance
snapshot per configuration. Per-case copies were checked
against the recorded fixture, skill, and input hashes. Saved transcripts were
regraded without new agents; their results matched. All source reads, stage
operations/order, outputs, exact CLI arguments, verdicts, and interrupted-run
reasons from runs 77–100 are retained in this BB thread's private storage as
`thread-stages-evidence/full-suite-runs.zip` and `full-suite-summary.json`.
The skill creator's static viewers show plain answers and their grades for the
full comparison and the three-trial investigation comparison on each runtime.
These finite reconstructed native-CLI sessions do not establish production
provider-session reliability.

## Software verification

- `npm run check:evals --workspace=bb-plugin-thread-stages`: 27 grader/fixture/runner tests passed.
- `npm test`: 127 repository tests passed.
- `npm run check:layout`, `check:ui`, `check:heading-icons`, `check:fork`: passed.
- Codex `quick_validate.py` with PyYAML: passed.
- The Thread stages `release:check` passed with the repository-pinned BB CLI:
  887 plugin tests, typecheck, SDK declarations, build, stylesheet verification,
  production-only build, and packed artifact verification.

On the predecessor commit, the [first features E2E attempt](https://github.com/ariofrio/ribbon/actions/runs/38996978000/job/117291602738)
timed out waiting for a context-menu autosave response. Its
[unchanged-commit rerun passed](https://github.com/ariofrio/ribbon/actions/runs/38996978000/job/117293051419).
This did not diagnose or fix the underlying cause.

An earlier local release attempt timed out in
`ProjectList.sectionCreate.test.tsx` after 886/887 tests passed. The full retry
passed all 887 tests and the remaining release checks without a UI-code change.
Its successful log is `thread-stages-release-check-before-work-final.log`;
the timeout remains in `thread-stages-release-check-before-work-v3.log`.

For the release check, from `plugins/bb-plugin-thread-stages`:

```sh
BB_CLI="$PWD/node_modules/bb-app/host-daemon/dist/bb" npm run release:check
```

The installed host CLI initially failed `verify:types` because its SDK is
0.6.50 while the repository pins 0.6.37. Using the repository's bb-app 0.46.0
CLI matches CI and passed without changing either pin or production settings.
The final release check, after the root-help correction, passed all 887 tests
and the remaining checks in `thread-stages-release-check-full-suite-final-fixture.log`.
No local screenshot recapture, install, merge, or deployment was performed.

Written by Codex
