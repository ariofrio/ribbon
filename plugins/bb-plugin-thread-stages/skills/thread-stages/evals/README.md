# Thread stages evaluations

[evals.json](evals.json) is the source of cases, workflow evidence, and expected
results. [run.py](run.py) launches a fresh Claude Code process for every selected
case, and [oracle.py](oracle.py) grades its answer and recorded behavior.

## Run

Requirements: Python 3, a POSIX host, and an authenticated Claude Code CLI with
`--safe-mode` support (tested with 2.1.293). The runner uses its configured default
model and records the actual model and CLI version. Model runs consume the
account's normal quota; CI does not launch them.

From the repository root:

```sh
# Validate the cases and exercise the grader and CLI fixture without a model.
npm run check:evals --workspace=bb-plugin-thread-stages

# Execute all 31 cases, or just the fifteen automatic-update cases.
npm run evals --workspace=bb-plugin-thread-stages
npm run evals --workspace=bb-plugin-thread-stages -- --mode automatic

# Select cases, or inspect prepared inputs without launching an agent.
npm run evals --workspace=bb-plugin-thread-stages -- --cases 2 5 17
npm run evals --workspace=bb-plugin-thread-stages -- --prepare

# Regrade saved transcripts without launching agents or overwriting the originals.
npm run evals --workspace=bb-plugin-thread-stages -- --grade <run-directory>

# Compare the observation case with a previous skill/instruction/stage revision.
npm run evals --workspace=bb-plugin-thread-stages -- --cases 17 --ref main
```

Every invocation creates new workspaces under `.scratch/work/thread-stage-evals/`.
There is no result cache. `--output <new-directory>` chooses another destination;
an existing directory is refused. `--timeout` limits each process (180 seconds
by default) and stops its process group when it expires. Any failed case makes
the command exit nonzero. Prepared inputs are explicitly marked unevaluated.

`--grade` writes separate `grade.json` and `graded-results.json` artifacts.
It requires the same case definitions and rejects prepared-only inputs.

`--ref` selects skill files, automatic instructions, and available stages from
the specified Git commit. The case definitions and expected results remain
those of the current suite, so a baseline can fail the new contract. Select
cases whose initial stage exists in that revision; an unsupported initial stage
is reported as an error rather than silently substituted.

## Cases and grading

| Cases | What they exercise |
| --- | --- |
| 1–16: recommendation | Existing scope, stage, completion, preference, and linked-action questions. Agents return structured recommendations and obey each prompt's limits on execution. |
| 17: observation | Established passive observation changes Active to Waiting. |
| 18: user review | Pending user review changes an incorrect external blocker to Active. |
| 19: own workers | Executing coordinated workers change an incorrect thread blocker to Active. |
| 20: independent thread | A required delivery independently owned by another BB workflow blocks this thread. |
| 21: external AI | A required delivery owned by an independent outside AI is an external blocker. |
| 22: exploratory report | Research with unsettled design and review keeps Active without a redundant write. |
| 23: durable completion | Delivered work with review and loose ends settled or delegated becomes Completed. |
| 24: routine observation | A routine check leaves Waiting unchanged. |
| 25: missing resumption path | Unfinished reporting setup keeps Active. |
| 26: automatic updates off | An independent dependency does not cause an unrequested stage write. |
| 27: filed issues unresolved | Submitting reports during an investigation keeps Active while useful work and unresolved findings remain. |
| 28: upstream fix pending | An accepted upstream fix blocks this thread while its own verification responsibility remains open. |
| 29: report-only completion | A task explicitly limited to filing a report can finish while the issue stays open. |
| 30: follow-up after submission | Concrete user follow-up reopens a thread incorrectly marked Completed after submission. |
| 31: unaccepted handoff | Tracking a task and notifying a proposed owner keeps Active until that owner accepts responsibility. |

Case 31 preserves the notified-owner handoff from the original case 14, while
case 14 now supplies an accepted handoff as the completion control. Case 31
tests the change in the delegation contract without giving the thread a new
objective to establish ownership. An unaccepted recipient owns neither a
completed handoff nor a blocker; arranging the handoff remains Active.

Automatic prompts ask for a workflow update without mentioning stages. The
expected stage and write count stay outside the agent workspace. The fixture
records CLI inspections, mutation attempts, target thread, resulting stage, and
invalid commands. Grading requires successful completion, successful required
skill reads, the expected final state and exact write count, inspection before
each write, and no invalid or forbidden calls. A correct recommendation alone
cannot pass an automatic case. Disabled updates require no skill read.

Recommendation grading checks the declared answer fields and proposed commands,
with equivalent JSON quoting and object-key order accepted. A single fenced JSON
answer may have explanatory prose around it. Required commands must appear in
order; additional valid read-only inspection commands are allowed. It also checks
required skill reads (including Thread actions in case 5), forbidden unnecessary
reads, and execution limits. Prose reasoning is preserved for human review;
the grader requires a nonempty reason but does not judge its meaning.

`npm run check:evals` runs the manifest validation and regression tests for the
grader and CLI fixture as part of `release:check`. These tests cover false passes
from missing writes, duplicate writes, wrong targets, invalid commands, failed
reads, missing completion events, and timeouts. They use no model credentials.

## Comparing guidance

Run the same committed case with `--ref <baseline>` and with the revised source,
using the same model and CLI configuration. A behavioral regression requires a
successful baseline session that makes the wrong stage decision, followed by a
revised session that meets the contract. A timeout, failed skill read, or missing
instruction string does not establish a behavioral regression. Inspect the
transcripts and recorded writes on both sides.

Cases 27–30 cover workflow boundaries that the previous guidance can also pass;
their passing results do not measure improvement. Case 31 targets the changed
handoff contract. Passing it does not establish that the original premature
completion after issue submission has been reproduced or fixed. Model outcomes
can vary between runs, so keep the artifacts and report the observed scope.

## Artifacts and limits

Each run records source hashes, the suite hash, selected case IDs, and CLI
version in `run.json`. Each case retains the exact prompt, instruction text,
skill snapshots, workflow evidence, final state, `calls.jsonl`, full
`transcript.jsonl`, stderr, and `result.json`. The run's `results.json` contains
all graded outcomes. Read the transcripts and reasoning when assessing a skill
change; machine checks do not cover every prose expectation.

The runner removes inherited BB connection variables and puts [fixture.py](fixture.py)
on PATH as `bb`. Safe mode disables installed customizations, and the runner
supplies the selected plugin instructions and skill catalog explicitly. Agents
are instructed to use the local fixture and receive only Bash and Read tools.
This is a behavioral fixture, not a security sandbox for hostile agents.

These runs evaluate native Claude Code sessions with reconstructed plugin
context. They do not launch BB threads or validate actual BB provider-session
injection, real collectors, runtime events, Codex, or Pi. The existing software
and browser tests cover the plugin integration separately.
