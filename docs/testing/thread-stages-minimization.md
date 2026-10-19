# Thread stages: instruction minimization

This compares the long guidance at `ceef7f14139221a10e235cc2fe24d23caabccea8`
([source](https://github.com/ariofrio/ribbon/blob/ceef7f14139221a10e235cc2fe24d23caabccea8/plugins/bb-plugin-thread-stages/skills/thread-stages/SKILL.md))
with the subsequent compact guidance in [PR #211](https://github.com/ariofrio/ribbon/pull/211).
It supplements the [original behavioral comparison](thread-stages-native-conversations.md);
it does not replace that comparison or claim a new reproduction of its original incident.

## Size and retained behavior

Whitespace-separated words, including frontmatter, headings and tables:

| Surface | Long | Compact | Reduction |
| --- | ---: | ---: | ---: |
| Thread stages skill | 2,087 | 494 | 76% |
| Automatic reminder | 142 | 39 | 73% |
| Explicit-only reminder | 21 | 9 | 57% |

The skill combines repeated guidance into a stage table, one reassessment/inspection
sequence, one completion boundary, and placement/layout instructions. The reminder
supplies the execution-time inspection cue. Preference and saved-action key catalogs
are discoverable in existing CLI help; no prose was moved to a new reference file.
Automatic-update settings, side-chat exclusion, manual preferences, owner distinctions,
no-churn controls and the workflow stage implementation remain unchanged.

Eleven candidates were exercised. The smallest attempted skill was 462 words;
it lost behavior. The retained 494-word version is the smallest tested version
that satisfied the final comparison, not a demonstrated mathematical minimum.

## Iteration evidence

Each candidate has an immutable source snapshot (`candidate-N.json`). Failures below
are actual CLI behavior, not string tests or fabricated baseline failures. Interrupted
candidates have partial observations, not full-suite acceptance rates.

| Candidate | Skill / automatic reminder words | Observed reason to revise |
| --- | --- | --- |
| 1 | 710 / 28 | Claude completed CI proposals awaiting direction; misclassified managed computation and an unaccepted handoff; queried plugin settings as layout preferences. |
| 2 | 552 / 28 | Claude wrote an explicitly requested stage before inspecting; still completed CI proposals; diagnostic 33 treated an unaccepted handoff as delegated. |
| 3 | 462 / 21 | Claude omitted fresh inspection, read new input under Completed, and completed proposals; optional coordinated observation was also marked complete. |
| 4 | 465 / 21 | Claude investigated during pending review under Needs user and completed the CI proposal; optional observation still failed. |
| 5 | 481 / 29 | Both CLIs sometimes read delivered inputs before changing the stale stage; Codex also ran BB inspection in a no-BB-command discussion. |
| 6 | 486 / 33 | Work timing improved; Claude guessed invalid substantive stage commands before recovering. |
| 7 | 486 / 33 | Starting with help in the skill did not prevent pre-skill command guessing. |
| 8 | 486 / 35 | Command discovery improved; Codex completed the CI proposal despite the broader pending decision. |
| 9 | 493 / 35 | Bounded-report/proposal/retained-scope checks pass 4/4 on each CLI (runs 207/208). Full coverage runs against the next candidate. |
| 10 | 492 / 35 | Claude diagnostic 28 toggled Active just to read workflow context, then returned to Needs user. |
| 11 | 494 / 39 | Exempts stage assessment while retaining task-input/source work timing; final comparison below. |

For example, candidate 1 Claude run 164 ends cases 55/58 in Completed instead of
Needs user. Candidate 5 Claude run 188 reads `exports/invoices.csv` under Dependent,
then writes Active for calculation. Candidate 7 Claude run 200 attempts
`bb thread stage get`, then recovers to the correct inspection command. These are
separate completion, work-order and CLI-discovery failures. Successful stage choices
alone do not excuse failed deliverables or invalid substantive commands.

## Final comparison

| Runtime / requested model and effort | Long native | Compact native | Long diagnostics | Compact diagnostics |
| --- | ---: | ---: | ---: | ---: |
| Codex 0.163.0 / `gpt-6.1-sol`, low | 18/18 | 18/18 | 39/40 | 40/40 |
| Claude Code 2.1.302 / `claude-opus-5-5[1m]`, high | 18/18 | 18/18 | 39/40 | 40/40 |

These are explicitly selected matched comparisons, not uninterrupted sweeps. Raw
compact Codex runs 213/215 are 17/18 and 38/40: capacity failures are retried in
217/218, and diagnostic 34 is replaced by its clarified matched task on both
sides. Raw compact Claude 214/216 passes 18/18 and 40/40; the same revised
34 still replaces that case. Long diagnostic Codex 36 leaves Active after
review work; long Claude 34 selects Active correctly but guesses unsupported
`bb files list`. That CLI error is not evidence of a stage-decision improvement.

Both sides use the same natural tasks, raw inputs, local backend, CLI versions,
requested models and effort. Native scenarios perform 32 turns with fourteen actual
session resumptions; all eighteen require useful task outputs. The forty diagnostics
remain separate recommendation/curated-summary/owner-boundary probes. Neither group
contacts production BB. Codex JSONL does not disclose the accepted model ID; Claude
reports canonical `claude-opus-5-5`.

The long guidance passes all native tasks in this sample. This supports retaining
coverage while reducing instructions, not a claim of improved reliability. Candidate
selection used these cases, so these are development regressions, not a held-out test
or a production success-rate estimate. Model variability remains.

## Integration with current main

The matched comparison above was completed at `49a6486ec845d70d1fcc8d45e4b768428021e3f9`.
Integrating upstream `0d396aca` preserves both evaluated instruction files byte for
byte. The only conflict was the skill; its compact stage table already uses
upstream's Active-first ordering. Upstream's UI changes and workflow-stage array
order are retained, with unchanged stage IDs.

Post-integration smoke selections are native cases `41 45 49 51 55 56 58` on both
CLIs (runs 223/224), plus diagnostics `13 16 17 28 32 34` on both (225/226).
They use the same runner commands below, adding `--cases` with those IDs and
omitting `--ref`. Their results and exact source hashes accompany the private
post-integration evidence and [PR validation status](https://github.com/ariofrio/ribbon/pull/211).
They are targeted checks, not another full 58-case comparison after integration.

## Reproduction and evidence

From repository root, the four native-suite commands were:

```sh
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --ref ceef7f14 --timeout 240 --output .scratch/work/stage-sessions/run-185
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --ref ceef7f14 --timeout 240 --output .scratch/work/stage-sessions/run-187
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --timeout 240 --output .scratch/work/stage-sessions/run-213
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --timeout 240 --output .scratch/work/stage-sessions/run-214
```

The diagnostic commands substitute `run.py`, use runs 189/191 for long and
215/216 for compact guidance, and keep the same flags. Revised diagnostic 34 uses matched long runs 219/220
and compact runs 221/222. Native Codex 41 and diagnostic 1 retry capacity errors
in runs 217/218. Earlier candidate 8 had
Codex capacity errors on diagnostic 7 and native case 49; isolated retries
205/206 passed, but that candidate still had genuine behavioral failures.
Original attempts remain
retained. Source, input, fixture, suite and runner hashes, exact CLI argument arrays,
model/effort, raw JSONL, plain outputs, stage operations, per-turn artifacts and
canonical grading accompany the runs. Comparison assembly verifies matching tasks,
inputs, source snapshots and configuration. Regrading writes separate comparison
results; original results are preserved.

`A` = In progress, `U` = Needs user, `D` = Dependent, `C` = Completed.
Every write below comes from the actual target CLI, not the runner.

| Runtime | Case / run | Recorded operations in order |
| --- | --- | --- |
| Codex | 41 / 217 | `show A, read notes/delivery.md@A, show A, show A, write U / resume: show U, write A, read src/retry-worker.ts@A, read src/receiver.ts@A, read logs/retry-probes.json@A, show A, show A, write U` |
| Codex | 43 / 213 | `show A, show A, write D / resume: show D, write A, read exports/invoices.csv@A, show A, read exports/invoices.csv@A, show A, write U` |
| Codex | 45 / 213 | `show A, show A, read notes/delivery.md@A, show A, show A, write U / resume: ` |
| Codex | 47 / 213 | `show A, read jobs/conversion.json@A / resume: show A, read jobs/conversion.json@A` |
| Codex | 49 / 213 | `show A, show A, read exports/invoices.csv@A, show A, read exports/invoices.csv@A, show A, write C` |
| Codex | 55 / 213 | `show A, write U / resume: show U, write A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, show A, write U` |
| Codex | 56 / 213 | `show A, read jobs/export.json@A, show A, write D, show D, read jobs/export.json@D / resume: show D, read jobs/export.json@D, write A, read exports/invoices.csv@A, show A, read exports/invoices.csv@A, show A, write U` |
| Codex | 58 / 213 | `show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, show A, write U` |
| Claude | 41 / 214 | `show A, read notes/delivery.md@A, show A, write U / resume: show U, write A, read src/retry-worker.ts@A, read src/receiver.ts@A, read logs/retry-probes.json@A, show A, write U` |
| Claude | 43 / 214 | `show A, show A, write D, show D / resume: show D, write A, read exports/invoices.csv@A, read exports/invoices.csv@A, show A, write U` |
| Claude | 45 / 214 | `show A, read notes/delivery.md@A, show A, write U / resume: show U` |
| Claude | 47 / 214 | `show A, read jobs/conversion.json@A / resume: show A, read jobs/conversion.json@A` |
| Claude | 49 / 214 | `show A, read exports/invoices.csv@A, read exports/invoices.csv@A, show A, write C` |
| Claude | 55 / 214 | `show A, show A, write U / resume: show U, write A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U` |
| Claude | 56 / 214 | `show A, read jobs/export.json@A, show A, write D, show D / resume: show D, read jobs/export.json@D, write A, show A, read exports/invoices.csv@A, read exports/invoices.csv@A, show A, write U` |
| Claude | 58 / 214 | `show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U` |

Claude's actual `findings.json` in native 41 is
`{"maxAttempts":4,"retries408":false,"deduplicates":false,"committedRows503":4}`.
Native 43 saves `{"acme":2000,"beta":550}` cents. Case 55/58 CI facts preserve
the incomplete parent workflow, incomplete new capture, four executing E2E groups,
and PR-wide relevance scope; a completed six-plugin subset is not called a finished
parent workflow. Canonical grading checks those saved facts as well as the stage
trace. Full operations and outputs for all cases accompany the comparison.

Full traces, all candidate snapshots, rejected/partial runs, logs and static review
viewers are retained privately under this BB thread's `thread-stages-evidence`
directory. They contain model traces and are not committed into the skill package.
The implementing Codex reviewed plain answers and artifacts against inputs; this
review was neither independent nor blind.

## Grading and infrastructure limits

Diagnostic 34 originally prohibited new operational changes while expecting Active
because cleanup arrangements were still this thread's responsibility. That mixed
an outstanding objective with permission to advance it. Its synthetic history now
explicitly records cleanup authorization, and the prompt only forbids repeating
completed experiments. Expected ownership/stage is unchanged. Both long and compact
guidances run the same revised task on both CLIs. Original attempts are retained;
those ambiguous failures do not establish a behavioral regression.

Two oracle repairs accept equivalent correct output: recognized stage suffixes on
scope names and unique file lists for counts. Read-only failed help discovery may
recover, consistently with the native harness; invalid substantive commands and
forbidden execution still fail. Both sides are replayed through the same current
oracle. Stage-assessment churn in candidate 10 remains a behavioral failure;
the oracle was not changed to accept those writes. Regression tests demonstrate RED/GREEN for these repairs.

An early CI fact key, `parent_plugins_complete`, allowed a valid interpretation as
the six completed per-plugin jobs. The final tasks explicitly ask whether the entire
parent workflow, including E2E/aggregate, is complete. Both sides receive that same
clarification; early failures on that ambiguous field are not stage-behavior RED.

Early runs 159–180 experienced MacBook sleep/timeouts. An isolated Mac mini attempt
(runs 181–184) hit invalidated Codex login and incomplete Claude execution. These
infrastructure failures do not establish instruction failures. Automatic approval
review rejected copying a remote host credential before execution; no credential was
read or transferred. The successful local comparison instead uses the pool route
already injected into this thread's process. The token stays in the environment,
is excluded from worker shells, and is absent from saved command arguments. No
account/profile/routing settings were changed. Owned remote terminals were closed.

The harness snapshots common runner code and records process-local pool use. Its
regrade path uses saved execution metadata without requiring current credentials.
Software tests check provider routing, side-chat exclusion and setting toggles;
actual agent behavior supplies the instruction validation.

## Verification

- 48 harness regression tests pass on Python 3.14 and 3.9; Codex skill validation passes.
- All 887 plugin tests pass with `npm test -- --maxWorkers=2`. An earlier default
  full release check passes all 887; a later default run hits one unchanged
  five-second section-creation timeout (886/887). Its isolated five-test file and
  the bounded-worker full run pass without changing assertions or timeouts.
- Typecheck, SDK types, build, styles and production package checks pass on the
  compact source. All 127 repository tests and layout/UI/icon/fork checks pass.
- Final source hashes: skill `316d3ec51eb1ef0dc46a6b6f4f55a13178e77caf764ca200a6802ca2213c324d`;
  reminder source `4c2bcd386fa7c6170b97f9311664eb76355ddbc6ca58ae5c8d4a8526d8bfdf9d`.

No production plugin installation/reload, PR merge or deployment is performed.
