# Thread stages: native conversation evaluation

The acceptance comparison covers **18 tasks / 32 turns**, including fourteen
native session resumptions. Updated guidance passes all eighteen on both CLIs.
The original guidance passes 14/18 on Codex and 10/18 on Claude. These finite
observations reproduce stale-stage work; they do not establish production reliability.
The separate **40 diagnostics** pass 40/40 with updated guidance on each CLI.
They are not forty autonomous tasks.

## Method and coverage

The [runner](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py)
starts actual `codex exec` or `claude --print` processes, then resumes the same
native session. Earlier answers and tool results are the agent's own history.
Workers receive natural requests, raw artifacts, the source-extracted plugin
reminder, and the skill catalog. No `work.json`, expected stage, grading rule,
comparison label, or announcement of evaluation is supplied. Four tasks have one
turn; fourteen use two turns.

The [manifest](../../plugins/bb-plugin-thread-stages/skills/thread-stages/evals/evals.json)
covers implicit review feedback; supplied choices; other-thread and external
deliveries; readiness discovered by a tool result; genuinely missing inputs;
useful work during pending review; a substantive side discussion; established
computation and observation; bounded completion; reopening Completed; manual/off
preferences; an explicit stage request with automatic updates off; and retained
responsibility after a narrower follow-up. Cases 45, 47, 48, 51, 52 and 54 are
controls against inappropriate changes. Recommendation and Thread-action owner
boundaries remain in the original diagnostic suite.

