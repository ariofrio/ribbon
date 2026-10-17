# Thread stages evaluation

The [manifest](evals.json) contains **17 task acceptance scenarios (41–57)** and
**40 diagnostic cases (1–40)**. Report these groups separately. A recommendation
answer or a correct stage operation from a supplied workflow summary does not
establish autonomous behavior in a continuing conversation.

## Task acceptance

[sessions.py](sessions.py) executes 31 turns across 17 scenarios through actual
`codex exec` / `codex exec resume` or `claude --print` / `claude --resume` calls.
Fourteen scenarios resume the same native session; three have one bounded task.
Session IDs must persist. Earlier assistant messages and tool results come from
the agent's own execution, rather than a supplied conversation synopsis.

Agents receive natural user requests, subsequent replies or BB message envelopes,
raw project artifacts, the source-extracted plugin reminder, and the skill
catalog. They do not receive `work.json`, stage expectations, grading rules,
comparison labels, or a statement that they are being evaluated. Backend state,
source inputs, traces, and the oracle remain outside their project workspace.
Each project has its own Git root, with no remote, so repository discovery cannot
walk into the checkout running the suite. The local `bb` executable provides thread inspection, stage writes, and project
file reads, including files the agent creates. It does not contact production BB.

| Cases | Work and decision boundary |
| --- | --- |
| 41 | Draft issue paragraphs, then investigate implicit review comments against client/receiver code and probes. Save corrected drafts and structured findings. |
| 42 | Ask for a region; resume calculation when the user supplies it and raw usage/pricing inputs. |
| 43–44 | Another thread's message or an external accountant's delivery resolves the prior wait. Read the new export and produce paid-account totals. |
| 45 | Explain exponential backoff in a substantive side discussion while draft review remains pending. Keep Needs user. |
| 46 | Produce invoice totals while the user still reviews the drafts. Use In progress during that work, then Needs user for the remaining review. |
| 47–48 | Check an executing conversion and an established recovery watch twice. Recorded collectors own notifications. Retain In progress without redundant writes. |
| 49 | Finish and save an explicitly bounded accounting report. Use Completed. |
| 50 | Perform an explicit placement request with automatic updates off. |
| 51 | Retain Deferred under a user's manual preference across a native resume and actual work. |
| 52 | Resume work with automatic updates off; retain the current stage. |
| 53 | Reopen a Completed thread for actual follow-up calculations and intended review. |
| 54 | Ask for genuinely missing inputs; retain Needs user when the user has not supplied them. |
| 55 | Establish the user's decision on a proposed gate, then investigate the recorded PNG-only recapture and PR-wide relevance code and save a discussion note and structured cutoff facts before that decision. No check-monitoring ownership is inferred. |
| 56 | A status tool result reveals another thread's completed export. Retain Dependent for the status check, then use In progress before integrating the delivered data. |
| 57 | A narrower follow-up retains the earlier report-index requirement and completes the bounded package without inventing another approval wait. |

The acceptance oracle requires correct saved deliverables as well as actual stage
writes, their order, inspection before writes, the stage at evidence reads, and
successful native continuation. A named report may live in a reported subdirectory unless the task gives an
explicit directory. Account amounts may be numbers or records using the source
`amount_cents` field. It checks domain data (retry behavior, cost,
paid-account totals, CI facts) and minimal report content rather than exact instruction
strings or hardcoded agent recommendations. A trace with correct stage writes
and a missing or wrong deliverable fails. Human review of prose and reasoning
remains necessary; keyword checks do not prove an explanation is sound.

Only successfully served file reads count as inspected evidence. A missing file
is a normal lookup failure; an unsupported read-only `--help` probe may be
recovered from. Invalid substantive calls and unrelated mutations fail. All
user-visible assistant messages are retained, including a question asked before
a final acknowledgment.

## Commands

Requirements: Python 3, POSIX, authenticated Codex and Claude CLIs. Tested with
Codex 0.163.0 and Claude Code 2.1.302. Defaults explicitly request
`gpt-6.1-sol` / low and `claude-opus-5-5[1m]` / high. Use the same model and
reasoning settings on both sides. Codex JSONL does not report the accepted model;
requested settings, CLI version, and Claude's reported model remain in traces.
Model execution consumes normal account quota; CI only tests the harness.

From the repository root:

```sh
# Validate all manifests and regression-test both runners and graders.
npm run check:evals --workspace=bb-plugin-thread-stages

# All 17 acceptance scenarios; choose a new neutral output path each time.
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --ref <original-commit> --output .scratch/work/stage-sessions/run-01
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime codex --output .scratch/work/stage-sessions/run-02
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --ref <original-commit> --output .scratch/work/stage-sessions/run-03
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --runtime claude --output .scratch/work/stage-sessions/run-04

# Select cases, override settings, or replay saved evidence without a new agent.
npm run evals:sessions --workspace=bb-plugin-thread-stages -- --runtime codex --model gpt-6.1-sol --effort low --cases 41 43 56 --output .scratch/work/stage-sessions/run-05
python3 plugins/bb-plugin-thread-stages/skills/thread-stages/evals/sessions.py --grade .scratch/work/stage-sessions/run-02

# The separate diagnostic suite: all 40, just automatic summaries, or a selection.
npm run evals --workspace=bb-plugin-thread-stages -- --runtime codex
npm run evals --workspace=bb-plugin-thread-stages -- --runtime claude --mode automatic
npm run evals --workspace=bb-plugin-thread-stages -- --runtime codex --cases 24 26 28 35 36 37 38 39 40
npm run evals --workspace=bb-plugin-thread-stages -- --prepare
npm run evals --workspace=bb-plugin-thread-stages -- --grade <diagnostic-run-directory>
```

`--ref` loads skill, injected reminder, and stages from Git. Case definitions and
input artifacts stay the same on both sides. `--model`, `--effort`, and
`--timeout` override the defaults; timeout is 240 seconds per acceptance turn.
Each output directory must be new. Avoid comparison labels in visible paths.
All temporary outputs belong in `.scratch/work/`, outside the packaged skill.

## Diagnostic cases

[run.py](run.py) preserves the original 40 single-session probes. Cases 1–16
request structured recommendations about scope, stages, preferences, and linked
Thread actions. Cases 17–34 use curated workflow summaries to isolate observation,
own workers, user/agent/external blockers, reporting and completion, handoffs,
missing resumption arrangements, no-churn, and automatic-update preferences.
Cases 35–39 investigate retry artifacts under user feedback and manual/off
controls. Case 40 investigates the recapture proposal boundary.

These remain useful narrow regressions and owner-boundary checks. Their wrapper
explicitly identifies the local environment and their `work.json` supplies
workflow conclusions. Their automatic oracle checks recorded operations and
source access, not task completion. Do not describe a 40/40 diagnostic result as
forty realistic autonomous tasks. The native continuation scenarios above supply
the stronger task acceptance coverage.

Recommendation answers use declared JSON fields, with equivalent command quoting
and JSON key order accepted. Extra valid read-only discovery is allowed. The
oracle enforces prompt limits on BB execution separately from skill-file reads,
which Codex performs through its shell. Cases 4 and 5 preserve preference
discovery and linked Thread actions coverage. `oracle.py validate` checks every
case and referenced input before either runner launches workers.

## Evidence and limits

Both runners save requested model/effort, CLI version, source/fixture/input/suite
hashes, exact CLI invocations, skill snapshots, plain answers, full JSONL traces,
stage operations, outputs, and canonical `grading.json`. Acceptance runs also
save per-turn state, call logs, immutable deliverable snapshots, session IDs,
exit codes, and the case/runner/oracle snapshots outside the agent workspace.
Regrading writes separate `grade.json` and `graded-results.json`; original
results and traces are retained. `--contracts <evals.json>` permits an explicit
oracle repair while refusing changes to worker-visible tasks or inputs; its
provenance records the contract changes. Interrupted runs must be identified separately.

The runner removes inherited BB connection variables and places its local `bb`
backend first on PATH. Claude safe mode disables installed customizations;
Codex ignores user configuration and rules, discovered skills and project docs,
and login shells. Its tool sandbox explicitly disables network access. Claude
uses per-session strict sandbox settings: no allowed network domains, no
unsandboxed retry, failure at startup if sandboxing is unavailable, and local
project/backend access. This requires macOS Seatbelt or Linux bubblewrap/socat;
see the [Claude sandbox reference](https://code.claude.com/docs/en/sandboxing).
Native model connections run outside the work-tool sandbox. Git global/system
configuration is suppressed in these processes. The isolated backend's writable directory is allowed in the
Codex workspace sandbox. This is a cooperative behavioral harness, not a
security boundary against a hostile agent. Native session persistence is used;
no BB threads, production services, plugins, or settings are created or changed.

The harness reconstructs the plugin instruction surface and uses a local backend.
It does not prove production provider injection, actual monitoring delivery,
third-party services, or all long-running conversation states. Plugin software
and integration tests cover separate owner boundaries. Report finite observations
and variability; an unchanged baseline that passes is not evidence of improvement.

See the [native comparison report](../../../../../docs/testing/thread-stages-native-conversations.md)
for actual commands, stage operation order, RED/GREEN evidence, interrupted runs,
manual review, and validation limits.
