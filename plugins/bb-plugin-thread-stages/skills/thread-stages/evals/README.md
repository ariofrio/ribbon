# Thread stages evaluations

The suite runs ordinary work requests in fresh native Claude Code sessions.
Agents receive the selected BB instructions, skill catalog, conversation history,
and project files. They are not told they are being evaluated, asked to select
a stage, or given an answer schema. The grader requires recorded commands and
their effects; describing a command does not count as executing it.

## Run

Requirements: macOS or Linux, Python 3.9+, and Claude Code with `--bare` and explicit MCP support
(tested with 2.1.300). Supply `ANTHROPIC_API_KEY`, or run from a BB session with
an existing Account Pooler route. Credentials stay in the client process and
are not written into artifacts or supplied to project tools.

From the repository root:

```sh
# Validate cases, command handling, isolation, and grading without a model.
npm run check:evals --workspace=bb-plugin-thread-stages

# Run all cases sequentially, or select a small group.
npm run evals --workspace=bb-plugin-thread-stages
npm run evals --workspace=bb-plugin-thread-stages -- --cases 4 29 33

# Inspect the exact model inputs without launching an agent.
npm run evals --workspace=bb-plugin-thread-stages -- --prepare

# Compare the same requests against a prior skill/instruction revision.
npm run evals --workspace=bb-plugin-thread-stages -- --ref <commit>

# Isolate the injected instructions while keeping the current skill.
npm run evals --workspace=bb-plugin-thread-stages -- --instructions-ref <commit>

# Regrade saved commands and state without another model call.
npm run evals --workspace=bb-plugin-thread-stages -- --grade <run-directory>
```

Default artifacts go under the repository's `.scratch/work/thread-stage-evals/`.
`--output` must name a new directory; workspace npm scripts run from the plugin,
so use an absolute path or `../../.scratch/work/...`. `--model` defaults to
`claude-opus-5-5`; `--timeout` bounds each session. CI runs the deterministic
checks, not the model sessions.

## Coverage

| Cases | Work being performed |
| --- | --- |
| 1 | Defer Operations threads while preserving completed work. |
| 4–5 | Apply sidebar preferences and save a prompt button without losing existing buttons or running it. |
| 8 | Report validation results while an earlier authorized rollout remains unfinished. |
| 17–28 | Observation without leaving In progress, incident delivery, user review, independent work, coordinated workers, independent owners, durable completion, and disabled automatic updates. |
| 29 | Actually submit two approved reports during an unresolved investigation. |
| 30 | Report a pending upstream fix while retaining local verification responsibility. |
| 31 | Actually submit a report whose explicitly bounded scope ends at filing. |
| 32 | Resume an investigation after an incorrect completion. |
| 33 | Summarize a handoff whose proposed recipient has not accepted it. |
| 34 | Actually update a report while review and failed cleanup remain outstanding. |

Overlapping recommendation cases were consolidated. Case IDs remain stable
where their workflow coverage survives; there is no recommendation-only mode.
The retained browser scenarios reconstruct the supplied incident, without
including its later acknowledgment of premature completion.

## Isolation and grading

Claude's built-in tools and ambient customizations are disabled. Its only tools
are project-scoped Read, Write, and shell operations from a local stdio MCP
server. They operate on a private state store and virtual project files, never
on the host shell, live BB state, or GitHub. Expected outcomes, command records,
and the runner are outside the readable project. Unsupported commands cannot
fall through to a real executable. Isolation is enforced by the tools rather
than an eval disclaimer in the prompt.

The shell supports the BB/GitHub command subset used by these requests.
The adapters preserve CLI discovery and command semantics, including unknown
commands, invalid arguments, saved-action replacement, preference mutation,
issue submission, and issue readback. They are not a complete BB installation
or Unix shell. No BB server, browser, or container is started per case.

Grading checks successful completion, skill reads before mutations, inspection
before stage changes, exact stage writes and targets, requested report evidence,
preferences/actions, and final state consistent with recorded effects. Reports
must preserve the approved bodies (ignoring outer whitespace) and be read back
after delivery; completion cannot precede that verification. Invalid mutation
commands fail even after recovery. Read-only discovery errors remain in the
transcript without erasing successful work. Ordinary prose cannot satisfy a
missing side effect. No-op cases inspect existing state and reject redundant
writes. Timeouts and missing tool registration cannot pass.

Each run retains source and suite hashes, native CLI version, requested/actual
model, model-visible inputs, tool events, initial/final state, full transcript,
completion/usage, and grading results. The harness is snapshotted for each run;
its MCP server runs from that snapshot. Changed cases or harness code cannot
regrade an old run; use the saved harness to reproduce its grading. Prepared
inputs are explicitly unevaluated.

## Interpreting comparisons

A behavioral red-green result needs a successful baseline session making the
wrong decision and a revised session meeting the same contract. Authentication
failures, tool-loading failures, and timeouts are not behavioral regressions.
Inspect commands and reasoning; the grader does not judge every prose claim.

An injected reminder is justified separately from the skill: hold the skill and
cases fixed and compare instruction variants. A combined change cannot establish
that both additions were needed. Keep the shortest general guidance supported
by the comparisons; do not tune instructions to case IDs or incident details.

These sessions test Claude's behavior with reconstructed BB context. Plugin
software tests cover actual provider injection and BB integration separately.
Passing an improved handoff case does not establish reproduction of the original
live issue-submission failure. Record that distinction with observed results.