The backend serves thread inspection, stage writes and project files locally.
It never contacts production BB. Each project has an empty Git root and no remote;
state, grading and traces live outside it. Work-tool networking is disabled:
Codex uses its workspace sandbox, and Claude uses [per-session strict sandbox settings](https://code.claude.com/docs/en/sandboxing).
A native Claude preflight wrote a local file and read BB state, while normal curl
received proxy 403 and direct curl failed DNS resolution. Model connections run
outside that tool sandbox. No installed plugin, global settings, production state,
or originating thread's BB Voice issue drafts changed.

The oracle checks actual stage writes/order, fresh inspection before writes,
stage at evidence reads, native session identity, and saved deliverables. Retry
behavior, invoice totals, cost and CI snapshot facts are checked as data. A correct
stage trace with missing or wrong work fails. Implementing Codex also reviewed
answers against inputs; that prose review was neither independent nor blind.

## Results

| Runtime | Requested model / effort | Original | Updated |
| --- | --- | --- | --- |
| Codex CLI 0.163.0 | `gpt-6.1-sol` / low | 14/18 | 18/18 |
| Claude Code 2.1.302 | `claude-opus-5-5[1m]` / high | 10/18 | 18/18 |

Claude messages report canonical `claude-opus-5-5`. Codex JSONL does not report
an accepted model ID. Both sides use the same model, effort, task, inputs, local
backend and sandbox configuration. Original instruction source is
`7b6fbf0bcb732ea6832877faf0563502e2930490`; updated source hashes are recorded below.

| Case | Scenario | Codex original → updated | Claude original → updated |
| --- | --- | --- | --- |
| 41 | implicit review comments resume investigation | fail → pass | fail → pass |
| 42 | supplied choice resumes calculation | pass → pass | fail → pass |
| 43 | other thread result unblocks integration | fail → pass | fail → pass |
| 44 | external result unblocks integration | fail → pass | fail → pass |
| 45 | substantive side discussion does not churn | pass → pass | pass → pass |
| 46 | independent work while review remains | fail → pass | fail → pass |
| 47 | coordinated computation remains active | pass → pass | pass → pass |
| 48 | established observation remains active | pass → pass | pass → pass |
| 49 | finished bounded reporting | pass → pass | pass → pass |
| 50 | explicit stage request when automatic off | pass → pass | pass → pass |
| 51 | manual stage preference persists on resume | pass → pass | pass → pass |
| 52 | automatic off across resumed work | pass → pass | pass → pass |
| 53 | completed thread reopens for actual followup | pass → pass | fail → pass |
| 54 | genuine missing user input stays waiting | pass → pass | pass → pass |
| 55 | ci report then proposal awaits direction | pass → pass | fail → pass |
| 56 | tool result resolves other thread wait | pass → pass | pass → pass |
| 57 | narrower followup preserves outstanding work | pass → pass | fail → pass |
| 58 | active ci investigation returns to user decision | pass → pass | pass → pass |

Codex failures 41, 43, 44 and 46 perform source work under the prior waiting
stage. Claude failures 41, 46, 53 and 55 also do source work under a stale stage;
42, 43, 44 and 57 omit fresh inspection before writes. Missing inspection is
reported separately from a wrong final stage. In case 57 the original guidance
already preserves the report-index requirement; its output is not evidence of
an objective-retention improvement.

The independent diagnostic comparison is original runs 131/132 and updated
149/150: Codex 40/40 → 40/40, Claude 38/40 → 40/40. Claude's original failures
35/36 are stage ordering. Earlier updated case 8 invented a new approval wait
for previously authorized work. The final skill clarifies that a narrower
follow-up does not itself cancel authorization; the final diagnostics pass.

## Operation and output evidence

`A` = In progress, `U` = Needs user, `D` = Dependent, `B` = external blocker,
`C` = Completed, `F` = Deferred. The runner seeds only the initial stage; every
later write below is performed by the target agent. Read stages come from the
backend's ordered call log. Repeated reads and inspections are retained.

### Case 41, codex

Original: `run 133: show A, read notes/delivery.md@A, write U / resume: show U, read src/retry-worker.ts@U, read src/receiver.ts@U, read logs/retry-probes.json@U, write A, write U`

Updated: `run 147: show A, read notes/delivery.md@A, show A, write U / resume: show U, write A, read src/retry-worker.ts@A, read src/receiver.ts@A, read logs/retry-probes.json@A, show A, write U`

### Case 41, claude

Original: `run 135: read notes/delivery.md@A, show A, write U / resume: read src/retry-worker.ts@U, read src/receiver.ts@U, read logs/retry-probes.json@U`

Updated: `run 148: show A, read notes/delivery.md@A, show A, write U / resume: show U, write A, read src/retry-worker.ts@A, read src/receiver.ts@A, read logs/retry-probes.json@A, show A, write U`

### Case 55, codex

Original: `run 151: show A, write U / resume: show U, write A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, write U`

Updated: `run 152: show A, write U / resume: show U, write A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U`

### Case 55, claude

Original: `run 153: show A, write U / resume: read ci/recapture-commit.json@U, read ci/screenshots-run.json@U, read ci/plugins-run.json@U, read ci/parent-validation.json@U, read scripts/changes.mjs@U, show U`

Updated: `run 154: show A, write U / resume: show U, write A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U`

### Case 56, codex

Original: `run 133: show A, read jobs/export.json@A, write D / resume: read jobs/export.json@D, show D, write A, read exports/invoices.csv@A, read exports/invoices.csv@A, write U`

Updated: `run 147: show A, read jobs/export.json@A, show A, write D, read jobs/export.json@D / resume: read jobs/export.json@D, show D, write A, read exports/invoices.csv@A, read exports/invoices.csv@A, show A, write U`

### Case 56, claude

Original: `run 135: read jobs/export.json@A, show A, write D / resume: read jobs/export.json@D, show D, write A, read exports/invoices.csv@A, read exports/invoices.csv@A, write U`

Updated: `run 148: show A, read jobs/export.json@A, show A, write D / resume: read jobs/export.json@D, show D, write A, read exports/invoices.csv@A, read exports/invoices.csv@A, show A, write U`

### Case 58, codex

Original: `run 155: show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, write U`

Updated: `run 156: show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U`

### Case 58, claude

Original: `run 157: show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, write U`

Updated: `run 158: show A, read ci/recapture-commit.json@A, read ci/screenshots-run.json@A, read ci/plugins-run.json@A, read ci/parent-validation.json@A, read scripts/changes.mjs@A, show A, write U`

Case 41's saved `findings.json` on both updated CLIs records four maximum
attempts, no 408 retry, no receiver deduplication, and four committed rows for
the 503 probe; both save corrected issue paragraphs. This is actual investigation
after implicit review comments, without a later user stage correction as a hint.
Case 56 performs its first readiness lookup in Dependent, then changes to Active
before integrating the delivered CSV. Its saved paid totals are acme 2000 and
beta 550 cents, excluding void invoices.

On the resumed turn, both updated CLIs retain U with zero writes for the
substantive backoff side answer (45) and genuinely missing inputs (54). They retain A with zero writes
for both conversion/status and recovery-watch turns (47/48), F for manual
placement while doing accounting work (51), and U with automatic updates off
while calculating cost (52). Case 50 allows the explicitly requested Completed
write with automatic updates off. Case 46 uses A during accounting work despite
pending draft review, then U when only that review remains. Case 49 saves the
bounded report and completes. These are different next-action boundaries, not
one stage choice applied to every task.

### CI case and non-reproduction

Case 55 establishes a pending commissioning decision in an earlier native turn,
then presents the original recapture question with recorded evidence. The thread
does not own the other PR's checks or monitoring. Inputs come from the
[PNG-only commit](https://github.com/ariofrio/ribbon/commit/230212acf5fba96c096cf92ae77059dfa27055ad),
[new screenshot run](https://github.com/ariofrio/ribbon/actions/runs/38988301794),
[new plugin run](https://github.com/ariofrio/ribbon/actions/runs/38988301786),
[PR-wide relevance code](https://github.com/ariofrio/ribbon/blob/119d80b/scripts/changes.mjs#L79),
and parent [plugin](https://github.com/ariofrio/ribbon/actions/runs/38987951125)
and [screenshot](https://github.com/ariofrio/ribbon/actions/runs/38987951127) jobs.
Parent status is reconstructed from job timestamps as of the same recorded cutoff;
later conclusions are omitted and that reconstruction is labeled in the input.

Both updated agents save `ci-note.md` and facts: 16 PNGs, parent plugins incomplete,
new capture incomplete, four new E2E groups running, relevance across the PR.
Their notes distinguish potentially redundant work from unfinished validation;
reuse must account for pending parent checks. Claude's note still contains
judgment about capture convergence and cost; the automated facts do not validate
every prose claim.

Original Codex passes this case; original Claude leaves U throughout investigation
and fails the work-stage barrier. Both originals already finish U. This does
**not** reproduce or prove a fix for the source incident's Active-to-Needs-user
post-report omission. A prior wording did reproduce an omitted first-turn U write
(run 139); the final reminder covers alignment before waiting for required input.

Case 58 adds the direct Active-start variant: the original CI question and raw
artifacts are supplied in a single turn with the pending commissioning decision.
It checks inspection of Active, investigation under Active, and an actual Needs
user write after reporting. Both original and updated guidances pass on both
CLIs; it is coverage of the reported boundary, not behavioral RED.

## Provenance, repairs and variability

Acceptance is a declared composite, not a best-of sample: original Codex uses
run 133 except case 57 from 137, case 55 from 151 and case 58 from 155; original Claude uses 135
except 57 from 138, 55 from 153 and 58 from 157. Updated Codex uses 147 except 55 from 152 and 58 from 156;
updated Claude uses 148 except 55 from 154 and 58 from 158. All sixteen unchanged tasks retain
their full-cohort outcomes. The repaired CI task and added Active-start variant use matched runs on both sides
and both CLIs. Assembly asserts matching worker tasks/inputs and source hashes.
Each task has one selected observation per configuration; there is no variance
estimate or claim of consistently reproducible improvement.

| Runs | Disposition |
| --- | --- |
| 101–102 | Backend directory was not writable in Codex's sandbox; infrastructure, not RED. |
| 103–110 | Incomplete referenced-thread inspection/generated-file support; pilots or interrupted runs, excluded. |
| 111–116 | Exposed stale inspection and premature Active before readiness lookup, plus oracle defects; superseded wording. |
| 117–128 | Task/oracle repairs; unrestricted Claude fetched live GitHub state in a CI case. Excluded from frozen-world acceptance. |
| 129–132 | Separate original/updated diagnostics; updated Claude still failed authorization case 8. |
| 133–138 | Strict sandbox comparison and added scope control; original selected observations retained as specified above. |
| 139–142 | Native scope wording iteration: Codex omitted first U write in CI task; a diagnostic Codex timeout before skill read is infrastructure. |
| 143–146 | Added before-waiting cue; valid read-only discovery/command chaining needed oracle repair; Claude authorization diagnostic still failed. |
| 147–150 | Final instruction source: native cohort and all forty diagnostics. CI task 55 subsequently replaced on all configurations for missing parent evidence. |
| 151–154 | Final CI task with parent cutoff data. Run 151's raw failure was a valid four-item list versus numeric count; separate repaired grading passes it. |
| 155–158 | Added the direct Active-start CI boundary on both guidances and CLIs; baseline passes are retained as non-reproduction. |

Oracle repairs preserve all visible questions, valid output directories and amount
representations, ordinary negative status answers, recovered read-only discovery,
and complete skill reads before unrelated shell failures. They do not excuse
wrong stages, substantive invalid operations, or incorrect domain data. Run 151's
count repair has a unit RED/GREEN regression rejecting wrong and duplicate counts.
Original result files are preserved; regrading writes separate outputs.

The earlier polling task could leave a CLI turn open; it was replaced by a quick
status request within an established watch. Initial review feedback falsely
asserted an error that the agent might not have made; the final feedback uses
natural questions. An earlier CI prompt omitted a pending decision; its native
prior turn now establishes that context. Those withdrawn tasks are not behavioral
RED. Manual review of run 148 found an unsupported prior-validation claim;
parent-run data was added and both guidances rerun, rather than accepting its
stage-only pass. A fixture help-string compatibility repair preserved its AST
and made it parse on Python 3.9.

## Reproduce and audit

From the repository root (the complete CLI settings, prompt, and resume ID are
also saved verbatim in every `control/turn-N/command.json`):

```sh
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --ref 7b6fbf0 --output .scratch/work/stage-sessions/run-01
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --output .scratch/work/stage-sessions/run-02
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --ref 7b6fbf0 --output .scratch/work/stage-sessions/run-03
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --output .scratch/work/stage-sessions/run-04
```

The final targeted invocations actually executed were:

```sh
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --ref 7b6fbf0 --cases 55 --output .scratch/work/stage-sessions/run-151
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --cases 55 --output .scratch/work/stage-sessions/run-152
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --ref 7b6fbf0 --cases 55 --output .scratch/work/stage-sessions/run-153
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --cases 55 --output .scratch/work/stage-sessions/run-154
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --ref 7b6fbf0 --cases 58 --output .scratch/work/stage-sessions/run-155
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --cases 58 --output .scratch/work/stage-sessions/run-156
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --ref 7b6fbf0 --cases 58 --output .scratch/work/stage-sessions/run-157
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --cases 58 --output .scratch/work/stage-sessions/run-158
```

Updated source SHA-256:

```text
ae89b350817f55392c6151f14be53d6d014736faaa2c737e181c21226b34b6a3  skills/thread-stages/SKILL.md
467c19b1ac001f8efc93cf60fa6eae200ff35f3cee8a0f1603fca42265dc2a4f  src/ribbon/agent-instructions.ts
```

Runs retain raw JSONL, plain responses, ordered calls, state, deliverable snapshots,
native session IDs, exact commands, exit codes, source/fixture/input/suite hashes,
CLI/model settings and per-run copies of the cases, runner and oracle. Original
results and replayed grades are separate. The official skill creator viewer is
generated from plain outputs and canonical `grading.json` for both configurations.
Private evidence under this thread's storage is indexed by `native-summary.json`,
with `native-conversations.zip`, `native-diagnostics.zip`, and the two static HTML
viewers under `thread-stages-evidence/`. Full traces are private; no raw traces
or generated screenshots are committed.

## Verification and limits

- 44 evaluation-harness tests on Python 3.14 and Python 3.9.
- 887 plugin tests; typecheck, build, production-only build and packed artifact verification via the pinned CLI's complete `release:check`.
- 127 repository tests; layout, vendored UI, heading icons and fork checks.
- Codex skill quick validation and `git diff --check`.

An earlier full release-check attempt timed out in an unchanged section-create UI
test (886/887). Its unchanged rerun passed 887/887; final verification also passed.
No local screenshot capture, merge or deployment was performed.

The backend reconstructs BB's instruction/state surface. It does not validate
production provider-session injection, real collector delivery, third-party
services, or arbitrary long histories. Claude work tools are Bash and Read.
Tasks use a few small artifact families, and minimal prose assertions cannot
prove all reasoning correct. Software/integration tests cover separate plugin
boundaries. The [historical diagnostic report](thread-stages-reassessment.md)
preserves earlier variability and non-reproductions.

Written by Codex
