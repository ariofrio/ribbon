# Thread stages evaluations

[evals.json](evals.json) is the source of cases, workflow evidence, and expected
results. [run.py](run.py) launches a fresh Codex or Claude Code process for every selected
case, and [oracle.py](oracle.py) grades its answer and recorded behavior.

## Run

Requirements: Python 3, a POSIX host, and an authenticated target CLI: Claude Code
with `--safe-mode` support or Codex with `--ignore-user-config` and
`skills.include_instructions=false` support (tested with 2.1.302 and 0.163.0).
Claude uses its configured default model; Codex uses its clean-config default.
The runner records the CLI version and Claude's reported model; Codex JSONL does
not report its model. Model runs consume the
account's normal quota; CI does not launch them.

From the repository root:

```sh
# Validate the cases and exercise the grader and CLI fixture without a model.
npm run check:evals --workspace=bb-plugin-thread-stages

# Execute all 39 cases, or just the twenty-three automatic-update cases.
npm run evals --workspace=bb-plugin-thread-stages
npm run evals --workspace=bb-plugin-thread-stages -- --mode automatic

# Run the reassessment cases and no-churn controls on either runtime.
npm run evals --workspace=bb-plugin-thread-stages -- --runtime codex --cases 24 26 28 35 36 37 38 39
npm run evals --workspace=bb-plugin-thread-stages -- --runtime claude --cases 24 26 28 35 36 37 38 39

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
Use neutral output directory names: paths to the fixture and skill are visible
to agents, so comparison labels in those paths would disclose the run's purpose.

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
| 17: observation | Established passive observation remains In progress. |
| 18: user review | Pending user review changes an incorrect external blocker to Needs user. |
| 19: own workers | Executing coordinated workers change an incorrect thread blocker to In progress. |
| 20: independent thread | A required delivery independently owned by another BB workflow blocks this thread. |
| 21: external AI | A required delivery owned by an independent outside AI is an external blocker. |
| 22: exploratory report | Research awaiting required user decisions and review becomes Needs user once independent work is exhausted. |
| 23: durable completion | Delivered work with review and loose ends settled or delegated becomes Completed. |
| 24: routine observation | A routine check leaves In progress unchanged. |
| 25: missing resumption path | Unfinished reporting setup keeps In progress. |
| 26: automatic updates off | An independent dependency does not cause an unrequested stage write. |
| 27: independent work before review | Pending user review leaves In progress unchanged while useful independent work remains. |
| 28: user blocker unchanged | An established user blocker stays Needs user without a redundant write. |
| 29: filed issues unresolved | Submitting reports during an investigation keeps In progress while useful work and unresolved findings remain. |
| 30: upstream fix pending | An accepted upstream fix blocks this thread while its own verification responsibility remains open. |
| 31: report-only completion | A task explicitly limited to filing a report can finish while the issue stays open. |
| 32: follow-up after submission | Concrete user follow-up reopens a thread incorrectly marked Completed after submission. |
| 33: unaccepted handoff | Tracking a task and notifying a proposed owner keeps In progress until that owner accepts responsibility. |
| 34: reviewed report, unfinished workflow | Explaining the trigger and verifying publication keeps In progress while failed cleanup still needs a resumption path and user review remains open. |
| 35: review feedback | User comments establish that drafts were reviewed and request a source-and-probe investigation. Change to In progress before that work, then return to Needs user for publication approval. |
| 36: supplied decision | The user supplies the previously requested choice and asks for a delivery-guarantee investigation before deciding on the proposal. The same work-order contract applies. |
| 37: pending review | A short acknowledgment and read marker leave genuine user review outstanding and Needs user unchanged. |
| 38: manual stage preference | An explicit instruction to retain Needs user prevents automatic writes during the investigation. |
| 39: automatic updates off during work | Disabled automatic updates prevent unrequested writes during the investigation. |

Cases 29 and 34 reconstruct two decision points from a browser-login
investigation. Case 29 preserves the reporting request inside the earlier
investigation and the Linux comparison added during reporting. Case 34 follows
the controlled experiments and report update, with user review and failed
scratch-profile cleanup still outstanding. Arranging the cleanup follow-up is
independent work; user review alone would instead use Needs user. Neither
supplies the agent's later
acknowledgment that completion was premature. Case 31 remains the explicitly
bounded reporting-only completion control.

Case 33 preserves the notified-owner handoff from the original case 14, while
case 14 now supplies an accepted handoff as the completion control. Case 33
tests the change in the delegation contract without giving the thread a new
objective to establish ownership. An unaccepted recipient owns neither a
completed handoff nor a blocker; arranging the handoff remains In progress.

Automatic prompts ask for a workflow update or the user's next delivery step
without mentioning stages. The expected stage and write count stay outside the
agent workspace. The fixture
records CLI inspections, mutation attempts, target thread, resulting stage, and
invalid commands. Grading requires successful completion, successful required
skill reads, the expected final state and exact write count, inspection before
each write, and no invalid or forbidden calls. A correct recommendation alone
cannot pass an automatic case. Disabled updates require no skill read.

Cases 35–39 add a substantive investigation of client retry behavior, receiver
side effects, and recorded delivery probes. The fixture's `bb files read` serves
the committed inputs and records the stage at each source read. Cases 35–36
require inspection and an In progress write before any of those reads; a late
write fails even if the final stage is correct. After the bounded investigation,
only the user's decision remains, so returning to Needs user is justified.
Cases 38–39 retain the user's manual/disabled-update preference; neither requires
a skill read or inspection just to leave the stage alone. The grader checks
source access and stage order; review the answer against the source and probes
to assess the explanation and revised paragraphs.

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

The approved reassessment wording has a [recorded comparison](../../../../../docs/testing/thread-stages-reassessment.md).
Both runtimes still failed work ordering in that comparison; passing controls
and individual grader checks do not establish a behavioral GREEN.

Cases 29–32 and 34 cover workflow boundaries that the previous guidance can also
pass; their passing results do not measure improvement. Case 33 targets the changed
handoff contract. Passing it does not establish that the original premature
completion after issue submission has been reproduced or fixed. Model outcomes
can vary between runs, so keep the artifacts and report the observed scope.

## Artifacts and limits

Each run records source hashes, the suite hash, selected case IDs, and CLI
version in `run.json`. Each case retains the exact prompt, instruction text,
skill snapshots, workflow evidence, final state, `calls.jsonl`, full
`transcript.jsonl`, stderr, and `result.json`. The run's `results.json` contains
all graded outcomes. `assistant.md` contains the plain answer, `command.json`
the actual CLI invocation, and `grading.json` the canonical expectation verdicts
and direct evidence. Read the transcripts and reasoning when assessing a skill
change; machine checks do not cover every prose expectation.

The runner removes inherited BB connection variables and puts [fixture.py](fixture.py)
on PATH as `bb`. Claude safe mode disables installed customizations and exposes
only Bash and Read. Codex ignores user config and rules, suppresses discovered
skill instructions and project documents, disables login shells to preserve the
fixture PATH, and uses a workspace-write sandbox. Both receive the selected
plugin instructions and skill catalog explicitly. Codex's actual command-result
events are adapted to the shared grader; raw JSONL is retained unchanged.
This is a behavioral fixture, not a security sandbox for hostile agents.

These runs evaluate native Codex and Claude Code sessions with reconstructed plugin
context. They do not launch BB threads or validate actual BB provider-session
injection, real collectors, runtime events, or Pi. The existing software
and browser tests cover the plugin integration separately.
